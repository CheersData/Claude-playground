import { NextRequest, NextResponse } from "next/server";

/**
 * Rate limiter distribuito con Upstash Redis.
 *
 * Quando UPSTASH_REDIS_REST_URL è configurato (produzione/Vercel):
 *   → Usa @upstash/ratelimit con sliding window — condiviso tra tutte le istanze.
 *
 * Quando non è configurato (sviluppo locale):
 *   → Fallback in-memory (stessa logica di prima).
 *
 * API pubblica invariata: checkRateLimit() → ora async.
 * Variabili d'ambiente richieste (Vercel dashboard / .env.local):
 *   UPSTASH_REDIS_REST_URL=https://...upstash.io
 *   UPSTASH_REDIS_REST_TOKEN=AX...
 */

// ─── Upstash (produzione) ────────────────────────────────────────────────────

let upstashClient: import("@upstash/ratelimit").Ratelimit | null = null;

function getUpstashRatelimiter(
  windowSec: number,
  max: number
): import("@upstash/ratelimit").Ratelimit | null {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return null;
  }

  // Lazy import — non blocca se il pacchetto non è disponibile
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Ratelimit } = require("@upstash/ratelimit");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis } = require("@upstash/redis");

    return new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(max, `${windowSec} s`),
      analytics: false,
    });
  } catch {
    return null;
  }
}

// ─── In-memory fallback (sviluppo) ──────────────────────────────────────────

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();
const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanup(windowMs: number): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  const cutoff = now - windowMs * 2;
  for (const [key, entry] of store.entries()) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}

function checkInMemory(
  clientKey: string,
  config: RateLimitConfig
): NextResponse | null {
  const windowMs = config.windowSec * 1000;
  const now = Date.now();
  cleanup(windowMs);

  let entry = store.get(clientKey);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(clientKey, entry);
  }

  entry.timestamps = entry.timestamps.filter((t) => t > now - windowMs);

  if (entry.timestamps.length >= config.max) {
    const oldestInWindow = entry.timestamps[0];
    const retryAfterSec = Math.ceil((oldestInWindow + windowMs - now) / 1000);
    return buildLimitedResponse(config.max, retryAfterSec, oldestInWindow + windowMs);
  }

  entry.timestamps.push(now);
  return null;
}

// ─── Configurazione per endpoint ─────────────────────────────────────────────

export interface RateLimitConfig {
  /** Finestra temporale in secondi */
  windowSec: number;
  /** Numero massimo di richieste nella finestra */
  max: number;
}

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  "api/analyze": { windowSec: 60, max: 3 },
  "api/deep-search": { windowSec: 60, max: 10 },
  "api/corpus/ask": { windowSec: 60, max: 10 },
  // SEC-M4: route pubbliche corpus — limiti per IP per evitare abuso crediti Voyage AI
  // Rotte semantiche (generano embeddings Voyage AI): limite stretto
  "api/corpus/article": { windowSec: 60, max: 30 },
  // Rotte di navigazione (no AI cost): limite più largo
  "api/corpus/hierarchy": { windowSec: 60, max: 60 },
  "api/corpus/institutes": { windowSec: 60, max: 60 },
  // Caricamento corpus — molto restrittivo (operazione admin)
  "api/corpus": { windowSec: 3600, max: 20 },
  "api/upload": { windowSec: 60, max: 10 },
  "api/vector-search": { windowSec: 60, max: 20 },
  "api/session": { windowSec: 60, max: 30 },
  // Payment endpoints — limite stretto anti-abuse (SEC-003)
  "api/stripe": { windowSec: 60, max: 5 },
  // Usage check — polled frequentemente dall'UI (SEC-003)
  "api/user/usage": { windowSec: 60, max: 60 },
  // Console — (SEC-003) match più specifico vince su "api/console"
  "api/console/auth": { windowSec: 60, max: 10 },
  "api/console/tier": { windowSec: 60, max: 30 },
  "api/console": { windowSec: 60, max: 10 },
  // Default per endpoint non specificati
  default: { windowSec: 60, max: 30 },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getClientKey(req: NextRequest, userId?: string): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  return userId ? `${ip}:${userId}` : ip;
}

function getEndpointKey(req: NextRequest): string {
  const pathname = new URL(req.url).pathname;
  let bestKey = "default";
  let bestLen = 0;
  for (const key of Object.keys(RATE_LIMITS)) {
    if (key !== "default" && pathname.includes(key) && key.length > bestLen) {
      bestKey = key;
      bestLen = key.length;
    }
  }
  return bestKey;
}

function buildLimitedResponse(
  max: number,
  retryAfterSec: number,
  resetMs: number
): NextResponse {
  return NextResponse.json(
    { error: "Troppe richieste. Riprova tra poco.", retryAfter: retryAfterSec },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSec),
        "X-RateLimit-Limit": String(max),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(resetMs / 1000)),
      },
    }
  );
}

// ─── Funzione pubblica ────────────────────────────────────────────────────────

/**
 * Controlla il rate limit per una request.
 * Restituisce null se OK, o una NextResponse 429 se superato.
 *
 * Usa Upstash Redis se configurato (produzione), altrimenti in-memory (sviluppo).
 */
export async function checkRateLimit(
  req: NextRequest,
  userId?: string
): Promise<NextResponse | null> {
  const endpointKey = getEndpointKey(req);
  const config = RATE_LIMITS[endpointKey] || RATE_LIMITS.default;
  const clientKey = `rl:${endpointKey}:${getClientKey(req, userId)}`;

  // ── Upstash (produzione) ──
  const limiter = getUpstashRatelimiter(config.windowSec, config.max);
  if (limiter) {
    try {
      const { success, limit, remaining, reset } = await limiter.limit(clientKey);
      if (!success) {
        const retryAfterSec = Math.ceil((reset - Date.now()) / 1000);
        return buildLimitedResponse(limit, Math.max(1, retryAfterSec), reset);
      }
      return null;
    } catch (err) {
      // Upstash non raggiungibile → fallback in-memory silenzioso
      console.warn(`[RATE-LIMIT] Upstash error, fallback in-memory: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── In-memory fallback ──
  return checkInMemory(clientKey, config);
}
