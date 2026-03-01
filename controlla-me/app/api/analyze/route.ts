import { NextRequest, NextResponse } from "next/server";
import { extractText } from "@/lib/extract-text";
import { runOrchestrator } from "@/lib/agents/orchestrator";
import { getAverageTimings } from "@/lib/analysis-cache";
import { createClient } from "@/lib/supabase/server";
import { PLANS } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { sanitizeDocumentText } from "@/lib/middleware/sanitize";
import { requireAuth, isAuthError, type AuthResult } from "@/lib/middleware/auth";
import { checkCsrf } from "@/lib/middleware/csrf";
import type { AgentPhase, PhaseStatus } from "@/lib/types";

export const maxDuration = 300; // 5 minutes for long-running analysis

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  // CSRF check (FormData endpoint — SEC-004)
  const csrf = checkCsrf(req);
  if (csrf) return csrf;

  // Auth: usa requireAuth centralizzato (Security dept standard)
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult as NextResponse;
  const { user } = authResult as AuthResult;
  const userId = user.id;

  // Rate limit (dopo auth per avere userId)
  const limited = checkRateLimit(req, userId);
  if (limited) return limited;

  // Piano e utilizzo
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, analyses_count")
    .eq("id", userId)
    .single();

  const plan = (profile?.plan as "free" | "pro") || "free";
  const used = profile?.analyses_count ?? 0;

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

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      let analysisDbId: string | null = null;

      try {
        // Parse form data
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        const rawText = formData.get("text") as string | null;
        const resumeSessionId =
          (formData.get("sessionId") as string | null) || undefined;
        const userContext =
          (formData.get("context") as string | null)?.trim() || undefined;

        let documentText: string;

        if (rawText && rawText.trim().length > 0) {
          documentText = sanitizeDocumentText(rawText);
        } else if (file) {
          send("progress", { phase: "upload", status: "running" });
          const buffer = Buffer.from(await file.arrayBuffer());
          const rawDocText = await extractText(buffer, file.type, file.name);
          documentText = sanitizeDocumentText(rawDocText);
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

        // Persist analysis record in Supabase (status: processing)
        const fileName = file?.name ?? "testo-incollato.txt";
        if (userId) {
          try {
            const admin = createAdminClient();
            const { data: inserted } = await admin
              .from("analyses")
              .insert({
                user_id: userId,
                file_name: fileName,
                status: "processing",
              })
              .select("id")
              .single();
            analysisDbId = inserted?.id ?? null;
          } catch {
            // Non-critical — analysis proceeds even without DB record
            console.error("[ANALYZE] Failed to create analysis record");
          }
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
          resumeSessionId,
          userContext
        );

        // Send the complete event now that result is fully populated
        send("complete", {
          advice: result.advice,
          classification: result.classification,
          analysis: result.analysis,
          investigation: result.investigation,
        });

        // Always send the sessionId so the frontend can resume later
        send("session", {
          sessionId: result.sessionId,
          analysisId: analysisDbId,
        });

        // Persist results to Supabase + increment counter
        if (userId) {
          try {
            const admin = createAdminClient();

            // Update analysis record with results
            if (analysisDbId) {
              const fairnessScore =
                result.advice?.fairnessScore ?? null;
              const docType =
                result.classification?.documentTypeLabel ?? null;
              const summary =
                result.advice?.summary ?? null;

              await admin
                .from("analyses")
                .update({
                  status: "completed",
                  document_type: docType,
                  classification: result.classification,
                  analysis: result.analysis,
                  investigation: result.investigation,
                  advice: result.advice,
                  fairness_score: fairnessScore,
                  summary,
                  completed_at: new Date().toISOString(),
                })
                .eq("id", analysisDbId);
            }

            // Increment analyses_count
            await admin.rpc("increment_analyses_count", { uid: userId });
          } catch {
            // Non-critical — don't fail the analysis
            console.error("[ANALYZE] Failed to persist analysis results");
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Errore sconosciuto";
        send("error", { message });

        // Mark analysis as failed in DB
        if (analysisDbId) {
          try {
            const admin = createAdminClient();
            await admin
              .from("analyses")
              .update({ status: "error" })
              .eq("id", analysisDbId);
          } catch {
            // Best-effort
          }
        }
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
