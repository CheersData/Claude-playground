/**
 * API Route: POST /api/integrations/[connectorId]/pause
 *
 * Pauses or resumes a connected integration.
 * Body: { action: "pause" | "resume" }
 *
 * - pause:  sets connection status to "paused", stops scheduled syncs
 * - resume: sets connection status to "active", re-enables scheduled syncs
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

  // Rate limit
  const rateLimited = await checkRateLimit(req);
  if (rateLimited) return rateLimited;

  // Auth
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const userId = authResult.user.id;
  const { connectorId } = await params;

  // Parse body
  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body JSON non valido" },
      { status: 400 }
    );
  }

  const action = body.action;
  if (action !== "pause" && action !== "resume") {
    return NextResponse.json(
      { error: "Campo 'action' obbligatorio: 'pause' o 'resume'" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Find the connection
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
    console.error(`[Pause] Connection lookup error:`, connError.message);
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

  // Validate state transitions
  if (action === "pause" && connection.status === "paused") {
    return NextResponse.json(
      { error: "La connessione e gia in pausa" },
      { status: 409 }
    );
  }
  if (action === "resume" && connection.status !== "paused") {
    return NextResponse.json(
      { error: "La connessione non e in pausa" },
      { status: 409 }
    );
  }

  const newStatus = action === "pause" ? "paused" : "active";

  const { error: updateError } = await admin
    .from("integration_connections")
    .update({
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id);

  if (updateError) {
    console.error(`[Pause] Failed to update status:`, updateError.message);
    return NextResponse.json(
      { error: `Errore nell'aggiornamento dello stato` },
      { status: 500 }
    );
  }

  console.log(
    `[${action === "pause" ? "Pause" : "Resume"}:${connectorId}] Connection ${connection.id}: '${connection.status}' -> '${newStatus}'`
  );

  return NextResponse.json({
    success: true,
    connectorId,
    connectionId: connection.id,
    action,
    previousStatus: connection.status,
    newStatus,
    message:
      action === "pause"
        ? "Connessione messa in pausa. Le sincronizzazioni automatiche sono sospese."
        : "Connessione ripresa. Le sincronizzazioni automatiche ripartiranno.",
    updatedAt: new Date().toISOString(),
  });
}
