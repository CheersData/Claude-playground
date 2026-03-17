/**
 * API Route: /api/integrations/[connectorId]/sync
 *
 * GET  — Poll sync progress (used by SyncProgress.tsx every 3s)
 * POST — Trigger a full end-to-end sync for a connected integration
 *
 * POST pipeline: FETCH → MAP → PERSIST → ANALYZE → INDEX → NOTIFY
 *
 *   1. Retrieve credentials from vault
 *   2. Delegate to executeFullSync (sync-dispatcher.ts) which handles:
 *      a. Fetch records from external connector
 *      b. Apply field mapping (rule → similarity → LLM)
 *      c. Persist to crm_records (upsert with external_id dedup)
 *      d. Analyze document-type records via 4-agent legal pipeline
 *      e. Auto-index results in vector DB
 *      f. Emit progress events
 *   3. Update integration_sync_log with accurate counters
 *   4. Update integration_connections.last_sync_at / last_sync_items
 *
 * POST supports two modes:
 *   - JSON (default): returns full result as JSON when pipeline completes
 *   - SSE streaming: when `?stream=true` query param or `Accept: text/event-stream`
 *     header is present, returns real-time events via Server-Sent Events with
 *     Sync Supervisor AI commentary at each stage transition
 *
 * GET returns the latest sync_log status for this user+connector,
 * estimating the current pipeline stage from elapsed time when
 * the sync is still running (the POST is synchronous, so counters
 * are 0 until completion).
 *
 * Uses dynamic dispatch via sync-dispatcher.ts — adding a new connector
 * to the registry is all that's needed for it to work here.
 * No modifications to this file required when adding new connectors.
 *
 * Security: requireAuth + rate-limit (POST also: CSRF)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkCsrf } from "@/lib/middleware/csrf";
import { getVaultOrNull } from "@/lib/credential-vault";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  executeFullSync,
  hasSyncHandler,
  listSyncHandlers,
  type SyncEvent,
  type FullSyncResult,
} from "@/lib/staff/data-connector/sync-dispatcher";
import { generateSupervisorComment } from "@/lib/agents/sync-supervisor";

// ─── GET: Poll sync progress ───
//
// Returns the latest sync status for the current user+connector.
// SyncProgress.tsx polls this every 3 seconds during an active sync.
// Since the POST handler is synchronous (items_fetched/items_processed stay 0
// until completion), we estimate the current stage from elapsed time when
// the sync is still running.

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ connectorId: string }> }
) {
  // Rate limit (polling every 3s — generous limit)
  const rateLimited = await checkRateLimit(req);
  if (rateLimited) return rateLimited;

  // Auth
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const userId = authResult.user.id;
  const { connectorId } = await params;

  const admin = createAdminClient();

  // Find the latest sync_log for this user+connector via integration_connections
  const { data: syncLog, error: queryError } = await admin
    .from("integration_sync_log")
    .select(
      `
      id,
      status,
      started_at,
      completed_at,
      items_fetched,
      items_processed,
      items_failed,
      duration_ms,
      error_details,
      connection_id,
      integration_connections!inner (
        user_id,
        connector_type
      )
    `
    )
    .eq("integration_connections.user_id", userId)
    .eq("integration_connections.connector_type", connectorId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (queryError) {
    console.error("[Sync GET] Query error:", queryError.message);
    return NextResponse.json(
      { error: "Errore nel recupero stato sync" },
      { status: 500 }
    );
  }

  // No sync ever started — return idle/done so the UI doesn't hang
  if (!syncLog) {
    return NextResponse.json({
      stage: "done" as const,
      progress: 100,
      recordsSynced: 0,
      recordsTotal: 0,
      message: "Nessuna sincronizzazione recente",
    });
  }

  // ── Terminal states ──

  if (syncLog.status === "success") {
    return NextResponse.json({
      stage: "done" as const,
      progress: 100,
      recordsSynced: syncLog.items_processed ?? 0,
      recordsTotal: syncLog.items_fetched ?? 0,
      message: "Sincronizzazione completata con successo",
      startedAt: syncLog.started_at,
    });
  }

  if (syncLog.status === "error") {
    const errorDetails = syncLog.error_details as Record<string, unknown> | null;
    return NextResponse.json({
      stage: "error" as const,
      progress: 0,
      recordsSynced: syncLog.items_processed ?? 0,
      recordsTotal: syncLog.items_fetched ?? 0,
      message: "Sincronizzazione interrotta per errore",
      error:
        (errorDetails?.message as string) ??
        "Errore durante la sincronizzazione",
      startedAt: syncLog.started_at,
    });
  }

  if (syncLog.status === "partial") {
    return NextResponse.json({
      stage: "done" as const,
      progress: 100,
      recordsSynced: syncLog.items_processed ?? 0,
      recordsTotal: syncLog.items_fetched ?? 0,
      message: `Sincronizzazione parziale: ${syncLog.items_processed ?? 0} elaborati, ${syncLog.items_failed ?? 0} falliti`,
      startedAt: syncLog.started_at,
    });
  }

  // ── Running state — estimate stage from timing ──

  const startedAt = syncLog.started_at
    ? new Date(syncLog.started_at).getTime()
    : Date.now();
  const elapsedMs = Date.now() - startedAt;
  const elapsedSec = elapsedMs / 1000;

  // If error_details already has stage_durations (written mid-sync), use them
  const errorDetails = syncLog.error_details as Record<string, unknown> | null;
  const stageDurations = errorDetails?.stage_durations as
    | Record<string, number>
    | undefined;

  let stage: string;
  let progress: number;
  let message: string;

  if (stageDurations) {
    // Use actual stage durations to determine current stage
    const fetchDone = (stageDurations.fetch ?? 0) > 0;
    const mapDone = (stageDurations.map ?? 0) > 0;
    const analyzeDone = (stageDurations.analyze ?? 0) > 0;

    if (analyzeDone) {
      stage = "analyzing";
      progress = 85;
      message = "Finalizzazione analisi AI...";
    } else if (mapDone) {
      stage = "analyzing";
      progress = 70;
      message = "Analisi legale dei documenti importati...";
    } else if (fetchDone) {
      stage = "mapping";
      progress = 45;
      message = "Normalizzazione e trasformazione campi...";
    } else {
      stage = "fetching";
      progress = 20;
      message = "Download record dalla piattaforma...";
    }
  } else {
    // Estimate stage from elapsed time
    if (elapsedSec < 3) {
      stage = "connecting";
      progress = 5;
      message = "Verifica credenziali e permessi...";
    } else if (elapsedSec < 10) {
      stage = "fetching";
      progress = 15 + Math.min(15, Math.floor((elapsedSec - 3) * 2));
      message = "Download record dalla piattaforma...";
    } else if (elapsedSec < 20) {
      stage = "mapping";
      progress = 35 + Math.min(20, Math.floor((elapsedSec - 10) * 2));
      message = "Normalizzazione e trasformazione campi...";
    } else {
      stage = "analyzing";
      progress = 60 + Math.min(30, Math.floor((elapsedSec - 20) * 0.5));
      message = "Analisi legale dei documenti importati...";
    }
  }

  // If we have actual counters, use them for records
  const recordsSynced = syncLog.items_processed ?? 0;
  const recordsTotal = syncLog.items_fetched ?? 0;

  // If items_fetched > 0 and items_processed > 0, compute a better progress
  if (recordsTotal > 0 && recordsSynced > 0) {
    const ratio = recordsSynced / recordsTotal;
    progress = Math.max(progress, Math.round(ratio * 90)); // cap at 90 until truly done
  }

  return NextResponse.json({
    stage,
    progress: Math.min(progress, 95), // never 100 while running
    recordsSynced,
    recordsTotal,
    message,
    startedAt: syncLog.started_at,
  });
}

// ─── Helpers ───

/** Detect if the client is requesting SSE streaming mode. */
function isStreamingRequest(req: NextRequest): boolean {
  const streamParam = req.nextUrl.searchParams.get("stream");
  if (streamParam === "true") return true;
  const accept = req.headers.get("accept") ?? "";
  return accept.includes("text/event-stream");
}

/** Map sync-dispatcher stage names to supervisor-friendly stage names. */
function mapSyncStage(
  dispatcherStage: string
): "connecting" | "fetching" | "mapping" | "analyzing" | "done" | "error" {
  switch (dispatcherStage) {
    case "fetch":
      return "fetching";
    case "map":
      return "mapping";
    case "persist":
      return "mapping"; // persist is part of the mapping phase from user's perspective
    case "analyze":
    case "index":
      return "analyzing";
    case "complete":
      return "done";
    case "error":
      return "error";
    default:
      return "connecting";
  }
}

/** Estimate progress percentage from dispatcher stage. */
function estimateProgressFromStage(
  stage: string,
  event?: SyncEvent
): number {
  switch (stage) {
    case "fetch":
      return 15;
    case "map":
      return 35;
    case "persist": {
      if (event?.progress) {
        const { current, total } = event.progress;
        return total > 0 ? 35 + Math.round((current / total) * 20) : 50;
      }
      return 50;
    }
    case "analyze": {
      if (event?.progress) {
        const { current, total } = event.progress;
        return total > 0 ? 60 + Math.round((current / total) * 30) : 75;
      }
      return 70;
    }
    case "index":
      return 90;
    case "complete":
      return 100;
    default:
      return 5;
  }
}

// ─── Common: Auth + Validation for POST ───

interface SyncPreflightResult {
  userId: string;
  connectorId: string;
  body: Record<string, unknown>;
  connectionId: string;
  connectionConfig: Record<string, unknown>;
  accessToken: string;
  syncLogId: string | null;
  admin: ReturnType<typeof createAdminClient>;
}

/**
 * Shared preflight logic for POST (both streaming and non-streaming).
 * Returns either a SyncPreflightResult on success or a NextResponse error.
 */
async function syncPreflight(
  req: NextRequest,
  params: Promise<{ connectorId: string }>
): Promise<SyncPreflightResult | NextResponse> {
  // CSRF
  const csrfBlocked = checkCsrf(req);
  if (csrfBlocked) return csrfBlocked;

  // Rate limit
  const rateLimited = await checkRateLimit(req);
  if (rateLimited) return rateLimited;

  // Auth
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const userId = authResult.user.id;
  const { connectorId } = await params;

  // Parse request body for optional pipeline configuration
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is fine — all options have defaults
  }

  // Validate sync handler exists in the dynamic registry
  if (!hasSyncHandler(connectorId)) {
    return NextResponse.json(
      {
        error: `Sync non supportato per connettore '${connectorId}'. ` +
          `Connettori disponibili: ${listSyncHandlers().join(", ") || "(nessuno)"}`,
      },
      { status: 400 }
    );
  }

  // Get vault
  const vault = getVaultOrNull();
  if (!vault) {
    return NextResponse.json(
      {
        error:
          "Credential vault non configurato (VAULT_ENCRYPTION_KEY mancante)",
      },
      { status: 500 }
    );
  }

  // Retrieve credentials
  const credentials = await vault.getCredential(userId, connectorId);
  const accessToken = credentials?.access_token || credentials?.api_key;
  if (!credentials || !accessToken) {
    return NextResponse.json(
      { error: "Credenziali non trovate. Riautorizza il connettore." },
      { status: 401 }
    );
  }

  const admin = createAdminClient();

  // Verify connection exists and is active
  const { data: connection, error: connError } = await admin
    .from("integration_connections")
    .select("id, status, config")
    .eq("user_id", userId)
    .eq("connector_type", connectorId)
    .neq("status", "disconnected")
    .maybeSingle();

  if (connError || !connection) {
    return NextResponse.json(
      { error: "Connessione non trovata o non attiva" },
      { status: 404 }
    );
  }

  // Create sync_log entry
  const { data: syncLog, error: logError } = await admin
    .from("integration_sync_log")
    .insert({
      connection_id: connection.id,
      user_id: userId,
      status: "running",
      started_at: new Date().toISOString(),
      items_fetched: 0,
      items_processed: 0,
      items_failed: 0,
    })
    .select("id")
    .single();

  if (logError) {
    console.error("[Sync] Failed to create sync_log:", logError.message);
  }

  return {
    userId,
    connectorId,
    body,
    connectionId: connection.id,
    connectionConfig: (connection.config as Record<string, unknown>) ?? {},
    accessToken,
    syncLogId: syncLog?.id ?? null,
    admin,
  };
}

// ─── Common: Post-sync DB updates ───

async function updateSyncResults(
  admin: ReturnType<typeof createAdminClient>,
  syncLogId: string | null,
  connectionId: string,
  result: FullSyncResult
): Promise<{ syncStatus: string; analysisSuccessCount: number; analysisFailCount: number }> {
  const syncStatus = result.fetchError
    ? "error"
    : result.persist.failed > 0 && result.persist.stored > 0
      ? "partial"
      : result.persist.failed > 0 && result.persist.stored === 0
        ? "error"
        : "success";

  const analysisSuccessCount = result.analysisResults.filter((r) => r.analysisId).length;
  const analysisFailCount = result.analysisResults.filter((r) => r.error).length;

  if (syncLogId) {
    await admin
      .from("integration_sync_log")
      .update({
        status: syncStatus,
        completed_at: new Date().toISOString(),
        items_fetched: result.itemsFetched,
        items_processed: result.persist.stored,
        items_failed: result.persist.failed,
        duration_ms: result.durationMs,
        error_details: result.fetchError
          ? { message: result.fetchError }
          : result.persist.errors.length > 0 || analysisFailCount > 0
            ? {
                persist_errors: result.persist.errors,
                mapped_items: result.itemsMapped,
                total_items: result.itemsFetched,
                analysis_success: analysisSuccessCount,
                analysis_failed: analysisFailCount,
                stage_durations: result.stageDurations,
              }
            : result.itemsMapped > 0
              ? {
                  mapped_items: result.itemsMapped,
                  total_items: result.itemsFetched,
                  analysis_success: analysisSuccessCount,
                  stage_durations: result.stageDurations,
                }
              : null,
      })
      .eq("id", syncLogId);
  }

  await admin
    .from("integration_connections")
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_items: result.persist.stored,
      status: syncStatus === "error" ? "error" : "active",
    })
    .eq("id", connectionId);

  return { syncStatus, analysisSuccessCount, analysisFailCount };
}

// ─── POST: Trigger sync ───

export const maxDuration = 300; // 5 minutes for long-running syncs with analysis

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ connectorId: string }> }
) {
  // Detect streaming mode BEFORE consuming the body
  const wantsStream = isStreamingRequest(req);

  // Run shared preflight (auth, validation, sync_log creation)
  const preflight = await syncPreflight(req, params);
  if (preflight instanceof NextResponse) return preflight;

  const {
    userId,
    connectorId,
    body,
    connectionId,
    connectionConfig,
    accessToken,
    syncLogId,
    admin,
  } = preflight;

  // Build common pipeline options
  const pipelineOptions = {
    fetchLimit: typeof body.fetchLimit === "number" ? body.fetchLimit : 200,
    skipAnalysis: body.skipAnalysis === true,
    analyzeEntityTypes: Array.isArray(body.analyzeEntityTypes)
      ? body.analyzeEntityTypes as string[]
      : undefined,
    maxAnalysisRecords: typeof body.maxAnalysisRecords === "number"
      ? body.maxAnalysisRecords
      : 10,
    connectionConfig,
    connectionId,
  };

  // ── SSE Streaming Mode ──

  if (wantsStream) {
    const encoder = new TextEncoder();

    // Track pipeline state for supervisor context
    let totalFetched = 0;
    let totalMapped = 0;
    const pipelineErrors: string[] = [];
    let lastSupervisorStage = "";

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          try {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
            );
          } catch {
            // Controller may be closed if client disconnected
          }
        };

        try {
          // Generate initial supervisor comment
          const connectComment = await generateSupervisorComment(
            "connecting",
            {
              connectorName: connectorId,
              connectorType: connectorId,
            }
          );
          send("supervisor", connectComment);

          // Execute the full sync pipeline with event callbacks
          const result = await executeFullSync(
            admin,
            userId,
            connectorId,
            accessToken,
            {
              ...pipelineOptions,
              log: (msg: string) => console.log(msg),
              onEvent: async (event: SyncEvent) => {
                // Track state
                if (event.progress) {
                  if (event.stage === "fetch") {
                    totalFetched = event.progress.total;
                  }
                  if (event.stage === "map") {
                    totalMapped = event.progress.current;
                  }
                }
                if (event.stage === "error" && event.data?.error) {
                  pipelineErrors.push(String(event.data.error));
                }

                // Send raw progress event
                const progress = estimateProgressFromStage(event.stage, event);
                send("progress", {
                  stage: mapSyncStage(event.stage),
                  progress,
                  recordsProcessed: event.progress?.current ?? 0,
                  recordsTotal: event.progress?.total ?? totalFetched,
                  message: event.message,
                });

                // Generate supervisor commentary on stage transitions
                const supervisorStage = mapSyncStage(event.stage);
                if (
                  supervisorStage !== lastSupervisorStage &&
                  event.stage !== "complete"
                ) {
                  lastSupervisorStage = supervisorStage;

                  // Fire-and-forget: don't block the pipeline on supervisor LLM calls
                  generateSupervisorComment(supervisorStage, {
                    connectorName: connectorId,
                    connectorType: connectorId,
                    recordsFetched: totalFetched,
                    recordsMapped: totalMapped,
                    errors: pipelineErrors.length > 0 ? pipelineErrors : undefined,
                  })
                    .then((comment) => send("supervisor", comment))
                    .catch((err) =>
                      console.warn(
                        `[Sync SSE] Supervisor comment failed: ${err instanceof Error ? err.message : String(err)}`
                      )
                    );
                }
              },
            }
          );

          // Update DB with results
          const { analysisSuccessCount, analysisFailCount } =
            await updateSyncResults(admin, syncLogId, connectionId, result);

          // Send complete event with full results
          send("complete", {
            itemsFetched: result.itemsFetched,
            itemsMapped: result.itemsMapped,
            persist: {
              stored: result.persist.stored,
              failed: result.persist.failed,
            },
            analysisResults: result.analysisResults,
            analysisSuccessCount,
            analysisFailCount,
            durationMs: result.durationMs,
            stageDurations: result.stageDurations,
          });

          // Final supervisor commentary
          const doneComment = await generateSupervisorComment("done", {
            connectorName: connectorId,
            connectorType: connectorId,
            recordsFetched: result.itemsFetched,
            recordsMapped: result.itemsMapped,
            duration: result.durationMs,
            errors: result.fetchError ? [result.fetchError] : undefined,
          });
          send("supervisor", doneComment);

          // Signal stream end
          send("done", {});
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Errore sconosciuto";

          // Try to generate a supervisor error comment
          try {
            const errorComment = await generateSupervisorComment("error", {
              connectorName: connectorId,
              connectorType: connectorId,
              errors: [message],
            });
            send("supervisor", errorComment);
          } catch {
            // Supervisor itself failed — send raw error
          }

          send("error", { message });
          send("done", {});
        } finally {
          try {
            controller.close();
          } catch {
            // Controller may already be closed
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

  // ── JSON Mode (default — existing behavior) ──

  const result = await executeFullSync(
    admin,
    userId,
    connectorId,
    accessToken,
    {
      ...pipelineOptions,
      log: (msg: string) => console.log(msg),
    }
  );

  // Update DB with results
  const { syncStatus, analysisSuccessCount, analysisFailCount } =
    await updateSyncResults(admin, syncLogId, connectionId, result);

  // Return response
  if (result.fetchError) {
    return NextResponse.json(
      {
        success: false,
        error: result.fetchError,
        syncLogId,
        durationMs: result.durationMs,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    success: true,
    // Fetch + Map
    itemCount: result.itemsFetched,
    itemsMapped: result.itemsMapped,
    // Persist
    itemsStored: result.persist.stored,
    itemsFailed: result.persist.failed,
    // Analysis
    itemsAnalyzed: analysisSuccessCount,
    analysisFailed: analysisFailCount,
    analysisSkipped: result.analysisSkipped,
    analysisResults: result.analysisResults,
    // Metadata
    syncLogId,
    durationMs: result.durationMs,
    stageDurations: result.stageDurations,
  });
}
