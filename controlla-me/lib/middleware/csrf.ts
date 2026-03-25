import { NextRequest, NextResponse } from "next/server";

/**
 * CSRF protection via Origin header check.
 *
 * Strategia:
 * 1. Nessun Origin header → server-to-server o CLI → permetti sempre
 *    (I browser moderni mandano SEMPRE Origin su POST cross-site)
 * 2. Origin presente:
 *    - Stesso origine dell'app → permetti
 *    - Origini aggiuntive in ALLOWED_ORIGINS (comma-separated) → permetti
 *    - localhost/127.0.0.1 → permetti (sviluppo)
 *    - Altrimenti → blocca 403
 *
 * Variabili d'ambiente:
 *   NEXT_PUBLIC_APP_URL  — dominio principale (es. https://controlla-me.vercel.app)
 *   ALLOWED_ORIGINS      — origini aggiuntive separate da virgola
 *                          (es. https://www.poimandres.work,https://poimandres.work)
 *
 * Nota: Il Referer NON viene controllato — è meno affidabile dell'Origin
 * e la sua assenza indica tipicamente chiamate server-to-server legittime.
 *
 * SameSite=Lax sui cookie Supabase fornisce già protezione base.
 * Questo aggiunge un layer esplicito per le route che accettano FormData.
 *
 * Applicare a: POST /api/analyze, POST /api/upload, POST /api/console, POST /api/console/tier
 */
export function checkCsrf(req: NextRequest): NextResponse | null {
  const origin = req.headers.get("origin");

  // Nessun Origin header → server-to-server, CLI, o script → permetti
  if (!origin) return null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Costruisce set di origini consentite: app URL + hardcoded + ALLOWED_ORIGINS
  const allowedOrigins = new Set<string>();
  try {
    const parsed = new URL(appUrl);
    allowedOrigins.add(parsed.origin);
    // Auto-allow www/non-www variant to prevent CSRF false positives
    // when users access via www.domain vs domain (common with DNS setups)
    if (parsed.hostname.startsWith("www.")) {
      const nonWww = new URL(appUrl);
      nonWww.hostname = parsed.hostname.slice(4);
      allowedOrigins.add(nonWww.origin);
    } else if (!parsed.hostname.includes("localhost")) {
      const withWww = new URL(appUrl);
      withWww.hostname = `www.${parsed.hostname}`;
      allowedOrigins.add(withWww.origin);
    }
  } catch {
    // URL non valida, ignorata
  }

  // Origini di produzione hardcoded (non dipendono da env vars)
  allowedOrigins.add("https://www.poimandres.work");
  allowedOrigins.add("https://poimandres.work");
  allowedOrigins.add("https://controlla.me");
  allowedOrigins.add("https://www.controlla.me");

  // ALLOWED_ORIGINS: origini aggiuntive da env var (comma-separated)
  const extra = process.env.ALLOWED_ORIGINS ?? "";
  for (const raw of extra.split(",")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    try {
      allowedOrigins.add(new URL(trimmed).origin);
    } catch {
      // URL non valida, ignorata
    }
  }

  try {
    const originUrl = new URL(origin);

    // Origini consentite (app URL + ALLOWED_ORIGINS) → ok
    if (allowedOrigins.has(originUrl.origin)) return null;

    // Localhost (sviluppo) → ok
    if (
      originUrl.hostname === "localhost" ||
      originUrl.hostname === "127.0.0.1"
    ) {
      return null;
    }
  } catch {
    // URL non valida → blocca per sicurezza
  }

  return NextResponse.json(
    { error: "Origine della richiesta non consentita" },
    { status: 403 }
  );
}
