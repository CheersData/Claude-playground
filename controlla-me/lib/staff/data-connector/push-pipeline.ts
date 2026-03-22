/**
 * Push Pipeline — Orchestrates pushing records from crm_records (hub) to a target connector.
 *
 * Flow:
 *   1. Read source records from crm_records (by IDs or query)
 *   2. Load entity_mapping_configs for source→target field transformation
 *   3. Apply field mapping (denormalize hub → target schema)
 *   4. Call connector.push() on the target connector
 *   5. Return PushPipelineResult with counts and errors
 *
 * This is the core of the hub-and-spoke architecture:
 *   Source (any) → PULL → crm_records (hub) → PUSH → Target (any)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PushResult } from "./types";

// ─── Types ───

export interface PushPipelineInput {
  /** Source connector ID (e.g. "hubspot") — where records came from */
  sourceConnectorId: string;
  /** Target connector ID (e.g. "hubspot", "fatture-in-cloud") — where to push */
  targetConnectorId: string;
  /** Entity type to push (e.g. "contact", "company") */
  entityType: string;
  /** Target entity type (can differ from source, e.g. contact → lead) */
  targetEntityType?: string;
  /** Specific record IDs to push (from crm_records.id). If empty, push all of entityType. */
  recordIds?: string[];
  /** Dry run — validate mapping but don't actually push */
  dryRun?: boolean;
}

export interface PushPipelineResult {
  /** Records read from hub */
  recordsRead: number;
  /** Records mapped successfully */
  recordsMapped: number;
  /** Push result from target connector */
  pushResult: PushResult | null;
  /** Pipeline-level errors */
  errors: string[];
  /** Duration in milliseconds */
  durationMs: number;
}

// ─── Pipeline ───

/**
 * Execute the push pipeline: hub → mapping → target.
 *
 * @param admin - Supabase admin client (service role)
 * @param userId - Authenticated user ID
 * @param input - Pipeline parameters
 * @param pushFn - Function that actually pushes items to the target (injected by caller)
 * @param log - Logger
 */
export async function executePushPipeline(
  admin: SupabaseClient,
  userId: string,
  input: PushPipelineInput,
  pushFn: (items: Record<string, unknown>[], entityType: string, dryRun: boolean) => Promise<PushResult>,
  log: (msg: string) => void = console.log
): Promise<PushPipelineResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const targetEntityType = input.targetEntityType ?? input.entityType;

  log(`[PushPipeline] Starting: ${input.sourceConnectorId} → ${input.targetConnectorId} (${input.entityType} → ${targetEntityType})`);

  // ─── Step 1: Read records from crm_records ───

  let query = admin
    .from("crm_records")
    .select("id, external_id, object_type, data, mapped_fields")
    .eq("user_id", userId)
    .eq("connector_source", input.sourceConnectorId)
    .eq("object_type", input.entityType);

  if (input.recordIds && input.recordIds.length > 0) {
    query = query.in("id", input.recordIds);
  }

  const { data: records, error: queryError } = await query;

  if (queryError) {
    return {
      recordsRead: 0,
      recordsMapped: 0,
      pushResult: null,
      errors: [`Errore lettura record: ${queryError.message}`],
      durationMs: Date.now() - startTime,
    };
  }

  if (!records || records.length === 0) {
    return {
      recordsRead: 0,
      recordsMapped: 0,
      pushResult: null,
      errors: ["Nessun record trovato con i criteri specificati"],
      durationMs: Date.now() - startTime,
    };
  }

  log(`[PushPipeline] ${records.length} records read from hub`);

  // ─── Step 2: Load mapping config (if exists) ───

  const { data: mappingConfig } = await admin
    .from("entity_mapping_configs")
    .select("mappings")
    .eq("user_id", userId)
    .eq("source_connector", input.sourceConnectorId)
    .eq("target_connector", input.targetConnectorId)
    .eq("source_entity", input.entityType)
    .eq("target_entity", targetEntityType)
    .eq("status", "active")
    .maybeSingle();

  const fieldMappings = (mappingConfig?.mappings as Array<{
    sourceField: string;
    targetField: string;
  }>) || null;

  if (fieldMappings) {
    log(`[PushPipeline] Found ${fieldMappings.length} field mappings`);
  } else {
    log(`[PushPipeline] No mapping config found — using raw data + mapped_fields`);
  }

  // ─── Step 3: Apply mapping to each record ───

  const mappedItems: Record<string, unknown>[] = [];

  for (const record of records) {
    try {
      const mappedItem: Record<string, unknown> = {
        // Preserve source identity for upsert matching
        externalId: record.external_id,
        objectType: targetEntityType,
      };

      if (fieldMappings) {
        // Apply explicit source→target field mapping
        const sourceData = {
          ...(record.data as Record<string, unknown>),
          ...(record.mapped_fields as Record<string, unknown>),
        };

        for (const { sourceField, targetField } of fieldMappings) {
          if (targetField && targetField !== "-- Ignora --") {
            const value = sourceData[sourceField];
            if (value !== null && value !== undefined) {
              mappedItem[targetField] = value;
            }
          }
        }
      } else {
        // No explicit mapping — use mapped_fields (from sync mapping) or raw data
        const mapped = record.mapped_fields as Record<string, unknown>;
        if (mapped && Object.keys(mapped).length > 0) {
          Object.assign(mappedItem, mapped);
        } else {
          // Fall back to raw data
          Object.assign(mappedItem, record.data as Record<string, unknown>);
        }
      }

      mappedItems.push(mappedItem);
    } catch (err) {
      errors.push(
        `Mapping failed for record ${record.external_id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  log(`[PushPipeline] ${mappedItems.length}/${records.length} records mapped`);

  if (mappedItems.length === 0) {
    return {
      recordsRead: records.length,
      recordsMapped: 0,
      pushResult: null,
      errors: errors.length > 0 ? errors : ["Nessun record mappato correttamente"],
      durationMs: Date.now() - startTime,
    };
  }

  // ─── Step 4: Push to target connector ───

  try {
    const pushResult = await pushFn(
      mappedItems,
      targetEntityType,
      input.dryRun ?? false
    );

    log(
      `[PushPipeline] Push complete: ${pushResult.created} created, ` +
      `${pushResult.updated} updated, ${pushResult.failed} failed`
    );

    return {
      recordsRead: records.length,
      recordsMapped: mappedItems.length,
      pushResult,
      errors,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Push failed: ${msg}`);

    return {
      recordsRead: records.length,
      recordsMapped: mappedItems.length,
      pushResult: null,
      errors,
      durationMs: Date.now() - startTime,
    };
  }
}
