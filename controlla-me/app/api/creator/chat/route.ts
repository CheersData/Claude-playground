/**
 * Creator Chat API — SSE streaming endpoint per la chat del creator con il suo CME.
 *
 * Auth: Supabase Auth + ruolo creator (requireCreatorAuth)
 * Model: Gemini 2.5 Flash (free tier)
 * Pattern: SSE via createSSEStream (same as /api/console)
 */

import { NextRequest } from "next/server";
import { checkCsrf } from "@/lib/middleware/csrf";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { requireCreatorAuth, isAuthError } from "@/lib/middleware/auth";
import { generate } from "@/lib/ai-sdk/generate";
import { buildCreatorCMEPrompt } from "@/lib/creator/cme-prompt";
import {
  getCreatorHistory,
  getCreatorPreferences,
  getEmployeeName,
  saveCreatorSession,
  saveCreatorPreference,
} from "@/lib/creator/memory";
import { loadPlatformKnowledge } from "@/lib/creator/mde-knowledge";
import { createSSEStream, SSE_HEADERS } from "@/lib/sse-stream-factory";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  // CSRF
  const csrf = checkCsrf(req);
  if (csrf) return csrf;

  // Rate limiting
  const rl = await checkRateLimit(req);
  if (rl) return rl;

  // Auth — richiede ruolo creator+
  const authResult = await requireCreatorAuth();
  if (isAuthError(authResult)) return authResult;

  const userId = authResult.user.id;

  const { stream, send, close: closeStream } = createSSEStream({ request: req });

  (async () => {
    try {
      // Parse FormData
      const formData = await req.formData();
      const message = (formData.get("message") as string | null)?.trim();

      if (!message) {
        send("error", { message: "Messaggio vuoto" });
        closeStream();
        return;
      }

      // Parse conversation history
      let history: ConversationTurn[] = [];
      const rawHistory = formData.get("history") as string | null;
      if (rawHistory) {
        try {
          const parsed = JSON.parse(rawHistory);
          if (Array.isArray(parsed)) {
            history = parsed
              .filter(
                (t: unknown) =>
                  t &&
                  typeof (t as ConversationTurn).role === "string" &&
                  typeof (t as ConversationTurn).content === "string"
              )
              .slice(-10);
          }
        } catch {
          // Invalid JSON — ignore
        }
      }

      // Load creator context + platform knowledge in parallel
      const [sessionHistory, preferences, profile, employeeName, platformKnowledge] = await Promise.all([
        getCreatorHistory(userId, 5),
        getCreatorPreferences(userId),
        loadCreatorProfile(userId),
        getEmployeeName(userId),
        loadPlatformKnowledge(),
      ]);

      const creatorName = preferences["name"] || profile?.full_name || "Creator";
      const isFirstVisit = sessionHistory.length === 0 && history.length === 0;

      // Build system prompt with dynamic knowledge (cordone ombelicale)
      const systemPrompt = buildCreatorCMEPrompt({
        creatorName,
        creatorRole: profile?.role || "creator",
        projects: [], // TODO: load from creator_projects when table exists
        isFirstVisit,
        sessionHistory,
        creatorEmployeeName: employeeName || undefined,
        platformKnowledge,
      });

      // Build conversation for LLM
      const conversationParts: string[] = [];
      for (const turn of history) {
        conversationParts.push(`${turn.role === "user" ? "Utente" : "CME"}: ${turn.content}`);
      }
      conversationParts.push(`Utente: ${message}`);
      const fullPrompt = conversationParts.join("\n\n");

      send("status", { phase: "thinking" });

      // Generate response — Gemini Flash (free tier)
      const result = await generate("gemini-2.5-flash", fullPrompt, {
        systemPrompt,
        maxTokens: 1024,
        temperature: 0.7,
        jsonOutput: false,
        agentName: "creator-cme",
      });

      send("message", { content: result.text });
      send("done", {
        model: result.model,
        provider: result.provider,
        durationMs: result.durationMs,
      });

      // Fire-and-forget: save session & detect name
      detectAndSaveName(userId, message, preferences).catch(() => {});
      if (history.length > 0 && history.length % 5 === 0) {
        saveCreatorSession(userId, `Chat: ${message.slice(0, 100)}`).catch(() => {});
      }
    } catch (err) {
      console.error("[creator-chat] Error:", err);
      send("error", {
        message: err instanceof Error ? err.message : "Errore interno",
      });
    } finally {
      closeStream();
    }
  })();

  return new Response(stream, { headers: SSE_HEADERS });
}

// ─── Helpers ───

async function loadCreatorProfile(
  userId: string
): Promise<{ full_name: string | null; role: string } | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("profiles")
      .select("full_name, role")
      .eq("id", userId)
      .single();

    if (error || !data) return null;
    return {
      full_name: data.full_name as string | null,
      role: (data.role as string) || "creator",
    };
  } catch {
    return null;
  }
}

/**
 * Detect creator name from message patterns and save as preference.
 * Patterns: "mi chiamo X", "sono X", "il mio nome è X"
 */
async function detectAndSaveName(
  userId: string,
  message: string,
  currentPrefs: Record<string, string>
): Promise<void> {
  if (currentPrefs["name"]) return; // already known

  const patterns = [
    /mi chiamo\s+(.+)/i,
    /sono\s+([A-Z][a-zA-ZÀ-ú]+(?:\s+[A-Z][a-zA-ZÀ-ú]+)*)/,
    /il mio nome (?:è|e)\s+(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      const name = match[1].trim().slice(0, 50);
      if (name.length >= 2) {
        await saveCreatorPreference(userId, "name", name);
        return;
      }
    }
  }
}
