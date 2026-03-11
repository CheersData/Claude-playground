/**
 * Mapper Orchestrator — Pipeline completa per mapping campi sorgente → destinazione.
 *
 * Pipeline a 4 step:
 *   1. Cache lookup in connector_field_mappings (Supabase)
 *   2. Rule engine (L1 esatto + L2 parziale + L3 similarity)
 *   3. LLM fallback per campi ambigui (confidence < 0.8 dal rule engine)
 *   4. Cache write dei risultati (TTL 30gg per LLM, null per regole)
 *
 * ADR: ADR-002-ai-mapping-hybrid-rule-llm.md
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { applyRuleEngine } from "./rule-engine";
import { llmMapFields } from "./llm-mapper";
import { CONFIDENCE_THRESHOLDS } from "./types";
import type {
  TransformType,
  FieldMapping,
  MappingResult,
  MapFieldsOptions,
  MappingOrigin,
  MappingConfidence,
  SourceFieldInput,
  TargetSchemaField,
  RuleMatchResult,
  LLMFieldMapping,
} from "./types";

// Re-export types for backward compatibility
export type { FieldMapping, MappingResult, MapFieldsOptions } from "./types";

// ─── Cache Layer (Supabase: connector_field_mappings) ───

const CACHE_TTL_DAYS = 30;

interface CachedMapping {
  source_field: string;
  target_field: string;
  mapping_type: Exclude<MappingOrigin, "cache">;
  transform: string;
  confidence: MappingConfidence;
  cached_until: string | null;
}

/**
 * Cerca mapping gia cachati per un connettore.
 * Filtra automaticamente i mapping scaduti (cached_until passato).
 */
async function lookupCache(
  connectorSource: string,
  sourceFieldNames: string[]
): Promise<Map<string, CachedMapping>> {
  const result = new Map<string, CachedMapping>();

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("connector_field_mappings")
      .select("source_field, target_field, mapping_type, transform, confidence, cached_until")
      .eq("connector_source", connectorSource)
      .in("source_field", sourceFieldNames)
      .or("cached_until.is.null,cached_until.gt.now()");

    if (error) {
      console.warn(`[MAPPER] Cache lookup fallito: ${error.message}`);
      return result;
    }

    for (const row of data ?? []) {
      result.set(row.source_field, row as CachedMapping);
    }
  } catch (err) {
    console.warn(`[MAPPER] Cache lookup errore:`, err instanceof Error ? err.message : err);
  }

  return result;
}

/**
 * Salva mapping nella cache per riuso futuro.
 * - Regole: cached_until = null (non scadono mai)
 * - LLM: cached_until = now() + 30 giorni
 */
async function saveToCache(
  connectorSource: string,
  mappings: FieldMapping[]
): Promise<void> {
  if (mappings.length === 0) return;

  try {
    const supabase = createAdminClient();
    const now = new Date();
    const ttl = new Date(now.getTime() + CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);

    const rows = mappings.map((m) => ({
      connector_source: connectorSource,
      source_field: m.sourceField,
      target_field: m.targetField,
      mapping_type: m.mappingType === "cache" ? "rule" : m.mappingType, // cache non e un tipo DB
      transform: m.transform,
      confidence: m.confidence,
      cached_until: m.mappingType === "llm" ? ttl.toISOString() : null,
    }));

    const { error } = await supabase
      .from("connector_field_mappings")
      .upsert(rows, {
        onConflict: "connector_source,source_field,target_field",
        ignoreDuplicates: false,
      });

    if (error) {
      console.warn(`[MAPPER] Cache save fallito: ${error.message}`);
    } else {
      console.log(`[MAPPER] Salvati ${rows.length} mapping in cache (${connectorSource})`);
    }
  } catch (err) {
    console.warn(`[MAPPER] Cache save errore:`, err instanceof Error ? err.message : err);
  }
}

// ─── Orchestrator ───

/**
 * Pipeline completa di mapping campi sorgente → destinazione.
 *
 * Step 1: Cache lookup in connector_field_mappings
 * Step 2: Rule engine per campi rimanenti (L1 esatto + L2 parziale + L3 similarity)
 * Step 3: LLM fallback per campi con confidence < 0.8 o non risolti
 * Step 4: Cache write dei nuovi risultati
 *
 * @param connectorSource - Identificativo del connettore (es. "salesforce_accounts", "hubspot_contacts")
 * @param sourceFields - Campi sorgente da mappare (nome + valore di esempio opzionale)
 * @param targetSchema - Schema destinazione (nome + tipo + descrizione opzionale)
 * @param options - Opzioni (skipLLM, llmConfidenceThreshold)
 */
export async function mapFields(
  connectorSource: string,
  sourceFields: SourceFieldInput[],
  targetSchema: TargetSchemaField[],
  options?: MapFieldsOptions
): Promise<MappingResult> {
  const {
    skipLLM = false,
    llmConfidenceThreshold = CONFIDENCE_THRESHOLDS.LLM_MINIMUM,
  } = options ?? {};

  const allMapped: FieldMapping[] = [];
  const unmapped: Array<{ name: string; reason: string }> = [];
  let remaining = [...sourceFields];
  const usedTargets = new Set<string>();

  console.log(
    `[MAPPER] Inizio mapping: ${sourceFields.length} campi sorgente → ${targetSchema.length} colonne target (source: ${connectorSource})`
  );

  // ─── Step 1: Cache lookup ───

  const sourceFieldNames = remaining.map((f) => f.name);
  const cached = await lookupCache(connectorSource, sourceFieldNames);

  for (const field of remaining) {
    const hit = cached.get(field.name);
    if (hit && !usedTargets.has(hit.target_field)) {
      allMapped.push({
        sourceField: field.name,
        targetField: hit.target_field,
        transform: hit.transform as TransformType,
        confidence: hit.confidence,
        mappingType: "cache",
      });
      usedTargets.add(hit.target_field);
    }
  }

  remaining = remaining.filter((f) => !allMapped.some((m) => m.sourceField === f.name));

  if (cached.size > 0) {
    console.log(`[MAPPER] Cache: ${allMapped.length} hit, ${remaining.length} rimasti`);
  }

  // ─── Step 2: Rule engine ───

  if (remaining.length > 0) {
    // Filtra target schema per escludere campi gia usati
    const availableTargets = targetSchema.filter((t) => !usedTargets.has(t.name));
    const ruleResult = applyRuleEngine(remaining, availableTargets);

    // Accetta match con confidence >= AUTO_ACCEPT direttamente
    const highConfidence: RuleMatchResult[] = [];
    const lowConfidence: RuleMatchResult[] = [];

    for (const match of ruleResult.mapped) {
      if (match.confidence >= CONFIDENCE_THRESHOLDS.AUTO_ACCEPT) {
        highConfidence.push(match);
      } else {
        lowConfidence.push(match);
      }
    }

    for (const match of highConfidence) {
      if (!usedTargets.has(match.targetField)) {
        allMapped.push({
          sourceField: match.sourceField,
          targetField: match.targetField,
          transform: match.transform,
          confidence: match.confidence,
          mappingType: "rule",
        });
        usedTargets.add(match.targetField);
      }
    }

    // Campi non risolti + quelli con bassa confidenza → candidati per LLM
    const forLLM = [
      ...ruleResult.unmapped,
      ...lowConfidence.map((m) => ({
        name: m.sourceField,
        sampleValue: sourceFields.find((f) => f.name === m.sourceField)?.sampleValue,
      })),
    ];

    remaining = forLLM;

    console.log(
      `[MAPPER] Rule engine: ${highConfidence.length} match (>= 0.8), ` +
      `${lowConfidence.length} bassa confidenza, ${ruleResult.unmapped.length} non risolti → ` +
      `${remaining.length} candidati LLM`
    );
  }

  // ─── Step 3: LLM fallback ───

  const newMappingsToCache: FieldMapping[] = [];

  if (!skipLLM && remaining.length > 0) {
    try {
      const availableTargets = targetSchema.filter((t) => !usedTargets.has(t.name));
      const llmResults: LLMFieldMapping[] = await llmMapFields(remaining, availableTargets);

      for (const llmMapping of llmResults) {
        if (
          llmMapping.targetField &&
          llmMapping.confidence >= llmConfidenceThreshold &&
          !usedTargets.has(llmMapping.targetField)
        ) {
          const mapping: FieldMapping = {
            sourceField: llmMapping.sourceField,
            targetField: llmMapping.targetField,
            transform: llmMapping.transform,
            confidence: llmMapping.confidence,
            mappingType: "llm",
          };
          allMapped.push(mapping);
          newMappingsToCache.push(mapping);
          usedTargets.add(llmMapping.targetField);
        } else {
          // LLM non ha trovato match o confidenza troppo bassa
          const reason = !llmMapping.targetField
            ? "LLM: nessun match trovato"
            : llmMapping.confidence < llmConfidenceThreshold
              ? `LLM: confidenza troppo bassa (${llmMapping.confidence} < ${llmConfidenceThreshold})`
              : `LLM: target ${llmMapping.targetField} gia usato`;
          unmapped.push({ name: llmMapping.sourceField, reason });
        }
      }

      // Campi che l'LLM non ha nemmeno provato a mappare
      const llmMappedNames = new Set(llmResults.map((r) => r.sourceField));
      for (const field of remaining) {
        if (!llmMappedNames.has(field.name) && !allMapped.some((m) => m.sourceField === field.name)) {
          unmapped.push({ name: field.name, reason: "LLM: campo non incluso nella risposta" });
        }
      }
    } catch (err) {
      console.error(
        `[MAPPER] LLM fallback fallito:`,
        err instanceof Error ? err.message : err
      );
      // LLM ha fallito — segna tutti i rimanenti come unmapped
      for (const field of remaining) {
        if (!allMapped.some((m) => m.sourceField === field.name)) {
          unmapped.push({ name: field.name, reason: "LLM non disponibile" });
        }
      }
    }
  } else if (remaining.length > 0) {
    // LLM disabilitato — segna rimanenti come unmapped
    for (const field of remaining) {
      if (!allMapped.some((m) => m.sourceField === field.name)) {
        unmapped.push({ name: field.name, reason: "LLM disabilitato (skipLLM)" });
      }
    }
  }

  // ─── Step 4: Cache write (fire-and-forget) ───

  // Salva sia i mapping da regole (nuovi) che quelli da LLM
  const ruleMappingsToCache = allMapped.filter(
    (m) => m.mappingType === "rule" && !cached.has(m.sourceField)
  );
  const allToCache = [...ruleMappingsToCache, ...newMappingsToCache];

  if (allToCache.length > 0) {
    // Fire-and-forget: non blocca il ritorno
    saveToCache(connectorSource, allToCache).catch((err) =>
      console.error("[MAPPER] Cache write fallito:", err instanceof Error ? err.message : err)
    );
  }

  // ─── Risultato ───

  const fromCache = allMapped.filter((m) => m.mappingType === "cache").length;
  const fromRules = allMapped.filter((m) => m.mappingType === "rule").length;
  const fromLLM = allMapped.filter((m) => m.mappingType === "llm").length;

  const confidences = allMapped.map((m) => m.confidence);
  const overallConfidence =
    confidences.length > 0
      ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100) / 100
      : 0;

  console.log(
    `[MAPPER] Completato: ${allMapped.length}/${sourceFields.length} mappati | ` +
    `cache: ${fromCache}, regole: ${fromRules}, LLM: ${fromLLM}, unmapped: ${unmapped.length} | ` +
    `confidenza media: ${overallConfidence}`
  );

  return {
    mapped: allMapped,
    unmapped,
    overallConfidence,
    stats: {
      fromCache,
      fromRules,
      fromLLM,
      unmappedCount: unmapped.length,
      totalFields: sourceFields.length,
    },
  };
}
