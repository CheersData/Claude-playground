import { NextRequest, NextResponse } from "next/server";

/**
 * CSRF protection via Origin header check.
 *
 * Strategia:
 * 1. Nessun Origin header → server-to-server o CLI → permetti sempre
 *    (I browser moderni mandano SEMPRE Origin su POST cross-site)
 * 2. Origin presente:
 *    - Stesso origine dell'app → permetti
 *    - localhost/127.0.0.1 → permetti (sviluppo)
 *    - Altrimenti → blocca 403
 *
 * Nota: Il Referer NON viene controllato — è meno affidabile dell'Origin
 * e la sua assenza indica tipicamente chiamate server-to-server legittime.
 *
 * SameSite=Lax sui cookie Supabase fornisce già protezione base.
 * Questo aggiunge un layer esplicito per le route che accettano FormData.
 *
 * Applicare a: POST /api/analyze, POST /api/upload
 */
export function checkCsrf(req: NextRequest): NextResponse | null {
  const origin = req.headers.get("origin");

  // Nessun Origin header → server-to-server, CLI, o script → permetti
  if (!origin) return null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  try {
    const originUrl = new URL(origin);
    const appUrlParsed = new URL(appUrl);

    // Stessa origine dell'app → ok
    if (originUrl.origin === appUrlParsed.origin) return null;

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
    { error: "Richiesta non autorizzata" },
    { status: 403 }
  );
}
