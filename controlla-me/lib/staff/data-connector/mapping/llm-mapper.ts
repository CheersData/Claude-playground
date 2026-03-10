/**
 * LLM Mapper — Fallback AI per campi non risolti dal rule engine.
 *
 * Usa runAgent("mapper", prompt) con catena di fallback dal tier system.
 * Tier Intern raccomandato: Groq/Cerebras, ~gratis per task di classificazione.
 *
 * Chiamato solo per i campi rimasti non mappati dopo L1 (regole) e L2 (similarity).
 * Output cachato in connector_field_mappings (TTL 30 giorni).
 *
 * ADR: ADR-002-ai-mapping-hybrid-rule-llm.md
 */

import { runAgent } from "@/lib/ai-sdk/agent-runner";
import { MAPPER_SYSTEM_PROMPT, buildMapperPrompt } from "@/lib/prompts/mapper";
import type {
  TransformType,
  LLMFieldMapping,
  SourceFieldInput,
  TargetSchemaField,
} from "./types";

// Re-export for backward compatibility
export type { LLMFieldMapping } from "./types";

interface LLMMapperResponse {
  mappings: Array<{
    sourceField: string;
    targetField: string | null;
    transform: string;
    confidence: number;
    reasoning: string;
  }>;
}

// ─── Validazione ───

const VALID_TRANSFORMS = new Set<TransformType>([
  "direct", "normalize_email", "normalize_cf", "normalize_piva",
  "normalize_phone", "iso_date", "number", "boolean", "json", "skip",
]);

/**
 * Valida e sanitizza la risposta LLM.
 * Forza i tipi corretti e filtra mapping invalidi.
 */
function validateLLMResponse(raw: LLMMapperResponse): LLMFieldMapping[] {
  if (!raw?.mappings || !Array.isArray(raw.mappings)) {
    console.warn("[LLM-MAPPER] Risposta LLM senza array mappings, ritorno vuoto");
    return [];
  }

  return raw.mappings
    .filter((m) => {
      // Deve avere almeno sourceField
      if (!m.sourceField || typeof m.sourceField !== "string") return false;
      // Confidence deve essere un numero valido
      if (typeof m.confidence !== "number" || m.confidence < 0 || m.confidence > 1) return false;
      return true;
    })
    .map((m) => ({
      sourceField: m.sourceField,
      targetField: m.targetField ?? null,
      transform: VALID_TRANSFORMS.has(m.transform as TransformType)
        ? (m.transform as TransformType)
        : "direct",
      confidence: Math.round(m.confidence * 100) / 100, // 2 decimali
      reasoning: typeof m.reasoning === "string" ? m.reasoning.slice(0, 200) : "",
    }));
}

// ─── Public API ───

/**
 * Chiama l'LLM per mappare un batch di campi non risolti.
 *
 * @param unmappedFields - Campi sorgente non ancora mappati (con sample value opzionale)
 * @param targetSchema - Schema destinazione disponibile
 * @returns Array di mapping proposti dall'LLM (validati)
 * @throws Se l'intera catena di fallback fallisce
 */
export async function llmMapFields(
  unmappedFields: SourceFieldInput[],
  targetSchema: TargetSchemaField[]
): Promise<LLMFieldMapping[]> {
  if (unmappedFields.length === 0) return [];

  const userPrompt = buildMapperPrompt(unmappedFields, targetSchema);

  console.log(
    `[LLM-MAPPER] Mapping ${unmappedFields.length} campi non risolti → LLM (target: ${targetSchema.length} colonne)`
  );

  const start = Date.now();

  const result = await runAgent<LLMMapperResponse>("mapper", userPrompt, {
    systemPrompt: MAPPER_SYSTEM_PROMPT,
    maxTokens: 2048,
    temperature: 0,
    jsonOutput: true,
  });

  const validated = validateLLMResponse(result.parsed);

  console.log(
    `[LLM-MAPPER] Completato in ${Date.now() - start}ms | ` +
    `${validated.length}/${unmappedFields.length} campi mappati | ` +
    `modello: ${result.usedModelKey} | fallback: ${result.usedFallback}`
  );

  return validated;
}
