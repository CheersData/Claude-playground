/**
 * Server-side push notification utilities.
 *
 * Uses the web-push library with VAPID keys for standard Web Push Protocol.
 * Subscriptions are stored in Supabase (push_subscriptions table).
 *
 * Required env vars:
 *   VAPID_PUBLIC_KEY   — base64url-encoded VAPID public key
 *   VAPID_PRIVATE_KEY  — base64url-encoded VAPID private key
 *   NEXT_PUBLIC_APP_URL — used as VAPID subject (mailto: or https://)
 */

import * as webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PushSubscriptionRecord {
  id: string;
  user_id: string | null;
  endpoint: string;
  keys_p256dh: string;
  keys_auth: string;
  created_at: string;
  last_used_at: string | null;
  user_agent: string | null;
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  url?: string;
  /** Notification category for client-side filtering */
  category?: "analysis" | "trading" | "task" | "system";
  data?: Record<string, unknown>;
}

// ─── VAPID Configuration ──────────────────────────────────────────────────────

let vapidConfigured = false;

function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://localhost:3000";

  if (!publicKey || !privateKey) {
    console.warn(
      "[Push] VAPID_PUBLIC_KEY o VAPID_PRIVATE_KEY non configurate. Push notifications disabilitate."
    );
    return false;
  }

  webpush.setVapidDetails(appUrl, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

/**
 * Returns the VAPID public key for client-side subscription.
 * Returns null if VAPID is not configured.
 */
export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

// ─── Subscription Storage (Supabase) ──────────────────────────────────────────

/**
 * Saves or updates a push subscription in the database.
 * Uses the endpoint as unique key — if the same endpoint is re-subscribed,
 * the record is updated (upsert).
 */
export async function saveSubscription(
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  },
  userId: string | null,
  userAgent: string | null
): Promise<{ id: string } | { error: string }> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: userId,
        endpoint: subscription.endpoint,
        keys_p256dh: subscription.keys.p256dh,
        keys_auth: subscription.keys.auth,
        user_agent: userAgent,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    )
    .select("id")
    .single();

  if (error) {
    console.error("[Push] Errore salvataggio subscription:", error.message);
    return { error: error.message };
  }

  return { id: data.id };
}

/**
 * Removes a push subscription by endpoint.
 */
export async function removeSubscription(
  endpoint: string
): Promise<{ success: boolean }> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);

  if (error) {
    console.error("[Push] Errore rimozione subscription:", error.message);
    return { success: false };
  }

  return { success: true };
}

// ─── Send Notifications ───────────────────────────────────────────────────────

/**
 * Sends a push notification to a specific subscription.
 * Returns true on success, false on failure.
 * Automatically removes subscriptions that are no longer valid (410 Gone).
 */
export async function sendToSubscription(
  subscription: PushSubscriptionRecord,
  payload: PushPayload
): Promise<boolean> {
  if (!ensureVapidConfigured()) return false;

  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.keys_p256dh,
      auth: subscription.keys_auth,
    },
  };

  try {
    await webpush.sendNotification(
      pushSubscription,
      JSON.stringify(payload),
      {
        TTL: 60 * 60, // 1 hour
        urgency: "normal",
      }
    );

    // Update last_used_at
    const supabase = createAdminClient();
    await supabase
      .from("push_subscriptions")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", subscription.id);

    return true;
  } catch (err: unknown) {
    const statusCode =
      err && typeof err === "object" && "statusCode" in err
        ? (err as { statusCode: number }).statusCode
        : 0;

    // 404 or 410 = subscription no longer valid — clean up
    if (statusCode === 404 || statusCode === 410) {
      console.log(
        `[Push] Subscription scaduta (${statusCode}), rimuovo:`,
        subscription.endpoint.slice(0, 60)
      );
      await removeSubscription(subscription.endpoint);
      return false;
    }

    console.error(
      "[Push] Errore invio notifica:",
      err instanceof Error ? err.message : String(err)
    );
    return false;
  }
}

/**
 * Sends a push notification to a specific user (all their subscriptions).
 * Returns the count of successfully delivered notifications.
 */
export async function sendToUser(
  userId: string,
  payload: PushPayload
): Promise<number> {
  if (!ensureVapidConfigured()) return 0;

  const supabase = createAdminClient();
  const { data: subscriptions, error } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("user_id", userId);

  if (error || !subscriptions?.length) return 0;

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      sendToSubscription(sub as PushSubscriptionRecord, payload)
    )
  );

  return results.filter(
    (r) => r.status === "fulfilled" && r.value === true
  ).length;
}

/**
 * Sends a push notification to ALL subscriptions (broadcast).
 * Use sparingly — intended for system-wide announcements.
 * Returns the count of successfully delivered notifications.
 */
export async function broadcast(payload: PushPayload): Promise<number> {
  if (!ensureVapidConfigured()) return 0;

  const supabase = createAdminClient();
  const { data: subscriptions, error } = await supabase
    .from("push_subscriptions")
    .select("*");

  if (error || !subscriptions?.length) return 0;

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      sendToSubscription(sub as PushSubscriptionRecord, payload)
    )
  );

  return results.filter(
    (r) => r.status === "fulfilled" && r.value === true
  ).length;
}

// ─── Convenience helpers ──────────────────────────────────────────────────────

/** Notify user that their contract analysis is complete */
export async function notifyAnalysisComplete(
  userId: string,
  analysisId: string,
  fileName: string
): Promise<number> {
  return sendToUser(userId, {
    title: "Analisi completata",
    body: `L'analisi di "${fileName}" e pronta. Tocca per vedere i risultati.`,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: `analysis-${analysisId}`,
    url: `/analysis/${analysisId}`,
    category: "analysis",
  });
}

/** Notify about a trading alert (kill switch, daily report, etc.) */
export async function notifyTradingAlert(
  userId: string,
  title: string,
  body: string,
  url?: string
): Promise<number> {
  return sendToUser(userId, {
    title,
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: `trading-${Date.now()}`,
    url: url ?? "/ops",
    category: "trading",
  });
}

/** Notify about a task board update */
export async function notifyTaskUpdate(
  userId: string,
  taskTitle: string,
  action: "created" | "completed" | "assigned"
): Promise<number> {
  const actionText = {
    created: "Nuovo task creato",
    completed: "Task completato",
    assigned: "Task assegnato a te",
  }[action];

  return sendToUser(userId, {
    title: actionText,
    body: taskTitle,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: `task-${Date.now()}`,
    url: "/ops",
    category: "task",
  });
}
