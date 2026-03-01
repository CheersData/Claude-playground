/**
 * API Console Company Message — Invia follow-up a sessione Claude Code attiva.
 *
 * Scrive su stdin del child process usando il formato stream-json.
 * La risposta arriva sulla SSE stream originale (stessa connessione).
 */

import { getSession, deleteSession } from "@/lib/company/sessions";
import { requireConsoleAuth } from "@/lib/middleware/console-token";
import type { NextRequest } from "next/server";

export async function POST(req: Request) {
  const authPayload = requireConsoleAuth(req as unknown as NextRequest);
  if (!authPayload) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

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
      return new Response(JSON.stringify({ error: "Sessione scaduta" }), {
        status: 410,
        headers: { "Content-Type": "application/json" },
      });
    }

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
