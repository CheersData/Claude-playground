/**
 * Field Mapping Engine — 4-level intelligence for data entity mapping.
 *
 * Problem: When syncing data from external sources (CRM, ERP, etc.), field names
 * rarely match exactly. "email_address" vs "email", "created_on" vs "created_at", etc.
 *
 * Solution: 4-level hierarchy that builds confidence progressively:
 *   [1] RULES       — Deterministic mappings (exact match, case-insensitive)
 *   [2] SIMILARITY  — Levenshtein distance + heuristics (fuzzy matching)
 *   [3] LLM         — Single-shot inference for ambiguous cases (requires API)
 *   [4] LEARNING    — Cache mappings for reuse + train on human corrections
 *
 * Result: Each mapping includes confidence (0.0-1.0) and origin (rule|similarity|llm|manual).
 * Confidence >= 0.8 → use directly. < 0.8 → mark for review by human operator.
 *
 * DB: integration_field_mappings table (per user per connector per entity).
 * TTL: 30 days (refresh on next sync to catch schema changes).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { runAgent } from "@/lib/ai-sdk/agent-runner";
import type { DataModelSpec, TransformRule } from "./types";

// ─── Types ───

export type MappingOrigin = "rule" | "similarity" | "llm" | "manual";

export interface FieldMapping {
  sourceField: string;
  targetField: string;
  confidence: number;
  origin: MappingOrigin;
  reason: string;
}

export interface MappingResult {
  sourceFields: string[];
  targetFields: string[];
  mappings: FieldMapping[];
  unmappedSourceFields: string[];
  unmappedTargetFields: string[];
  confidence: number; // average confidence of all mappings
}

// ─── Level 1: Rules (deterministic) ───

/**
 * Standard field name aliases commonly used across systems.
 * Maps common variations to canonical names.
 */
const STANDARD_ALIASES: Record<string, string[]> = {
  // Identifiers
  id: ["id", "ID", "identifier", "code", "numero"],
  externalId: ["external_id", "externalId", "ext_id", "third_party_id"],

  // Dates
  createdAt: ["created_at", "createdAt", "created_date", "creation_date", "data_creazione", "data_creazione", "date_created"],
  updatedAt: ["updated_at", "updatedAt", "modified_at", "modifiedAt", "last_updated", "ultima_modifica"],
  deletedAt: ["deleted_at", "deletedAt", "removed_at", "archived_at"],

  // Contact fields
  email: ["email", "email_address", "emailAddress", "mail", "e_mail", "indirizzo_email"],
  phone: ["phone", "phoneNumber", "phone_number", "tel", "telephone", "cellulare", "cell"],
  firstName: ["first_name", "firstName", "fname", "given_name", "nome"],
  lastName: ["last_name", "lastName", "lname", "family_name", "cognome"],
  fullName: ["full_name", "fullName", "name", "display_name", "displayName"],

  // Address fields
  address: ["address", "street_address", "streetAddress", "via", "indirizzo"],
  city: ["city", "città", "localita", "locality"],
  postalCode: ["postal_code", "postalCode", "zip", "zip_code", "zipCode", "cap"],
  country: ["country", "country_code", "countryCode", "nazione"],

  // Company fields
  companyName: ["company", "company_name", "companyName", "ragione_sociale", "azienda"],
  companyId: ["company_id", "companyId", "account_id", "accountId"],

  // Financial fields
  amount: ["amount", "total", "price", "importo", "valore"],
  currency: ["currency", "currency_code", "currencyCode", "valuta"],

  // Status fields
  status: ["status", "state", "stato"],
  active: ["active", "is_active", "isActive", "enabled", "activo"],
};

/**
 * Pattern-based aliases for common naming conventions.
 * Used when exact match fails.
 */
const PATTERN_ALIASES: Array<{
  pattern: RegExp;
  replacement: string | ((...args: string[]) => string);
}> = [
  // snake_case to camelCase
  { pattern: /_([a-z])/g, replacement: (_: string, c: string) => c.toUpperCase() },
  // Remove common prefixes/suffixes
  { pattern: /^is_/i, replacement: "" },
  { pattern: /^has_/i, replacement: "" },
  { pattern: /_id$/i, replacement: "" },
];

/**
 * Level 1: Rule-based matching (deterministic, 1.0 confidence).
 * Returns mappings where source field matches a canonical name exactly.
 */
export function matchByRules(
  sourceFields: string[],
  targetFields: string[]
): FieldMapping[] {
  const mappings: FieldMapping[] = [];
  const matched = new Set<string>();

  for (const targetField of targetFields) {
    // Normalize target field name
    const normalized = targetField.toLowerCase().trim();

    // Find source field that matches any alias
    for (const sourceField of sourceFields) {
      if (matched.has(sourceField)) continue; // Already mapped

      const sourceLower = sourceField.toLowerCase().trim();

      // Check all standard aliases
      for (const [canonical, aliases] of Object.entries(STANDARD_ALIASES)) {
        const aliasesLower = aliases.map((a) => a.toLowerCase());

        if (aliasesLower.includes(sourceLower) && aliasesLower.includes(normalized)) {
          mappings.push({
            sourceField,
            targetField,
            confidence: 1.0,
            origin: "rule",
            reason: `Standard alias match for canonical field "${canonical}"`,
          });
          matched.add(sourceField);
          break;
        }

        // Also try reverse: if source is canonical, find target alias
        if (canonical.toLowerCase() === sourceLower && aliasesLower.includes(normalized)) {
          mappings.push({
            sourceField,
            targetField,
            confidence: 1.0,
            origin: "rule",
            reason: `Standard alias match for canonical field "${canonical}"`,
          });
          matched.add(sourceField);
          break;
        }
      }

      if (matched.has(sourceField)) break;
    }
  }

  return mappings;
}

// ─── Level 2: Similarity (fuzzy matching with Levenshtein) ───

/**
 * Levenshtein distance: minimum edits (insert, delete, replace) to transform one string to another.
 * Lower distance = higher similarity.
 */
function levenshteinDistance(a: string, b: string): number {
  const [s1, s2] = a.length < b.length ? [a, b] : [b, a];
  const costs: number[] = [];

  for (let i = 0; i <= s1.length; i++) {
    let last = i;
    for (let j = 1; j <= s2.length; j++) {
      const current =
        s1[i - 1] === s2[j - 1] ? costs[j - 1] : 1 + Math.min(costs[j - 1], costs[j], last);
      costs[j - 1] = last;
      last = current;
    }
    costs[s2.length] = last;
  }

  return costs[s2.length] ?? 0;
}

/**
 * Calculate similarity as 1 - (distance / maxLen).
 * 1.0 = identical, 0.0 = completely different.
 */
function similarityScore(a: string, b: string): number {
  const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
  const maxLen = Math.max(a.length, b.length);
  return 1 - distance / maxLen;
}

/**
 * Level 2: Similarity-based matching (fuzzy, 0.6-0.9 confidence).
 * Matches fields with high Levenshtein similarity.
 * Only considers pairs not already mapped at Level 1.
 */
export function matchBySimilarity(
  sourceFields: string[],
  targetFields: string[],
  existingMappings: FieldMapping[],
  threshold = 0.7
): FieldMapping[] {
  const mappings: FieldMapping[] = [];
  const mappedSources = new Set(existingMappings.map((m) => m.sourceField));
  const mappedTargets = new Set(existingMappings.map((m) => m.targetField));

  const candidates: Array<{
    source: string;
    target: string;
    score: number;
  }> = [];

  // Score all unmapped pairs
  for (const sourceField of sourceFields) {
    if (mappedSources.has(sourceField)) continue;

    for (const targetField of targetFields) {
      if (mappedTargets.has(targetField)) continue;

      const score = similarityScore(sourceField, targetField);
      if (score >= threshold) {
        candidates.push({ source: sourceField, target: targetField, score });
      }
    }
  }

  // Sort by score descending and greedily assign
  candidates.sort((a, b) => b.score - a.score);

  for (const { source, target, score } of candidates) {
    // Skip if already mapped in this pass
    if (mappings.some((m) => m.sourceField === source || m.targetField === target)) {
      continue;
    }

    const confidence = Math.min(0.9, 0.5 + score * 0.4); // Map 0.7-1.0 to 0.78-0.9
    mappings.push({
      sourceField: source,
      targetField: target,
      confidence,
      origin: "similarity",
      reason: `Levenshtein similarity: ${(score * 100).toFixed(0)}%`,
    });
  }

  return mappings;
}

// ─── Level 3: LLM Inference ───

/**
 * LLM-based mapping for ambiguous cases.
 * Calls an LLM agent to infer mappings from field names + sample values.
 *
 * Only used if:
 * - Free tier enabled (no additional token cost)
 * - Significant unmapped fields remain
 * - User hasn't disabled LLM mapping
 */
export async function matchByLLM(
  sourceFields: string[],
  targetFields: string[],
  sampleData?: Record<string, unknown>[],
  existingMappings?: FieldMapping[]
): Promise<FieldMapping[]> {
  const mappedSources = new Set(existingMappings?.map((m) => m.sourceField) ?? []);
  const mappedTargets = new Set(existingMappings?.map((m) => m.targetField) ?? []);

  const unmappedSources = sourceFields.filter((f) => !mappedSources.has(f));
  const unmappedTargets = targetFields.filter((f) => !mappedTargets.has(f));

  // Not worth calling LLM for trivial cases
  if (unmappedSources.length === 0 || unmappedTargets.length === 0) {
    return [];
  }

  // Build sample data context
  let sampleContext = "";
  if (sampleData && sampleData.length > 0) {
    const sample = sampleData[0];
    const entries = Object.entries(sample)
      .slice(0, 5)
      .map(([k, v]) => `"${k}": ${typeof v === "string" ? `"${v}"` : v}`)
      .join(", ");
    sampleContext = ` Sample data: {${entries}}`;
  }

  const prompt = `You are a data mapping expert. Match source fields to target fields.

Source fields: ${unmappedSources.join(", ")}
Target fields: ${unmappedTargets.join(", ")}${sampleContext}

Return a JSON array of mappings:
{
  "mappings": [
    { "source": "sourceFieldName", "target": "targetFieldName", "confidence": 0.85, "reason": "brief reason" }
  ]
}

Rules:
- Only map fields you're confident about
- confidence: 0.0-1.0 (0.8+ = high confidence)
- Be conservative; omit uncertain mappings
- Each source/target can only appear once`;

  try {
    const result = await runAgent("mapping-agent", prompt);

    // Parse JSON from agent response
    let parsed;
    try {
      // runAgent already parses JSON → result.parsed contains the output
      parsed = result.parsed as Record<string, unknown>;
    } catch {
      // Fallback: try to extract JSON from raw text
      try {
        const match = result.text.match(/\{[\s\S]*\}/);
        if (!match) {
          console.warn("[MAPPING] LLM returned no valid JSON");
          return [];
        }
        parsed = JSON.parse(match[0]);
      } catch {
        console.warn("[MAPPING] LLM JSON parse failed");
        return [];
      }
    }

    const mappings = parsed.mappings as Array<{
      source: string;
      target: string;
      confidence: number;
      reason: string;
    }>;

    return (mappings ?? []).map((m) => ({
      sourceField: m.source,
      targetField: m.target,
      confidence: Math.max(0, Math.min(1, m.confidence)),
      origin: "llm",
      reason: m.reason ?? "LLM inference",
    }));
  } catch (err) {
    console.error(
      "[MAPPING] LLM mapping failed:",
      err instanceof Error ? err.message : String(err)
    );
    return [];
  }
}

// ─── Level 4: Learning ───

/**
 * Schema for a cached mapping entry.
 */
export interface CachedMapping {
  sourceConnector: string;
  entityType: string;
  sourceField: string;
  targetField: string;
  confidence: number;
  origin: MappingOrigin;
  createdAt: string;
  lastUsedAt: string | null;
}

/**
 * Save a mapping to the cache table (integration_field_mappings).
 */
export async function cacheMappings(
  userId: string,
  connectorId: string,
  entityType: string,
  mappings: FieldMapping[]
): Promise<void> {
  if (mappings.length === 0) return;

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const rows = mappings.map((m) => ({
    user_id: userId,
    connector_id: connectorId,
    entity_type: entityType,
    source_field: m.sourceField,
    target_field: m.targetField,
    confidence: m.confidence,
    origin: m.origin,
    created_at: now,
    updated_at: now,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // TTL: 30 days
  }));

  const { error } = await admin
    .from("integration_field_mappings")
    .upsert(rows, {
      onConflict: "user_id,connector_id,entity_type,source_field,target_field",
    });

  if (error) {
    console.error("[MAPPING] Cache write failed:", error.message);
  }
}

/**
 * Load cached mappings for a connector entity.
 */
export async function loadCachedMappings(
  userId: string,
  connectorId: string,
  entityType: string
): Promise<FieldMapping[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("integration_field_mappings")
    .select(
      "source_field, target_field, confidence, origin"
    )
    .eq("user_id", userId)
    .eq("connector_id", connectorId)
    .eq("entity_type", entityType)
    .is("expires_at", null)
    .or("expires_at.gt.now()");

  if (error) {
    console.error("[MAPPING] Cache read failed:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    sourceField: row.source_field,
    targetField: row.target_field,
    confidence: row.confidence,
    origin: row.origin as MappingOrigin,
    reason: "cached",
  }));
}

/**
 * Mark a cached mapping as used (for analytics).
 */
export async function markMappingUsed(
  userId: string,
  connectorId: string,
  entityType: string,
  sourceField: string,
  targetField: string
): Promise<void> {
  const admin = createAdminClient();

  await admin
    .from("integration_field_mappings")
    .update({ last_used_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("connector_id", connectorId)
    .eq("entity_type", entityType)
    .eq("source_field", sourceField)
    .eq("target_field", targetField);
}

/**
 * Accept/correct a mapping (human feedback).
 * Updates confidence and origin to "manual" to indicate verified mapping.
 */
export async function reviewMapping(
  userId: string,
  connectorId: string,
  entityType: string,
  sourceField: string,
  targetField: string,
  approved: boolean,
  correctedTarget?: string
): Promise<void> {
  const admin = createAdminClient();

  if (!approved) {
    // Delete incorrect mapping
    await admin
      .from("integration_field_mappings")
      .delete()
      .eq("user_id", userId)
      .eq("connector_id", connectorId)
      .eq("entity_type", entityType)
      .eq("source_field", sourceField)
      .eq("target_field", targetField);
    return;
  }

  // Update mapping with human verification
  const finalTarget = correctedTarget ?? targetField;
  await admin
    .from("integration_field_mappings")
    .upsert({
      user_id: userId,
      connector_id: connectorId,
      entity_type: entityType,
      source_field: sourceField,
      target_field: finalTarget,
      confidence: 1.0,
      origin: "manual",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      expires_at: null, // Manual mappings don't expire
    });
}

// ─── Main Orchestrator ───

/**
 * Full 4-level mapping pipeline.
 * Runs levels sequentially, skipping those where confidence threshold met.
 */
export async function generateMappings(
  userId: string,
  connectorId: string,
  entityType: string,
  sourceFields: string[],
  targetFields: string[],
  options?: {
    sampleData?: Record<string, unknown>[];
    useLLM?: boolean;
    useCache?: boolean;
    confidenceThreshold?: number;
  }
): Promise<MappingResult> {
  const useLLM = options?.useLLM !== false;
  const useCache = options?.useCache !== false;
  const confidenceThreshold = options?.confidenceThreshold ?? 0.75;

  // ─── Level 0: Cache Lookup ───
  let allMappings: FieldMapping[] = [];

  if (useCache) {
    const cached = await loadCachedMappings(userId, connectorId, entityType);
    allMappings.push(...cached);
  }

  // ─── Level 1: Rules ───
  const ruleMappings = matchByRules(sourceFields, targetFields);
  allMappings.push(...ruleMappings);

  // ─── Level 2: Similarity ───
  const similarityMappings = matchBySimilarity(
    sourceFields,
    targetFields,
    allMappings
  );
  allMappings.push(...similarityMappings);

  // ─── Level 3: LLM (only if unmapped fields remain and under threshold) ───
  const mappedSources = new Set(allMappings.map((m) => m.sourceField));
  const mappedTargets = new Set(allMappings.map((m) => m.targetField));
  const unmappedSources = sourceFields.filter((f) => !mappedSources.has(f));
  const unmappedTargets = targetFields.filter((f) => !mappedTargets.has(f));

  if (useLLM && unmappedSources.length > 0 && unmappedTargets.length > 0) {
    const llmMappings = await matchByLLM(
      sourceFields,
      targetFields,
      options?.sampleData,
      allMappings
    );
    allMappings.push(...llmMappings);
  }

  // ─── Build Result ───
  const mappedSources2 = new Set(allMappings.map((m) => m.sourceField));
  const mappedTargets2 = new Set(allMappings.map((m) => m.targetField));

  const result: MappingResult = {
    sourceFields,
    targetFields,
    mappings: allMappings,
    unmappedSourceFields: sourceFields.filter((f) => !mappedSources2.has(f)),
    unmappedTargetFields: targetFields.filter((f) => !mappedTargets2.has(f)),
    confidence: allMappings.length > 0
      ? allMappings.reduce((sum, m) => sum + m.confidence, 0) / allMappings.length
      : 0,
  };

  // ─── Cache the results for next time ───
  if (useCache) {
    await cacheMappings(userId, connectorId, entityType, result.mappings);
  }

  return result;
}

/**
 * Convert mapping result to transform rules for DataModelSpec.
 */
export function mappingsToTransformRules(mappings: FieldMapping[]): TransformRule[] {
  return mappings.map((m) => ({
    sourceField: m.sourceField,
    targetColumn: m.targetField,
    transform: "identity", // Can be enhanced with type conversion rules
    mappedBy: m.origin,
    confidence: m.confidence,
  }));
}
