/**
 * POST /api/company/sessions/heartbeat — Write heartbeat for interactive sessions.
 *
 * Called by the /ops page every 10 seconds to signal that an interactive
 * Claude Code session is active. The heartbeat file is read by
 * getUnifiedSessions() to include the interactive session in the
 * SessionIndicator, AgentDots, and CapacityIndicator.
 *
 * Body (optional): { target?: string }
 *
 * Protected with requireConsoleAuth + rate limit.
 */

import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { writeHeartbeat, clearHeartbeat } from "@/lib/company/sessions";
import type { NextRequest } from "next/server";

export async function POST(req: Request) {
  // Rate limit: 20/min (polled every 10s = 6/min expected)
  const rl = await checkRateLimit(req as unknown as NextRequest);
  if (rl) return rl;

  const authPayload = requireConsoleAuth(req as unknown as NextRequest);
  if (!authPayload) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const target = (body as { target?: string }).target ?? "interactive";

    // Use the Node.js process PID as a stable identifier
    // (the actual Claude Code process PID is not easily obtainable from the browser)
    writeHeartbeat(process.pid, target);

    return new Response(
      JSON.stringify({ ok: true, pid: process.pid }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Errore sconosciuto";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * DELETE /api/company/sessions/heartbeat — Clear heartbeat (session ending).
 */
export async function DELETE(req: Request) {
  const rl = await checkRateLimit(req as unknown as NextRequest);
  if (rl) return rl;

  const authPayload = requireConsoleAuth(req as unknown as NextRequest);
  if (!authPayload) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  clearHeartbeat();

  return new Response(
    JSON.stringify({ ok: true }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}
