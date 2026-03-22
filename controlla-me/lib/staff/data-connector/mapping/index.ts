/**
 * AI Mapping Hybrid — Barrel export + MappingEngine class.
 *
 * MappingEngine e il punto di ingresso principale per il sistema di mapping
 * a 4 livelli di risoluzione:
 *
 *   L0: user_confirmed — mapping confermati dall'utente (learning loop, DB)
 *   L1: rule — alias deterministici per connettore + globali
 *   L2: similarity — Levenshtein distance con threshold 0.8
 *   L3: llm — LLM fallback via runAgent("mapper"), tier Intern (~gratis)
 *
 * Per campi singoli: MappingEngine.resolveField()
 * Per batch: MappingEngine.resolveFields()
 * Per conferma utente: MappingEngine.confirmMapping()
 *
 * ADR: adr-ai-mapping-hybrid.md
 */

import { resolveByRule } from "./rules";
import { resolveBySimilarity } from "./similarity";
import { llmMapFields } from "./llm-mapper";
import { getLearnedMapping, getLearnedMappingsBatch, saveLearnedMapping, getAllLearnedMappings } from "./learning";
import { getTargetSchema, TARGET_SCHEMAS as ALL_TARGET_SCHEMAS } from "./target-schemas";
import type { SourceFieldInput, TargetSchemaField } from "./types";

// ─── MappingResult Interface ───

export interface MappingResult {
  sourceField: string;
  targetField: string;
  level: "rule" | "similarity" | "llm" | "user_confirmed";
  confidence: number;
}

// ─── In-memory cache ───

const resolvedCache = new Map<string, MappingResult>();

function cacheKey(connectorType: string, sourceField: string, userId?: string): string {
  return `${connectorType}:${sourceField}:${userId ?? "_global"}`;
}

// ─── MappingEngine ───

export class MappingEngine {
  /**
   * Risolve un singolo campo sorgente al campo target piu appropriato.
   *
   * Ordine di risoluzione:
   *   L0: user_confirmed (DB — mapping confermati dall'utente)
   *   L1: rule (alias deterministici, zero cost)
   *   L2: similarity (Levenshtein distance, zero cost)
   *   L3: llm (runAgent("mapper") con tier Intern, ~gratis)
   *
   * Risultati cachati in memoria per evitare lookup ripetuti.
   *
   * @param connectorType - ID connettore (es. "hubspot", "salesforce", "stripe")
   * @param sourceField - Nome campo sorgente (qualsiasi formato)
   * @param userId - User ID per lookup mapping personali (opzionale)
   * @returns MappingResult con campo target, livello e confidenza
   */
  async resolveField(
    connectorType: string,
    sourceField: string,
    userId?: string
  ): Promise<MappingResult> {
    // Check in-memory cache
    const key = cacheKey(connectorType, sourceField, userId);
    const cached = resolvedCache.get(key);
    if (cached) return cached;

    // L0: User-confirmed mapping (DB)
    const learned = await getLearnedMapping(connectorType, sourceField, userId);
    if (learned) {
      const result: MappingResult = {
        sourceField,
        targetField: learned,
        level: "user_confirmed",
        confidence: 1.0,
      };
      resolvedCache.set(key, result);
      return result;
    }

    // L1: Deterministic rules
    const ruleTarget = resolveByRule(connectorType, sourceField);
    if (ruleTarget) {
      const result: MappingResult = {
        sourceField,
        targetField: ruleTarget,
        level: "rule",
        confidence: 1.0,
      };
      resolvedCache.set(key, result);
      return result;
    }

    // L2: Levenshtein similarity
    const targetSchema = this.getTargetFieldsForConnector(connectorType);
    const similarResult = resolveBySimilarity(sourceField, targetSchema, 0.8);
    if (similarResult) {
      const result: MappingResult = {
        sourceField,
        targetField: similarResult.field,
        level: "similarity",
        confidence: similarResult.score,
      };
      resolvedCache.set(key, result);
      return result;
    }

    // L3: LLM fallback
    const llmResults = await this.callLLM(connectorType, [sourceField], targetSchema);
    if (llmResults.length > 0 && llmResults[0].targetField) {
      const llmResult = llmResults[0];
      const result: MappingResult = {
        sourceField,
        targetField: llmResult.targetField,
        level: "llm",
        confidence: llmResult.confidence,
      };
      resolvedCache.set(key, result);
      return result;
    }

    // Nessun match trovato — ritorna skip con confidence 0
    return {
      sourceField,
      targetField: "",
      level: "llm",
      confidence: 0,
    };
  }

  /**
   * Risolve un batch di campi sorgente (piu efficiente per chiamate LLM).
   *
   * Raggruppa i campi non risolti da L0-L2 in una singola chiamata LLM.
   * Molto piu efficiente di chiamare resolveField() in loop per N campi.
   *
   * @param connectorType - ID connettore
   * @param sourceFields - Lista nomi campi sorgente
   * @param userId - User ID per lookup mapping personali (opzionale)
   * @returns Array di MappingResult (stesso ordine di sourceFields)
   */
  async resolveFields(
    connectorType: string,
    sourceFields: string[],
    userId?: string
  ): Promise<MappingResult[]> {
    const results: MappingResult[] = [];
    const unresolvedForLLM: string[] = [];
    const unresolvedIndices: number[] = [];

    // ─── L0: Batch lookup mapping confermati (singola query DB) ───
    const learnedBatch = await getLearnedMappingsBatch(
      connectorType,
      sourceFields,
      userId
    );

    const targetSchema = this.getTargetFieldsForConnector(connectorType);

    for (let i = 0; i < sourceFields.length; i++) {
      const sourceField = sourceFields[i];

      // Check in-memory cache
      const key = cacheKey(connectorType, sourceField, userId);
      const cached = resolvedCache.get(key);
      if (cached) {
        results[i] = cached;
        continue;
      }

      // L0: User-confirmed (from batch query)
      const learned = learnedBatch.get(sourceField);
      if (learned) {
        const result: MappingResult = {
          sourceField,
          targetField: learned,
          level: "user_confirmed",
          confidence: 1.0,
        };
        results[i] = result;
        resolvedCache.set(key, result);
        continue;
      }

      // L1: Deterministic rules
      const ruleTarget = resolveByRule(connectorType, sourceField);
      if (ruleTarget) {
        const result: MappingResult = {
          sourceField,
          targetField: ruleTarget,
          level: "rule",
          confidence: 1.0,
        };
        results[i] = result;
        resolvedCache.set(key, result);
        continue;
      }

      // L2: Levenshtein similarity
      const similarResult = resolveBySimilarity(sourceField, targetSchema, 0.8);
      if (similarResult) {
        const result: MappingResult = {
          sourceField,
          targetField: similarResult.field,
          level: "similarity",
          confidence: similarResult.score,
        };
        results[i] = result;
        resolvedCache.set(key, result);
        continue;
      }

      // Non risolto → accumula per batch LLM
      unresolvedForLLM.push(sourceField);
      unresolvedIndices.push(i);
    }

    // ─── L3: Batch LLM per tutti i campi non risolti ───
    if (unresolvedForLLM.length > 0) {
      console.log(
        `[MAPPING-ENGINE] ${unresolvedForLLM.length}/${sourceFields.length} campi → LLM (connector: ${connectorType})`
      );

      const llmResults = await this.callLLM(
        connectorType,
        unresolvedForLLM,
        targetSchema
      );

      // Mappa i risultati LLM per sourceField per lookup veloce
      const llmBySource = new Map(
        llmResults
          .filter((r) => r.targetField !== null)
          .map((r) => [r.sourceField, r])
      );

      for (let j = 0; j < unresolvedForLLM.length; j++) {
        const sourceField = unresolvedForLLM[j];
        const idx = unresolvedIndices[j];
        const llmResult = llmBySource.get(sourceField);

        if (llmResult && llmResult.targetField) {
          const result: MappingResult = {
            sourceField,
            targetField: llmResult.targetField,
            level: "llm",
            confidence: llmResult.confidence,
          };
          results[idx] = result;
          const key = cacheKey(connectorType, sourceField, userId);
          resolvedCache.set(key, result);
        } else {
          results[idx] = {
            sourceField,
            targetField: "",
            level: "llm",
            confidence: 0,
          };
        }
      }
    }

    // Log sommario
    const byLevel = {
      user_confirmed: results.filter((r) => r.level === "user_confirmed").length,
      rule: results.filter((r) => r.level === "rule").length,
      similarity: results.filter((r) => r.level === "similarity").length,
      llm: results.filter((r) => r.level === "llm" && r.confidence > 0).length,
      unmapped: results.filter((r) => r.confidence === 0).length,
    };

    console.log(
      `[MAPPING-ENGINE] Risolti ${sourceFields.length} campi: ` +
      `L0=${byLevel.user_confirmed}, L1=${byLevel.rule}, L2=${byLevel.similarity}, ` +
      `L3=${byLevel.llm}, unmapped=${byLevel.unmapped}`
    );

    return results;
  }

  /**
   * Conferma o corregge un mapping (learning loop L4).
   *
   * Salva la conferma nel DB per riuso futuro e invalida la cache
   * in-memory per forzare il refresh.
   *
   * @param connectorType - ID connettore
   * @param sourceField - Nome campo sorgente
   * @param targetField - Nome campo target confermato/corretto
   * @param userId - ID utente che conferma
   */
  async confirmMapping(
    connectorType: string,
    sourceField: string,
    targetField: string,
    userId: string
  ): Promise<void> {
    await saveLearnedMapping(connectorType, sourceField, targetField, userId);

    // Invalida cache in-memory per questo campo
    const key = cacheKey(connectorType, sourceField, userId);
    resolvedCache.delete(key);
    // Invalida anche la cache globale (senza userId)
    const globalKey = cacheKey(connectorType, sourceField);
    resolvedCache.delete(globalKey);

    console.log(
      `[MAPPING-ENGINE] Mapping confermato e cachato: ${connectorType}/${sourceField} → ${targetField}`
    );
  }

  /**
   * Ritorna tutti i mapping noti per un connettore.
   *
   * Include sia i mapping confermati dall'utente (DB) che quelli
   * risolti in questa sessione (cache in-memory).
   *
   * @param connectorType - ID connettore
   * @param userId - Filtra per utente (opzionale)
   */
  async getMappings(
    connectorType: string,
    userId?: string
  ): Promise<MappingResult[]> {
    // Carica mapping confermati dal DB
    const learnedMappings = await getAllLearnedMappings(connectorType, userId);

    return learnedMappings.map((m) => ({
      sourceField: m.sourceField,
      targetField: m.targetField,
      level: "user_confirmed" as const,
      confidence: 1.0,
    }));
  }

  /**
   * Pulisce la cache in-memory.
   * Utile in test o quando si vuole forzare un refresh completo.
   */
  clearCache(): void {
    resolvedCache.clear();
  }

  // ─── Private helpers ───

  /**
   * Determina i campi target disponibili per un connettore.
   * Usa il target schema del DataType associato.
   */
  private getTargetFieldsForConnector(connectorType: string): string[] {
    // Mappa connettore → dataType per lo schema target
    const connectorToDataType: Record<string, string> = {
      salesforce: "contacts",
      hubspot: "contacts",
      stripe: "payments",
      google_drive: "documents",
      "google-drive": "documents",
      fatture_in_cloud: "invoices",
      "fatture-in-cloud": "invoices",
      quickbooks: "invoices",
      zendesk: "tickets",
      freshdesk: "tickets",
      jira: "tickets",
    };

    const dataType = connectorToDataType[connectorType];
    if (dataType) {
      const schema = getTargetSchema(dataType);
      if (schema.length > 0) return schema;
    }

    // Fallback: unione di tutti gli schema
    const all = new Set<string>();
    for (const schema of Object.values(ALL_TARGET_SCHEMAS)) {
      for (const field of schema) {
        all.add(field);
      }
    }
    return Array.from(all);
  }

  /**
   * Chiama l'LLM mapper per un batch di campi non risolti.
   * Converte i campi nel formato atteso da llmMapFields.
   */
  private async callLLM(
    _connectorType: string,
    sourceFields: string[],
    targetFields: string[]
  ): Promise<Array<{ sourceField: string; targetField: string; confidence: number }>> {
    try {
      const inputs: SourceFieldInput[] = sourceFields.map((f) => ({ name: f }));
      const targets: TargetSchemaField[] = targetFields.map((f) => ({
        name: f,
        type: "text",
      }));

      const llmResults = await llmMapFields(inputs, targets);

      return llmResults.map((r) => ({
        sourceField: r.sourceField,
        targetField: r.targetField ?? "",
        confidence: r.confidence,
      }));
    } catch (err) {
      console.error(
        `[MAPPING-ENGINE] LLM fallito:`,
        err instanceof Error ? err.message : err
      );
      return [];
    }
  }
}

// ─── Barrel exports (backward compatibility) ───

// Types (source of truth)
export type {
  TransformType,
  MappingConfidence,
  MappingOrigin,
  MappingRule,
  RuleMatchType,
  RuleMatchResult,
  LLMFieldMapping,
  FieldMapping,
  MappingStats,
  MapFieldsOptions,
  SourceFieldInput,
  TargetSchemaField,
} from "./types";
export { CONFIDENCE_THRESHOLDS } from "./types";
// Note: MappingResult from types.ts is re-exported below as PipelineMappingResult
// to avoid conflict with the MappingEngine's MappingResult interface
export type { MappingResult as PipelineMappingResult } from "./types";

// FieldMapper class (ADR-2 entry point)
export { FieldMapper } from "./field-mapper";
export type { MappedRecord } from "./field-mapper";

// Orchestrator (pipeline entry point)
export { mapFields } from "./mapper";

// Rule Engine
export { matchField, applyRuleEngine, normalizeFieldName, getRules } from "./rule-engine";

// LLM Mapper
export { llmMapFields } from "./llm-mapper";

// New modules (Task #808)
export { FIELD_ALIASES, resolveByRule, resolveByRuleBatch } from "./rules";
export { levenshteinDistance, resolveBySimilarity, resolveBatchBySimilarity } from "./similarity";
export { saveLearnedMapping, getLearnedMapping, getLearnedMappingsBatch, getAllLearnedMappings } from "./learning";
export type { LearnedMapping } from "./learning";
export { TARGET_SCHEMAS, getTargetSchema, getAvailableDataTypes } from "./target-schemas";

// Per-connector rules
export { STRIPE_RULES } from "./rules/stripe-rules";
export { HUBSPOT_RULES } from "./rules/hubspot-rules";
export { SALESFORCE_RULES } from "./rules/salesforce-rules";
export { GOOGLE_DRIVE_RULES } from "./rules/google-drive-rules";
export { FATTURE_IN_CLOUD_RULES } from "./rules/fatture-in-cloud-rules";
export type { FieldMappingRule } from "./rules/stripe-rules";
