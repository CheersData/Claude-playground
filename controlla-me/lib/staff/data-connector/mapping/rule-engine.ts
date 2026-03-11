/**
 * Rule Engine — Regole deterministiche per mapping campi sorgente → destinazione.
 *
 * Copre l'80-90% dei campi standard senza chiamate LLM.
 * Livelli di risoluzione:
 *   L1: Match esatto su pattern normalizzati (confidence 1.0)
 *   L2: Match parziale su substring/sinonimi (confidence 0.8-0.9)
 *   L3: Similarity euristica Levenshtein (confidence 0.7-0.9)
 *
 * ADR: ADR-002-ai-mapping-hybrid-rule-llm.md
 */

import type {
  MappingRule,
  RuleMatchResult,
  MappingConfidence,
  SourceFieldInput,
  TargetSchemaField,
} from "./types";
import { CONFIDENCE_THRESHOLDS } from "./types";

// Re-export types for backward compatibility
export type { TransformType, MappingRule, RuleMatchResult } from "./types";

// ─── Regole deterministiche ───

const DETERMINISTIC_RULES: MappingRule[] = [
  // ── Identita persona ──
  {
    sourcePatterns: ["first_name", "firstname", "nome", "given_name", "prenom", "name_first"],
    targetField: "first_name",
    transform: "direct",
    confidence: 1.0,
  },
  {
    sourcePatterns: ["last_name", "lastname", "cognome", "surname", "family_name", "nom", "name_last"],
    targetField: "last_name",
    transform: "direct",
    confidence: 1.0,
  },
  {
    sourcePatterns: ["full_name", "fullname", "nome_completo", "display_name", "displayname", "name"],
    targetField: "full_name",
    transform: "direct",
    confidence: 1.0,
  },

  // ── Contatti ──
  {
    sourcePatterns: ["email", "email_address", "e_mail", "mail", "pec", "email_principale"],
    targetField: "email",
    transform: "normalize_email",
    confidence: 1.0,
  },
  {
    sourcePatterns: ["phone", "phone_number", "telefono", "tel", "mobile", "cellulare", "cell"],
    targetField: "phone",
    transform: "normalize_phone",
    confidence: 1.0,
  },
  {
    sourcePatterns: ["fax", "fax_number", "numero_fax"],
    targetField: "fax",
    transform: "normalize_phone",
    confidence: 1.0,
  },

  // ── Azienda ──
  {
    sourcePatterns: [
      "company_name", "company", "ragione_sociale", "org_name", "organization",
      "organisation", "organizzazione", "azienda", "societa", "denominazione",
      "account_name",
    ],
    targetField: "company_name",
    transform: "direct",
    confidence: 1.0,
  },

  // ── Codici fiscali e identificativi ──
  {
    sourcePatterns: ["codice_fiscale", "cf", "fiscal_code", "tax_id", "tax_code", "ssn"],
    targetField: "tax_id",
    transform: "normalize_cf",
    confidence: 1.0,
  },
  {
    sourcePatterns: ["partita_iva", "p_iva", "piva", "vat_number", "vat_id", "vat", "vat_code"],
    targetField: "vat_number",
    transform: "normalize_piva",
    confidence: 1.0,
  },

  // ── Indirizzi ──
  {
    sourcePatterns: ["address", "indirizzo", "street", "via", "street_address", "address_line_1", "billing_street"],
    targetField: "address",
    transform: "direct",
    confidence: 0.95,
  },
  {
    sourcePatterns: ["city", "citta", "comune", "town", "billing_city"],
    targetField: "city",
    transform: "direct",
    confidence: 1.0,
  },
  {
    sourcePatterns: ["state", "province", "provincia", "regione", "region", "billing_state"],
    targetField: "province",
    transform: "direct",
    confidence: 0.95,
  },
  {
    sourcePatterns: ["zip", "zip_code", "postal_code", "cap", "postcode", "billing_postal_code"],
    targetField: "postal_code",
    transform: "direct",
    confidence: 1.0,
  },
  {
    sourcePatterns: ["country", "paese", "nazione", "country_code", "billing_country"],
    targetField: "country",
    transform: "direct",
    confidence: 1.0,
  },

  // ── Date ──
  {
    sourcePatterns: ["created_at", "createdat", "creation_date", "data_creazione", "date_created", "created_date"],
    targetField: "created_at",
    transform: "iso_date",
    confidence: 1.0,
  },
  {
    sourcePatterns: ["updated_at", "updatedat", "modification_date", "data_modifica", "date_modified", "last_modified", "modified_date"],
    targetField: "updated_at",
    transform: "iso_date",
    confidence: 1.0,
  },
  {
    sourcePatterns: ["birth_date", "birthdate", "data_nascita", "date_of_birth", "dob", "birthday"],
    targetField: "birth_date",
    transform: "iso_date",
    confidence: 1.0,
  },

  // ── Business / CRM ──
  {
    sourcePatterns: ["deal_name", "opportunity_name", "nome_opportunita", "deal_title"],
    targetField: "deal_name",
    transform: "direct",
    confidence: 1.0,
  },
  {
    sourcePatterns: ["deal_value", "amount", "importo", "value", "deal_amount", "opportunity_amount", "revenue"],
    targetField: "amount",
    transform: "number",
    confidence: 0.95,
  },
  {
    sourcePatterns: ["currency", "valuta", "currency_code"],
    targetField: "currency",
    transform: "direct",
    confidence: 1.0,
  },
  {
    sourcePatterns: ["stage", "deal_stage", "pipeline_stage", "fase", "stato_trattativa"],
    targetField: "stage",
    transform: "direct",
    confidence: 0.95,
  },
  {
    sourcePatterns: ["status", "stato", "state"],
    targetField: "status",
    transform: "direct",
    confidence: 0.85, // Piu bassa: "status" e ambiguo (ordine? contratto? ticket?)
  },
  {
    sourcePatterns: ["owner", "owner_name", "assigned_to", "responsabile", "sales_rep", "account_owner"],
    targetField: "owner",
    transform: "direct",
    confidence: 0.95,
  },
  {
    sourcePatterns: ["source", "lead_source", "fonte", "provenienza", "channel"],
    targetField: "source",
    transform: "direct",
    confidence: 0.90,
  },
  {
    sourcePatterns: ["website", "url", "sito_web", "web", "homepage"],
    targetField: "website",
    transform: "direct",
    confidence: 1.0,
  },
  {
    sourcePatterns: ["industry", "settore", "sector", "business_type"],
    targetField: "industry",
    transform: "direct",
    confidence: 0.95,
  },

  // ── Fatturazione / ERP ──
  {
    sourcePatterns: ["invoice_number", "numero_fattura", "invoice_id", "fattura_numero"],
    targetField: "invoice_number",
    transform: "direct",
    confidence: 1.0,
  },
  {
    sourcePatterns: ["invoice_date", "data_fattura", "date_invoice"],
    targetField: "invoice_date",
    transform: "iso_date",
    confidence: 1.0,
  },
  {
    sourcePatterns: ["due_date", "data_scadenza", "payment_due_date", "scadenza"],
    targetField: "due_date",
    transform: "iso_date",
    confidence: 1.0,
  },
  {
    sourcePatterns: ["total", "totale", "total_amount", "importo_totale", "grand_total"],
    targetField: "total_amount",
    transform: "number",
    confidence: 0.95,
  },
  {
    sourcePatterns: ["tax_amount", "iva", "vat_amount", "imposta", "tax"],
    targetField: "tax_amount",
    transform: "number",
    confidence: 0.90,
  },
  {
    sourcePatterns: ["quantity", "quantita", "qty", "qta"],
    targetField: "quantity",
    transform: "number",
    confidence: 1.0,
  },
  {
    sourcePatterns: ["unit_price", "prezzo_unitario", "price", "prezzo"],
    targetField: "unit_price",
    transform: "number",
    confidence: 0.95,
  },
  {
    sourcePatterns: ["description", "descrizione", "desc", "note", "notes", "appunti"],
    targetField: "description",
    transform: "direct",
    confidence: 0.90,
  },

  // ── ID esterni ──
  {
    sourcePatterns: ["id", "record_id", "external_id", "ext_id"],
    targetField: "external_id",
    transform: "direct",
    confidence: 0.85, // "id" e generico — piu bassa
  },
];

// ─── Normalizzazione campo sorgente ───

/**
 * Normalizza il nome di un campo sorgente:
 * - Lowercase
 * - camelCase → snake_case
 * - Spazi, trattini, punti → underscore
 * - Rimuove underscore multipli e trailing
 */
export function normalizeFieldName(fieldName: string): string {
  return fieldName
    // camelCase → snake_case: "firstName" → "first_name"
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    // Lowercase
    .toLowerCase()
    // Caratteri non alfanumerici → underscore
    .replace(/[^a-z0-9]/g, "_")
    // Underscore multipli → singolo
    .replace(/_+/g, "_")
    // Rimuovi leading/trailing underscore
    .replace(/^_|_$/g, "");
}

// ─── Levenshtein Distance ───

/**
 * Calcola la distanza di Levenshtein tra due stringhe.
 * Usata per L3 (similarity euristica).
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // sostituzione
          matrix[i][j - 1] + 1,     // inserimento
          matrix[i - 1][j] + 1      // cancellazione
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Similarita normalizzata tra due stringhe (0.0 - 1.0).
 */
function computeSimilarity(source: string, target: string): number {
  const maxLen = Math.max(source.length, target.length);
  if (maxLen === 0) return 1.0;
  const distance = levenshteinDistance(source, target);
  return 1.0 - distance / maxLen;
}

// ─── Rule Engine ───

/**
 * L1: Match esatto — confronta il campo normalizzato con i pattern delle regole.
 * Confidence: dalla regola (tipicamente 1.0 per match esatti).
 */
function matchExact(normalized: string): MappingRule | null {
  for (const rule of DETERMINISTIC_RULES) {
    if (rule.sourcePatterns.includes(normalized)) {
      return rule;
    }
  }
  return null;
}

/**
 * L2: Match parziale — il campo normalizzato contiene un pattern o viceversa.
 * Confidence: regola * 0.9 (penalita per match non esatto).
 */
function matchPartial(normalized: string): (MappingRule & { adjustedConfidence: number }) | null {
  let bestMatch: (MappingRule & { adjustedConfidence: number }) | null = null;
  let bestOverlap = 0;

  for (const rule of DETERMINISTIC_RULES) {
    for (const pattern of rule.sourcePatterns) {
      if (normalized.includes(pattern) || pattern.includes(normalized)) {
        // Calcola l'overlap per preferire match piu specifici
        const overlap = Math.min(normalized.length, pattern.length) / Math.max(normalized.length, pattern.length);
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          bestMatch = {
            ...rule,
            adjustedConfidence: rule.confidence * 0.9,
          };
        }
      }
    }
  }

  return bestMatch;
}

/**
 * L3: Similarity euristica — Levenshtein distance con i campi target.
 * Usata solo se L1 e L2 falliscono. Confidence: similarity score.
 */
function matchSimilarity(
  normalized: string,
  targetFields: TargetSchemaField[]
): { targetField: string; confidence: MappingConfidence } | null {
  let bestMatch: { targetField: string; confidence: MappingConfidence } | null = null;

  for (const target of targetFields) {
    const targetNormalized = normalizeFieldName(target.name);
    const similarity = computeSimilarity(normalized, targetNormalized);

    if (similarity >= CONFIDENCE_THRESHOLDS.SIMILARITY_MIN && (!bestMatch || similarity > bestMatch.confidence)) {
      bestMatch = {
        targetField: target.name,
        confidence: Math.round(similarity * 100) / 100, // 2 decimali
      };
    }
  }

  return bestMatch;
}

// ─── Public API ───

/**
 * Applica il rule engine a un singolo campo sorgente.
 * Prova in ordine: L1 (esatto) → L2 (parziale) → L3 (similarity).
 *
 * @returns RuleMatchResult se trovato, null se nessun match
 */
export function matchField(
  sourceFieldName: string,
  targetSchema: TargetSchemaField[]
): RuleMatchResult | null {
  const normalized = normalizeFieldName(sourceFieldName);

  // L1: Match esatto
  const exact = matchExact(normalized);
  if (exact) {
    return {
      sourceField: sourceFieldName,
      targetField: exact.targetField,
      transform: exact.transform,
      confidence: exact.confidence,
      matchType: "exact",
    };
  }

  // L2: Match parziale
  const partial = matchPartial(normalized);
  if (partial && partial.adjustedConfidence >= CONFIDENCE_THRESHOLDS.AUTO_ACCEPT) {
    return {
      sourceField: sourceFieldName,
      targetField: partial.targetField,
      transform: partial.transform,
      confidence: partial.adjustedConfidence,
      matchType: "partial",
    };
  }

  // L3: Similarity con target schema
  const similar = matchSimilarity(normalized, targetSchema);
  if (similar) {
    return {
      sourceField: sourceFieldName,
      targetField: similar.targetField,
      transform: "direct", // Similarity non puo inferire la trasformazione
      confidence: similar.confidence,
      matchType: "similarity",
    };
  }

  return null;
}

/**
 * Applica il rule engine a un batch di campi sorgente.
 * Ritorna i campi mappati e quelli rimasti non mappati.
 */
export function applyRuleEngine(
  sourceFields: SourceFieldInput[],
  targetSchema: TargetSchemaField[]
): {
  mapped: RuleMatchResult[];
  unmapped: SourceFieldInput[];
} {
  const mapped: RuleMatchResult[] = [];
  const unmapped: SourceFieldInput[] = [];
  const usedTargets = new Set<string>();

  for (const field of sourceFields) {
    const match = matchField(field.name, targetSchema);
    if (match && !usedTargets.has(match.targetField)) {
      mapped.push(match);
      usedTargets.add(match.targetField);
    } else {
      unmapped.push(field);
    }
  }

  return { mapped, unmapped };
}

/**
 * Esporta le regole deterministiche per test e ispezione.
 */
export function getRules(): readonly MappingRule[] {
  return DETERMINISTIC_RULES;
}
