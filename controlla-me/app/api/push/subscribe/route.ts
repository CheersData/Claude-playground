/**
 * POST /api/push/subscribe — Store a push subscription
 * DELETE /api/push/subscribe — Remove a push subscription
 * GET /api/push/subscribe — Get VAPID public key + subscription status
 *
 * Auth: optional (anonymous subscriptions allowed, but user_id linked if authenticated)
 * CSRF: checked on POST/DELETE
 * Rate limit: 10 req/min per IP
 */

import { NextRequest, NextResponse } from "next/server";
import { checkCsrf } from "@/lib/middleware/csrf";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import {
  saveSubscription,
  removeSubscription,
  getVapidPublicKey,
} from "@/lib/push-notifications";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const rl = await checkRateLimit(req);
  if (rl) return rl;

  const vapidKey = getVapidPublicKey();

  if (!vapidKey) {
    return NextResponse.json(
      { enabled: false, reason: "VAPID non configurato" },
      { status: 200 }
    );
  }

  return NextResponse.json({
    enabled: true,
    vapidPublicKey: vapidKey,
  });
}

export async function POST(req: NextRequest) {
  // CSRF check
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  // Rate limit: 10 per minute
  const rl = await checkRateLimit(req);
  if (rl) return rl;

  // Parse body
  let body: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body JSON non valido" },
      { status: 400 }
    );
  }

  const { endpoint, keys } = body;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json(
      { error: "Campi obbligatori: endpoint, keys.p256dh, keys.auth" },
      { status: 400 }
    );
  }

  // Validate endpoint is a URL
  try {
    new URL(endpoint);
  } catch {
    return NextResponse.json(
      { error: "Endpoint non valido" },
      { status: 400 }
    );
  }

  // Get user ID if authenticated (optional)
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    // Not authenticated — that's fine
  }

  const userAgent = req.headers.get("user-agent");

  const result = await saveSubscription(
    { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
    userId,
    userAgent
  );

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ id: result.id }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  // CSRF check
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  // Rate limit
  const rl = await checkRateLimit(req);
  if (rl) return rl;

  let body: { endpoint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body JSON non valido" },
      { status: 400 }
    );
  }

  if (!body.endpoint) {
    return NextResponse.json(
      { error: "Campo obbligatorio: endpoint" },
      { status: 400 }
    );
  }

  const result = await removeSubscription(body.endpoint);

  return NextResponse.json({ success: result.success });
}
