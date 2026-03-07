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

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  // Rate limiting
  const rl = await checkRateLimit(req);
  if (rl) return rl;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // Controller potrebbe essere già chiuso
        }
      };

      const sendAgent = (
        phase: string,
        status: "running" | "done" | "error",
        extra?: Record<string, unknown>
      ) => send("agent", { phase, status, ...extra });

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
        controller.close();
        return;
      }

      const { message, phaseResults = {}, tier = "intern", conversationHistory = [] } = body;

      if (!message?.trim()) {
        send("error", { phase: "leader", error: "Messaggio vuoto" });
        controller.close();
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

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
