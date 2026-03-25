/**
 * Client-side push notification utilities.
 *
 * Handles permission requests, subscription management, and
 * communication with the /api/push/subscribe endpoint.
 *
 * All functions are safe to call server-side (they no-op when
 * window/navigator are unavailable).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type PushPermissionState = "granted" | "denied" | "default" | "unsupported";

export interface PushClientState {
  /** Whether the browser supports push notifications */
  supported: boolean;
  /** Current permission state */
  permission: PushPermissionState;
  /** Whether the user is currently subscribed */
  subscribed: boolean;
}

// ─── Feature Detection ────────────────────────────────────────────────────────

/** Returns true if the browser supports push notifications */
export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Returns the current notification permission state */
export function getPermissionState(): PushPermissionState {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission as PushPermissionState;
}

// ─── VAPID Key ────────────────────────────────────────────────────────────────

/**
 * Converts a base64url VAPID public key to a Uint8Array
 * required by PushManager.subscribe().
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Requests notification permission from the user.
 * Returns the resulting permission state.
 */
export async function requestPermission(): Promise<PushPermissionState> {
  if (!isPushSupported()) return "unsupported";

  const result = await Notification.requestPermission();
  return result as PushPermissionState;
}

/**
 * Gets the current push subscription state.
 */
export async function getClientState(): Promise<PushClientState> {
  if (!isPushSupported()) {
    return { supported: false, permission: "unsupported", subscribed: false };
  }

  const permission = getPermissionState();
  let subscribed = false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    subscribed = subscription !== null;
  } catch {
    // SW not ready yet — that's OK
  }

  return { supported: true, permission, subscribed };
}

/**
 * Subscribes the user to push notifications.
 *
 * 1. Requests permission if not yet granted
 * 2. Subscribes to PushManager with VAPID key
 * 3. Sends the subscription to our server
 *
 * @param vapidPublicKey - The VAPID public key (base64url encoded)
 * @returns true if successfully subscribed, false otherwise
 */
export async function subscribeToPush(
  vapidPublicKey: string
): Promise<boolean> {
  if (!isPushSupported()) return false;

  // Request permission if needed
  const permission = await requestPermission();
  if (permission !== "granted") return false;

  try {
    const registration = await navigator.serviceWorker.ready;

    // Check if already subscribed
    const existingSubscription =
      await registration.pushManager.getSubscription();
    if (existingSubscription) {
      // Already subscribed — re-sync with server
      await syncSubscriptionWithServer(existingSubscription);
      return true;
    }

    // Create new subscription
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

    // Send to server
    await syncSubscriptionWithServer(subscription);
    return true;
  } catch (err) {
    console.error("[Push] Errore durante la sottoscrizione:", err);
    return false;
  }
}

/**
 * Unsubscribes the user from push notifications.
 * Removes the subscription from both the browser and our server.
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (!subscription) return true; // Already unsubscribed

    // Remove from server first
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });

    // Then unsubscribe from browser
    await subscription.unsubscribe();
    return true;
  } catch (err) {
    console.error("[Push] Errore durante la cancellazione:", err);
    return false;
  }
}

// ─── Internal ─────────────────────────────────────────────────────────────────

/**
 * Sends the PushSubscription to the server for storage.
 */
async function syncSubscriptionWithServer(
  subscription: PushSubscription
): Promise<void> {
  const json = subscription.toJSON();

  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: {
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Server rejected subscription: ${response.status} ${text}`);
  }
}
