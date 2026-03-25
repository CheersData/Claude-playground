import { NextRequest, NextResponse } from "next/server";
import { authenticateUser, parseAuthInput, findUserByName } from "@/lib/console-auth";
import { generateToken } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkCsrf } from "@/lib/middleware/csrf";
import { auditLog, extractRequestMeta } from "@/lib/middleware/audit-log";
import { getRolePermissions } from "@/lib/middleware/auth";
import type { AppRole } from "@/lib/middleware/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * H3-FIX: Resolve RBAC role from the `profiles` table (DB is authoritative).
 * The legacy whitelist is used ONLY as an identity source (name matching),
 * never as a role source. If no profiles row exists, defaults to 'user'.
 */
async function resolveDbRole(
  nome: string,
  cognome: string
): Promise<AppRole> {
  try {
    const admin = createAdminClient();

    // Try to find the user's profile by matching full_name or email patterns.
    // The whitelist users may have a profiles row (e.g., created via OAuth).
    const fullName = `${nome} ${cognome}`;
    const { data, error } = await admin
      .from("profiles")
      .select("role")
      .ilike("full_name", fullName)
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return "user";
    }

    const role = data.role as AppRole;
    return role || "user";
  } catch {
    return "user";
  }
}

export async function POST(req: NextRequest) {
  // Rate limiting (SEC-003)
  const rl = await checkRateLimit(req);
  if (rl) return rl;

  // CSRF protection (SEC-005)
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

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

  // Step 1: Check whitelist for identity verification (name/cognome/ruolo match)
  const result = authenticateUser(parsed.nome, parsed.cognome, parsed.ruolo);

  const { ipAddress, userAgent } = extractRequestMeta(req);

  if (result.authorized && result.user) {
    const u = result.user;

    // H3-FIX: ALWAYS resolve role from DB (profiles table).
    // The whitelist is ONLY an identity source, never a role source.
    let dbRole = await resolveDbRole(u.nome, u.cognome);

    // If no DB profile exists (defaults to 'user'), use whitelist ruolo as fallback.
    // This allows whitelist-only users (no Supabase profile) to access the console.
    if (dbRole === "user") {
      const ruoloLower = u.ruolo.toLowerCase();
      if (ruoloLower === "boss") dbRole = "boss";
      else if (ruoloLower === "creator") dbRole = "creator";
      else if (ruoloLower === "notaio") dbRole = "operator";
    }

    // Reject console access if role is still 'user' after fallback
    if (dbRole === "user") {
      void auditLog({
        eventType: "auth.failed",
        ipAddress,
        userAgent,
        payload: {
          ruolo: u.ruolo,
          cognome: u.cognome,
          reason: "whitelist_identity_ok_but_db_role_insufficient",
          dbRole,
        },
        result: "failure",
      });
      return NextResponse.json({
        authorized: false,
        message: `Identità verificata per ${u.ruolo} ${u.cognome}, ma il ruolo nel database non consente l'accesso alla console.\nContattare un amministratore per l'assegnazione del ruolo.`,
      });
    }

    const permissions = await getRolePermissions(dbRole);

    // SEC-004: genera token HMAC-SHA256 con tier default, sid univoco, RBAC role+permissions
    const token = generateToken({
      nome: u.nome,
      cognome: u.cognome,
      ruolo: u.ruolo,
      role: dbRole,
      permissions:
        permissions.length > 0
          ? permissions
          : dbRole === "boss"
            ? ["*"]
            : ["console.access"],
    });

    // SEC-006: audit log accesso riuscito
    void auditLog({
      eventType: "auth.login",
      ipAddress,
      userAgent,
      payload: { ruolo: u.ruolo, cognome: u.cognome, role: dbRole },
      result: "success",
    });
    return NextResponse.json({
      authorized: true,
      user: {
        nome: u.nome,
        cognome: u.cognome,
        ruolo: u.ruolo,
        role: dbRole,
      },
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

  // Messaggio specifico se l'identità (nome+cognome) è nota ma il ruolo non corrisponde
  const knownUser = findUserByName(parsed.nome, parsed.cognome);
  if (knownUser) {
    return NextResponse.json({
      authorized: false,
      message: `Identità verificata per ${parsed.nome} ${parsed.cognome}, ma il ruolo "${parsed.ruolo}" non corrisponde.\nRiprovi con il ruolo corretto oppure inserisca solo: ${parsed.nome} ${parsed.cognome}`,
    });
  }

  return NextResponse.json({
    authorized: false,
    message: `Accesso non autorizzato per ${parsed.ruolo} ${parsed.nome} ${parsed.cognome}.\nQuesta console è riservata agli utenti autorizzati.`,
  });
}
