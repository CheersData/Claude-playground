import { NextRequest } from "next/server";
import { extractText } from "@/lib/extract-text";
import { runOrchestrator } from "@/lib/agents/orchestrator";
import { getAverageTimings } from "@/lib/analysis-cache";
import { auth, profiles } from "@/lib/db";
import { PLANS } from "@/lib/stripe";
import type { AgentPhase, PhaseStatus } from "@/lib/types";

export const maxDuration = 300; // 5 minutes for long-running analysis

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  // Check usage limits before starting the stream
  let userId: string | null = null;
  try {
    const user = await auth.getAuthenticatedUser();

    if (user) {
      userId = user.id;
      const profile = await profiles.getProfile(user.id);

      const plan = profile?.plan ?? "free";
      const used = profile?.analysesCount ?? 0;

      if (plan === "free" && used >= PLANS.free.analysesPerMonth) {
        return new Response(
          `event: error\ndata: ${JSON.stringify({
            message: "Hai raggiunto il limite di analisi gratuite per questo mese.",
            code: "LIMIT_REACHED",
          })}\n\n`,
          {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            },
          }
        );
      }
    }
  } catch {
    // Auth check failed — allow analysis (graceful degradation)
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        // Parse form data
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        const rawText = formData.get("text") as string | null;
        const resumeSessionId =
          (formData.get("sessionId") as string | null) || undefined;

        let documentText: string;

        if (rawText && rawText.trim().length > 0) {
          documentText = rawText;
        } else if (file) {
          send("progress", { phase: "upload", status: "running" });
          const buffer = Buffer.from(await file.arrayBuffer());
          documentText = await extractText(buffer, file.type, file.name);
          send("progress", { phase: "upload", status: "done" });
        } else {
          send("error", { message: "Nessun file o testo fornito" });
          return;
        }

        if (documentText.trim().length < 50) {
          send("error", {
            message:
              "Il testo estratto è troppo corto. Assicurati che il documento contenga testo leggibile.",
          });
          return;
        }

        // Send historical average timings so the client can calibrate the progress bar
        try {
          const avgTimings = await getAverageTimings();
          send("timing", avgTimings);
        } catch {
          // Non-critical — client will use defaults
        }

        // Run the 4-agent orchestrator with SSE callbacks
        const result = await runOrchestrator(
          documentText,
          {
            onProgress: (
              phase: AgentPhase,
              status: PhaseStatus,
              data?: unknown
            ) => {
              send("progress", { phase, status, data });
            },
            onError: (phase: AgentPhase, error: string) => {
              send("error", { phase, error });
            },
            onComplete: () => {
              // noop — complete event is sent below after result is available
            },
          },
          resumeSessionId
        );

        // Send the complete event now that result is fully populated
        send("complete", {
          advice: result.advice,
          classification: result.classification,
          analysis: result.analysis,
          investigation: result.investigation,
        });

        // Always send the sessionId so the frontend can resume later
        send("session", { sessionId: result.sessionId });

        // Increment analyses_count for authenticated users
        if (userId) {
          try {
            await profiles.incrementAnalysesCount(userId);
          } catch {
            // Non-critical — don't fail the analysis
            console.error("[ANALYZE] Failed to increment analyses_count");
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Errore sconosciuto";
        send("error", { message });
      } finally {
        try {
          controller.close();
        } catch {
          // Controller may already be closed from early returns
        }
      }
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
