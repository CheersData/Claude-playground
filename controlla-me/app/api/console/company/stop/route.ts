/**
 * API Stop — Termina una sessione company chat attiva.
 */

import { deleteSession } from "@/lib/company/sessions";
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
    const { sessionId } = await req.json();

    if (!sessionId) {
      return new Response(JSON.stringify({ error: "sessionId richiesto" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    deleteSession(sessionId);

    return new Response(JSON.stringify({ ok: true, sessionId }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Errore stop" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
