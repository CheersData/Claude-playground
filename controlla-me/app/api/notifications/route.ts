/**
 * API Route: /api/notifications
 *
 * GET  — List notifications for the authenticated user.
 *        Query params:
 *          ?unread=true       — only unread
 *          ?limit=50          — max results (default 50)
 *          ?type=auto_analysis_complete — filter by type
 *          ?since=ISO_DATE    — only notifications after this date
 *          ?summary=true      — return only counts (badge data)
 *
 * POST — Batch mark notifications as read.
 *        Body: { ids: ["uuid1", "uuid2"] }
 *        Or:   { markAllRead: true }
 *
 * DELETE — Delete a specific notification.
 *          Body: { id: "uuid" }
 *
 * Security: requireAuth + rate-limit + CSRF (POST/DELETE)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, type AuthResult } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkCsrf } from "@/lib/middleware/csrf";
import {
  listNotifications,
  getNotificationSummary,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from "@/lib/notifications";
import type { NotificationType } from "@/lib/notifications";

// ─── GET: List notifications or summary ───

export async function GET(req: NextRequest) {
  // Rate limit by IP (no auth needed for rate limit check)
  const rateLimited = await checkRateLimit(req);
  if (rateLimited) return rateLimited;

  // Auth
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;
  const userId = (authResult as AuthResult).user.id;

  const url = new URL(req.url);
  const isSummary = url.searchParams.get("summary") === "true";

  // Summary mode: return badge counts only
  if (isSummary) {
    const summary = await getNotificationSummary(userId);
    return NextResponse.json(summary);
  }

  // List mode: return full notifications
  const unreadOnly = url.searchParams.get("unread") === "true";
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "50", 10) || 50,
    200
  );
  const type = url.searchParams.get("type") as NotificationType | null;
  const since = url.searchParams.get("since") ?? undefined;

  const notifications = await listNotifications(userId, {
    unreadOnly,
    limit,
    type: type ?? undefined,
    since,
  });

  return NextResponse.json({
    notifications,
    count: notifications.length,
  });
}

// ─── POST: Mark notifications as read ───

export async function POST(req: NextRequest) {
  // CSRF check
  const csrfBlocked = checkCsrf(req);
  if (csrfBlocked) return csrfBlocked;

  // Rate limit
  const rateLimited = await checkRateLimit(req);
  if (rateLimited) return rateLimited;

  // Auth
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;
  const userId = (authResult as AuthResult).user.id;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Mark all as read
  if (body.markAllRead === true) {
    const count = await markAllAsRead(userId);
    return NextResponse.json({ marked: count });
  }

  // Mark specific IDs as read
  const ids = body.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json(
      { error: "Provide 'ids' array or 'markAllRead: true'" },
      { status: 400 }
    );
  }

  // Validate UUIDs (basic check)
  const validIds = ids.filter(
    (id) => typeof id === "string" && id.length >= 32
  );

  if (validIds.length === 0) {
    return NextResponse.json(
      { error: "No valid notification IDs provided" },
      { status: 400 }
    );
  }

  const count = await markAsRead(userId, validIds);
  return NextResponse.json({ marked: count });
}

// ─── DELETE: Delete a notification ───

export async function DELETE(req: NextRequest) {
  // CSRF check
  const csrfBlocked = checkCsrf(req);
  if (csrfBlocked) return csrfBlocked;

  // Rate limit
  const rateLimited = await checkRateLimit(req);
  if (rateLimited) return rateLimited;

  // Auth
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;
  const userId = (authResult as AuthResult).user.id;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = body.id;
  if (typeof id !== "string" || id.length < 32) {
    return NextResponse.json(
      { error: "Provide a valid notification 'id'" },
      { status: 400 }
    );
  }

  const deleted = await deleteNotification(userId, id);
  if (!deleted) {
    return NextResponse.json(
      { error: "Notifica non trovata o non eliminabile" },
      { status: 404 }
    );
  }

  return NextResponse.json({ deleted: true });
}
