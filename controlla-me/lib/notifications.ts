/**
 * Notification Service — CRUD operations for integration_notifications table.
 *
 * Provides a typed API for creating, querying, and managing user notifications.
 * Used by:
 * - auto-analyzer.ts: creates notifications after auto-analysis
 * - /api/notifications: REST endpoint polled by the UI
 *
 * All operations use service_role admin client for server-side access.
 * RLS on the table ensures per-user isolation for client-side queries.
 */

import { createAdminClient } from "./supabase/admin";

// ─── Types ───

/** Notification types supported by the system. */
export type NotificationType =
  | "auto_analysis_complete"
  | "auto_analysis_failed"
  | "sync_complete"
  | "sync_error"
  | "credential_expiring"
  | "credential_expired";

/** Notification severity levels. */
export type NotificationSeverity = "info" | "warning" | "error";

/** A notification record as stored in the database. */
export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  severity: NotificationSeverity;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

/** Input for creating a new notification. */
export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  severity?: NotificationSeverity;
  data?: Record<string, unknown>;
}

/** Query options for listing notifications. */
export interface NotificationQueryOptions {
  /** Only return unread notifications. Default: false. */
  unreadOnly?: boolean;
  /** Maximum number of notifications to return. Default: 50. */
  limit?: number;
  /** Filter by notification type. */
  type?: NotificationType;
  /** Return notifications created after this ISO timestamp. */
  since?: string;
}

/** Summary of unread notification counts by severity. */
export interface NotificationSummary {
  total: number;
  unread: number;
  bySeverity: {
    info: number;
    warning: number;
    error: number;
  };
}

// ─── CRUD Operations ───

/**
 * Create a new notification for a user.
 *
 * @returns The created notification ID, or null on failure.
 */
export async function createNotification(
  input: CreateNotificationInput
): Promise<string | null> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("integration_notifications")
    .insert({
      user_id: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      severity: input.severity ?? "info",
      data: input.data ?? {},
    })
    .select("id")
    .single();

  if (error) {
    console.error(`[Notifications] Create failed: ${error.message}`);
    return null;
  }

  return data?.id ?? null;
}

/**
 * List notifications for a user with optional filters.
 */
export async function listNotifications(
  userId: string,
  options: NotificationQueryOptions = {}
): Promise<Notification[]> {
  const admin = createAdminClient();
  const { unreadOnly = false, limit = 50, type, since } = options;

  let query = admin
    .from("integration_notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unreadOnly) {
    query = query.is("read_at", null);
  }

  if (type) {
    query = query.eq("type", type);
  }

  if (since) {
    query = query.gte("created_at", since);
  }

  const { data, error } = await query;

  if (error) {
    console.error(`[Notifications] List failed: ${error.message}`);
    return [];
  }

  return (data ?? []) as Notification[];
}

/**
 * Get the notification summary (counts) for a user.
 * Useful for showing a badge count in the UI.
 */
export async function getNotificationSummary(
  userId: string
): Promise<NotificationSummary> {
  const admin = createAdminClient();

  // Fetch recent notifications (last 90 days) to compute summary
  const { data, error } = await admin
    .from("integration_notifications")
    .select("id, severity, read_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !data) {
    return { total: 0, unread: 0, bySeverity: { info: 0, warning: 0, error: 0 } };
  }

  const unread = data.filter((n) => !n.read_at);
  const bySeverity = { info: 0, warning: 0, error: 0 };

  for (const n of unread) {
    const sev = n.severity as NotificationSeverity;
    if (sev in bySeverity) bySeverity[sev]++;
  }

  return {
    total: data.length,
    unread: unread.length,
    bySeverity,
  };
}

/**
 * Mark one or more notifications as read.
 *
 * @returns Number of notifications marked as read.
 */
export async function markAsRead(
  userId: string,
  notificationIds: string[]
): Promise<number> {
  if (notificationIds.length === 0) return 0;

  const admin = createAdminClient();

  const { data, error } = await admin.rpc("mark_notifications_read", {
    p_user_id: userId,
    p_notification_ids: notificationIds,
  });

  if (error) {
    console.error(`[Notifications] Mark read failed: ${error.message}`);
    return 0;
  }

  return (data as number) ?? 0;
}

/**
 * Mark all notifications as read for a user.
 *
 * @returns Number of notifications marked as read.
 */
export async function markAllAsRead(userId: string): Promise<number> {
  const admin = createAdminClient();

  const { data: unread } = await admin
    .from("integration_notifications")
    .select("id")
    .eq("user_id", userId)
    .is("read_at", null);

  if (!unread || unread.length === 0) return 0;

  const ids = unread.map((n) => n.id);
  return markAsRead(userId, ids);
}

/**
 * Delete a specific notification.
 */
export async function deleteNotification(
  userId: string,
  notificationId: string
): Promise<boolean> {
  const admin = createAdminClient();

  const { error } = await admin
    .from("integration_notifications")
    .delete()
    .eq("id", notificationId)
    .eq("user_id", userId);

  if (error) {
    console.error(`[Notifications] Delete failed: ${error.message}`);
    return false;
  }

  return true;
}
