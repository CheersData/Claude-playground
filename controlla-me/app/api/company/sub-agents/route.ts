/**
 * GET /api/company/sub-agents — List active sub-agents + zombie count.
 * POST /api/company/sub-agents — Register or deregister a sub-agent.
 * DELETE /api/company/sub-agents — Kill all zombie sub-agents.
 *
 * Protected with requireConsoleAuth + rate limit.
 */

import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkCsrf } from "@/lib/middleware/csrf";
import {
  getActiveSubAgents,
  getSubAgentStats,
  cleanupZombies,
  killSubAgent,
} from "@/lib/company/sub-agent-tracker";
import type { NextRequest } from "next/server";

export async function GET(req: Request) {
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
    const subAgents = getActiveSubAgents();
    const stats = getSubAgentStats();

    return new Response(
      JSON.stringify({
        subAgents,
        stats,
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
    const { action, id } = body as { action?: string; id?: string };

    if (!action || !id) {
      return new Response(
        JSON.stringify({ error: "Missing action or id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (action === "kill") {
      const killed = killSubAgent(id);
      const operatorName = `${authPayload.nome} ${authPayload.cognome}`;
      console.log(
        `[KILL] Operator: ${operatorName} (sid: ${authPayload.sid}) killed sub-agent ${id}`
      );

      return new Response(
        JSON.stringify({
          ok: true,
          id,
          killed,
          message: killed
            ? `Sub-agent ${id} marked as error`
            : `Sub-agent ${id} not found or already completed`,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Errore sconosciuto";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

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

  const csrfError = checkCsrf(req as unknown as NextRequest);
  if (csrfError) return csrfError;

  try {
    const cleaned = cleanupZombies();
    const operatorName = `${authPayload.nome} ${authPayload.cognome}`;
    console.log(
      `[KILL] Operator: ${operatorName} (sid: ${authPayload.sid}) killed ${cleaned} zombie sub-agents`
    );

    return new Response(
      JSON.stringify({
        ok: true,
        cleaned,
        message: cleaned > 0
          ? `Killed ${cleaned} zombie sub-agent(s)`
          : "No zombies found",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Errore sconosciuto";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
