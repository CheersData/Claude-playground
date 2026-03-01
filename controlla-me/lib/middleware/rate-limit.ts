import { NextRequest, NextResponse } from "next/server";

/**
 * Rate limiter in-memory con sliding window.
 * Zero dipendenze, zero costi. Funziona per singola istanza.
 *
 * Limiti:
 * - Non condiviso tra istanze serverless (ma meglio di niente)
 * - Si resetta al restart del server
 * - Per produzione con piu' istanze: migrare a Redis/Upstash
 */

interface RateLimitEntry {
  timestamps: number[];
}

// Storage in-memory: Map<chiave, timestamps[]>
const store = new Map<string, RateLimitEntry>();

// Pulizia periodica per evitare memory leak
const CLEANUP_INTERVAL = 60_000; // 1 minuto
let lastCleanup = Date.now();

function cleanup(windowMs: number): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  const cutoff = now - windowMs * 2; // Margine di sicurezza
  for (const [key, entry] of store.entries()) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) {
      store.delete(key);
    }
  }
}

export interface RateLimitConfig {
  /** Finestra temporale in secondi */
  windowSec: number;
  /** Numero massimo di richieste nella finestra */
  max: number;
}

/** Configurazioni per endpoint */
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  "api/analyze": { windowSec: 60, max: 3 },
  "api/deep-search": { windowSec: 60, max: 10 },
  "api/corpus/ask": { windowSec: 60, max: 10 },
  "api/corpus": { windowSec: 3600, max: 20 },
  "api/upload": { windowSec: 60, max: 10 },
  "api/vector-search": { windowSec: 60, max: 20 },
  "api/session": { windowSec: 60, max: 30 },
  // Payment endpoints — limite stretto anti-abuse (SEC-003)
  "api/stripe": { windowSec: 60, max: 5 },
  // Usage check — polled frequentemente dall'UI (SEC-003)
  "api/user/usage": { windowSec: 60, max: 60 },
  // Console — (SEC-003) match più specifico vince su "api/console"
  "api/console/auth": { windowSec: 60, max: 10 },   // max 10 tentativi auth/min
  "api/console/tier": { windowSec: 60, max: 30 },   // max 30 switch tier/min
  "api/console": { windowSec: 60, max: 10 },         // max 10 query AI/min (costose)
  // Default per endpoint non specificati
  default: { windowSec: 60, max: 30 },
};

/**
 * Estrai una chiave identificativa dalla request.
 * Usa IP + eventuale userId per granularita'.
 */
function getClientKey(req: NextRequest, userId?: string): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  return userId ? `${ip}:${userId}` : ip;
}

/**
 * Identifica l'endpoint dalla URL per trovare la config giusta.
 * Usa longest match per evitare che "api/corpus" matchi prima di "api/corpus/ask".
 */
function getEndpointKey(req: NextRequest): string {
  const path = new URL(req.url).pathname;

  let bestKey = "default";
  let bestLen = 0;

  for (const key of Object.keys(RATE_LIMITS)) {
    if (key !== "default" && path.includes(key) && key.length > bestLen) {
      bestKey = key;
      bestLen = key.length;
    }
  }

  return bestKey;
}

/**
 * Controlla il rate limit per una request.
 * Restituisce null se OK, o una NextResponse 429 se superato.
 */
export function checkRateLimit(
  req: NextRequest,
  userId?: string
): NextResponse | null {
  const endpointKey = getEndpointKey(req);
  const config = RATE_LIMITS[endpointKey] || RATE_LIMITS.default;
  const clientKey = `${endpointKey}:${getClientKey(req, userId)}`;
  const windowMs = config.windowSec * 1000;
  const now = Date.now();

  // Pulizia periodica
  cleanup(windowMs);

  // Prendi o crea entry
  let entry = store.get(clientKey);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(clientKey, entry);
  }

  // Rimuovi timestamps fuori dalla finestra
  entry.timestamps = entry.timestamps.filter((t) => t > now - windowMs);

  // Controlla limite
  if (entry.timestamps.length >= config.max) {
    const oldestInWindow = entry.timestamps[0];
    const retryAfterSec = Math.ceil((oldestInWindow + windowMs - now) / 1000);

    return NextResponse.json(
      {
        error: "Troppe richieste. Riprova tra poco.",
        retryAfter: retryAfterSec,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSec),
          "X-RateLimit-Limit": String(config.max),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(
            Math.ceil((oldestInWindow + windowMs) / 1000)
          ),
        },
      }
    );
  }

  // Registra questa richiesta
  entry.timestamps.push(now);

  return null; // OK, non limitato
}
