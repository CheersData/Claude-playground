import { NextRequest, NextResponse } from "next/server";
import { authenticateUser, parseAuthInput } from "@/lib/console-auth";
import { generateToken } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { auditLog, extractRequestMeta } from "@/lib/middleware/audit-log";

export async function POST(req: NextRequest) {
  // Rate limiting (SEC-003)
  const rl = await checkRateLimit(req);
  if (rl) return rl;

  const body = await req.json();
  const { input } = body as { input?: string };

  if (!input || !input.trim()) {
    return NextResponse.json({
      authorized: false,
      message: "Inserisca nome, cognome e ruolo per procedere.",
    });
  }

  const parsed = parseAuthInput(input);

  if (!parsed) {
    return NextResponse.json({
      authorized: false,
      message:
        "Non ho capito. Inserisca: Nome Cognome, Ruolo\n(Esempio: Mario Rossi, Avvocato)",
    });
  }

  const result = authenticateUser(parsed.nome, parsed.cognome, parsed.ruolo);

  const { ipAddress, userAgent } = extractRequestMeta(req);

  if (result.authorized && result.user) {
    const u = result.user;
    // SEC-004: genera token HMAC-SHA256 con tier default e sid univoco
    const token = generateToken({ nome: u.nome, cognome: u.cognome, ruolo: u.ruolo });
    // SEC-006: audit log accesso riuscito
    void auditLog({
      eventType: "auth.login",
      ipAddress,
      userAgent,
      payload: { ruolo: u.ruolo, cognome: u.cognome },
      result: "success",
    });
    return NextResponse.json({
      authorized: true,
      user: { nome: u.nome, cognome: u.cognome, ruolo: u.ruolo },
      token,
      message: `Benvenuta, ${u.ruolo} ${u.cognome}.\n\nlexmea assiste professionisti giuridici. Può:\n\u2022 Farmi domande sulla legislazione italiana\n\u2022 Caricare un contratto per l'analisi automatica\n\u2022 Ottenere risposte argomentate con riferimenti normativi\n\nCome posso aiutarla oggi?`,
    });
  }

  // SEC-006: audit log accesso negato
  void auditLog({
    eventType: "auth.failed",
    ipAddress,
    userAgent,
    payload: { ruolo: parsed.ruolo, nome: parsed.nome },
    result: "failure",
  });
  return NextResponse.json({
    authorized: false,
    message: `Accesso non autorizzato per ${parsed.ruolo} ${parsed.nome} ${parsed.cognome}.\nQuesta console è riservata agli utenti autorizzati.`,
  });
}
