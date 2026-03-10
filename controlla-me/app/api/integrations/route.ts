/**
 * API Route: /api/integrations
 *
 * Root integration management endpoint — backed by Supabase.
 *
 * GET    — List user's connections with status (from integration_connections)
 * POST   — Create new connection (insert into integration_connections)
 * DELETE  — Disconnect a connector (soft-delete + revoke vault credential)
 *
 * Security:
 * - requireAuth: all operations require authenticated user
 * - checkRateLimit: prevent abuse
 * - checkCsrf: POST/DELETE protected against cross-site requests
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkCsrf } from "@/lib/middleware/csrf";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVaultOrNull } from "@/lib/credential-vault";

// ─── Helpers ───

const CONNECTOR_NAMES: Record<string, string> = {
  "google-drive": "Google Drive",
  hubspot: "HubSpot",
  salesforce: "Salesforce",
  stripe: "Stripe",
  normattiva: "Normattiva",
  eurlex: "EUR-Lex",
};

// ─── GET: List user's connections with status ───

export async function GET(req: NextRequest) {
  // Rate limit
  const rateLimited = await checkRateLimit(req);
  if (rateLimited) return rateLimited;

  // Auth
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const userId = authResult.user.id;

  // Query integration_connections for this user (RLS-scoped via authenticated client)
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("integration_connections")
    .select(
      "id, connector_type, status, last_sync_at, last_sync_items, sync_frequency, created_at"
    )
    .eq("user_id", userId)
    .neq("status", "disconnected")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[INTEGRATIONS] GET error:", error.message);
    return NextResponse.json(
      { error: "Errore nel recupero delle connessioni" },
      { status: 500 }
    );
  }

  const connections = (rows ?? []).map((row) => ({
    id: row.id,
    connectorId: row.connector_type,
    connectorName:
      CONNECTOR_NAMES[row.connector_type] ?? row.connector_type,
    status: row.status,
    lastSync: row.last_sync_at,
    nextSync: null,
    itemsSynced: row.last_sync_items ?? 0,
    frequency: row.sync_frequency,
    createdAt: row.created_at,
  }));

  // Summary stats
  const totalActive = connections.filter(
    (c) => c.status === "active" || c.status === "connected"
  ).length;
  const totalItems = connections.reduce((sum, c) => sum + c.itemsSynced, 0);
  const lastSync =
    connections
      .filter((c) => c.lastSync)
      .sort(
        (a, b) =>
          new Date(b.lastSync!).getTime() - new Date(a.lastSync!).getTime()
      )[0]?.lastSync ?? null;
  const errorCount = connections.filter((c) => c.status === "error").length;

  return NextResponse.json({
    connections,
    summary: {
      totalActive,
      totalItems,
      lastSync,
      errorCount,
      totalConnections: connections.length,
    },
  });
}

// ─── POST: Create new connection ───

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

  // Parse body
  let body: {
    connectorId?: string;
    connectorName?: string;
    frequency?: string;
    selectedEntities?: string[];
    [key: string]: unknown;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body JSON non valido" },
      { status: 400 }
    );
  }

  const { connectorId, frequency, selectedEntities, ...extraConfig } = body;
  // connectorName is accepted but not stored — derived from connector_type
  delete extraConfig.connectorName;

  if (!connectorId) {
    return NextResponse.json(
      { error: "Campo obbligatorio mancante: connectorId" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Check for existing active connection (not disconnected)
  const { data: existing, error: checkError } = await admin
    .from("integration_connections")
    .select("id")
    .eq("user_id", userId)
    .eq("connector_type", connectorId)
    .neq("status", "disconnected")
    .maybeSingle();

  if (checkError) {
    console.error("[INTEGRATIONS] POST duplicate check error:", checkError.message);
    return NextResponse.json(
      { error: "Errore nel controllo connessioni esistenti" },
      { status: 500 }
    );
  }

  if (existing) {
    const name = CONNECTOR_NAMES[connectorId] ?? connectorId;
    return NextResponse.json(
      { error: `Connettore '${name}' gia configurato` },
      { status: 409 }
    );
  }

  // Insert new connection
  const { data: inserted, error: insertError } = await admin
    .from("integration_connections")
    .insert({
      user_id: userId,
      connector_type: connectorId,
      status: "active",
      config: { selectedEntities, ...extraConfig },
      sync_frequency: frequency || "daily",
    })
    .select(
      "id, connector_type, status, last_sync_at, last_sync_items, sync_frequency, created_at"
    )
    .single();

  if (insertError) {
    console.error("[INTEGRATIONS] POST insert error:", insertError.message);
    return NextResponse.json(
      { error: "Errore nella creazione della connessione" },
      { status: 500 }
    );
  }

  const connectorName = CONNECTOR_NAMES[connectorId] ?? connectorId;

  return NextResponse.json(
    {
      connection: {
        id: inserted.id,
        connectorId: inserted.connector_type,
        connectorName,
        status: inserted.status,
        lastSync: inserted.last_sync_at,
        nextSync: null,
        itemsSynced: inserted.last_sync_items ?? 0,
        frequency: inserted.sync_frequency,
        createdAt: inserted.created_at,
      },
      message: `Connessione a ${connectorName} creata con successo`,
    },
    { status: 201 }
  );
}

// ─── DELETE: Disconnect a connector ───

export async function DELETE(req: NextRequest) {
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

  // Parse query params
  const { searchParams } = new URL(req.url);
  const connectorId = searchParams.get("connectorId");

  if (!connectorId) {
    return NextResponse.json(
      { error: "Parametro obbligatorio mancante: connectorId" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Soft-delete: set status to 'disconnected'
  const { data: updated, error: updateError } = await admin
    .from("integration_connections")
    .update({ status: "disconnected", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("connector_type", connectorId)
    .neq("status", "disconnected")
    .select("id, connector_type")
    .maybeSingle();

  if (updateError) {
    console.error("[INTEGRATIONS] DELETE error:", updateError.message);
    return NextResponse.json(
      { error: "Errore nella disconnessione del connettore" },
      { status: 500 }
    );
  }

  if (!updated) {
    return NextResponse.json(
      { error: `Connettore '${connectorId}' non trovato tra le tue connessioni` },
      { status: 404 }
    );
  }

  // Revoke credential in vault (best-effort — vault may not be configured)
  const vault = getVaultOrNull();
  if (vault) {
    try {
      await vault.revokeCredential(userId, connectorId, "oauth2_token");
    } catch (err) {
      console.error(
        `[INTEGRATIONS] Vault revoke error for ${connectorId}:`,
        err instanceof Error ? err.message : err
      );
      // Non-fatal: connection is already disconnected in DB
    }
  }

  const connectorName = CONNECTOR_NAMES[connectorId] ?? connectorId;

  return NextResponse.json({
    connectorId,
    connectorName,
    message: `Connessione a ${connectorName} rimossa con successo`,
  });
}
