"use client";

import { useEffect } from "react";

/**
 * Registers the service worker for PWA support.
 * Only registers in production (or when SW is available).
 * Handles updates by activating the new SW immediately.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // Register on load to avoid blocking initial render
    window.addEventListener("load", registerSW);
    return () => window.removeEventListener("load", registerSW);
  }, []);

  return null;
}

async function registerSW() {
  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });

    // Check for updates periodically (every 60 minutes)
    setInterval(
      () => {
        registration.update().catch(() => {
          // Silent fail — update check is best-effort
        });
      },
      60 * 60 * 1000
    );

    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener("statechange", () => {
        // When the new SW is installed and there's a controller (existing SW),
        // the new version is ready. We let skipWaiting() in sw.js handle activation.
        if (
          newWorker.state === "activated" &&
          navigator.serviceWorker.controller
        ) {
          // Optional: notify user of update. For now, silent update.
          console.log("[SW] Nuova versione attivata.");
        }
      });
    });
  } catch (err) {
    console.warn("[SW] Registrazione fallita:", err);
  }
}
