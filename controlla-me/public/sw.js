/// <reference lib="webworker" />

/**
 * Poimandres Service Worker
 *
 * Cache strategies:
 * - Cache-first: static assets (JS, CSS, fonts, icons, images)
 * - Network-first: API calls (/api/*) with offline fallback
 * - Stale-while-revalidate: corpus legislativo (/api/corpus/*)
 * - No cache: SSE streaming endpoints
 */

const CACHE_VERSION = "poimandres-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;
const CORPUS_CACHE = `${CACHE_VERSION}-corpus`;

const OFFLINE_URL = "/offline";

// SSE streaming endpoints — NEVER cache
const SSE_ENDPOINTS = [
  "/api/analyze",
  "/api/console",
  "/api/music/analyze",
  "/api/debug/stream",
];

// Static asset extensions to cache-first
const STATIC_EXTENSIONS = [
  ".js",
  ".css",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".png",
  ".jpg",
  ".jpeg",
  ".svg",
  ".ico",
  ".webp",
  ".avif",
  ".mp4",
  ".webm",
];

// Google Fonts domains for cache-first
const FONT_ORIGINS = [
  "https://fonts.googleapis.com",
  "https://fonts.gstatic.com",
];

// ─── Install ───────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      // Pre-cache the offline page
      return cache.addAll([OFFLINE_URL]);
    })
  );
  // Activate immediately — don't wait for old SW to finish
  self.skipWaiting();
});

// ─── Activate ──────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key.startsWith("poimandres-") && key !== STATIC_CACHE && key !== API_CACHE && key !== CORPUS_CACHE)
          .map((key) => caches.delete(key))
      );
    })
  );
  // Take control of all clients immediately
  self.clients.claim();
});

// ─── Fetch ─────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== "GET") return;

  // Skip SSE streaming endpoints — never cache
  if (isSSEEndpoint(url.pathname)) return;

  // Skip non-http(s) requests (chrome-extension, etc.)
  if (!url.protocol.startsWith("http")) return;

  // Route to appropriate strategy
  if (isCorpusAPI(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, CORPUS_CACHE));
  } else if (isAPIRoute(url.pathname)) {
    event.respondWith(networkFirst(request, API_CACHE));
  } else if (isStaticAsset(url) || isFontRequest(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  } else if (isNavigationRequest(request)) {
    event.respondWith(navigationHandler(request));
  }
});

// ─── Strategy: Cache-First ─────────────────────────────────────
// For static assets: serve from cache, fall back to network
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Static asset unavailable offline — return 503
    return new Response("Offline", { status: 503 });
  }
}

// ─── Strategy: Network-First ───────────────────────────────────
// For API calls: try network, fall back to cache
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    // API unavailable and no cache — return JSON error
    return new Response(
      JSON.stringify({ error: "Sei offline. Riprova quando sei connesso." }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

// ─── Strategy: Stale-While-Revalidate ──────────────────────────
// For corpus data: serve cache immediately, update in background
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  return cached || fetchPromise;
}

// ─── Navigation Handler ────────────────────────────────────────
// For page navigations: network first, offline page fallback
async function navigationHandler(request) {
  try {
    return await fetch(request);
  } catch {
    const cached = await caches.match(OFFLINE_URL);
    if (cached) return cached;

    return new Response("Offline", {
      status: 503,
      headers: { "Content-Type": "text/html" },
    });
  }
}

// ─── Helpers ───────────────────────────────────────────────────
function isSSEEndpoint(pathname) {
  return SSE_ENDPOINTS.some((ep) => pathname.startsWith(ep));
}

function isCorpusAPI(pathname) {
  return pathname.startsWith("/api/corpus/");
}

function isAPIRoute(pathname) {
  return pathname.startsWith("/api/");
}

function isStaticAsset(url) {
  // Next.js static files
  if (url.pathname.startsWith("/_next/static/")) return true;
  // Files with static extensions
  return STATIC_EXTENSIONS.some((ext) => url.pathname.endsWith(ext));
}

function isFontRequest(url) {
  return FONT_ORIGINS.some((origin) => url.href.startsWith(origin));
}

function isNavigationRequest(request) {
  return request.mode === "navigate" || request.headers.get("accept")?.includes("text/html");
}

// ─── Push Notifications ─────────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    // Fallback for plain text push
    payload = {
      title: "Poimandres",
      body: event.data.text(),
    };
  }

  const title = payload.title || "Poimandres";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icons/icon-192.png",
    badge: payload.badge || "/icons/icon-192.png",
    tag: payload.tag || "poimandres-default",
    // Store the URL to open on click
    data: {
      url: payload.url || "/",
      category: payload.category || "system",
      ...payload.data,
    },
    // Vibration pattern: short-pause-long
    vibrate: [100, 50, 200],
    // Actions for rich notifications (Android)
    actions: getActionsForCategory(payload.category),
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ─── Notification Click ─────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";
  const action = event.action;

  // Handle custom actions
  let targetUrl = url;
  if (action === "view-dashboard") {
    targetUrl = "/dashboard";
  } else if (action === "view-ops") {
    targetUrl = "/ops";
  }

  // Focus existing window or open new one
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // Try to focus an existing window on the same origin
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        // No existing window — open a new one
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

// ─── Notification Close (dismissed) ─────────────────────────────
self.addEventListener("notificationclose", (_event) => {
  // Could track dismissals for analytics in the future
});

// ─── Background Sync ────────────────────────────────────────────
// Queued requests are stored in IndexedDB by the client and replayed
// when connectivity is restored.

const SYNC_STORE = "poimandres-sync-queue";

self.addEventListener("sync", (event) => {
  if (event.tag === "offline-queue") {
    event.waitUntil(replayOfflineQueue());
  }
});

/**
 * Replays queued requests that were saved while offline.
 * Each entry in the queue is: { url, method, headers, body, timestamp }
 */
async function replayOfflineQueue() {
  let db;
  try {
    db = await openSyncDB();
  } catch {
    // IndexedDB not available — skip
    return;
  }

  const tx = db.transaction(SYNC_STORE, "readwrite");
  const store = tx.objectStore(SYNC_STORE);
  const allKeys = await idbGetAllKeys(store);

  for (const key of allKeys) {
    try {
      const entry = await idbGet(store, key);
      if (!entry) continue;

      // Skip entries older than 24 hours
      if (Date.now() - entry.timestamp > 24 * 60 * 60 * 1000) {
        store.delete(key);
        continue;
      }

      const response = await fetch(entry.url, {
        method: entry.method,
        headers: entry.headers,
        body: entry.body,
      });

      if (response.ok || response.status < 500) {
        // Success or client error (don't retry) — remove from queue
        store.delete(key);
      }
      // 5xx — leave in queue for next sync
    } catch {
      // Network still down — leave in queue
      break;
    }
  }
}

// ─── IndexedDB Helpers for Background Sync ──────────────────────
function openSyncDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("poimandres-sw", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SYNC_STORE)) {
        db.createObjectStore(SYNC_STORE, { autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbGet(store, key) {
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGetAllKeys(store) {
  return new Promise((resolve, reject) => {
    const req = store.getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── Push Notification Actions by Category ──────────────────────
function getActionsForCategory(category) {
  switch (category) {
    case "analysis":
      return [
        { action: "view-dashboard", title: "Vedi risultati" },
      ];
    case "trading":
      return [
        { action: "view-ops", title: "Vai a Ops" },
      ];
    case "task":
      return [
        { action: "view-ops", title: "Vedi task" },
      ];
    default:
      return [];
  }
}
