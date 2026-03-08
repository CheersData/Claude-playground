// ─── CDP Data Cleanser ───
// Validazione, normalizzazione e bonifica dati per il Customer Data Profile.
// Ogni dato in ingresso nel CDP passa per questo modulo.

// ─── Document Type Normalization ───

/**
 * Mappa i documentType dal Classifier (testo libero) a una tassonomia controllata.
 * Il Classifier puo restituire varianti diverse dello stesso tipo — qui li uniamo.
 */
const DOCUMENT_TYPE_MAP: Record<string, string> = {
  // Contratti di lavoro
  contratto_di_lavoro: "contratto_lavoro",
  "contratto di lavoro": "contratto_lavoro",
  contratto_lavoro_subordinato: "contratto_lavoro",
  contratto_lavoro_determinato: "contratto_lavoro",
  contratto_lavoro_indeterminato: "contratto_lavoro",
  employment_contract: "contratto_lavoro",
  // Locazione
  contratto_locazione: "locazione",
  "contratto di locazione": "locazione",
  contratto_affitto: "locazione",
  "contratto di affitto": "locazione",
  lease_agreement: "locazione",
  locazione_abitativa: "locazione",
  locazione_commerciale: "locazione",
  // Compravendita
  contratto_vendita: "compravendita",
  contratto_acquisto: "compravendita",
  "contratto di vendita": "compravendita",
  preliminare_vendita: "compravendita",
  compravendita_immobiliare: "compravendita",
  // Prestazione servizi
  contratto_servizi: "prestazione_servizi",
  "contratto di servizi": "prestazione_servizi",
  contratto_prestazione: "prestazione_servizi",
  contratto_appalto: "prestazione_servizi",
  // Societario
  statuto_societa: "societario",
  atto_costitutivo: "societario",
  patto_parasociale: "societario",
  // Privacy
  informativa_privacy: "privacy",
  privacy_policy: "privacy",
  gdpr: "privacy",
  // Termini di servizio
  termini_servizio: "termini_servizio",
  terms_of_service: "termini_servizio",
  condizioni_generali: "termini_servizio",
  // NDA
  nda: "nda",
  accordo_riservatezza: "nda",
  non_disclosure: "nda",
  // Procura
  procura: "procura",
  delega: "procura",
  mandato: "procura",
};

/**
 * Normalizza un tipo di documento dal Classifier alla tassonomia controllata.
 * Restituisce il tipo normalizzato o il tipo originale lowercase se non mappato.
 */
export function normalizeDocumentType(rawType: string | null | undefined): string | null {
  if (!rawType) return null;

  const cleaned = rawType.trim().toLowerCase().replace(/\s+/g, "_");
  return DOCUMENT_TYPE_MAP[cleaned] ?? cleaned;
}

// ─── Region Normalization ───

const REGION_MAP: Record<string, string> = {
  // Nomi completi
  abruzzo: "abruzzo",
  basilicata: "basilicata",
  calabria: "calabria",
  campania: "campania",
  "emilia-romagna": "emilia_romagna",
  "emilia romagna": "emilia_romagna",
  "friuli-venezia giulia": "friuli_venezia_giulia",
  "friuli venezia giulia": "friuli_venezia_giulia",
  lazio: "lazio",
  liguria: "liguria",
  lombardia: "lombardia",
  marche: "marche",
  molise: "molise",
  piemonte: "piemonte",
  puglia: "puglia",
  sardegna: "sardegna",
  sicilia: "sicilia",
  toscana: "toscana",
  "trentino-alto adige": "trentino_alto_adige",
  "trentino alto adige": "trentino_alto_adige",
  umbria: "umbria",
  "valle d'aosta": "valle_daosta",
  "valle d aosta": "valle_daosta",
  veneto: "veneto",
  // Sigle citta principali -> regione
  rm: "lazio",
  roma: "lazio",
  mi: "lombardia",
  milano: "lombardia",
  na: "campania",
  napoli: "campania",
  to: "piemonte",
  torino: "piemonte",
  fi: "toscana",
  firenze: "toscana",
  bo: "emilia_romagna",
  bologna: "emilia_romagna",
  ge: "liguria",
  genova: "liguria",
  pa: "sicilia",
  palermo: "sicilia",
  ba: "puglia",
  bari: "puglia",
  ve: "veneto",
  venezia: "veneto",
  ca: "sardegna",
  cagliari: "sardegna",
};

/**
 * Normalizza una regione italiana a una chiave standard.
 * Accetta nomi completi, abbreviazioni di citta principali, varianti con/senza trattino.
 */
export function normalizeRegion(rawRegion: string | null | undefined): string | null {
  if (!rawRegion) return null;

  const cleaned = rawRegion.trim().toLowerCase();
  return REGION_MAP[cleaned] ?? null;
}

// ─── Email Normalization ───

/**
 * Normalizza un indirizzo email: lowercase, trim, validazione base.
 * Restituisce null se l'email non e valida.
 */
export function normalizeEmail(rawEmail: string | null | undefined): string | null {
  if (!rawEmail) return null;

  const cleaned = rawEmail.trim().toLowerCase();

  // Validazione base: contiene @ e almeno un . dopo @
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleaned)) return null;

  return cleaned;
}

/**
 * Estrae il dominio da un'email normalizzata.
 * Usato nel CDP per evitare di memorizzare l'email completa (privacy).
 */
export function extractEmailDomain(email: string | null | undefined): string | null {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const parts = normalized.split("@");
  return parts.length === 2 ? parts[1] : null;
}

// ─── Name Normalization ───

/**
 * Normalizza un nome: trim, title case, rimozione caratteri speciali pericolosi.
 * Mantiene lettere accentate (italiano), spazi, apostrofi, trattini.
 */
export function normalizeName(rawName: string | null | undefined): string | null {
  if (!rawName) return null;

  const cleaned = rawName
    .trim()
    // Rimuovi caratteri potenzialmente pericolosi (HTML tags, script)
    .replace(/<[^>]*>/g, "")
    .replace(/[<>&"']/g, "")
    // Normalizza spazi multipli
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length === 0) return null;

  // Title case: prima lettera di ogni parola maiuscola
  return cleaned
    .split(" ")
    .map((word) => {
      if (word.length === 0) return word;
      // Gestisci prefissi come "d'", "dell'", "l'"
      const apostropheIdx = word.indexOf("'");
      if (apostropheIdx > 0 && apostropheIdx < word.length - 1) {
        return (
          word.slice(0, apostropheIdx + 1).toLowerCase() +
          word.charAt(apostropheIdx + 1).toUpperCase() +
          word.slice(apostropheIdx + 2).toLowerCase()
        );
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

// ─── Score Validation ───

/**
 * Clamp un fairness score al range valido 1.0-10.0.
 * Restituisce null se il valore non e un numero valido.
 */
export function clampFairnessScore(score: number | null | undefined): number | null {
  if (score === null || score === undefined || isNaN(score)) return null;
  return Math.round(Math.min(10, Math.max(1, score)) * 10) / 10;
}

/**
 * Clamp un punteggio percentuale al range 0-100.
 */
export function clampPercentage(value: number | null | undefined): number {
  if (value === null || value === undefined || isNaN(value)) return 0;
  return Math.round(Math.min(100, Math.max(0, value)));
}

/**
 * Clamp un rate al range 0.0-1.0 (percentuale come decimale).
 */
export function clampRate(value: number | null | undefined): number {
  if (value === null || value === undefined || isNaN(value)) return 0;
  return Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
}

// ─── Date Validation ───

/**
 * Valida una data ISO 8601. Rifiuta date nel futuro o prima del 2024.
 * Restituisce la stringa ISO o null se invalida.
 */
export function validateDate(rawDate: string | null | undefined): string | null {
  if (!rawDate) return null;

  try {
    const date = new Date(rawDate);
    if (isNaN(date.getTime())) return null;

    const now = new Date();
    const minDate = new Date("2024-01-01T00:00:00Z");

    if (date > now) return null;
    if (date < minDate) return null;

    return date.toISOString();
  } catch {
    return null;
  }
}

// ─── Text Sanitization ───

/**
 * Sanitizza testo libero: rimuove HTML, tag script, caratteri di controllo.
 * Tronca a maxLength caratteri.
 */
export function sanitizeText(
  rawText: string | null | undefined,
  maxLength: number = 500
): string | null {
  if (!rawText) return null;

  const cleaned = rawText
    .trim()
    // Rimuovi HTML tags
    .replace(/<[^>]*>/g, "")
    // Rimuovi caratteri di controllo (tranne newline e tab)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    // Normalizza spazi
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length === 0) return null;

  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

// ─── Array Deduplication and Limiting ───

/**
 * Deduplica e limita un array di stringhe.
 * Utile per preferred_doc_types, common_risk_areas, corpus_interests.
 */
export function deduplicateAndLimit(
  items: string[],
  maxItems: number = 10
): string[] {
  const unique = Array.from(new Set(items.map((item) => item.trim().toLowerCase()).filter(Boolean)));
  return unique.slice(0, maxItems);
}

// ─── Frequency Counter ───

/**
 * Conta le frequenze di elementi in un array e restituisce gli N piu frequenti.
 * Usato per calcolare preferred_doc_types dai dati storici.
 */
export function topByFrequency(items: string[], topN: number = 5): string[] {
  const freq = new Map<string, number>();
  for (const item of items) {
    const normalized = item.trim().toLowerCase();
    if (normalized) {
      freq.set(normalized, (freq.get(normalized) ?? 0) + 1);
    }
  }

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([key]) => key);
}

// ─── Composite Cleanser ───

/**
 * Bonifica completa di un evento analysis_completed.
 * Normalizza tutti i campi prima di passarli al profile-builder.
 */
export function cleanseAnalysisEvent(raw: {
  document_type?: string | null;
  document_sub_type?: string | null;
  fairness_score?: number | null;
  overall_risk?: string | null;
  needs_lawyer?: boolean;
  jurisdiction?: string | null;
  clause_count?: number;
  critical_count?: number;
  high_count?: number;
}): {
  document_type: string | null;
  document_sub_type: string | null;
  fairness_score: number | null;
  overall_risk: string | null;
  needs_lawyer: boolean;
  jurisdiction: string | null;
  clause_count: number;
  critical_count: number;
  high_count: number;
} {
  const validRiskLevels = ["critical", "high", "medium", "low"];
  const rawRisk = raw.overall_risk?.trim().toLowerCase() ?? null;

  return {
    document_type: normalizeDocumentType(raw.document_type),
    document_sub_type: raw.document_sub_type
      ? sanitizeText(raw.document_sub_type, 100)
      : null,
    fairness_score: clampFairnessScore(raw.fairness_score),
    overall_risk: rawRisk && validRiskLevels.includes(rawRisk) ? rawRisk : null,
    needs_lawyer: raw.needs_lawyer === true,
    jurisdiction: raw.jurisdiction ? sanitizeText(raw.jurisdiction, 100) : null,
    clause_count: Math.max(0, Math.floor(raw.clause_count ?? 0)),
    critical_count: Math.max(0, Math.floor(raw.critical_count ?? 0)),
    high_count: Math.max(0, Math.floor(raw.high_count ?? 0)),
  };
}
