/**
 * Integration Context Loader — Fetches user-specific integration data
 * for the Integration Setup Agent v2.
 *
 * Queries:
 *   1. Active connections (integration_connections)
 *   2. Record counts per connector (crm_records aggregate)
 *   3. Recent syncs (integration_sync_log)
 *   4. Credential status from vault (metadata only, no secrets)
 *
 * Formats everything as readable Italian text for the system prompt.
 *
 * Uses the admin (service_role) client to bypass RLS — the function
 * itself enforces user_id isolation in every query.
 */

import { createAdminClient } from "@/lib/supabase/admin";

// ─── Types ───

export interface IntegrationContext {
  connections: IntegrationConnection[];
  recordCounts: RecordCount[];
  recentSyncs: RecentSync[];
  credentialStatus: CredentialStatus[];
}

interface IntegrationConnection {
  id: string;
  connector_type: string;
  status: string;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface RecordCount {
  connector_source: string;
  object_type: string;
  count: number;
}

interface RecentSync {
  id: string;
  source_id: string;
  sync_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  items_fetched: number;
  items_inserted: number;
  items_updated: number;
  errors: number;
}

interface CredentialStatus {
  connector_source: string;
  credential_type: string;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

// ─── Loader ───

/**
 * Load the full integration context for a user.
 *
 * All queries filter by user_id and use the admin client.
 * If any query fails, that section returns empty (graceful degradation).
 */
export async function loadUserIntegrationContext(
  userId: string
): Promise<IntegrationContext> {
  const admin = createAdminClient();

  // Run all queries in parallel for speed
  const [connectionsResult, countsResult, syncsResult, credsResult] =
    await Promise.allSettled([
      // 1. Active connections
      admin
        .from("integration_connections")
        .select("id, connector_type, status, config, created_at, updated_at")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("created_at", { ascending: false }),

      // 2. Record counts per connector + object_type
      // Using a raw RPC or grouped query. Since Supabase JS doesn't support
      // GROUP BY natively, we fetch recent records and aggregate client-side.
      admin
        .from("crm_records")
        .select("connector_source, object_type")
        .eq("user_id", userId)
        .limit(5000),

      // 3. Recent syncs (last 10)
      admin
        .from("connector_sync_log")
        .select(
          "id, source_id, sync_type, status, started_at, completed_at, items_fetched, items_inserted, items_updated, errors"
        )
        .eq("user_id", userId)
        .order("started_at", { ascending: false })
        .limit(10),

      // 4. Credential status (metadata only — no decrypted secrets)
      admin
        .from("credential_vault")
        .select(
          "connector_source, credential_type, expires_at, last_used_at, created_at"
        )
        .eq("user_id", userId)
        .is("revoked_at", null),
    ]);

  // Extract results with graceful degradation
  const connections: IntegrationConnection[] =
    connectionsResult.status === "fulfilled" && connectionsResult.value.data
      ? (connectionsResult.value.data as IntegrationConnection[])
      : [];

  // Aggregate record counts client-side
  const recordCounts: RecordCount[] = [];
  if (countsResult.status === "fulfilled" && countsResult.value.data) {
    const rows = countsResult.value.data as Array<{
      connector_source: string;
      object_type: string;
    }>;
    const countMap: Record<string, number> = {};
    for (const row of rows) {
      const key = `${row.connector_source}::${row.object_type}`;
      countMap[key] = (countMap[key] ?? 0) + 1;
    }
    for (const key of Object.keys(countMap)) {
      const [connector_source, object_type] = key.split("::");
      recordCounts.push({ connector_source, object_type, count: countMap[key] });
    }
  }

  const recentSyncs: RecentSync[] =
    syncsResult.status === "fulfilled" && syncsResult.value.data
      ? (syncsResult.value.data as RecentSync[])
      : [];

  const credentialStatus: CredentialStatus[] =
    credsResult.status === "fulfilled" && credsResult.value.data
      ? (credsResult.value.data as CredentialStatus[])
      : [];

  return {
    connections,
    recordCounts,
    recentSyncs,
    credentialStatus,
  };
}

// ─── Formatter ───

/**
 * Format the integration context as readable Italian text
 * for injection into the agent's system prompt.
 */
export function formatContextForPrompt(ctx: IntegrationContext): string {
  const lines: string[] = [];

  // ─── Connections ───

  if (ctx.connections.length === 0) {
    lines.push(
      "L'utente non ha ancora configurato nessuna integrazione attiva."
    );
  } else {
    lines.push(
      `L'utente ha ${ctx.connections.length} connessione/i attiva/e:`
    );
    lines.push("");

    for (const conn of ctx.connections) {
      const counts = ctx.recordCounts.filter(
        (c) => c.connector_source === conn.connector_type
      );
      const totalRecords = counts.reduce((sum, c) => sum + c.count, 0);

      const lastSync = ctx.recentSyncs.find(
        (s) =>
          s.source_id.includes(conn.connector_type) ||
          s.source_id === conn.id
      );

      const cred = ctx.credentialStatus.find(
        (c) => c.connector_source === conn.connector_type
      );

      const syncInfo = lastSync
        ? `ultimo sync: ${formatDate(lastSync.started_at)} (${lastSync.status}, ${lastSync.items_fetched} record recuperati)`
        : "nessun sync effettuato";

      const credInfo = cred
        ? cred.expires_at
          ? `credenziali: ${isExpired(cred.expires_at) ? "SCADUTE" : "valide"} (scadenza: ${formatDate(cred.expires_at)})`
          : "credenziali: attive (nessuna scadenza)"
        : "credenziali: non configurate";

      lines.push(
        `- **${conn.connector_type}**: ${totalRecords} record totali | ${syncInfo} | ${credInfo}`
      );

      // Detail per object type
      if (counts.length > 0) {
        const details = counts
          .sort((a, b) => b.count - a.count)
          .map((c) => `${c.object_type}: ${c.count}`)
          .join(", ");
        lines.push(`  Record per tipo: ${details}`);
      }
    }
  }

  // ─── Recent sync issues (if any) ───

  const failedSyncs = ctx.recentSyncs.filter((s) => s.status === "failed");
  if (failedSyncs.length > 0) {
    lines.push("");
    lines.push("**Sync recenti falliti:**");
    for (const sync of failedSyncs.slice(0, 3)) {
      lines.push(
        `- ${sync.source_id}: fallito il ${formatDate(sync.started_at)} (${sync.errors} errori)`
      );
    }
  }

  // ─── Expired credentials ───

  const expiredCreds = ctx.credentialStatus.filter(
    (c) => c.expires_at && isExpired(c.expires_at)
  );
  if (expiredCreds.length > 0) {
    lines.push("");
    lines.push("**Credenziali scadute (richiedono ri-autorizzazione):**");
    for (const cred of expiredCreds) {
      lines.push(
        `- ${cred.connector_source}: scadute il ${formatDate(cred.expires_at!)}`
      );
    }
  }

  return lines.join("\n");
}

// ─── Helpers ───

function formatDate(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoDate;
  }
}

function isExpired(isoDate: string): boolean {
  try {
    return new Date(isoDate).getTime() < Date.now();
  } catch {
    return false;
  }
}
