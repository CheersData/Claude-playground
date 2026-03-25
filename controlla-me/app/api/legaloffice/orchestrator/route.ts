/**
 * POST /api/legaloffice/orchestrator
 *
 * Endpoint SSE che sostituisce /api/legaloffice/leader per la modalità Q&A.
 * Il Leader orchestra gli agenti specializzati e li mostra attivi nella sidebar.
 *
 * Pattern identico a /api/console/route.ts — eventi SSE "agent" + "complete".
 */

import { NextRequest } from "next/server";
import { runLegalOfficeOrchestrator } from "@/lib/agents/legaloffice-orchestrator";
import { sessionTierStore, type SessionTierContext, type TierName } from "@/lib/tiers";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkCsrf } from "@/lib/middleware/csrf";
import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { broadcastConsoleAgent } from "@/lib/agent-broadcast";
import { createSSEStream, SSE_HEADERS } from "@/lib/sse-stream-factory";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  // Auth — console-only route (calls LLM)
  const authPayload = requireConsoleAuth(req);
  if (!authPayload) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // CSRF protection (SEC-NEW-H2)
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  // Rate limiting
  const rl = await checkRateLimit(req);
  if (rl) return rl;

  const { stream, send, close: closeStream } = createSSEStream({ request: req });

  // Run the pipeline asynchronously
  (async () => {
    const sendAgent = (
      phase: string,
      status: "running" | "done" | "error",
      extra?: Record<string, unknown>
    ) => {
      send("agent", { phase, status, ...extra });
      // Broadcast to AgentDots in /ops
      broadcastConsoleAgent(phase, status, {
        task: (extra?.summary as string) ?? `Legal Q&A: ${phase}`,
      });
    };

    // Parse body
    let body: {
      message?: string;
      sessionId?: string;
      phaseResults?: Record<string, unknown>;
      tier?: string;
      conversationHistory?: Array<{ role: string; content: string }>;
    };

    try {
      body = await req.json();
    } catch {
      send("error", { phase: "leader", error: "Body non valido" });
      closeStream();
      return;
    }

    const { message, phaseResults = {}, tier = "intern", conversationHistory = [] } = body;

    if (!message?.trim()) {
      send("error", { phase: "leader", error: "Messaggio vuoto" });
      closeStream();
      return;
    }

    // Context di sessione per tier isolation (come in /api/console/route.ts)
    const sessionCtx: SessionTierContext = {
      tier: tier as TierName,
      disabledAgents: new Set(),
      sid: `legaloffice-qa-${Date.now()}`,
    };

    await sessionTierStore.run(sessionCtx, async () => {
      try {
        await runLegalOfficeOrchestrator(
          {
            message: message.trim(),
            phaseResults,
            tier,
            conversationHistory,
          },
          {
            onAgentStart: (phase, modelInfo) => {
              sendAgent(phase, "running", modelInfo ? { modelInfo } : undefined);
            },
            onAgentDone: (phase, output, summary, timing) => {
              sendAgent(phase, "done", {
                output,
                ...(summary != null ? { summary } : {}),
                ...(timing != null ? { timing } : {}),
              });
            },
            onError: (phase, error) => {
              sendAgent(phase, "error", { error });
            },
            onComplete: (leaderAnswer, agentOutputs, decision) => {
              send("complete", {
                leaderAnswer,
                agentOutputs,
                route: decision.route,
              });
            },
          }
        );
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error("[LEGALOFFICE-ORCHESTRATOR] Errore:", errMsg);
        send("error", { phase: "leader", error: "Errore interno. Riprova." });
      }
    });

    closeStream();
  })();

  return new Response(stream, { headers: SSE_HEADERS });
}
