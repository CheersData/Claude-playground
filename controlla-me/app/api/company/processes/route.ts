/**
 * GET /api/company/processes — Unified Process Monitor endpoint.
 *
 * Returns all running processes across the system in a unified schema:
 *   - Console/daemon/interactive sessions (in-memory + file-based)
 *   - Sub-agents (.claude/sub-agents.json)
 *   - Company tasks in_progress (Supabase)
 *   - Trading scheduler (heartbeat file)
 *
 * POST /api/company/processes — Kill a process.
 *   Body: { id: string, action: "kill" }
 *   Dispatches to the correct kill mechanism based on process type.
 *
 * Architecture Plan: company/architecture/plans/process-monitor.md
 * Protected with requireConsoleAuth + rate limit + CSRF on POST.
 */

import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkCsrf } from "@/lib/middleware/csrf";
import {
  getUnifiedProcesses,
  computeSummary,
  killProcess,
} from "@/lib/company/process-monitor";
import type { MonitoredProcess } from "@/lib/company/process-monitor";
import type { NextRequest } from "next/server";

export async function GET(req: Request) {
  // Rate limit: 30/min (polled every 5s by the UI)
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
    const processes = await getUnifiedProcesses();
    const summary = computeSummary(processes);

    return new Response(
      JSON.stringify({
        processes,
        summary,
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

export async function POST(req: Request) {
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

  try {
    const body = await req.json();
    const { id, action } = body as { id?: string; action?: string };

    if (!id || action !== "kill") {
      return new Response(
        JSON.stringify({ error: "Missing id or invalid action. Expected: { id, action: \"kill\" }" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Find the process to determine its type
    const processes = await getUnifiedProcesses();
    const target = findProcess(processes, id);

    if (!target) {
      return new Response(
        JSON.stringify({ error: `Process not found: ${id}` }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!target.killable) {
      return new Response(
        JSON.stringify({ error: `Process ${id} is not killable` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const result = await killProcess(id, target.type);

    // Audit log
    const operatorName = `${authPayload.nome} ${authPayload.cognome}`;
    console.log(
      `[PROCESS-MONITOR] Operator: ${operatorName} (sid: ${authPayload.sid}) kill ${target.type} ${id} — ${result.ok ? "OK" : "FAILED"}: ${result.message}`
    );

    return new Response(
      JSON.stringify({
        ok: result.ok,
        id,
        type: target.type,
        message: result.message,
      }),
      {
        status: result.ok ? 200 : 500,
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

// ─── Helpers ───

/**
 * Find a process by id in the list, including nested children.
 */
function findProcess(
  processes: MonitoredProcess[],
  id: string
): MonitoredProcess | null {
  for (const p of processes) {
    if (p.id === id) return p;
    for (const child of p.children ?? []) {
      if (child.id === id) return child;
    }
  }
  return null;
}
