/**
 * GET /api/company/sessions — Active Session Tracker endpoint.
 *
 * Returns all active Claude-related sessions across the system:
 *   - Console sessions (in-memory, same process)
 *   - Task-runner sessions (file-based, cross-process)
 *   - Daemon sessions (file-based, cross-process)
 *   - Orphan claude processes (OS process discovery)
 *
 * Protected with requireConsoleAuth + rate limit.
 * Response target: <100ms for registered sessions, may be slower with orphan discovery.
 */

import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import {
  getUnifiedSessions,
  toDTOWithAgents,
  readHeartbeat,
} from "@/lib/company/sessions";
import { getActiveAgentEvents } from "@/lib/agent-broadcast";
import {
  getActiveSubAgents,
  getZombieSubAgents,
  toAgentEvents,
} from "@/lib/company/sub-agent-tracker";
import type { AgentDTO } from "@/lib/company/sessions";
import type { AgentEvent } from "@/lib/agent-broadcast";
import type { NextRequest } from "next/server";

export async function GET(req: Request) {
  // Rate limit: 30/min (lightweight endpoint, may be polled frequently)
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
    // Query param: ?orphans=true to include OS process discovery (slower)
    const url = new URL(req.url);
    const includeOrphans = url.searchParams.get("orphans") === "true";

    const { sessions, orphanCount } = getUnifiedSessions({
      includeOrphans,
    });

    // Build AgentDTO list from active agent events (ADR-005)
    const agentEvents: AgentEvent[] = getActiveAgentEvents();
    const agentDTOs: AgentDTO[] = agentEvents.map((ev) => ({
      id: ev.id,
      department: ev.department,
      task: ev.task,
      status: ev.status,
      timestamp: ev.timestamp,
      // Pass through parentPid and sessionId for toDTOWithAgents filtering
      ...(ev.parentPid !== undefined ? { parentPid: ev.parentPid } : {}),
      ...(ev.sessionId !== undefined ? { sessionId: ev.sessionId } : {}),
    }));

    // ─── Sub-agent tracking (file-based, from .claude/sub-agents.json) ───
    // Sub-agents are Claude Code Agent tool invocations tracked via CLI.
    // They appear as agents under the interactive (heartbeat) session.
    const subAgents = getActiveSubAgents();
    const zombieSubAgents = getZombieSubAgents();

    if (subAgents.length > 0) {
      // Find the heartbeat session PID to use as parentPid for sub-agents
      const heartbeat = readHeartbeat();
      const heartbeatPid = heartbeat?.pid;

      // Convert sub-agents to AgentDTO format and append to agent list
      const subAgentEvents = toAgentEvents(subAgents, heartbeatPid);
      for (const ev of subAgentEvents) {
        agentDTOs.push({
          id: ev.id,
          department: ev.department,
          task: ev.task,
          status: ev.status,
          timestamp: ev.timestamp,
          ...(ev.parentPid !== undefined ? { parentPid: ev.parentPid } : {}),
        });
      }
    }

    const activeCount = sessions.filter((s) => s.status === "active").length;
    const closingCount = sessions.filter((s) => s.status === "closing").length;

    // Build session DTOs with agents synthesized per session
    const sessionDTOs = sessions.map((s) => toDTOWithAgents(s, agentDTOs));
    const totalAgents = sessionDTOs.reduce((sum, s) => sum + s.agentCount, 0);

    return new Response(
      JSON.stringify({
        count: activeCount + closingCount,
        activeCount,
        closingCount,
        total: sessions.length,
        orphanCount,
        totalAgents,
        zombieSubAgents: zombieSubAgents.length,
        sessions: sessionDTOs,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store",
        },
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
