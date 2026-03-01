/**
 * Console Token — HMAC-SHA256 signed tokens per autenticazione console.
 *
 * Formato:  base64url(payload_json) + "." + hmac_hex
 * Payload:  { nome, cognome, ruolo, sid, tier, disabledAgents, iat, exp }
 *
 * Il token è STATELESS: contiene tier e disabledAgents correnti della sessione.
 * Quando l'utente cambia tier, la route emette un nuovo token (refreshToken).
 * Il client aggiorna sessionStorage — zero Map lato server.
 *
 * SEC-004: implementa requireConsoleAuth() usato da /api/console e /api/console/tier.
 */

import { createHmac, randomBytes } from "crypto";
import type { NextRequest } from "next/server";
import type { TierName } from "@/lib/tiers";
import type { AgentName } from "@/lib/models";

// ─── Secret ───

const SECRET =
  process.env.CONSOLE_JWT_SECRET ||
  "dev-console-secret-CHANGE-IN-PRODUCTION-min32chars!!";

if (process.env.NODE_ENV === "production" && !process.env.CONSOLE_JWT_SECRET) {
  console.error(
    "[SECURITY] CONSOLE_JWT_SECRET non configurato in produzione! Impostare subito."
  );
}

// ─── Token TTL ───

const TOKEN_TTL_MS = 24 * 3600 * 1000; // 24 ore

// ─── Types ───

export interface ConsoleTokenPayload {
  /** Nome dell'operatore */
  nome: string;
  /** Cognome dell'operatore */
  cognome: string;
  /** Ruolo dell'operatore */
  ruolo: string;
  /** Session ID stabile — usato per logging e correlazione */
  sid: string;
  /** Tier corrente della sessione */
  tier: TierName;
  /** Agenti disabilitati nella sessione corrente */
  disabledAgents: AgentName[];
  /** Issued at (ms epoch) */
  iat: number;
  /** Expiry (ms epoch) */
  exp: number;
}

// ─── Core ───

/**
 * Genera un token firmato per un utente autenticato.
 * Il sid è stabile per tutta la durata della sessione;
 * tier e disabledAgents cambiano con refreshToken().
 */
export function generateToken(
  user: { nome: string; cognome: string; ruolo: string },
  options: {
    tier?: TierName;
    disabledAgents?: AgentName[];
    /** Riutilizza un sid esistente (per refresh) */
    sid?: string;
  } = {}
): string {
  const payload: ConsoleTokenPayload = {
    nome: user.nome,
    cognome: user.cognome,
    ruolo: user.ruolo,
    sid: options.sid ?? randomBytes(16).toString("hex"),
    tier: options.tier ?? "partner",
    disabledAgents: options.disabledAgents ?? [],
    iat: Date.now(),
    exp: Date.now() + TOKEN_TTL_MS,
  };

  return sign(payload);
}

/**
 * Emette un nuovo token con tier/disabledAgents aggiornati.
 * Preserva sid, nome, cognome, ruolo del token originale.
 */
export function refreshToken(
  payload: ConsoleTokenPayload,
  updates: Partial<Pick<ConsoleTokenPayload, "tier" | "disabledAgents">>
): string {
  return generateToken(
    { nome: payload.nome, cognome: payload.cognome, ruolo: payload.ruolo },
    {
      sid: payload.sid,
      tier: updates.tier ?? payload.tier,
      disabledAgents: updates.disabledAgents ?? payload.disabledAgents,
    }
  );
}

/**
 * Verifica il token e ritorna il payload se valido e non scaduto.
 * Ritorna null se firma errata, token malformato o scaduto.
 */
export function verifyToken(token: string): ConsoleTokenPayload | null {
  try {
    const dotIdx = token.lastIndexOf(".");
    if (dotIdx === -1) return null;

    const payloadB64 = token.slice(0, dotIdx);
    const sig = token.slice(dotIdx + 1);
    const expectedSig = createHmac("sha256", SECRET)
      .update(payloadB64)
      .digest("hex");

    // Timing-safe comparison (evita timing attack)
    if (sig.length !== expectedSig.length) return null;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) {
      diff |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
    }
    if (diff !== 0) return null;

    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8")
    ) as ConsoleTokenPayload;

    if (Date.now() > payload.exp) return null;

    return payload;
  } catch {
    return null;
  }
}

/**
 * Estrae e verifica il token dall'header Authorization della request.
 * Ritorna il payload se valido, null se assente/invalido/scaduto.
 */
export function requireConsoleAuth(
  req: NextRequest
): ConsoleTokenPayload | null {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return verifyToken(auth.slice(7));
}

// ─── Internals ───

function sign(payload: ConsoleTokenPayload): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(payloadB64).digest("hex");
  return `${payloadB64}.${sig}`;
}
