/**
 * Console authentication — RBAC + legacy whitelist.
 *
 * Two authentication paths (checked in order):
 * 1. DB role check: if user is logged in via Supabase and has role >= 'admin', access granted
 * 2. Legacy whitelist: hardcoded AUTHORIZED_USERS for backwards compatibility (migration period)
 *
 * The legacy whitelist will be removed once all console users have DB accounts with roles.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { AppRole } from "@/lib/middleware/auth";
import { roleLevel } from "@/lib/middleware/auth";

export interface AuthorizedUser {
  nome: string;
  cognome: string;
  ruolo: string;
}

/**
 * Legacy whitelist — kept for backwards compatibility during migration.
 * TODO: remove once all console users authenticate via Supabase OAuth + DB roles.
 */
export const AUTHORIZED_USERS: AuthorizedUser[] = [
  { nome: "Manuela", cognome: "Lo Buono", ruolo: "Notaio" },
  { nome: "Boss", cognome: "Boss", ruolo: "Boss" },
  { nome: "Lady", cognome: "D", ruolo: "Creator" },
];

/**
 * Verifica se l'utente è autorizzato via whitelist (case-insensitive, trim).
 * Legacy path — used when no Supabase session is available.
 */
export function authenticateUser(
  nome: string,
  cognome: string,
  ruolo: string
): { authorized: boolean; user?: AuthorizedUser } {
  const match = AUTHORIZED_USERS.find(
    (u) =>
      u.nome.toLowerCase() === nome.trim().toLowerCase() &&
      u.cognome.toLowerCase() === cognome.trim().toLowerCase() &&
      u.ruolo.toLowerCase() === ruolo.trim().toLowerCase()
  );
  return match ? { authorized: true, user: match } : { authorized: false };
}

/**
 * Cerca un utente autorizzato solo per nome e cognome (case-insensitive, trim).
 * Utile quando l'utente non specifica il ruolo.
 */
export function findUserByName(
  nome: string,
  cognome: string
): AuthorizedUser | null {
  return (
    AUTHORIZED_USERS.find(
      (u) =>
        u.nome.toLowerCase() === nome.trim().toLowerCase() &&
        u.cognome.toLowerCase() === cognome.trim().toLowerCase()
    ) ?? null
  );
}

/**
 * Check if a Supabase-authenticated user has console access (role >= operator).
 * Also checks if the account is active (deactivated creators are rejected).
 * Returns the user's role and active status if authorized, null otherwise.
 * Uses admin client to bypass RLS (reads any profile).
 */
export async function checkConsoleAccessByUserId(
  userId: string
): Promise<{ authorized: boolean; role: AppRole; active: boolean }> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("profiles")
      .select("role, active")
      .eq("id", userId)
      .single();

    if (error || !data) {
      return { authorized: false, role: "user", active: true };
    }

    const role = (data.role as AppRole) || "user";
    const active = data.active !== false; // backward compat: null/undefined = active
    return {
      authorized: roleLevel(role) >= roleLevel("operator") && active,
      role,
      active,
    };
  } catch {
    return { authorized: false, role: "user", active: true };
  }
}

/**
 * Check if a user has console access by email.
 * Useful when we have email but not userId.
 * Also checks if the account is active (deactivated creators are rejected).
 */
export async function checkConsoleAccessByEmail(
  email: string
): Promise<{ authorized: boolean; role: AppRole; active: boolean }> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("profiles")
      .select("role, active")
      .eq("email", email)
      .single();

    if (error || !data) {
      return { authorized: false, role: "user", active: true };
    }

    const role = (data.role as AppRole) || "user";
    const active = data.active !== false; // backward compat: null/undefined = active
    return {
      authorized: roleLevel(role) >= roleLevel("operator") && active,
      role,
      active,
    };
  } catch {
    return { authorized: false, role: "user", active: true };
  }
}

/**
 * Parsing best-effort di input utente in nome/cognome/ruolo.
 * Formati supportati:
 * - "Nome Cognome, Ruolo"
 * - "Nome Cognome Ruolo"
 * - "Ruolo Nome Cognome"
 */
export function parseAuthInput(input: string): {
  nome: string;
  cognome: string;
  ruolo: string;
} | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Try comma-separated: "Manuela Lo Buono, Notaio"
  if (trimmed.includes(",")) {
    const parts = trimmed.split(",").map((p) => p.trim());
    if (parts.length === 2) {
      const nameParts = parts[0].split(/\s+/);
      const ruolo = parts[1];
      if (nameParts.length >= 2 && ruolo) {
        const nome = nameParts[0];
        const cognome = nameParts.slice(1).join(" ");
        return { nome, cognome, ruolo };
      }
    }
  }

  // Try space-separated: check if any word matches a known role
  const words = trimmed.split(/\s+/);
  const knownRoles = AUTHORIZED_USERS.map((u) => u.ruolo.toLowerCase());

  // Check first word as role: "Notaio Manuela Lo Buono"
  if (words.length >= 3 && knownRoles.includes(words[0].toLowerCase())) {
    return {
      ruolo: words[0],
      nome: words[1],
      cognome: words.slice(2).join(" "),
    };
  }

  // Check last word as role: "Manuela Lo Buono Notaio"
  if (words.length >= 3 && knownRoles.includes(words[words.length - 1].toLowerCase())) {
    return {
      nome: words[0],
      cognome: words.slice(1, -1).join(" "),
      ruolo: words[words.length - 1],
    };
  }

  // Fallback: first = nome, last = ruolo, middle = cognome
  if (words.length >= 3) {
    return {
      nome: words[0],
      cognome: words.slice(1, -1).join(" "),
      ruolo: words[words.length - 1],
    };
  }

  // 2 parole: potrebbe essere "Nome Cognome" senza ruolo
  // Cerca match per nome+cognome e auto-risolvi il ruolo se univoco
  if (words.length === 2) {
    const candidate = findUserByName(words[0], words[1]);
    if (candidate) {
      return { nome: candidate.nome, cognome: candidate.cognome, ruolo: candidate.ruolo };
    }
  }

  // SEC-002: nessun partial match — richiede struttura completa per evitare bypass
  // "Ciao Manuela" o "Manuela" da soli NON concedono accesso.
  return null;
}
