/**
 * Console authentication — whitelist configurabile.
 *
 * Per aggiungere un utente autorizzato, aggiungere un record a AUTHORIZED_USERS.
 * In futuro può leggere da env var o DB.
 */

export interface AuthorizedUser {
  nome: string;
  cognome: string;
  ruolo: string;
}

export const AUTHORIZED_USERS: AuthorizedUser[] = [
  { nome: "Manuela", cognome: "Lo Buono", ruolo: "Notaio" },
];

/**
 * Verifica se l'utente è autorizzato (case-insensitive, trim).
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

  // Partial match: se l'input contiene anche solo il nome di un utente autorizzato, matcha
  const inputLower = trimmed.toLowerCase();
  const partialMatch = AUTHORIZED_USERS.find(
    (u) =>
      inputLower.includes(u.nome.toLowerCase()) ||
      inputLower.includes(u.cognome.toLowerCase()) ||
      inputLower === u.nome.toLowerCase() ||
      inputLower === u.cognome.toLowerCase()
  );
  if (partialMatch) {
    return {
      nome: partialMatch.nome,
      cognome: partialMatch.cognome,
      ruolo: partialMatch.ruolo,
    };
  }

  return null;
}
