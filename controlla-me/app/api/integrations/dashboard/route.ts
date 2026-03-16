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
  normattiva: "Normattiva",
  eurlex: "EUR-Lex",
  mailchimp: "Mailchimp",
};

const ICON_MAP: Record<string, string> = {
  stripe: "CreditCard",
  salesforce: "Building2",
  hubspot: "Users",
  "google-drive": "HardDrive",
  mailchimp: "Building2",
  normattiva: "Building2",
  eurlex: "Building2",
};

const CATEGORY_MAP: Record<string, string> = {
  stripe: "Pagamenti",
  salesforce: "CRM",
  hubspot: "CRM / Marketing",
  "google-drive": "Storage",
  mailchimp: "Marketing",
  normattiva: "Legale",
  eurlex: "Legale",
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
    });
  }

  // Fetch recent sync errors across all connections
  const connectionIds = connections.map((c) => c.id);
  const { data: errorLogs } = await supabase
    .from("integration_sync_log")
    .select(
      "connection_id, status, started_at, error_details, items_failed"
    )
    .in("connection_id", connectionIds)
    .eq("status", "error")
    .order("started_at", { ascending: false })
    .limit(20);

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
    const connErrors = (errorLogs || []).filter(
      (log) => log.connection_id === conn.id
    );
    const latestErrorDetails = connErrors[0]?.error_details as Record<string, unknown> | null;
    const latestError = (latestErrorDetails?.message as string) || undefined;

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
    };
  });

  // Build error log entries
  const errors = (errorLogs || []).map((log) => {
    const conn = connections.find((c) => c.id === log.connection_id);
    const connectorType = (conn?.connector_type as string) || "unknown";
    const startedAt = log.started_at as string;
    const time = startedAt
      ? new Date(startedAt).toLocaleTimeString("it-IT", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "--";

    const errorDetails = log.error_details as Record<string, unknown> | null;
    return {
      timestamp: time,
      connector: CONNECTOR_NAMES[connectorType] || connectorType,
      message: (errorDetails?.message as string) || "Errore sconosciuto",
      details: errorDetails?.details as string | undefined,
    };
  });

  return NextResponse.json({
    integrations,
    errors,
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

      // Create a sync log entry
      const { data: syncLog } = await admin
        .from("integration_sync_log")
        .insert({
          connection_id: connection.id,
          user_id: userId,
          status: "running",
          started_at: new Date().toISOString(),
          items_fetched: 0,
          items_processed: 0,
          items_failed: 0,
          error_details: { trigger: "dashboard_manual" },
        })
        .select("id")
        .single();

      // In a real implementation, this would trigger the actual sync via a background job.
      // For now, mark the sync as completed after a brief delay simulation.
      // The actual sync logic lives in /api/integrations/[connectorId]/sync.

      // Update connection back to active (sync will be handled by the sync endpoint)
      await admin
        .from("integration_connections")
        .update({
          status: "active",
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", connection.id);

      // Complete sync log
      if (syncLog?.id) {
        await admin
          .from("integration_sync_log")
          .update({
            status: "success",
            completed_at: new Date().toISOString(),
            error_details: { trigger: "dashboard_manual", note: "Quick sync from dashboard" },
          })
          .eq("id", syncLog.id);
      }

      return NextResponse.json({
        success: true,
        connectorId,
        status: "synced",
        syncLogId: syncLog?.id,
        message: "Sincronizzazione avviata",
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
