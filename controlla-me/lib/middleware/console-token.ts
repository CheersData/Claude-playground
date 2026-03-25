/**
 * Console Token — HMAC-SHA256 signed tokens per autenticazione console.
 *
 * Formato:  base64url(payload_json) + "." + hmac_hex
 * Payload:  { nome, cognome, ruolo, role, permissions, sid, tier, disabledAgents, iat, exp }
 *
 * The token is STATELESS: contains tier, disabledAgents, RBAC role and permissions.
 * When the user changes tier, the route emits a new token (refreshToken).
 * The client updates sessionStorage — zero Map server-side.
 *
 * SEC-004: implements requireConsoleAuth() used by /api/console and /api/console/tier.
 * RBAC: role/permissions from profiles.role + role_permissions table (migration 044).
 */

import { createHmac, randomBytes } from "crypto";
import type { NextRequest } from "next/server";
import type { TierName } from "@/lib/tiers";
import type { AgentName } from "@/lib/models";
import type { AppRole } from "@/lib/middleware/auth";
import { roleLevel, ROLE_HIERARCHY } from "@/lib/middleware/auth";

// ─── Secret ───

/**
 * In produzione: CONSOLE_JWT_SECRET obbligatorio.
 * Se mancante, usa un segreto casuale per-processo:
 *   - Nessun token hardcoded esterno può essere valido (sicuro)
 *   - I token scadono ad ogni restart (limitazione accettabile vs bypass silenzioso)
 *   - Logga un errore critico per segnalare la misconfiguration
 *
 * In sviluppo: fallback su stringa hardcoded (ok per dev locale).
 */
function buildSecret(): string {
  const envSecret = process.env.CONSOLE_JWT_SECRET;
  if (envSecret) return envSecret;

  if (process.env.NODE_ENV === "production") {
    console.error(
      "[SECURITY CRITICAL] CONSOLE_JWT_SECRET non configurato in produzione! " +
      "Usando segreto casuale per-processo — i token scadranno ad ogni restart. " +
      "Configurare CONSOLE_JWT_SECRET immediatamente."
    );
    // Segreto casuale: invalida token hardcoded, nessun bypass possibile
    return createHmac("sha256", Date.now().toString())
      .update(Math.random().toString())
      .digest("hex");
  }

  return "dev-console-secret-CHANGE-IN-PRODUCTION-min32chars!!";
}

const SECRET = buildSecret();

// ─── Token TTL ───

const TOKEN_TTL_MS = 24 * 3600 * 1000; // 24 ore

// ─── Types ───

export interface ConsoleTokenPayload {
  /** Nome dell'operatore */
  nome: string;
  /** Cognome dell'operatore */
  cognome: string;
  /** Ruolo dell'operatore (legacy — display role like "Notaio", "Boss") */
  ruolo: string;
  /** RBAC role from profiles table (boss|admin|creator|operator|user) */
  role: AppRole;
  /** Permissions resolved from role_permissions table */
  permissions: string[];
  /** Whether the user account is active (false = deactivated by boss) */
  active: boolean;
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
 * Tier di default per nuove sessioni console.
 * Configurabile via env var CONSOLE_DEFAULT_TIER.
 * Valori validi: "intern" | "associate" | "partner"
 * Default: "partner" (backward compat).
 * Su poimandres.work (piano free): impostare CONSOLE_DEFAULT_TIER=intern.
 */
function getDefaultTier(): TierName {
  const env = process.env.CONSOLE_DEFAULT_TIER as TierName | undefined;
  if (env === "intern" || env === "associate" || env === "partner") return env;
  return "partner";
}

/**
 * Genera un token firmato per un utente autenticato.
 * Il sid è stabile per tutta la durata della sessione;
 * tier e disabledAgents cambiano con refreshToken().
 *
 * `role` and `permissions` come from the RBAC system (migration 046).
 * H1-FIX: `role` is required — no default to prevent privilege escalation.
 */
export function generateToken(
  user: {
    nome: string;
    cognome: string;
    ruolo: string;
    role: AppRole;
    permissions?: string[];
    active?: boolean;
  },
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
    role: user.role,
    permissions: user.permissions ?? [],
    active: user.active !== false, // default true for backward compat
    sid: options.sid ?? randomBytes(16).toString("hex"),
    tier: options.tier ?? getDefaultTier(),
    disabledAgents: options.disabledAgents ?? [],
    iat: Date.now(),
    exp: Date.now() + TOKEN_TTL_MS,
  };

  return sign(payload);
}

/**
 * Emette un nuovo token con tier/disabledAgents aggiornati.
 * Preserva sid, nome, cognome, ruolo, role, permissions del token originale.
 */
export function refreshToken(
  payload: ConsoleTokenPayload,
  updates: Partial<Pick<ConsoleTokenPayload, "tier" | "disabledAgents">>
): string {
  return generateToken(
    {
      nome: payload.nome,
      cognome: payload.cognome,
      ruolo: payload.ruolo,
      role: payload.role,
      permissions: payload.permissions,
      active: payload.active,
    },
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
 *
 * H1-FIX: tokens without a `role` field are rejected (return null).
 * Pre-RBAC tokens must re-authenticate to get a valid token with role.
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

    const raw = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8")
    ) as Record<string, unknown>;

    if (Date.now() > (raw.exp as number)) return null;

    // H1-FIX: reject pre-RBAC tokens that lack a role field.
    // Users must re-authenticate to get a token with proper RBAC role.
    if (!raw.role || !ROLE_HIERARCHY.includes(raw.role as AppRole)) {
      return null;
    }

    const payload: ConsoleTokenPayload = {
      nome: raw.nome as string,
      cognome: raw.cognome as string,
      ruolo: raw.ruolo as string,
      role: raw.role as AppRole,
      permissions: (raw.permissions as string[]) ?? [],
      active: raw.active !== false, // backward compat: tokens without 'active' field are treated as active
      sid: raw.sid as string,
      tier: raw.tier as TierName,
      disabledAgents: (raw.disabledAgents as AgentName[]) ?? [],
      iat: raw.iat as number,
      exp: raw.exp as number,
    };

    return payload;
  } catch {
    return null;
  }
}

/**
 * Estrae e verifica il token dall'header Authorization della request.
 * Fallback: query param `?t=<token>` per SSE (EventSource non supporta headers custom).
 * Ritorna il payload se valido, null se assente/invalido/scaduto.
 */
export function requireConsoleAuth(
  req: NextRequest
): ConsoleTokenPayload | null {
  // 1. Authorization header (fetch, XHR)
  const auth = req.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) {
    return verifyToken(auth.slice(7));
  }

  // 2. Query param fallback (EventSource/SSE — cannot send custom headers)
  const queryToken = req.nextUrl.searchParams.get("t");
  if (queryToken) {
    return verifyToken(queryToken);
  }

  return null;
}

/**
 * RBAC: requires the console token's role to be at least `minRole`.
 * Uses the role hierarchy: boss > admin > operator > user.
 *
 * Returns the verified payload if role is sufficient, null otherwise.
 * Callers should return 403 when this returns null.
 */
export function requireConsoleRole(
  req: NextRequest,
  minRole: AppRole
): ConsoleTokenPayload | null {
  const payload = requireConsoleAuth(req);
  if (!payload) return null;

  if (roleLevel(payload.role) < roleLevel(minRole)) {
    return null;
  }

  return payload;
}

/**
 * RBAC: requires the console token to have a specific permission.
 * Wildcard '*' matches everything.
 *
 * Returns the verified payload if permission is granted, null otherwise.
 */
export function requireConsolePermission(
  req: NextRequest,
  permission: string
): ConsoleTokenPayload | null {
  const payload = requireConsoleAuth(req);
  if (!payload) return null;

  const perms = payload.permissions ?? [];
  if (!perms.includes("*") && !perms.includes(permission)) {
    return null;
  }

  return payload;
}

// ─── Internals ───

function sign(payload: ConsoleTokenPayload): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(payloadB64).digest("hex");
  return `${payloadB64}.${sig}`;
}
