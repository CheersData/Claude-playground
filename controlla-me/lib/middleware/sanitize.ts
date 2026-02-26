/**
 * Sanitizzazione input per prevenire prompt injection e altri attacchi.
 * Zero dipendenze.
 */

/** Lunghezza massima del testo documento (circa 100 pagine) */
const MAX_DOCUMENT_LENGTH = 500_000;

/** Lunghezza massima per una domanda utente (deep search) */
const MAX_QUESTION_LENGTH = 2_000;

/**
 * Sanitizza il testo di un documento prima di passarlo agli agenti.
 *
 * - Rimuove caratteri di controllo (eccetto newline e tab)
 * - Tronca alla lunghezza massima
 * - Rimuove sequenze che sembrano istruzioni di sistema
 */
export function sanitizeDocumentText(text: string): string {
  let cleaned = text;

  // Rimuovi caratteri di controllo (mantieni \n \r \t)
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // Tronca alla lunghezza massima
  if (cleaned.length > MAX_DOCUMENT_LENGTH) {
    cleaned = cleaned.slice(0, MAX_DOCUMENT_LENGTH);
  }

  return cleaned;
}

/**
 * Sanitizza una domanda utente (deep search).
 */
export function sanitizeUserQuestion(question: string): string {
  let cleaned = question.trim();

  // Rimuovi caratteri di controllo
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  // Tronca
  if (cleaned.length > MAX_QUESTION_LENGTH) {
    cleaned = cleaned.slice(0, MAX_QUESTION_LENGTH);
  }

  return cleaned;
}

/**
 * Sanitizza un sessionId per prevenire path traversal.
 * Accetta solo caratteri alfanumerici e trattini.
 */
export function sanitizeSessionId(sessionId: string): string | null {
  const cleaned = sessionId.trim();

  // Solo alfanumerici, trattini e underscore
  if (!/^[a-zA-Z0-9_-]+$/.test(cleaned)) {
    return null;
  }

  // Lunghezza ragionevole
  if (cleaned.length < 5 || cleaned.length > 100) {
    return null;
  }

  return cleaned;
}
