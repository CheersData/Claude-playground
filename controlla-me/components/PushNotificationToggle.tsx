"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import {
  isPushSupported,
  getClientState,
  subscribeToPush,
  unsubscribeFromPush,
  type PushClientState,
} from "@/lib/push-client";

/**
 * Toggle component for enabling/disabling push notifications.
 *
 * Shows different states:
 * - Unsupported: hidden (nothing to show)
 * - Default: bell icon with "Attiva notifiche" prompt
 * - Granted + subscribed: active bell with option to disable
 * - Denied: bell-off with explanation
 * - Loading: spinner during subscribe/unsubscribe
 */
export function PushNotificationToggle({
  className = "",
  compact = false,
}: {
  className?: string;
  /** Compact mode: icon-only button (for navbar) */
  compact?: boolean;
}) {
  const [state, setState] = useState<PushClientState>({
    supported: false,
    permission: "unsupported",
    subscribed: false,
  });
  const [loading, setLoading] = useState(false);
  const [vapidKey, setVapidKey] = useState<string | null>(null);

  // Fetch VAPID key and initial state
  useEffect(() => {
    if (!isPushSupported()) return;

    const init = async () => {
      // Fetch VAPID key from server
      try {
        const res = await fetch("/api/push/subscribe");
        const data = await res.json();
        if (data.enabled && data.vapidPublicKey) {
          setVapidKey(data.vapidPublicKey);
        }
      } catch {
        // Server unreachable — push not available
        return;
      }

      // Get client state
      const clientState = await getClientState();
      setState(clientState);
    };

    init();
  }, []);

  const handleToggle = useCallback(async () => {
    if (!vapidKey || loading) return;

    setLoading(true);
    try {
      if (state.subscribed) {
        const success = await unsubscribeFromPush();
        if (success) {
          setState((prev) => ({ ...prev, subscribed: false }));
        }
      } else {
        const success = await subscribeToPush(vapidKey);
        if (success) {
          setState((prev) => ({
            ...prev,
            subscribed: true,
            permission: "granted",
          }));
        } else {
          // Permission might have been denied
          const newState = await getClientState();
          setState(newState);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [vapidKey, loading, state.subscribed]);

  // Don't render if push is not supported or VAPID is not configured
  if (!state.supported || !vapidKey) return null;

  // Permission permanently denied
  if (state.permission === "denied") {
    if (compact) {
      return (
        <button
          className={`p-2 rounded-lg text-neutral-500 cursor-not-allowed ${className}`}
          disabled
          title="Notifiche bloccate dal browser. Modifica le impostazioni del sito per riattivarle."
        >
          <BellOff className="w-5 h-5" />
        </button>
      );
    }

    return (
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-xl bg-neutral-800/50 text-neutral-400 ${className}`}
      >
        <BellOff className="w-5 h-5 flex-shrink-0" />
        <div className="text-sm">
          <p className="font-medium">Notifiche bloccate</p>
          <p className="text-xs text-neutral-500">
            Modifica le impostazioni del browser per riattivarle.
          </p>
        </div>
      </div>
    );
  }

  // Compact mode (icon button)
  if (compact) {
    return (
      <button
        onClick={handleToggle}
        disabled={loading}
        className={`p-2 rounded-lg transition-colors ${
          state.subscribed
            ? "text-[#FF6B35] hover:bg-[#FF6B35]/10"
            : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
        } ${className}`}
        title={
          state.subscribed
            ? "Notifiche attive — tocca per disattivare"
            : "Attiva notifiche"
        }
      >
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : state.subscribed ? (
          <BellRing className="w-5 h-5" />
        ) : (
          <Bell className="w-5 h-5" />
        )}
      </button>
    );
  }

  // Full mode (card with label)
  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
        state.subscribed
          ? "bg-[#FF6B35]/10 text-[#FF6B35] hover:bg-[#FF6B35]/20"
          : "bg-neutral-800/50 text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
      } ${className}`}
    >
      <div className="flex-shrink-0">
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : state.subscribed ? (
          <BellRing className="w-5 h-5" />
        ) : (
          <Bell className="w-5 h-5" />
        )}
      </div>
      <div className="text-left text-sm">
        <p className="font-medium">
          {state.subscribed ? "Notifiche attive" : "Attiva notifiche"}
        </p>
        <p className="text-xs opacity-70">
          {state.subscribed
            ? "Ricevi aggiornamenti su analisi, trading e task"
            : "Analisi completate, alert trading, aggiornamenti task"}
        </p>
      </div>
    </button>
  );
}
