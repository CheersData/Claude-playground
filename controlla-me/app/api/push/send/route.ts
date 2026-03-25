/**
 * POST /api/push/send — Send push notifications
 *
 * Auth: requireConsoleAuth (operator+ only)
 * CSRF: checked
 * Rate limit: 10 req/min
 *
 * Body:
 *   { userId: string, ...payload }   — send to specific user
 *   { broadcast: true, ...payload }  — send to all subscriptions
 *   payload: { title, body, icon?, badge?, tag?, url?, category? }
 */

import { NextRequest, NextResponse } from "next/server";
import { checkCsrf } from "@/lib/middleware/csrf";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { requireConsoleAuth } from "@/lib/middleware/console-token";
import {
  sendToUser,
  broadcast,
  type PushPayload,
} from "@/lib/push-notifications";

export async function POST(req: NextRequest) {
  // Auth: console operator+
  const auth = requireConsoleAuth(req);
  if (!auth) {
    return NextResponse.json(
      { error: "Autenticazione console richiesta" },
      { status: 401 }
    );
  }

  // CSRF check
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  // Rate limit: 10 per minute
  const rl = await checkRateLimit(req);
  if (rl) return rl;

  // Parse body
  let body: {
    userId?: string;
    broadcast?: boolean;
    title?: string;
    body?: string;
    icon?: string;
    badge?: string;
    tag?: string;
    url?: string;
    category?: PushPayload["category"];
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body JSON non valido" },
      { status: 400 }
    );
  }

  // Validate payload
  if (!body.title || !body.body) {
    return NextResponse.json(
      { error: "Campi obbligatori: title, body" },
      { status: 400 }
    );
  }

  const payload: PushPayload = {
    title: body.title,
    body: body.body,
    icon: body.icon ?? "/icons/icon-192.png",
    badge: body.badge ?? "/icons/icon-192.png",
    tag: body.tag,
    url: body.url,
    category: body.category,
  };

  let sent = 0;

  if (body.broadcast) {
    sent = await broadcast(payload);
  } else if (body.userId) {
    sent = await sendToUser(body.userId, payload);
  } else {
    return NextResponse.json(
      { error: "Specificare userId o broadcast: true" },
      { status: 400 }
    );
  }

  return NextResponse.json({ sent });
}
