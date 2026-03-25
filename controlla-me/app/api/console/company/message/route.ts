/**
 * API Console Company Message — Invia follow-up a sessione Claude Code attiva.
 *
 * Scrive su stdin del child process usando il formato stream-json.
 * La risposta arriva sulla SSE stream originale (stessa connessione).
 */

import { getSession, deleteSession } from "@/lib/company/sessions";
import { requireConsoleRole } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkCsrf } from "@/lib/middleware/csrf";
import { broadcastAgentEvent } from "@/lib/agent-broadcast";
import type { NextRequest } from "next/server";

export async function POST(req: Request) {
  // SEC-M4: Rate limit — 10 per minute
  const rl = await checkRateLimit(req as unknown as NextRequest);
  if (rl) return rl;

  // Admin only — sends follow-up to company agent session
  const authPayload = requireConsoleRole(req as unknown as NextRequest, "admin");
  if (!authPayload) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // CSRF protection
  const csrfError = checkCsrf(req as unknown as NextRequest);
  if (csrfError) return csrfError;

  try {
    const { sessionId, message } = await req.json();

    if (!sessionId || !message) {
      return new Response(JSON.stringify({ error: "sessionId e message richiesti" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const session = getSession(sessionId);
    if (!session) {
      return new Response(JSON.stringify({ error: "Sessione non trovata o terminata" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Use a unique id per message so each message has its own lifecycle
    // (running → done → 8s cleanup) that doesn't collide with other messages.
    // Previously used a stable sessionId-based key, which caused the old
    // cleanup timeout to silently fail when a new message overwrote the entry
    // — the counter grew by 1 per message and never shrank.
    const broadcastId = `company-follow-up-${sessionId}-${Date.now()}`;
    broadcastAgentEvent({
      id: broadcastId,
      department: "cme",
      task: `Messaggio follow-up: ${message.slice(0, 50)}`,
      status: "running",
    });

    // Write follow-up message in stream-json format
    const userMsg = JSON.stringify({
      type: "user",
      message: {
        role: "user",
        content: [{ type: "text", text: message }],
      },
    });

    try {
      session.child.stdin?.write(userMsg + "\n");
    } catch {
      // stdin closed — session expired
      deleteSession(sessionId);
      broadcastAgentEvent({
        id: broadcastId,
        department: "cme",
        task: "Sessione scaduta",
        status: "error",
      });
      return new Response(JSON.stringify({ error: "Sessione scaduta" }), {
        status: 410,
        headers: { "Content-Type": "application/json" },
      });
    }

    broadcastAgentEvent({
      id: broadcastId,
      department: "cme",
      task: "Messaggio inviato",
      status: "done",
    });
    return new Response(JSON.stringify({ ok: true, sessionId }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Errore invio messaggio" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
