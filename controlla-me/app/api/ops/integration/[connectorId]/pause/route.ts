/**
 * API Route: POST /api/ops/integration/[connectorId]/pause
 *
 * Ops console version — pauses or resumes a data-connector source.
 * Body: { action: "pause" | "resume" }
 *
 * Since the data-connector framework uses `corpus-sources.ts` config and
 * `connector_sync_log` (not integration_connections), pausing is tracked
 * in sync_log metadata. The cron pipeline checks this flag before syncing.
 *
 * Security: requireConsoleAuth + rate-limit + CSRF
 */

import { NextRequest, NextResponse } from "next/server";
import { requireConsoleAuth } from "@/lib/middleware/console-token";
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

  // Console auth
  const payload = requireConsoleAuth(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit (5/min per IP)
  const rl = await checkRateLimit(req);
  if (rl) return rl;

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

  try {
    // Check current pause state from sync_log metadata
    const { data: lastLog } = await admin
      .from("connector_sync_log")
      .select("id, metadata")
      .eq("source_id", connectorId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const currentlyPaused =
      lastLog?.metadata &&
      typeof lastLog.metadata === "object" &&
      (lastLog.metadata as Record<string, unknown>).paused === true;

    if (action === "pause" && currentlyPaused) {
      return NextResponse.json(
        { error: `Connettore '${connectorId}' gia in pausa` },
        { status: 409 }
      );
    }
    if (action === "resume" && !currentlyPaused) {
      return NextResponse.json(
        { error: `Connettore '${connectorId}' non e in pausa` },
        { status: 409 }
      );
    }

    // Insert a sync_log entry marking the pause/resume action
    const { error: insertError } = await admin
      .from("connector_sync_log")
      .insert({
        source_id: connectorId,
        sync_type: action === "pause" ? "pause" : "resume",
        phase: null,
        status: "completed",
        completed_at: new Date().toISOString(),
        items_fetched: 0,
        items_inserted: 0,
        items_updated: 0,
        items_skipped: 0,
        errors: 0,
        error_details: [],
        metadata: {
          paused: action === "pause",
          trigger: "ops_console",
          operator: payload.nome ?? "unknown",
        },
      });

    if (insertError) {
      throw new Error(insertError.message);
    }

    console.log(
      `[OPS:${action === "pause" ? "Pause" : "Resume"}] Connector '${connectorId}' ${action}d by ${payload.nome ?? "operator"}`
    );

    return NextResponse.json({
      success: true,
      connectorId,
      action,
      paused: action === "pause",
      message:
        action === "pause"
          ? `Connettore '${connectorId}' messo in pausa. Le sincronizzazioni automatiche sono sospese.`
          : `Connettore '${connectorId}' ripreso. Le sincronizzazioni automatiche ripartiranno.`,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[OPS:${action}] Error for '${connectorId}':`, message);
    return NextResponse.json(
      { error: `Errore: ${message}` },
      { status: 500 }
    );
  }
}
