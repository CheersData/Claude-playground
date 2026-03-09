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

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // Controller closed
        }
      };

      // Send current snapshot immediately
      const snapshot = getActiveAgentEvents();
      send("snapshot", snapshot);

      // Subscribe to live events
      unsubscribe = onAgentEvent((evt: AgentEvent) => {
        send("agent", evt);
      });

      // Heartbeat every 15s to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 15_000);

      // Cleanup on abort
      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        if (unsubscribe) unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
      });
    },

    cancel() {
      if (unsubscribe) unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
