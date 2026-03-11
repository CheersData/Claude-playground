/**
 * POST /api/legaloffice/leader
 *
 * Leader conversazionale dell'Ufficio Legale.
 * Risponde a domande libere sul documento analizzato usando i phaseResults.
 *
 * Body: { message, sessionId?, agentContext?, phaseResults? }
 * Response: { answer: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { generate } from "@/lib/ai-sdk/generate";
import { LEGALOFFICE_LEADER_SYSTEM, buildLeaderPrompt } from "@/lib/prompts/legaloffice-leader";
import { getAgentChain } from "@/lib/tiers";
import { MODELS, isProviderEnabled } from "@/lib/models";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkCsrf } from "@/lib/middleware/csrf";
import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { broadcastConsoleAgent } from "@/lib/agent-broadcast";

export async function POST(req: NextRequest) {
  // Auth — console-only route (calls LLM)
  const authPayload = requireConsoleAuth(req);
  if (!authPayload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // CSRF protection (SEC-NEW-H1)
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  // Rate limiting — protegge crediti LLM (SEC-NEW-H1)
  const rl = await checkRateLimit(req);
  if (rl) return rl;

  try {
    const body = await req.json();
    const {
      message,
      agentContext,
      phaseResults = {},
    }: {
      message: string;
      agentContext?: string | null;
      phaseResults?: Record<string, unknown>;
    } = body;

    if (!message?.trim()) {
      return NextResponse.json({ error: "Messaggio vuoto" }, { status: 400 });
    }

    const prompt = buildLeaderPrompt(message, agentContext ?? null, phaseResults);

    broadcastConsoleAgent("legal-leader", "running", { task: "Leader Ufficio Legale" });

    // Usa la catena del leader, scendi finché trova un provider disponibile
    const chain = getAgentChain("leader");
    let answer = "";
    let lastError: Error | null = null;

    for (const modelKey of chain) {
      const model = MODELS[modelKey];
      if (!isProviderEnabled(model.provider)) continue;

      try {
        const result = await generate(modelKey, prompt, {
          systemPrompt: LEGALOFFICE_LEADER_SYSTEM,
          maxTokens: 800,
          temperature: 0.4,
          jsonOutput: false,
          agentName: "LEGALOFFICE-LEADER",
        });
        answer = result.text.trim();
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(`[LEGALOFFICE-LEADER] ${modelKey} fallito:`, lastError.message);
        continue;
      }
    }

    if (!answer) {
      console.error("[LEGALOFFICE-LEADER] Tutti i modelli falliti:", lastError?.message);
      broadcastConsoleAgent("legal-leader", "error", { task: "Tutti i modelli falliti" });
      return NextResponse.json(
        { answer: "Non riesco a rispondere al momento. Riprova tra qualche secondo." },
        { status: 200 }
      );
    }

    broadcastConsoleAgent("legal-leader", "done", { task: "Risposta generata" });
    return NextResponse.json({ answer });
  } catch (err) {
    console.error("[LEGALOFFICE-LEADER] Errore:", err);
    broadcastConsoleAgent("legal-leader", "error", { task: "Errore interno" });
    return NextResponse.json(
      { answer: "Errore interno. Riprova." },
      { status: 200 } // 200 per non crashare il frontend
    );
  }
}
