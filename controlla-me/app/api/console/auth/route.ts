import { NextRequest, NextResponse } from "next/server";
import { authenticateUser, parseAuthInput } from "@/lib/console-auth";
import { generateToken } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";

export async function POST(req: NextRequest) {
  // Rate limiting (SEC-003)
  const rl = checkRateLimit(req);
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

  if (result.authorized && result.user) {
    const u = result.user;
    // SEC-004: genera token HMAC-SHA256 con tier default e sid univoco
    const token = generateToken({ nome: u.nome, cognome: u.cognome, ruolo: u.ruolo });
    return NextResponse.json({
      authorized: true,
      user: { nome: u.nome, cognome: u.cognome, ruolo: u.ruolo },
      token,
      message: `Benvenuta, ${u.ruolo} ${u.cognome}.\n\nlexmea assiste professionisti giuridici. Può:\n\u2022 Farmi domande sulla legislazione italiana\n\u2022 Caricare un contratto per l'analisi automatica\n\u2022 Ottenere risposte argomentate con riferimenti normativi\n\nCome posso aiutarla oggi?`,
    });
  }

  return NextResponse.json({
    authorized: false,
    message: `Accesso non autorizzato per ${parsed.ruolo} ${parsed.nome} ${parsed.cognome}.\nQuesta console è riservata agli utenti autorizzati.`,
  });
}
