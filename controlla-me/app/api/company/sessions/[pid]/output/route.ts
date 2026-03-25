/**
 * GET /api/company/sessions/:pid/output
 *
 * SSE endpoint — streams stdout/stderr output from a console session's ring buffer.
 *
 * Protocol (console sessions — output capture):
 *   event: replay   — initial burst: all buffered lines from the ring buffer
 *   event: line     — new line as it arrives (live streaming)
 *   event: closed   — session ended (process exited)
 *   : heartbeat     — SSE comment every 15s to keep connection alive
 *
 * Protocol (non-console sessions — status dashboard fallback):
 *   event: status-dashboard — session metadata + initial agent snapshot
 *   event: agent-update     — periodic (3s) + real-time agent events for this PID
 *   event: closed           — session ended (process exited)
 *   : heartbeat             — SSE comment every 15s to keep connection alive
 *
 * Auth: requireConsoleAuth (query param ?t=<token> supported for EventSource)
 * Rate limit: 30/min per token
 *
 * ADR-005: Terminal Monitoring System
 */

import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import {
  getUnifiedSessions,
  getOutputLines,
  onOutputLine,
} from "@/lib/company/sessions";
import type { TrackedSession } from "@/lib/company/sessions";
import {
  getActiveAgentEvents,
  onAgentEvent,
} from "@/lib/agent-broadcast";
import type { AgentEvent } from "@/lib/agent-broadcast";
import type { NextRequest } from "next/server";
import { createSSEStream, SSE_HEADERS } from "@/lib/sse-stream-factory";

export const maxDuration = 300;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ pid: string }> }
) {
  // Rate limit: 30/min (SSE long-lived connection, limit is on initial connect only)
  const rl = await checkRateLimit(req as unknown as NextRequest);
  if (rl) return rl;

  const authPayload = requireConsoleAuth(req as unknown as NextRequest);
  if (!authPayload) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { pid: pidStr } = await params;
  const pid = parseInt(pidStr, 10);
  if (isNaN(pid) || pid <= 0) {
    return new Response(JSON.stringify({ error: "PID non valido" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Look up the session to determine type
  const { sessions } = getUnifiedSessions({ includeOrphans: false });
  const trackedSession = sessions.find((s) => s.pid === pid);

  if (!trackedSession) {
    return new Response(
      JSON.stringify({ error: `Session not found: PID ${pid}` }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Non-console sessions: send status-dashboard + periodic agent-update events
  if (trackedSession.type !== "console") {
    return buildStatusDashboardStream(trackedSession, pid);
  }

  // ─── SSE stream ───

  const { stream, send, sendComment, close: closeStream, onCleanup } = createSSEStream({ request: req as unknown as Request });

  // 1. Send ring buffer replay
  const { lines: bufferedLines, nextIndex } = getOutputLines(pid);
  send("replay", { lines: bufferedLines, nextIndex });

  // 2. Subscribe to live output lines
  const unsubscribeFn = onOutputLine(pid, (ev) => {
    send("line", ev);
  });
  onCleanup(() => unsubscribeFn());

  // 3. Heartbeat every 15s
  const heartbeatTimer = setInterval(() => {
    sendComment("heartbeat");
  }, 15_000);
  onCleanup(() => clearInterval(heartbeatTimer));

  // 4. Poll for session closure — check every 5s if session still exists
  const closedCheckTimer = setInterval(() => {
    const { sessions: currentSessions } = getUnifiedSessions({
      includeOrphans: false,
    });
    const stillAlive = currentSessions.some((s) => s.pid === pid);
    if (!stillAlive) {
      send("closed", { pid, code: null });
      closeStream();
    }
  }, 5_000);
  onCleanup(() => clearInterval(closedCheckTimer));

  return new Response(stream, { headers: SSE_HEADERS });
}

// ─── Status Dashboard Stream (non-console sessions) ──────────────────────────
//
// For sessions that don't have output capture (interactive, task-runner, daemon,
// orphan), we send a `status-dashboard` event with session metadata, then keep
// the connection open and periodically send `agent-update` events with current
// agent activity for that PID.

function buildStatusDashboardStream(
  session: TrackedSession,
  pid: number
): Response {
  const { stream, send, sendComment, close: closeStream, onCleanup } = createSSEStream();

  // Helper: collect agent events for this PID
  const getAgentsForPid = (): AgentEvent[] => {
    return getActiveAgentEvents().filter(
      (ev) =>
        ev.parentPid === pid ||
        (session.sessionId && ev.sessionId === session.sessionId)
    );
  };

  // 1. Send status-dashboard with session metadata + initial agents
  const uptime = Date.now() - session.startedAt.getTime();
  send("status-dashboard", {
    pid: session.pid,
    type: session.type,
    target: session.target,
    department: session.department ?? session.target,
    status: session.status,
    currentTask: session.currentTask ?? null,
    startedAt: session.startedAt.toISOString(),
    uptimeMs: uptime,
    agents: getAgentsForPid().map((ev) => ({
      id: ev.id,
      department: ev.department,
      status: ev.status,
      task: ev.task,
      timestamp: ev.timestamp,
    })),
  });

  // 2. Subscribe to real-time agent events and forward those matching this PID
  const unsubscribeAgentFn = onAgentEvent((ev) => {
    const isForThisPid =
      ev.parentPid === pid ||
      (session.sessionId && ev.sessionId === session.sessionId);
    if (isForThisPid) {
      send("agent-update", {
        agents: getAgentsForPid().map((a) => ({
          id: a.id,
          department: a.department,
          status: a.status,
          task: a.task,
          timestamp: a.timestamp,
        })),
      });
    }
  });
  onCleanup(() => unsubscribeAgentFn());

  // 3. Periodic agent-update every 3 seconds (covers TTL expirations, etc.)
  const agentPollTimer = setInterval(() => {
    send("agent-update", {
      agents: getAgentsForPid().map((a) => ({
        id: a.id,
        department: a.department,
        status: a.status,
        task: a.task,
        timestamp: a.timestamp,
      })),
    });
  }, 3_000);
  onCleanup(() => clearInterval(agentPollTimer));

  // 4. Heartbeat every 15s
  const heartbeatTimer = setInterval(() => {
    sendComment("heartbeat");
  }, 15_000);
  onCleanup(() => clearInterval(heartbeatTimer));

  // 5. Poll for session closure — check every 5s
  const closedCheckTimer = setInterval(() => {
    const { sessions: currentSessions } = getUnifiedSessions({
      includeOrphans: true,
    });
    const stillAlive = currentSessions.some((s) => s.pid === pid);
    if (!stillAlive) {
      send("closed", { pid, code: null });
      closeStream();
    }
  }, 5_000);
  onCleanup(() => clearInterval(closedCheckTimer));

  return new Response(stream, { headers: SSE_HEADERS });
}
