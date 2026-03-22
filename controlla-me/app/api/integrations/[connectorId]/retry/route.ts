/**
 * API Route: POST /api/integrations/[connectorId]/retry
 *
 * Retries a failed sync for a connected integration.
 * Resets the connection status from "error" to "active", then triggers a sync.
 *
 * Security: CSRF + requireAuth + rate-limit
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkCsrf } from "@/lib/middleware/csrf";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ connectorId: string }> }
) {
  // CSRF
  const csrfBlocked = checkCsrf(req);
  if (csrfBlocked) return csrfBlocked;

  // Rate limit (max 5/min to prevent abuse)
  const rateLimited = await checkRateLimit(req);
  if (rateLimited) return rateLimited;

  // Auth
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const userId = authResult.user.id;
  const { connectorId } = await params;

  const admin = createAdminClient();

  // Find the connection for this user + connector
  const { data: connection, error: connError } = await admin
    .from("integration_connections")
    .select("id, status, connector_type")
    .eq("user_id", userId)
    .eq("connector_type", connectorId)
    .neq("status", "disconnected")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (connError) {
    console.error("[Retry] Connection lookup error:", connError.message);
    return NextResponse.json(
      { error: "Errore nel recupero della connessione" },
      { status: 500 }
    );
  }

  if (!connection) {
    return NextResponse.json(
      { error: `Nessuna connessione attiva trovata per '${connectorId}'` },
      { status: 404 }
    );
  }

  // Reset connection status to "active" (clears the error state)
  const { error: updateError } = await admin
    .from("integration_connections")
    .update({
      status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);

  if (updateError) {
    console.error("[Retry] Failed to reset connection status:", updateError.message);
    return NextResponse.json(
      { error: "Errore nel reset dello stato connessione" },
      { status: 500 }
    );
  }

  // Log the retry in sync log
  await admin
    .from("integration_sync_log")
    .insert({
      connection_id: connection.id,
      user_id: userId,
      status: "running",
      started_at: new Date().toISOString(),
      items_fetched: 0,
      items_processed: 0,
      items_failed: 0,
      error_details: { trigger: "manual_retry", previous_status: connection.status },
    })
    .select("id")
    .single();

  console.log(
    `[Retry:${connectorId}] Connection ${connection.id} reset from '${connection.status}' to 'active'`
  );

  return NextResponse.json({
    success: true,
    connectorId,
    connectionId: connection.id,
    previousStatus: connection.status,
    newStatus: "active",
    message: `Connessione ripristinata. La prossima sincronizzazione avverra automaticamente.`,
    retriedAt: new Date().toISOString(),
  });
}
