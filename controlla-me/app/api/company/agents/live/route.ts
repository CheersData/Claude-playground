/**
 * GET /api/company/agents/live — SSE endpoint for real-time agent activity.
 *
 * The Ops dashboard subscribes to this endpoint to receive live updates
 * when agents start/complete/error. Events are broadcast from:
 * - Console route (document analysis, corpus Q&A, leader)
 * - Company route (CME chat, department delegation)
 * - Task runner (when executing tasks)
 *
 * Security: requireConsoleAuth (same as other /api/company/* routes).
 */

import { NextRequest } from "next/server";
import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { onAgentEvent, getActiveAgentEvents, type AgentEvent } from "@/lib/agent-broadcast";
import { createSSEStream, SSE_HEADERS_NO_BUFFER } from "@/lib/sse-stream-factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Auth check — requireConsoleAuth returns payload or null
  const tokenPayload = requireConsoleAuth(req);
  if (!tokenPayload) {
    return new Response(JSON.stringify({ error: "Non autorizzato" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Rate limit (generous — SSE is long-lived, uses default endpoint config)
  const rlErr = await checkRateLimit(req);
  if (rlErr) return rlErr;

  const { stream, send, sendComment, onCleanup } = createSSEStream({ request: req });

  // Send current snapshot immediately
  const snapshot = getActiveAgentEvents();
  send("snapshot", snapshot);

  // Subscribe to live events
  const unsubscribe = onAgentEvent((evt: AgentEvent) => {
    send("agent", evt);
  });
  onCleanup(() => unsubscribe());

  // Heartbeat every 15s to keep connection alive
  const heartbeat = setInterval(() => {
    sendComment("heartbeat");
  }, 15_000);
  onCleanup(() => clearInterval(heartbeat));

  return new Response(stream, { headers: SSE_HEADERS_NO_BUFFER });
}
