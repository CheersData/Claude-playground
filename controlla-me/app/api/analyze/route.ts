import { NextRequest } from "next/server";
import { extractText } from "@/lib/extract-text";
import { runOrchestrator } from "@/lib/agents/orchestrator";
import type { AgentPhase, PhaseStatus } from "@/lib/types";

export const maxDuration = 300; // 5 minutes for long-running analysis

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

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
          controller.close();
          return;
        }

        if (documentText.trim().length < 50) {
          send("error", {
            message:
              "Il testo estratto è troppo corto. Assicurati che il documento contenga testo leggibile.",
          });
          controller.close();
          return;
        }

        // Run the 4-agent orchestrator with SSE callbacks
        const result = await runOrchestrator(documentText, {
          onProgress: (phase: AgentPhase, status: PhaseStatus, data?: unknown) => {
            send("progress", { phase, status, data });
          },
          onError: (phase: AgentPhase, error: string) => {
            send("error", { phase, error });
          },
          onComplete: (advice) => {
            send("complete", {
              advice,
              classification: result?.classification,
              analysis: result?.analysis,
              investigation: result?.investigation,
            });
          },
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Errore sconosciuto";
        send("error", { message });
      } finally {
        controller.close();
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
