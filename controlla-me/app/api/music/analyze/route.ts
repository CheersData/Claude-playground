import { NextRequest } from "next/server";
import { requireAuth, isAuthError, type AuthResult } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkCsrf } from "@/lib/middleware/csrf";
import { createAdminClient } from "@/lib/supabase/admin";
import { broadcastConsoleAgent } from "@/lib/agent-broadcast";
import { spawn } from "child_process";
import path from "path";
import { existsSync } from "fs";
import { createSSEStream, SSE_HEADERS } from "@/lib/sse-stream-factory";

export const maxDuration = 600; // 10 minutes — audio processing is heavy

/** Music analysis pipeline stages (matches Python pipeline.py) */
type MusicStage =
  | "ingest"
  | "stem_separation"
  | "audio_analysis"
  | "save_results"
  | "trend_compare"
  | "arrangement_direction"
  | "quality_review"
  | "release_strategy"
  | "career_advice";

const STAGE_ORDER: MusicStage[] = [
  "ingest",
  "stem_separation",
  "audio_analysis",
  "save_results",
  "trend_compare",
  "arrangement_direction",
  "quality_review",
  "release_strategy",
  "career_advice",
];

/** Default estimated timings (seconds) for progress bar calibration */
const DEFAULT_TIMINGS: Record<MusicStage, number> = {
  ingest: 3,
  stem_separation: 120,
  audio_analysis: 30,
  save_results: 2,
  trend_compare: 10,
  arrangement_direction: 15,
  quality_review: 8,
  release_strategy: 15,
  career_advice: 20,
};

/** Path to the music Python project — turbopackIgnore prevents Turbopack from scanning the directory */
const MUSIC_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), "music");

/** Path to uploaded audio files (matches upload/route.ts) */
const UPLOAD_BASE_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), ".music-uploads");

export async function POST(req: NextRequest) {
  // CSRF check (FormData endpoint — SEC-004)
  const csrf = checkCsrf(req);
  if (csrf) return csrf;

  // Auth: optional — anonymous users can analyze (like /api/analyze for legal analysis)
  const authResult = await requireAuth();
  const user = isAuthError(authResult) ? null : (authResult as AuthResult).user;
  const userId = user?.id ?? null;

  // Rate limit (IP-based for anonymous, userId for authenticated)
  const limited = await checkRateLimit(req, userId ?? undefined);
  if (limited) return limited;

  const { stream, send, close: closeStream } = createSSEStream({ request: req });

  // Run the pipeline asynchronously
  (async () => {
      let analysisId: string | null = null;

      try {
        // Parse form data
        const formData = await req.formData();
        const analysisIdParam = formData.get("analysisId") as string | null;
        const dirId = (formData.get("dirId") as string | null) || userId;  // Filesystem directory ID from upload response
        const skipStems = formData.get("skipStems") === "true";
        const artistName = (formData.get("artistName") as string | null)?.trim() || null;
        const trackName = (formData.get("trackName") as string | null)?.trim() || null;

        if (!analysisIdParam) {
          send("error", {
            message: "ID analisi mancante. Carica prima il file audio tramite /api/music/upload.",
          });
          return;
        }

        analysisId = analysisIdParam;

        // Verify the analysis record exists and belongs to the user
        const admin = createAdminClient();
        const { data: record, error: fetchErr } = await admin
          .from("music_analyses")
          .select("id, file_name, status, user_id")
          .eq("id", analysisId)
          .single();

        if (fetchErr || !record) {
          send("error", {
            message: "Record di analisi non trovato. Ricarica il file audio.",
          });
          return;
        }

        // Ownership check: enforce only for authenticated users.
        // Anonymous uploads have user_id=NULL, so anyone with the analysisId can analyze.
        // Authenticated users can only analyze their own uploads.
        if (userId && record.user_id && record.user_id !== userId) {
          send("error", { message: "Non autorizzato ad analizzare questo file." });
          return;
        }

        if (record.status === "completed") {
          send("error", {
            message: "Questa analisi e' gia' stata completata.",
          });
          return;
        }

        // Find the uploaded file on disk
        // dirId comes from the upload response (userId for authenticated, anon-uuid for anonymous)
        const fileName = record.file_name as string;
        const fileExt = fileName.split(".").pop()?.toLowerCase() || "mp3";
        const effectiveDirId = dirId || record.user_id || "anon";
        const filePath = path.join(UPLOAD_BASE_DIR, effectiveDirId, `${analysisId}.${fileExt}`);

        if (!existsSync(filePath)) {
          send("error", {
            message: "File audio non trovato sul server. Ricaricalo tramite upload.",
          });
          return;
        }

        // Send estimated timings for client progress bar
        send("timing", DEFAULT_TIMINGS);
        send("session", { analysisId, fileName });

        // Update status to processing
        await admin
          .from("music_analyses")
          .update({ status: "processing" })
          .eq("id", analysisId);

        // Broadcast to ops dashboard
        broadcastConsoleAgent("music-pipeline", "running", {
          task: `Analisi audio: ${fileName}`,
        });

        // --- Run Python pipeline ---
        const result = await runPythonPipeline({
          filePath,
          analysisId,
          artistName,
          trackName,
          skipStems,
          send,
        });

        if (result.success) {
          // Send completion event with all enriched data
          send("complete", {
            analysisId,
            stages: result.stages,
            totalMs: result.totalMs,
            audioDna: result.audioDna,
            trendReport: result.trendReport,
            arrangementPlan: result.arrangementPlan,
            qualityReview: result.qualityReview,
            releaseStrategy: result.releaseStrategy,
            careerAdvice: result.careerAdvice,
          });

          broadcastConsoleAgent("music-pipeline", "done", {
            task: `Analisi completata: ${fileName}`,
          });
        } else {
          // Pipeline returned an error
          send("error", {
            message: result.error || "Errore durante l'analisi audio.",
            stage: result.failedStage,
          });

          // Mark as failed in DB
          await admin
            .from("music_analyses")
            .update({
              status: "failed",
            })
            .eq("id", analysisId);

          broadcastConsoleAgent("music-pipeline", "error", {
            task: `Analisi fallita: ${(result.error || "").slice(0, 80)}`,
          });
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Errore sconosciuto";
        send("error", { message });

        broadcastConsoleAgent("music-pipeline", "error", {
          task: `Analisi fallita: ${message.slice(0, 80)}`,
        });

        // Mark as failed in DB
        if (analysisId) {
          try {
            const admin = createAdminClient();
            await admin
              .from("music_analyses")
              .update({ status: "failed" })
              .eq("id", analysisId);
          } catch {
            // Best-effort
          }
        }
      } finally {
        closeStream();
      }
  })();

  return new Response(stream, { headers: SSE_HEADERS });
}

// ---------------------------------------------------------------------------
// Python Pipeline Runner
// ---------------------------------------------------------------------------

interface PipelineInput {
  filePath: string;
  analysisId: string;
  artistName: string | null;
  trackName: string | null;
  skipStems: boolean;
  send: (event: string, data: unknown) => void;
}

interface PipelineResult {
  success: boolean;
  stages?: Record<string, unknown>;
  totalMs?: number;
  audioDna?: Record<string, unknown>;
  trendReport?: Record<string, unknown>;
  arrangementPlan?: Record<string, unknown>;
  qualityReview?: Record<string, unknown>;
  releaseStrategy?: Record<string, unknown>;
  careerAdvice?: Record<string, unknown>;
  error?: string;
  failedStage?: string;
}

/**
 * Spawns the Python music analysis pipeline and parses its structured output.
 *
 * The Python pipeline (music/src/pipeline.py) is invoked via CLI.
 * We parse its stdout for JSON output and stderr for progress logging.
 *
 * If Python or the pipeline is not available, returns a graceful error.
 */
async function runPythonPipeline(input: PipelineInput): Promise<PipelineResult> {
  const { filePath, analysisId, artistName, trackName, skipStems, send } = input;

  // Determine Python executable — try venv first, then system
  const venvPython = path.join(MUSIC_DIR, ".venv", "bin", "python");
  const pythonCmd = existsSync(venvPython) ? venvPython : "python3";

  // Build command args
  const args = [
    "-m", "src.pipeline",
    "--input", filePath,
    "--analysis-id", analysisId,
  ];

  if (artistName) {
    args.push("--artist", artistName);
  }
  if (trackName) {
    args.push("--track", trackName);
  }
  if (skipStems) {
    args.push("--skip-stems");
  }

  return new Promise<PipelineResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let currentStage: MusicStage | null = null;
    let resolved = false;

    // Track which stages we have notified as done
    const stagesDone = new Set<string>();

    const safeResolve = (result: PipelineResult) => {
      if (!resolved) {
        resolved = true;
        resolve(result);
      }
    };

    let proc: ReturnType<typeof spawn>;

    try {
      const venvBinDir = path.join(MUSIC_DIR, ".venv", "bin");
      const venvDir = path.join(MUSIC_DIR, ".venv");
      proc = spawn(pythonCmd, args, {
        cwd: MUSIC_DIR,
        env: {
          ...process.env,
          // Activate the venv: set VIRTUAL_ENV and prepend venv bin + system paths to PATH.
          // PM2 passes a restricted PATH that may not include the venv or /usr/local/bin,
          // so we explicitly ensure all necessary directories are present.
          VIRTUAL_ENV: venvDir,
          PATH: `${venvBinDir}:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ""}`,
          // Ensure Python outputs are unbuffered for real-time streaming
          PYTHONUNBUFFERED: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 540_000, // 9 minutes (leave 1 min margin for the 600s maxDuration)
      });
    } catch (spawnError) {
      // Python not found or spawn failed
      const errMsg =
        spawnError instanceof Error ? spawnError.message : String(spawnError);

      if (errMsg.includes("ENOENT")) {
        safeResolve({
          success: false,
          error:
            "Python non trovato sul server. La pipeline di analisi audio richiede Python 3.11+ con le dipendenze installate.",
        });
      } else {
        safeResolve({
          success: false,
          error: `Impossibile avviare la pipeline: ${errMsg}`,
        });
      }
      return;
    }

    proc.stdout!.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr!.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;

      // Parse structlog output for stage progress
      // structlog lines look like: [info] stage_start stage=ingest ...
      // or: [info] stage_complete stage=audio_analysis ...
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Detect stage starts
        const stageStartMatch = trimmed.match(/stage_start.*stage[=:](\w+)/);
        if (stageStartMatch) {
          const stage = stageStartMatch[1] as MusicStage;
          if (STAGE_ORDER.includes(stage)) {
            currentStage = stage;
            send("progress", { phase: stage, status: "running" });
          }
          continue;
        }

        // Detect stage completions
        const stageCompleteMatch = trimmed.match(/stage_complete.*stage[=:](\w+)/);
        if (stageCompleteMatch) {
          const stage = stageCompleteMatch[1] as MusicStage;
          if (STAGE_ORDER.includes(stage) && !stagesDone.has(stage)) {
            stagesDone.add(stage);
            send("progress", { phase: stage, status: "done" });
          }
          continue;
        }

        // Detect stage skips
        const stageSkipMatch = trimmed.match(/stage_skip.*stage[=:](\w+)/);
        if (stageSkipMatch) {
          const stage = stageSkipMatch[1] as MusicStage;
          if (STAGE_ORDER.includes(stage)) {
            stagesDone.add(stage);
            send("progress", { phase: stage, status: "skipped" });
          }
          continue;
        }

        // Detect stage errors (stages 5-6 use stage_error for graceful degradation)
        const stageErrorMatch = trimmed.match(/stage_error.*stage[=:](\w+)/);
        if (stageErrorMatch) {
          const stage = stageErrorMatch[1] as MusicStage;
          if (STAGE_ORDER.includes(stage) && !stagesDone.has(stage)) {
            stagesDone.add(stage);
            send("progress", { phase: stage, status: "error" });
          }
          continue;
        }

        // Detect ingest_complete (pipeline.py logs this instead of stage_complete for ingest)
        if (trimmed.includes("ingest_complete") && !stagesDone.has("ingest")) {
          stagesDone.add("ingest");
          send("progress", { phase: "ingest", status: "done" });
          continue;
        }

        // Detect pipeline_complete
        if (trimmed.includes("pipeline_complete")) {
          // Mark any remaining stages as done
          for (const stage of STAGE_ORDER) {
            if (!stagesDone.has(stage)) {
              stagesDone.add(stage);
              send("progress", { phase: stage, status: "done" });
            }
          }
          continue;
        }

        // Detect pipeline_error
        if (trimmed.includes("pipeline_error")) {
          const errorMatch = trimmed.match(/error[=:]([^\s]+(?:\s[^\s]+)*)/);
          if (errorMatch && currentStage) {
            send("progress", { phase: currentStage, status: "error" });
          }
        }
      }
    });

    proc.on("error", (err: Error) => {
      if (err.message.includes("ENOENT")) {
        safeResolve({
          success: false,
          error:
            "Python non trovato sul server. La pipeline di analisi audio richiede Python 3.11+ con le dipendenze installate.",
        });
      } else {
        safeResolve({
          success: false,
          error: `Errore nel processo pipeline: ${err.message}`,
        });
      }
    });

    proc.on("close", (code: number | null) => {
      if (code === 0) {
        // Try to parse the structured output from stdout
        const result = parsePipelineOutput(stdout);
        safeResolve(result);
      } else {
        console.error(`[Music Pipeline] Process exited with code ${code}. stderr: ${stderr.slice(0, 2000)}`);
        // Extract meaningful error from stderr
        const errorMsg = extractErrorFromStderr(stderr);
        safeResolve({
          success: false,
          error: errorMsg || `La pipeline e' terminata con codice ${code}.`,
          failedStage: currentStage || undefined,
        });
      }
    });
  });
}

/**
 * Parse the final JSON output from the Python pipeline's stdout.
 *
 * The pipeline CLI prints a summary block to stdout. We look for JSON-like
 * output or parse the structured summary lines.
 */
function parsePipelineOutput(stdout: string): PipelineResult {
  // Try to find a JSON block in stdout
  const jsonMatch = stdout.match(/\{[\s\S]*"analysis_id"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        success: true,
        stages: parsed.stages,
        totalMs: parsed.total_ms,
        audioDna: parsed.stages?.audio_analysis?.audio_dna,
        trendReport: parsed.stages?.trend_compare?.trend_report,
        arrangementPlan: parsed.stages?.arrangement_direction?.arrangement_plan,
        qualityReview: parsed.stages?.quality_review?.quality_review,
        releaseStrategy: parsed.stages?.release_strategy?.release_strategy,
        careerAdvice: parsed.stages?.career_advice?.career_advice,
      };
    } catch {
      // JSON parse failed — fall through to text parsing
    }
  }

  // If the pipeline completed (exit code 0) but we can't parse JSON,
  // return a success with minimal data. The results were saved to DB
  // by the Python pipeline itself (stage 4: save_results).
  if (stdout.includes("Analysis:") || stdout.includes("pipeline_complete")) {
    return {
      success: true,
      stages: {},
      totalMs: 0,
    };
  }

  // If stdout is empty or unparseable, the pipeline likely completed
  // but didn't produce expected output
  return {
    success: true,
    stages: {},
    totalMs: 0,
  };
}

/**
 * Extract a user-friendly error message from Python stderr output.
 *
 * The pipeline emits structlog lines to stderr. When Demucs crashes (OOM, SIGKILL),
 * the pipeline catches it and continues without stems — so the process may still
 * exit 0. When it exits non-zero, we parse stderr for the real root cause.
 */
function extractErrorFromStderr(stderr: string): string {
  if (!stderr.trim()) {
    return "Errore sconosciuto nella pipeline audio.";
  }

  console.error("[Music Pipeline] stderr output:", stderr.slice(0, 2000));

  // Check for common Python errors — order matters: most specific first

  // Demucs / stem separation crashes (OOM, killed by OS, SIGKILL)
  if (
    stderr.includes("StemSeparationError") ||
    stderr.includes("Demucs exited with code") ||
    stderr.includes("Demucs timed out") ||
    stderr.includes("demucs_oom") ||
    stderr.includes("Demucs killed by OS")
  ) {
    // Extract the actual error detail if available
    const detailMatch = stderr.match(/StemSeparationError[:\s]+(.+?)(?:\n|$)/);
    const detail = detailMatch ? detailMatch[1].trim().slice(0, 150) : "";
    return `Separazione stem fallita: ${detail || "memoria insufficiente"}. La pipeline continua automaticamente senza stem separation.`;
  }

  // OS-level kill / OOM (outside of Demucs context — e.g., the whole Python process was killed)
  if (
    stderr.includes("Killed") ||
    stderr.includes("MemoryError") ||
    stderr.includes("Cannot allocate memory")
  ) {
    return "Processo terminato dal sistema operativo (memoria insufficiente). Riprova con --skip-stems o su un server con piu' RAM.";
  }

  if (stderr.includes("Demucs is not installed")) {
    return "Demucs non installato. La separazione degli stem richiede: pip install demucs";
  }

  if (stderr.includes("CUDA out of memory") || stderr.includes("OutOfMemoryError")) {
    return "Memoria GPU insufficiente per l'elaborazione. La pipeline riprova automaticamente su CPU.";
  }

  if (stderr.includes("ModuleNotFoundError: No module named")) {
    const moduleMatch = stderr.match(/No module named ['"]?([^'"\s;]+)['"]?/);
    const moduleName = moduleMatch ? moduleMatch[1] : "sconosciuto";
    return `Dipendenza Python mancante: ${moduleName}. Installa le dipendenze con: cd music && source .venv/bin/activate && pip install -e .`;
  }

  if (stderr.includes("TypeError")) {
    const typeErrorMatch = stderr.match(/TypeError:\s*(.+)/);
    const errorDetail = typeErrorMatch ? typeErrorMatch[1].trim() : "";
    if (errorDetail.length > 200) return errorDetail.slice(0, 200) + "...";
    return errorDetail || "Errore di tipo nella pipeline audio.";
  }

  if (stderr.includes("FileNotFoundError")) {
    return "File audio non trovato durante l'elaborazione.";
  }

  if (stderr.includes("File too large")) {
    return "Il file audio e' troppo grande per l'elaborazione.";
  }

  if (stderr.includes("Unsupported format")) {
    return "Formato audio non supportato dalla pipeline di analisi.";
  }

  // Last resort: grab the last meaningful Python error line (Traceback lines, not structlog noise)
  const lines = stderr.trim().split("\n").filter((l) => l.trim());
  // Look for the actual exception line (typically the last line starting with a class name + colon)
  let lastMeaningful = "";
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    // Skip empty lines and structlog JSON lines
    if (!line || line.startsWith("{") || line.startsWith("[")) continue;
    // Python exception lines typically look like "ExceptionName: message"
    if (/^[A-Z]\w*(Error|Exception|Warning):/.test(line)) {
      lastMeaningful = line;
      break;
    }
    // Fallback: take the last non-empty, non-structlog line
    if (!lastMeaningful) {
      lastMeaningful = line;
    }
  }

  // Limit to 200 chars for safety
  if (lastMeaningful.length > 200) {
    return lastMeaningful.slice(0, 200) + "...";
  }

  return lastMeaningful || "Errore sconosciuto nella pipeline audio.";
}
