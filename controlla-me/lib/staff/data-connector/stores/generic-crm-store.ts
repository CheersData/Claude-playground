/**
 * Generic CRM Store — Fallback store for connectors without a dedicated store.
 *
 * Used by: universal-rest, csv, and any future connector that uses
 * dataType "crm-records" but doesn't have a connector-specific store
 * registered (e.g. "crm-records:universal-rest").
 *
 * This store follows the same pattern as StripeStore/HubSpotStore:
 *   - Validates records minimally (must have some form of external ID)
 *   - Batch upserts to crm_records table
 *   - Uses the standard UNIQUE constraint (user_id, connector_source, object_type, external_id)
 *   - Supports MappingEngine output via _mapped_fields
 *
 * Architecture: This is registered as "crm-records" (without composite key)
 * in plugin-registry, so resolveGenericStore falls back to it when no
 * connector-specific store exists (e.g. "crm-records:universal-rest" not found,
 * falls back to "crm-records").
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { StoreInterface, StoreResult } from "../types";

/** Batch size for upsert operations */
const BATCH_SIZE = 50;

/**
 * System user UUID for backend/pipeline syncs (no real user context).
 * Same constant used by StripeStore/HubSpotStore.
 */
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Generic record shape that this store can accept.
 * Any record with at least an externalId/id and objectType/entity_type will work.
 */
interface GenericRecord {
  externalId?: string;
  external_id?: string;
  id?: string | number;
  objectType?: string;
  object_type?: string;
  entity_type?: string;
  entityType?: string;
  connectorSource?: string;
  connector_source?: string;
  // MappingEngine output (attached by loadGenericPipeline)
  _mapped_fields?: Record<string, unknown>;
  _mapping_confidence?: number;
  [key: string]: unknown;
}

export class GenericCRMStore implements StoreInterface<GenericRecord> {
  private connectorSource: string;

  constructor(
    connectorSource: string = "generic",
    private log: (msg: string) => void = console.log
  ) {
    this.connectorSource = connectorSource;
  }

  async save(
    records: GenericRecord[],
    options?: { dryRun?: boolean }
  ): Promise<StoreResult> {
    const tag = `[GENERIC-CRM-STORE:${this.connectorSource}]`;

    this.log(`${tag} Received ${records.length} records`);

    if (options?.dryRun) {
      this.log(`${tag} DRY RUN | ${records.length} records ready | no DB write`);
      return {
        inserted: 0,
        updated: 0,
        skipped: records.length,
        errors: 0,
        errorDetails: [],
      };
    }

    // Validate: must have some form of external ID
    const validRecords: GenericRecord[] = [];
    const errorDetails: Array<{ item: string; error: string }> = [];

    for (const record of records) {
      const externalId = extractExternalId(record);
      if (!externalId) {
        errorDetails.push({
          item: JSON.stringify(record).slice(0, 100),
          error: "Missing externalId/id — cannot upsert without unique identifier",
        });
        continue;
      }
      validRecords.push(record);
    }

    if (errorDetails.length > 0) {
      this.log(
        `${tag} Validation: ${validRecords.length} valid, ${errorDetails.length} rejected`
      );
    }

    if (validRecords.length === 0) {
      this.log(`${tag} No valid records to save`);
      return {
        inserted: 0,
        updated: 0,
        skipped: 0,
        errors: errorDetails.length,
        errorDetails,
      };
    }

    const admin = createAdminClient();
    let totalInserted = 0;
    const totalBatches = Math.ceil(validRecords.length / BATCH_SIZE);

    for (let i = 0; i < validRecords.length; i += BATCH_SIZE) {
      const batch = validRecords.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;

      this.log(`${tag} Batch ${batchNum}/${totalBatches} | ${batch.length} records`);

      try {
        const rows = batch.map((record) => this.toRow(record));

        const { data, error } = await admin
          .from("crm_records" as "connector_sync_log")
          .upsert(rows as never[], {
            onConflict: "user_id,connector_source,object_type,external_id",
            ignoreDuplicates: false,
          })
          .select("id");

        if (error) {
          throw new Error(error.message);
        }

        totalInserted += data?.length ?? batch.length;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log(`${tag} Batch ${batchNum} error: ${msg}`);

        for (const r of batch) {
          errorDetails.push({
            item: `${extractEntityType(r)}:${extractExternalId(r)}`,
            error: msg,
          });
        }
      }
    }

    this.log(
      `${tag} Done | inserted/updated: ${totalInserted} | errors: ${errorDetails.length}`
    );

    return {
      inserted: totalInserted,
      updated: 0, // Cannot distinguish — same as other stores
      skipped: 0,
      errors: errorDetails.length,
      errorDetails,
    };
  }

  /**
   * Convert a generic record to a crm_records DB row.
   *
   * Stores the entire record as raw JSONB in the `data` column,
   * and uses _mapped_fields from the MappingEngine (if present)
   * for the `mapped_fields` column.
   */
  private toRow(record: GenericRecord): Record<string, unknown> {
    const now = new Date().toISOString();
    const externalId = extractExternalId(record);
    const entityType = extractEntityType(record);

    // Determine connector source from record or constructor
    const connectorSource =
      record.connectorSource ??
      record.connector_source ??
      this.connectorSource;

    // Build mapped_fields: MappingEngine output takes priority
    const mappedFields = record._mapped_fields ?? {};

    // Clean up internal fields from raw data
    const { _mapped_fields, _mapping_confidence, ...rawData } = record;

    return {
      user_id: SYSTEM_USER_ID,
      connector_source: connectorSource,
      object_type: entityType,
      external_id: externalId,
      data: rawData,
      mapped_fields: mappedFields,
      ...(record._mapping_confidence != null
        ? { mapping_confidence: record._mapping_confidence }
        : {}),
      synced_at: now,
      updated_at: now,
    };
  }
}

// ─── Helpers ───

/** Extract external ID from various common field names */
function extractExternalId(record: GenericRecord): string {
  const raw =
    record.externalId ?? record.external_id ?? record.id;
  return raw != null ? String(raw) : "";
}

/** Extract entity type from various common field names */
function extractEntityType(record: GenericRecord): string {
  return String(
    record.objectType ??
      record.object_type ??
      record.entity_type ??
      record.entityType ??
      "record"
  );
}
