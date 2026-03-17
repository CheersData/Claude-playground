/**
 * API Route: /api/integrations/agent/setup
 *
 * POST — Conversational endpoint for the Integration Setup Agent.
 *
 * Accepts a user message and conversation history, calls the Setup Agent,
 * and returns a structured JSON response with the agent's reply.
 *
 * This is a standard request/response endpoint (NOT SSE streaming).
 * The frontend manages the conversation state and sends the full history
 * on each turn.
 *
 * Security: CSRF + requireAuth + rate-limit
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkCsrf } from "@/lib/middleware/csrf";
import {
  runSetupAgent,
  type SetupAgentMessage,
} from "@/lib/agents/integration-setup-agent";

// ─── Validation ───

function isValidMessage(msg: unknown): msg is SetupAgentMessage {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Record<string, unknown>;
  if (typeof m.role !== "string" || !["user", "agent"].includes(m.role))
    return false;
  if (typeof m.content !== "string") return false;
  return true;
}

// ─── POST: Send message to setup agent ───

export async function POST(req: NextRequest) {
  // CSRF
  const csrfBlocked = checkCsrf(req);
  if (csrfBlocked) return csrfBlocked;

  // Auth
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const userId = authResult.user.id;

  // Rate limit (conversational — allow reasonable rate)
  const rateLimited = await checkRateLimit(req, userId);
  if (rateLimited) return rateLimited;

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body JSON non valido" },
      { status: 400 }
    );
  }

  // Validate message
  const message = body.message;
  if (typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json(
      { error: "Il campo 'message' è obbligatorio e non può essere vuoto" },
      { status: 400 }
    );
  }

  if (message.length > 5000) {
    return NextResponse.json(
      { error: "Il messaggio è troppo lungo (max 5000 caratteri)" },
      { status: 400 }
    );
  }

  // Validate history
  const history = body.history;
  let validatedHistory: SetupAgentMessage[] = [];

  if (Array.isArray(history)) {
    // Validate each message in history
    for (const msg of history) {
      if (!isValidMessage(msg)) {
        return NextResponse.json(
          {
            error:
              "History contiene messaggi non validi. Ogni messaggio deve avere 'role' (user|agent) e 'content' (string).",
          },
          { status: 400 }
        );
      }
    }
    validatedHistory = history as SetupAgentMessage[];

    // Limit history length to prevent token explosion
    if (validatedHistory.length > 40) {
      validatedHistory = validatedHistory.slice(-40);
    }
  }

  // Optional connectorId from request context (useful when agent works from catalog page)
  const connectorId =
    typeof body.connectorId === "string" && body.connectorId.trim().length > 0
      ? body.connectorId.trim()
      : undefined;

  // Run the setup agent
  try {
    const result = await runSetupAgent(
      validatedHistory,
      message.trim(),
      connectorId
    );

    return NextResponse.json({
      message: result.message,
      action: result.action,
      questions: result.questions ?? [],
      discoveredSchema: result.discoveredSchema ?? null,
      proposedMapping: result.proposedMapping ?? [],
      connectorConfig: result.connectorConfig ?? null,
      needsUserInput: result.needsUserInput ?? true,
      discoveredEntities: result.discoveredEntities ?? null,
      connectorId: result.connectorId ?? connectorId ?? null,
      provider: result.provider,
      durationMs: result.durationMs,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[API:integration-setup] Error for user ${userId}: ${errorMsg}`);

    return NextResponse.json(
      {
        error: "Errore interno durante l'elaborazione. Riprova tra qualche istante.",
        message:
          "Mi dispiace, ho avuto un problema tecnico. Riprova tra qualche istante.",
        action: "error" as const,
        needsUserInput: true,
      },
      { status: 500 }
    );
  }
}
