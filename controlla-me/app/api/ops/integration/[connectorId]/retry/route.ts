/**
 * API Route: POST /api/ops/integration/[connectorId]/retry
 *
 * Ops console version — retries a failed data-connector sync.
 * Uses the data-connector sync-log (connector_sync_log) rather than
 * user integration_connections.
 *
 * Security: requireConsoleAuth + rate-limit + CSRF
 */

import { NextRequest, NextResponse } from "next/server";
import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkCsrf } from "@/lib/middleware/csrf";
import { startSync } from "@/lib/staff/data-connector/sync-log";

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

  try {
    // Create a new sync log entry with "queued" state.
    // The actual sync will be picked up by the data-connector cron or
    // executed manually via the CLI (`npx tsx scripts/data-connector.ts connect <id>`).
    const syncId = await startSync(connectorId, "retry", "queued");

    console.log(
      `[OPS:Retry] Sync retry queued for connector '${connectorId}' (syncId: ${syncId})`
    );

    return NextResponse.json({
      success: true,
      connectorId,
      syncId,
      message: `Sincronizzazione per '${connectorId}' accodata. Verra eseguita al prossimo ciclo cron o manualmente.`,
      queuedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[OPS:Retry] Error queuing retry for '${connectorId}':`, message);
    return NextResponse.json(
      { error: `Errore nell'accodamento del retry: ${message}` },
      { status: 500 }
    );
  }
}
