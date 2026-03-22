/**
 * Sync Scheduler — Polling-based sync for connectors without webhook support.
 *
 * For connectors like Google Drive (free tier) that don't support push
 * notifications, this scheduler periodically checks for changes and triggers
 * a sync via executeFullSync().
 *
 * Architecture:
 * - Reads active integration_connections from the database
 * - Determines which connections need syncing based on their schedule
 * - Triggers executeFullSync() with delta mode (only changed records)
 * - Implements exponential backoff on failures (15m -> 30m -> 1h -> 2h -> stop)
 * - Retry logic: up to 3 retries, then marks connection as "error"
 *
 * Designed to be called from:
 * 1. A cron endpoint (e.g. /api/platform/cron/sync-scheduler) triggered by Vercel Cron
 * 2. A standalone Node.js process for local development
 *
 * This module is stateless — all state is in the database. Multiple instances
 * can run safely (idempotent via connection.status checks).
 *
 * Backoff schedule (consecutive failures):
 *   Failure 1: wait 15 minutes (default interval, retry immediately on next run)
 *   Failure 2: wait 30 minutes
 *   Failure 3: wait 1 hour
 *   After 3 failures: mark connection as "error", stop polling
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getVaultOrNull } from "@/lib/credential-vault";
import {
  executeFullSync,
  hasSyncHandler,
  type FullSyncResult,
} from "./sync-dispatcher";

// ─── Configuration ───

/** Default poll interval per connector in minutes. */
const DEFAULT_POLL_INTERVALS: Record<string, number> = {
  "google-drive": 15,
  hubspot: 30,
  "fatture-in-cloud": 30,
  salesforce: 30,
  stripe: 60,
};

/** Minimum poll interval to prevent abuse (5 minutes). */
const MIN_POLL_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Backoff multipliers for consecutive failures.
 * Index = failure count - 1. After the last entry, polling stops.
 */
const BACKOFF_MULTIPLIERS = [1, 2, 4, 8];

/** Maximum number of retries before marking the connection as error. */
const MAX_RETRIES = 3;

// ─── Types ───

export interface SchedulerResult {
  /** Total active connections checked */
  connectionsChecked: number;
  /** Connections that were synced */
  connectionsSynced: number;
  /** Connections skipped (not due yet, already syncing, etc.) */
  connectionsSkipped: number;
  /** Connections that failed */
  connectionsFailed: number;
  /** Connections marked as error (exceeded max retries) */
  connectionsErrored: number;
  /** Per-connection details */
  details: SyncAttemptResult[];
  /** Total duration in milliseconds */
  durationMs: number;
}

export interface SyncAttemptResult {
  connectionId: string;
  connectorId: string;
  userId: string;
  action: "synced" | "skipped" | "failed" | "errored";
  reason?: string;
  syncResult?: {
    itemsFetched: number;
    itemsStored: number;
    durationMs: number;
  };
  error?: string;
}

interface ConnectionRecord {
  id: string;
  user_id: string;
  connector_type: string;
  status: string;
  config: Record<string, unknown>;
  last_sync_at: string | null;
  consecutive_failures: number;
  poll_interval_minutes: number | null;
}

// ─── Main Scheduler ───

/**
 * Run the sync scheduler.
 *
 * Queries all active integration connections, determines which ones are
 * due for a sync, and executes them sequentially (to avoid overwhelming
 * external APIs).
 *
 * @param options.connectorFilter - Only schedule syncs for this connector type
 * @param options.maxConnections - Maximum connections to sync in one run (default: 20)
 * @param options.forceSyncAll - Ignore poll intervals, sync everything
 * @param options.log - Custom logger
 */
export async function runSyncScheduler(options?: {
  connectorFilter?: string;
  maxConnections?: number;
  forceSyncAll?: boolean;
  log?: (msg: string) => void;
}): Promise<SchedulerResult> {
  const log = options?.log ?? console.log;
  const maxConnections = options?.maxConnections ?? 20;
  const startTime = Date.now();

  const result: SchedulerResult = {
    connectionsChecked: 0,
    connectionsSynced: 0,
    connectionsSkipped: 0,
    connectionsFailed: 0,
    connectionsErrored: 0,
    details: [],
    durationMs: 0,
  };

  // ── 1. Check vault availability ──

  const vault = getVaultOrNull();
  if (!vault) {
    log("[SYNC-SCHEDULER] Credential vault non disponibile, skip");
    result.durationMs = Date.now() - startTime;
    return result;
  }

  const admin = createAdminClient();

  // ── 2. Query active connections ──

  let query = admin
    .from("integration_connections")
    .select(
      "id, user_id, connector_type, status, config, last_sync_at, consecutive_failures, poll_interval_minutes"
    )
    .in("status", ["active", "error_retry"])
    .order("last_sync_at", { ascending: true, nullsFirst: true })
    .limit(maxConnections);

  if (options?.connectorFilter) {
    query = query.eq("connector_type", options.connectorFilter);
  }

  const { data: connections, error: queryError } = await query;

  if (queryError) {
    log(`[SYNC-SCHEDULER] Query error: ${queryError.message}`);
    result.durationMs = Date.now() - startTime;
    return result;
  }

  if (!connections || connections.length === 0) {
    log("[SYNC-SCHEDULER] Nessuna connessione attiva da sincronizzare");
    result.durationMs = Date.now() - startTime;
    return result;
  }

  result.connectionsChecked = connections.length;
  log(
    `[SYNC-SCHEDULER] ${connections.length} connessioni attive trovate`
  );

  // ── 3. Process each connection ──

  for (const conn of connections as ConnectionRecord[]) {
    const attemptResult = await processSingleConnection(
      admin,
      vault,
      conn,
      options?.forceSyncAll ?? false,
      log
    );

    result.details.push(attemptResult);

    switch (attemptResult.action) {
      case "synced":
        result.connectionsSynced++;
        break;
      case "skipped":
        result.connectionsSkipped++;
        break;
      case "failed":
        result.connectionsFailed++;
        break;
      case "errored":
        result.connectionsErrored++;
        break;
    }
  }

  result.durationMs = Date.now() - startTime;

  log(
    `[SYNC-SCHEDULER] Completato in ${(result.durationMs / 1000).toFixed(1)}s: ` +
      `${result.connectionsSynced} sincronizzate, ${result.connectionsSkipped} saltate, ` +
      `${result.connectionsFailed} fallite, ${result.connectionsErrored} in errore`
  );

  return result;
}

// ─── Single Connection Processing ───

async function processSingleConnection(
  admin: ReturnType<typeof createAdminClient>,
  vault: NonNullable<ReturnType<typeof getVaultOrNull>>,
  conn: ConnectionRecord,
  forceSyncAll: boolean,
  log: (msg: string) => void
): Promise<SyncAttemptResult> {
  const { id: connectionId, user_id: userId, connector_type: connectorId } = conn;

  // ── Check if sync handler is registered ──
  if (!hasSyncHandler(connectorId)) {
    return {
      connectionId,
      connectorId,
      userId,
      action: "skipped",
      reason: `Sync handler non registrato per '${connectorId}'`,
    };
  }

  // ── Check if currently syncing (prevent overlap) ──
  const { data: runningSyncs } = await admin
    .from("integration_sync_log")
    .select("id")
    .eq("connection_id", connectionId)
    .eq("status", "running")
    .limit(1);

  if (runningSyncs && runningSyncs.length > 0) {
    return {
      connectionId,
      connectorId,
      userId,
      action: "skipped",
      reason: "Sync gia' in corso",
    };
  }

  // ── Check if due for sync (poll interval + backoff) ──
  if (!forceSyncAll && !isDueForSync(conn)) {
    return {
      connectionId,
      connectorId,
      userId,
      action: "skipped",
      reason: "Non ancora il momento (intervallo + backoff)",
    };
  }

  // ── Retrieve credentials ──
  const credentials = await vault.getCredential(userId, connectorId);
  const accessToken = credentials?.access_token || credentials?.api_key;

  if (!credentials || !accessToken) {
    log(
      `[SYNC-SCHEDULER] ${connectorId}/${connectionId}: Credenziali non trovate, skip`
    );
    return {
      connectionId,
      connectorId,
      userId,
      action: "skipped",
      reason: "Credenziali non trovate o scadute",
    };
  }

  // ── Create sync log entry ──
  const { data: syncLog } = await admin
    .from("integration_sync_log")
    .insert({
      connection_id: connectionId,
      user_id: userId,
      status: "running",
      started_at: new Date().toISOString(),
      items_fetched: 0,
      items_processed: 0,
      items_failed: 0,
      error_details: { trigger: "scheduler" },
    })
    .select("id")
    .single();

  // ── Execute sync ──
  log(`[SYNC-SCHEDULER] ${connectorId}/${connectionId}: Avvio sync...`);

  let syncResult: FullSyncResult;
  try {
    syncResult = await executeFullSync(admin, userId, connectorId, accessToken, {
      fetchLimit: 200,
      skipAnalysis: true, // Scheduled syncs skip heavy analysis
      connectionConfig: conn.config,
      log: (msg) => log(`  ${msg}`),
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return handleSyncFailure(
      admin,
      conn,
      syncLog?.id ?? null,
      errorMessage,
      log
    );
  }

  // ── Handle result ──

  if (syncResult.fetchError) {
    return handleSyncFailure(
      admin,
      conn,
      syncLog?.id ?? null,
      syncResult.fetchError,
      log
    );
  }

  // Success: reset failure counter
  await admin
    .from("integration_connections")
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_items: syncResult.persist.stored,
      status: "active",
      consecutive_failures: 0,
    })
    .eq("id", connectionId);

  // Update sync log
  if (syncLog?.id) {
    await admin
      .from("integration_sync_log")
      .update({
        status:
          syncResult.persist.failed > 0 && syncResult.persist.stored > 0
            ? "partial"
            : "success",
        completed_at: new Date().toISOString(),
        items_fetched: syncResult.itemsFetched,
        items_processed: syncResult.persist.stored,
        items_failed: syncResult.persist.failed,
        duration_ms: syncResult.durationMs,
      })
      .eq("id", syncLog.id);
  }

  log(
    `[SYNC-SCHEDULER] ${connectorId}/${connectionId}: ` +
      `${syncResult.itemsFetched} fetched, ${syncResult.persist.stored} stored ` +
      `in ${(syncResult.durationMs / 1000).toFixed(1)}s`
  );

  return {
    connectionId,
    connectorId,
    userId,
    action: "synced",
    syncResult: {
      itemsFetched: syncResult.itemsFetched,
      itemsStored: syncResult.persist.stored,
      durationMs: syncResult.durationMs,
    },
  };
}

// ─── Polling interval calculation ───

/**
 * Determines if a connection is due for a sync based on:
 * 1. Poll interval (per-connector default or per-connection override)
 * 2. Exponential backoff from consecutive failures
 * 3. Last sync timestamp
 */
function isDueForSync(conn: ConnectionRecord): boolean {
  const now = Date.now();

  // Never synced — always due
  if (!conn.last_sync_at) return true;

  const lastSync = new Date(conn.last_sync_at).getTime();
  if (isNaN(lastSync)) return true;

  // Base interval: per-connection override or per-connector default
  const baseIntervalMin =
    conn.poll_interval_minutes ??
    DEFAULT_POLL_INTERVALS[conn.connector_type] ??
    15;

  const baseIntervalMs = baseIntervalMin * 60 * 1000;

  // Apply backoff multiplier for consecutive failures
  const failures = conn.consecutive_failures ?? 0;
  const backoffIndex = Math.min(failures, BACKOFF_MULTIPLIERS.length - 1);
  const multiplier = failures > 0 ? BACKOFF_MULTIPLIERS[backoffIndex] : 1;
  const effectiveInterval = Math.max(baseIntervalMs * multiplier, MIN_POLL_INTERVAL_MS);

  const elapsed = now - lastSync;
  return elapsed >= effectiveInterval;
}

// ─── Failure handling with retry logic ───

/**
 * Handles a failed sync attempt:
 * - Increments consecutive_failures counter
 * - If failures > MAX_RETRIES: marks connection as "error" (stop polling)
 * - Otherwise: marks as "error_retry" (will be retried with backoff)
 * - Updates sync log with error details
 */
async function handleSyncFailure(
  admin: ReturnType<typeof createAdminClient>,
  conn: ConnectionRecord,
  syncLogId: string | null,
  errorMessage: string,
  log: (msg: string) => void
): Promise<SyncAttemptResult> {
  const { id: connectionId, user_id: userId, connector_type: connectorId } = conn;
  const newFailureCount = (conn.consecutive_failures ?? 0) + 1;
  const exceededRetries = newFailureCount > MAX_RETRIES;

  log(
    `[SYNC-SCHEDULER] ${connectorId}/${connectionId}: Sync fallito ` +
      `(tentativo ${newFailureCount}/${MAX_RETRIES}): ${errorMessage}`
  );

  // Update connection status
  await admin
    .from("integration_connections")
    .update({
      consecutive_failures: newFailureCount,
      status: exceededRetries ? "error" : "error_retry",
      last_sync_at: new Date().toISOString(),
    })
    .eq("id", connectionId);

  // Update sync log
  if (syncLogId) {
    await admin
      .from("integration_sync_log")
      .update({
        status: "error",
        completed_at: new Date().toISOString(),
        error_details: {
          trigger: "scheduler",
          error: errorMessage,
          failure_count: newFailureCount,
          max_retries: MAX_RETRIES,
          will_retry: !exceededRetries,
        },
      })
      .eq("id", syncLogId);
  }

  if (exceededRetries) {
    log(
      `[SYNC-SCHEDULER] ${connectorId}/${connectionId}: ` +
        `Max retry superato (${MAX_RETRIES}), connessione in stato 'error'. ` +
        `L'utente deve riautorizzare per ripristinare.`
    );

    // TODO: notify user via email/Telegram that their connection has failed
  }

  return {
    connectionId,
    connectorId,
    userId,
    action: exceededRetries ? "errored" : "failed",
    error: errorMessage,
    reason: exceededRetries
      ? `Max retry superato (${MAX_RETRIES}), connessione disattivata`
      : `Tentativo ${newFailureCount}/${MAX_RETRIES}, prossimo retry con backoff`,
  };
}

// ─── Helpers ───

/**
 * Get the effective poll interval for a connector in minutes.
 * Returns the per-connection override if set, otherwise the default.
 */
export function getEffectivePollInterval(
  connectorId: string,
  connectionOverride?: number | null
): number {
  if (connectionOverride && connectionOverride > 0) {
    return connectionOverride;
  }
  return DEFAULT_POLL_INTERVALS[connectorId] ?? 15;
}

/**
 * Get the next sync time for a connection, considering backoff.
 * Returns an ISO string of when the next sync should occur.
 */
export function getNextSyncTime(
  lastSyncAt: string | null,
  connectorId: string,
  consecutiveFailures: number,
  pollIntervalOverride?: number | null
): string | null {
  if (!lastSyncAt) return new Date().toISOString(); // Due immediately

  const lastSync = new Date(lastSyncAt).getTime();
  if (isNaN(lastSync)) return new Date().toISOString();

  const baseIntervalMin = getEffectivePollInterval(connectorId, pollIntervalOverride);
  const baseIntervalMs = baseIntervalMin * 60 * 1000;

  const failures = consecutiveFailures ?? 0;
  const backoffIndex = Math.min(failures, BACKOFF_MULTIPLIERS.length - 1);
  const multiplier = failures > 0 ? BACKOFF_MULTIPLIERS[backoffIndex] : 1;
  const effectiveInterval = Math.max(baseIntervalMs * multiplier, MIN_POLL_INTERVAL_MS);

  return new Date(lastSync + effectiveInterval).toISOString();
}

/**
 * Resets the failure counter for a connection.
 * Called when a user re-authorizes a failed connection.
 */
export async function resetConnectionRetries(
  connectionId: string
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("integration_connections")
    .update({
      consecutive_failures: 0,
      status: "active",
    })
    .eq("id", connectionId);
}
