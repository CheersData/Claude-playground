/**
 * Types per il sistema di mapping ibrido rule+LLM.
 *
 * Centralizza tutte le interfacce usate da:
 * - rule-engine.ts (Tier 1: regole deterministiche)
 * - llm-mapper.ts (Tier 2: fallback LLM)
 * - mapper.ts (orchestratore: cache + rules + LLM)
 *
 * ADR: ADR-002-ai-mapping-hybrid-rule-llm.md
 */

// ─── Transform Types ───

/**
 * Trasformazioni applicabili a un campo mappato.
 * Il rule engine e l'LLM mapper usano lo stesso set di trasformazioni.
 */
export type TransformType =
  | "direct"          // Copia diretta
  | "normalize_email" // Lowercase + trim
  | "normalize_cf"    // Uppercase + trim codice fiscale
  | "normalize_piva"  // Strip prefisso paese + trim
  | "normalize_phone" // Rimuovi spazi/trattini, aggiungi +39 se mancante
  | "iso_date"        // Converte a ISO 8601
  | "number"          // Parse numerico
  | "boolean"         // Parse booleano
  | "json"            // Parse JSON string
  | "skip";           // Campo ignorato

// ─── Confidence ───

/**
 * Soglie di confidenza per il sistema di mapping.
 *
 * Il rule engine produce confidence 0.75-1.0 a seconda del livello di match.
 * L'LLM produce confidence 0.0-1.0 a seconda della certezza del mapping.
 *
 * Soglie:
 * - >= AUTO_ACCEPT: mapping accettato automaticamente (rule o LLM)
 * - >= LLM_MINIMUM: mapping LLM accettato (sopra soglia utente, default 0.6)
 * - < LLM_MINIMUM: mapping rifiutato, campo va in Tier 3 (manual review)
 */
export const CONFIDENCE_THRESHOLDS = {
  /** Soglia per accettazione automatica da rule engine (L1/L2 match) */
  AUTO_ACCEPT: 0.8,
  /** Soglia minima di similarity per L3 (Levenshtein) */
  SIMILARITY_MIN: 0.75,
  /** Default soglia minima per accettare mapping LLM */
  LLM_MINIMUM: 0.6,
} as const;

export type MappingConfidence = number; // 0.0 - 1.0

// ─── Mapping Origin ───

/**
 * Origine di un mapping — traccia come e stato risolto il campo.
 * Usato per audit, logging e feedback loop (Tier 3 → Tier 1).
 */
export type MappingOrigin = "cache" | "rule" | "llm" | "manual";

// ─── Rule Engine Types ───

/**
 * Regola deterministica per mapping campi.
 * Definita staticamente in rule-engine.ts.
 */
export interface MappingRule {
  /** Pattern di match sul nome campo sorgente (tutti lowercase, snake_case) */
  sourcePatterns: string[];
  /** Colonna destinazione */
  targetField: string;
  /** Trasformazione da applicare */
  transform: TransformType;
  /** Confidenza base (1.0 = match esatto regola) */
  confidence: MappingConfidence;
}

/**
 * Tipo di match del rule engine.
 * - exact: L1 — il campo normalizzato corrisponde esattamente a un pattern
 * - partial: L2 — il campo normalizzato contiene un pattern o viceversa
 * - similarity: L3 — distanza di Levenshtein sotto soglia
 */
export type RuleMatchType = "exact" | "partial" | "similarity";

/**
 * Risultato di un singolo match del rule engine.
 */
export interface RuleMatchResult {
  sourceField: string;
  targetField: string;
  transform: TransformType;
  confidence: MappingConfidence;
  matchType: RuleMatchType;
}

// ─── LLM Mapper Types ───

/**
 * Mapping prodotto dall'LLM per un singolo campo.
 * Validato e sanitizzato dal llm-mapper prima di essere restituito.
 */
export interface LLMFieldMapping {
  sourceField: string;
  targetField: string | null;
  transform: TransformType;
  confidence: MappingConfidence;
  reasoning: string;
}

// ─── Orchestrator Types ───

/**
 * Mapping finale prodotto dall'orchestratore.
 * Unisce i risultati di cache, rule engine e LLM.
 */
export interface FieldMapping {
  sourceField: string;
  targetField: string;
  transform: TransformType;
  confidence: MappingConfidence;
  /** Origine del mapping: "cache" | "rule" | "llm" */
  mappingType: MappingOrigin;
}

/**
 * Risultato complessivo del mapping pipeline.
 */
export interface MappingResult {
  /** Campi mappati con successo */
  mapped: FieldMapping[];
  /** Campi rimasti non mappati */
  unmapped: Array<{ name: string; reason: string }>;
  /** Confidenza media aggregata (0.0-1.0) */
  overallConfidence: MappingConfidence;
  /** Statistiche di provenienza */
  stats: MappingStats;
}

/**
 * Statistiche di provenienza dei mapping.
 * Utile per monitoring e audit in Operations dashboard.
 */
export interface MappingStats {
  fromCache: number;
  fromRules: number;
  fromLLM: number;
  unmappedCount: number;
  totalFields: number;
}

/**
 * Opzioni per il mapping pipeline.
 */
export interface MapFieldsOptions {
  /** Disabilita LLM fallback (solo regole + cache). Default: false */
  skipLLM?: boolean;
  /** Soglia minima di confidenza per accettare un mapping LLM. Default: 0.6 */
  llmConfidenceThreshold?: MappingConfidence;
}

// ─── Schema Input Types ───

/**
 * Campo sorgente da mappare (input al mapping pipeline).
 */
export interface SourceFieldInput {
  name: string;
  sampleValue?: unknown;
}

/**
 * Campo dello schema destinazione (target del mapping).
 */
export interface TargetSchemaField {
  name: string;
  type: string;
  description?: string;
}
