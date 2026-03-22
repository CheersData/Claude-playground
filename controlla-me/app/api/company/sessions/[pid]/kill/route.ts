/**
 * POST /api/company/sessions/:pid/kill
 *
 * Kill a terminal process or soft-kill a single agent within it.
 *
 * Body (optional):
 *   { agentId?: string }
 *   - If agentId is present: soft-kill that agent via AbortController + broadcast
 *   - If absent: hard-kill the terminal process (SIGTERM on Unix, taskkill on Windows)
 *
 * ADR-005: Terminal Monitoring System
 */

import { execSync } from "child_process";
import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkCsrf } from "@/lib/middleware/csrf";
import {
  getUnifiedSessions,
  markSessionClosing,
  unregisterSession,
  clearOutputRing,
  getSession,
  deleteSession,
} from "@/lib/company/sessions";
import { broadcastAgentEvent, abortAgent } from "@/lib/agent-broadcast";
import { killSubAgent } from "@/lib/company/sub-agent-tracker";
import type { NextRequest } from "next/server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ pid: string }> }
) {
  // Rate limit: 5/min — kill operations are sensitive
  const rl = await checkRateLimit(req as unknown as NextRequest);
  if (rl) return rl;

  const authPayload = requireConsoleAuth(req as unknown as NextRequest);
  if (!authPayload) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const csrfError = checkCsrf(req as unknown as NextRequest);
  if (csrfError) return csrfError;

  const { pid: pidStr } = await params;
  const pid = parseInt(pidStr, 10);
  if (isNaN(pid) || pid <= 0) {
    return new Response(JSON.stringify({ error: "PID non valido" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Parse optional body
  let agentId: string | undefined;
  try {
    const body = await req.json();
    agentId = body?.agentId;
  } catch {
    // No body or invalid JSON — treat as terminal kill
  }

  // ADR-005 Section 8: Operator identity for kill audit logging
  const operatorName = `${authPayload.nome} ${authPayload.cognome}`;
  const operatorSid = authPayload.sid;

  // ─── Agent soft-kill ───
  if (agentId) {
    // Check if this is a file-tracked sub-agent (from .claude/sub-agents.json)
    const isSubAgent = agentId.startsWith("subagent-");
    let wasKilled = false;

    if (isSubAgent) {
      // Sub-agents are tracked via file — kill by marking as error in the JSON file
      const rawId = agentId.replace(/^subagent-/, "");
      wasKilled = killSubAgent(rawId);
    }

    // Also try the in-memory AbortController (works for broadcast-based agents)
    const wasAborted = abortAgent(agentId);

    // Broadcast "error" status so the UI reflects the kill
    broadcastAgentEvent({
      id: agentId,
      department: "operations",
      task: "Killed by operator",
      status: "error",
      parentPid: pid,
    });

    console.log(
      `[KILL] Operator: ${operatorName} (sid: ${operatorSid}) soft-stopped agent ${agentId} in PID ${pid}${isSubAgent ? " (sub-agent)" : ""}`
    );

    return new Response(
      JSON.stringify({
        ok: true,
        pid,
        agentId,
        method: isSubAgent ? "sub-agent-kill" : "soft-stop",
        abortControllerTriggered: wasAborted,
        fileTrackerKilled: wasKilled,
        message: isSubAgent
          ? `Sub-agent ${agentId} killed (file tracker updated)`
          : `Agent ${agentId} soft-killed (broadcast sent)`,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // ─── Terminal hard-kill ───

  // Find the session in Layer 1 first (has ChildProcess handle)
  // Layer 1 sessions are keyed by sessionId string, not PID.
  // We need to find the sessionId by iterating — use getUnifiedSessions to get the TrackedSession.
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

  // If the session has a sessionId (Layer 1), try ChildProcess.kill() first
  let method: "sigterm" | "taskkill" | "process-kill" = "sigterm";
  let killError: string | undefined;

  if (trackedSession.sessionId) {
    const activeSession = getSession(trackedSession.sessionId);
    if (activeSession?.child) {
      try {
        markSessionClosing(pid);
        activeSession.child.kill("SIGTERM");
        method = "sigterm";

        // Cleanup Layer 1 — Layer 2 cleanup + ring buffer will happen in child.on("close")
        // but we proactively clean Layer 1 here in case close fires before our response
        deleteSession(trackedSession.sessionId);
      } catch (err) {
        killError = err instanceof Error ? err.message : String(err);
      }
    }
  }

  // Fallback to OS kill if Layer 1 kill did not work (or no sessionId)
  if (killError || !trackedSession.sessionId) {
    try {
      markSessionClosing(pid);

      if (process.platform === "win32") {
        // /T kills process tree (child agents), /F forces immediate termination
        execSync(`taskkill /F /T /PID ${pid}`, {
          windowsHide: true,
          timeout: 5000,
        });
        method = "taskkill";
      } else {
        process.kill(pid, "SIGTERM");
        method = "process-kill";
      }

      // Cleanup Layer 2 + ring buffer immediately (no child.on("close") in this path)
      unregisterSession(pid);
      clearOutputRing(pid);
      killError = undefined;
    } catch (err) {
      killError = err instanceof Error ? err.message : String(err);
    }
  }

  if (killError) {
    return new Response(
      JSON.stringify({ error: `Kill failed: ${killError}` }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  console.log(
    `[KILL] Operator: ${operatorName} (sid: ${operatorSid}) killed PID ${pid} (type: ${trackedSession.type}, target: ${trackedSession.target}) via ${method}`
  );

  return new Response(
    JSON.stringify({
      ok: true,
      pid,
      method,
      message:
        method === "taskkill"
          ? `taskkill /F /T sent to PID ${pid}`
          : method === "sigterm"
          ? `SIGTERM sent to PID ${pid}`
          : `process.kill(${pid}, "SIGTERM") sent`,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}
