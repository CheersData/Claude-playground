/**
 * API Route: /api/integrations/dashboard
 *
 * Dashboard endpoint — returns all active connections with sync status,
 * entity breakdowns, and recent errors for the SyncDashboard component.
 *
 * GET — List all user connections with dashboard-ready data
 *
 * POST — Perform actions on connections (sync, pause, resume, disconnect)
 *
 * Security:
 * - requireAuth: all operations require authenticated user
 * - checkRateLimit: prevent abuse
 * - checkCsrf: POST protected against cross-site requests
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkCsrf } from "@/lib/middleware/csrf";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ─── Helpers ───

const CONNECTOR_NAMES: Record<string, string> = {
  "google-drive": "Google Drive",
  hubspot: "HubSpot",
  salesforce: "Salesforce",
  stripe: "Stripe",
  "fatture-in-cloud": "Fatture in Cloud",
  normattiva: "Normattiva",
  eurlex: "EUR-Lex",
  mailchimp: "Mailchimp",
  "universal-rest": "API REST Personalizzata",
  csv: "CSV / Excel",
};

const ICON_MAP: Record<string, string> = {
  stripe: "CreditCard",
  salesforce: "Building2",
  hubspot: "Users",
  "google-drive": "HardDrive",
  "fatture-in-cloud": "FileText",
  mailchimp: "Building2",
  normattiva: "Building2",
  eurlex: "Building2",
  "universal-rest": "Globe",
  csv: "FileSpreadsheet",
};

const CATEGORY_MAP: Record<string, string> = {
  stripe: "Pagamenti",
  salesforce: "CRM",
  hubspot: "CRM / Marketing",
  "google-drive": "Storage",
  "fatture-in-cloud": "Fatturazione IT",
  mailchimp: "Marketing",
  normattiva: "Legale",
  eurlex: "Legale",
  "universal-rest": "API Personalizzata",
  csv: "File Import",
};

function mapDbStatusToDashboard(
  dbStatus: string
): "synced" | "syncing" | "error" | "paused" | "disabled" {
  switch (dbStatus) {
    case "active":
    case "connected":
      return "synced";
    case "syncing":
      return "syncing";
    case "error":
      return "error";
    case "paused":
      return "paused";
    default:
      return "disabled";
  }
}

// ─── GET: Dashboard data ───

export async function GET(req: NextRequest) {
  // Rate limit
  const rateLimited = await checkRateLimit(req);
  if (rateLimited) return rateLimited;

  // Auth
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const userId = authResult.user.id;

  const supabase = await createClient();

  // Fetch all non-disconnected connections for this user
  const { data: connections, error: connError } = await supabase
    .from("integration_connections")
    .select(
      "id, connector_type, status, last_sync_at, last_sync_items, sync_frequency, config, created_at"
    )
    .eq("user_id", userId)
    .neq("status", "disconnected")
    .order("created_at", { ascending: false });

  if (connError) {
    console.error("[DASHBOARD] Connection query error:", connError.message);
    return NextResponse.json(
      { error: "Errore nel recupero delle connessioni" },
      { status: 500 }
    );
  }

  if (!connections || connections.length === 0) {
    return NextResponse.json({
      integrations: [],
      errors: [],
      syncHistory: [],
    });
  }

  // Fetch all sync logs from last 7 days across all connections
  // Used for: error log, per-connector sync counts, and global sync history
  const connectionIds = connections.map((c) => c.id);
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: allSyncLogs } = await supabase
    .from("integration_sync_log")
    .select(
      "connection_id, status, started_at, completed_at, items_processed, items_failed, error_details"
    )
    .in("connection_id", connectionIds)
    .gte("started_at", sevenDaysAgo)
    .order("started_at", { ascending: false })
    .limit(500);

  const syncLogs = allSyncLogs ?? [];

  // Extract error logs from all sync logs
  const errorLogs = syncLogs.filter((log) => log.status === "error");

  // Build per-connection sync record counts from last 7 days
  const perConnectionSyncRecords = new Map<
    string,
    { success: number; failed: number; syncCount: number }
  >();
  for (const log of syncLogs) {
    const connId = log.connection_id as string;
    const entry = perConnectionSyncRecords.get(connId) ?? {
      success: 0,
      failed: 0,
      syncCount: 0,
    };
    entry.success += (log.items_processed as number) ?? 0;
    entry.failed += (log.items_failed as number) ?? 0;
    entry.syncCount += 1;
    perConnectionSyncRecords.set(connId, entry);
  }

  // Build 7-day aggregated sync history across all connections
  const historyByDate = new Map<
    string,
    { success: number; failed: number }
  >();

  // Pre-fill 7 days with zeros (oldest first)
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    historyByDate.set(dateStr, { success: 0, failed: 0 });
  }

  for (const log of syncLogs) {
    const date = (log.started_at as string).split("T")[0];
    const entry = historyByDate.get(date);
    if (entry) {
      entry.success += (log.items_processed as number) ?? 0;
      entry.failed += (log.items_failed as number) ?? 0;
    }
  }

  const syncHistory = Array.from(historyByDate.entries()).map(
    ([date, stats]) => ({
      date,
      success: stats.success,
      failed: stats.failed,
    })
  );

  // Build dashboard integrations
  const integrations = connections.map((conn) => {
    const connectorType = conn.connector_type as string;
    const config = (conn.config as Record<string, unknown>) || {};
    const selectedEntities = (config.selectedEntities as string[]) || [];

    // Build entity breakdown
    const entities = selectedEntities.map((entityId: string) => ({
      name: entityId.charAt(0).toUpperCase() + entityId.slice(1),
      recordCount: 0, // Will be populated by real sync data when available
    }));

    // Compute next sync based on frequency
    let nextSync: string | null = null;
    if (
      conn.last_sync_at &&
      conn.status !== "paused" &&
      conn.status !== "error"
    ) {
      const lastSyncDate = new Date(conn.last_sync_at as string);
      const freq = (conn.sync_frequency as string) || "daily";
      const freqMs: Record<string, number> = {
        "real-time": 5 * 60_000, // 5 min
        hourly: 60 * 60_000,
        daily: 24 * 60 * 60_000,
        weekly: 7 * 24 * 60 * 60_000,
      };
      const interval = freqMs[freq] || freqMs.daily;
      nextSync = new Date(lastSyncDate.getTime() + interval).toISOString();
    }

    // Find errors for this connection
    const connErrors = errorLogs.filter(
      (log) => log.connection_id === conn.id
    );
    const latestErrorDetails = connErrors[0]?.error_details as Record<
      string,
      unknown
    > | null;
    const latestError =
      (latestErrorDetails?.message as string) || undefined;

    // Per-connection 7d sync summary
    const connSyncStats = perConnectionSyncRecords.get(conn.id as string);

    return {
      id: connectorType,
      name: CONNECTOR_NAMES[connectorType] || connectorType,
      category: CATEGORY_MAP[connectorType] || "Altro",
      icon: ICON_MAP[connectorType] || "Plug",
      status: mapDbStatusToDashboard(conn.status as string),
      lastSync: conn.last_sync_at as string | null,
      nextSync,
      recordCount: (conn.last_sync_items as number) || 0,
      entities,
      error: latestError || undefined,
      recentSyncCount: connSyncStats?.syncCount ?? 0,
      recentRecordsSynced: connSyncStats?.success ?? 0,
      recentRecordsFailed: connSyncStats?.failed ?? 0,
    };
  });

  // Build error log entries
  const errors = errorLogs.map((log) => {
    const conn = connections.find((c) => c.id === log.connection_id);
    const connectorType = (conn?.connector_type as string) || "unknown";
    const startedAt = log.started_at as string;
    const time = startedAt
      ? new Date(startedAt).toLocaleTimeString("it-IT", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "--";

    const errorDetails = log.error_details as Record<
      string,
      unknown
    > | null;
    return {
      timestamp: time,
      connector: CONNECTOR_NAMES[connectorType] || connectorType,
      message:
        (errorDetails?.message as string) || "Errore sconosciuto",
      details: errorDetails?.details as string | undefined,
    };
  });

  return NextResponse.json({
    integrations,
    errors,
    syncHistory,
  });
}

// ─── POST: Perform actions (sync, pause, resume) ───

export async function POST(req: NextRequest) {
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

  let body: {
    action: "sync" | "pause" | "resume" | "disconnect";
    connectorId: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body JSON non valido" },
      { status: 400 }
    );
  }

  const { action, connectorId } = body;

  if (!action || !connectorId) {
    return NextResponse.json(
      { error: "Campi obbligatori mancanti: action, connectorId" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Find the connection
  const { data: connection, error: findError } = await admin
    .from("integration_connections")
    .select("id, status")
    .eq("user_id", userId)
    .eq("connector_type", connectorId)
    .neq("status", "disconnected")
    .maybeSingle();

  if (findError || !connection) {
    return NextResponse.json(
      { error: `Connessione '${connectorId}' non trovata` },
      { status: 404 }
    );
  }

  switch (action) {
    case "pause": {
      const { error } = await admin
        .from("integration_connections")
        .update({ status: "paused", updated_at: new Date().toISOString() })
        .eq("id", connection.id);

      if (error) {
        return NextResponse.json(
          { error: "Errore nel mettere in pausa la connessione" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        connectorId,
        status: "paused",
        message: "Connessione messa in pausa",
      });
    }

    case "resume": {
      const { error } = await admin
        .from("integration_connections")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("id", connection.id);

      if (error) {
        return NextResponse.json(
          { error: "Errore nel riprendere la connessione" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        connectorId,
        status: "active",
        message: "Connessione ripresa",
      });
    }

    case "sync": {
      // Update status to syncing
      await admin
        .from("integration_connections")
        .update({ status: "syncing", updated_at: new Date().toISOString() })
        .eq("id", connection.id);

      // Trigger the real sync pipeline by calling the sync endpoint internally.
      // The sync endpoint at /api/integrations/[connectorId]/sync handles:
      //   1. Credential retrieval from vault
      //   2. Full pipeline: FETCH -> MAP -> PERSIST -> ANALYZE -> INDEX
      //   3. Sync log creation and completion
      //
      // We construct the internal URL and call it. The sync runs in the background
      // while we return immediately to the dashboard UI (which polls GET /sync for progress).

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const syncUrl = `${appUrl}/api/integrations/${connectorId}/sync`;

      // Fire-and-forget: trigger the sync asynchronously.
      // The POST /sync endpoint handles its own sync_log lifecycle.
      // We need to forward auth headers so the sync endpoint can authenticate.
      const cookieHeader = req.headers.get("cookie") ?? "";
      const csrfToken = req.headers.get("x-csrf-token") ?? "";

      fetch(syncUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieHeader,
          "x-csrf-token": csrfToken,
          Origin: appUrl,
        },
        body: JSON.stringify({
          fetchLimit: 200,
          skipAnalysis: false,
        }),
      }).catch((err) => {
        console.error(
          `[Dashboard] Background sync trigger failed for ${connectorId}:`,
          err instanceof Error ? err.message : String(err)
        );
        // Revert status on fire-and-forget failure
        admin
          .from("integration_connections")
          .update({ status: "error", updated_at: new Date().toISOString() })
          .eq("id", connection.id)
          .then(() => {});
      });

      return NextResponse.json({
        success: true,
        connectorId,
        status: "syncing",
        message: "Sincronizzazione avviata. Controlla il progresso nel pannello del connettore.",
      });
    }

    case "disconnect": {
      const { error } = await admin
        .from("integration_connections")
        .update({
          status: "disconnected",
          updated_at: new Date().toISOString(),
        })
        .eq("id", connection.id);

      if (error) {
        return NextResponse.json(
          { error: "Errore nella disconnessione" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        connectorId,
        status: "disconnected",
        message: `${CONNECTOR_NAMES[connectorId] || connectorId} disconnesso`,
      });
    }

    default:
      return NextResponse.json(
        { error: `Azione non riconosciuta: ${action}` },
        { status: 400 }
      );
  }
}
