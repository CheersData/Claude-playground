/**
 * HubSpot Store — Writes HubSpotRecord[] to the generic crm_records table via Supabase.
 *
 * Uses the generic JSONB schema from migration 030_integration_tables.sql:
 *   - user_id: system UUID (backend sync, no real user context)
 *   - connector_source: "hubspot"
 *   - object_type: "contact" | "company" | "deal" | "ticket" | "engagement"
 *   - external_id: HubSpot object ID (numeric string)
 *   - data: JSONB — full HubSpotRecord as raw data
 *   - mapped_fields: JSONB — normalized/key fields for quick access
 *
 * Upsert logic: ON CONFLICT (user_id, connector_source, object_type, external_id) DO UPDATE.
 * This ensures idempotent syncs — re-running the pipeline updates existing records
 * without creating duplicates.
 *
 * Features:
 *   - Batch upsert, 100 records per batch (HubSpot API page size aligned)
 *   - All 5 object types in the same store (differentiated by object_type column)
 *   - Sync metadata tracking: last_synced_at, record_count per type
 *   - MappingEngine support: merges _mapped_fields with hardcoded defaults
 *
 * Same table as StripeStore — differentiated by connector_source = 'hubspot'.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { validateHubSpotRecord } from "../models/hubspot-record-model";
import type { StoreInterface, StoreResult } from "../types";
import type { HubSpotRecord, HubSpotObjectType } from "../parsers/hubspot-parser";

/** Batch size aligned with HubSpot API page size for optimal throughput */
const BATCH_SIZE = 100;

/**
 * System user UUID for backend syncs (HubSpot has no user context in demo mode).
 * Same constant used by StripeStore — all service-level connector syncs use this UUID.
 */
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

/** Per-type record counts for sync metadata */
export interface HubSpotSyncMetadata {
  /** ISO 8601 timestamp of last sync completion */
  lastSyncedAt: string;
  /** Total records upserted in this sync */
  totalRecords: number;
  /** Record count per object type */
  countsByType: Partial<Record<HubSpotObjectType, number>>;
  /** Validation error count */
  validationErrors: number;
  /** DB error count */
  dbErrors: number;
}

export class HubSpotStore implements StoreInterface<HubSpotRecord> {
  /** Metadata from the most recent save() call */
  private _lastSyncMetadata: HubSpotSyncMetadata | null = null;

  constructor(private log: (msg: string) => void = console.log) {}

  /**
   * Returns sync metadata from the most recent save() call.
   * Useful for logging, monitoring, and sync-log entries.
   */
  get lastSyncMetadata(): HubSpotSyncMetadata | null {
    return this._lastSyncMetadata;
  }

  async save(
    records: HubSpotRecord[],
    options?: { dryRun?: boolean }
  ): Promise<StoreResult> {
    const syncStartedAt = new Date().toISOString();

    // Count records per type (before validation)
    const inputCountsByType = countByType(records);
    this.log(
      `[HUBSPOT-STORE] Received ${records.length} records: ${formatTypeCounts(inputCountsByType)}`
    );

    if (options?.dryRun) {
      this.log(
        `[HUBSPOT-STORE] DRY RUN | ${records.length} records ready | no DB write`
      );
      this._lastSyncMetadata = {
        lastSyncedAt: syncStartedAt,
        totalRecords: 0,
        countsByType: inputCountsByType,
        validationErrors: 0,
        dbErrors: 0,
      };
      return {
        inserted: 0,
        updated: 0,
        skipped: records.length,
        errors: 0,
        errorDetails: [],
      };
    }

    // Validate all records first
    const validRecords: HubSpotRecord[] = [];
    const errorDetails: Array<{ item: string; error: string }> = [];

    for (const record of records) {
      const validation = validateHubSpotRecord(record);
      if (validation.valid) {
        validRecords.push(record);
      } else {
        errorDetails.push({
          item: `${record.objectType}:${record.externalId}`,
          error: validation.errors.join("; "),
        });
      }
    }

    if (errorDetails.length > 0) {
      this.log(
        `[HUBSPOT-STORE] Validation: ${validRecords.length} valid, ${errorDetails.length} rejected`
      );
    }

    if (validRecords.length === 0) {
      this.log(`[HUBSPOT-STORE] No valid records to save`);
      this._lastSyncMetadata = {
        lastSyncedAt: syncStartedAt,
        totalRecords: 0,
        countsByType: inputCountsByType,
        validationErrors: errorDetails.length,
        dbErrors: 0,
      };
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
    let dbErrors = 0;
    const totalBatches = Math.ceil(validRecords.length / BATCH_SIZE);

    for (let i = 0; i < validRecords.length; i += BATCH_SIZE) {
      const batch = validRecords.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;

      // Log batch with type breakdown
      const batchCounts = countByType(batch);
      this.log(
        `[HUBSPOT-STORE] Batch ${batchNum}/${totalBatches} | ${batch.length} records (${formatTypeCounts(batchCounts)})`
      );

      try {
        const rows = batch.map(toRow);

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

        // Supabase upsert doesn't distinguish insert vs update in response
        totalInserted += data?.length ?? batch.length;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log(`[HUBSPOT-STORE] Batch ${batchNum} error: ${msg}`);
        dbErrors += batch.length;

        for (const r of batch) {
          errorDetails.push({
            item: `${r.objectType}:${r.externalId}`,
            error: msg,
          });
        }
      }
    }

    const syncCompletedAt = new Date().toISOString();

    // Build per-type counts for successfully saved records
    const savedCountsByType = countByType(validRecords);

    this._lastSyncMetadata = {
      lastSyncedAt: syncCompletedAt,
      totalRecords: totalInserted,
      countsByType: savedCountsByType,
      validationErrors: records.length - validRecords.length,
      dbErrors,
    };

    this.log(
      `[HUBSPOT-STORE] Done | inserted/updated: ${totalInserted} | errors: ${errorDetails.length} | ${formatTypeCounts(savedCountsByType)}`
    );

    // Update sync metadata in integration_connections (if table exists)
    await this.updateSyncMetadata(admin, syncCompletedAt, savedCountsByType, totalInserted);

    return {
      inserted: totalInserted,
      updated: 0, // Cannot distinguish — same as StripeStore
      skipped: 0,
      errors: errorDetails.length,
      errorDetails,
    };
  }

  /**
   * Update sync metadata in integration_connections table.
   * This tracks last_synced_at and record counts per type for the HubSpot connector.
   * Non-critical: errors are logged but do not fail the sync.
   */
  private async updateSyncMetadata(
    admin: ReturnType<typeof createAdminClient>,
    syncedAt: string,
    countsByType: Partial<Record<HubSpotObjectType, number>>,
    totalRecords: number
  ): Promise<void> {
    try {
      // Update the integration_connections row for HubSpot (if exists)
      // This is a best-effort operation — the sync succeeds even if this fails
      const { error } = await admin
        .from("integration_connections" as "connector_sync_log")
        .update({
          last_synced_at: syncedAt,
          sync_metadata: {
            record_count: totalRecords,
            counts_by_type: countsByType,
            last_synced_at: syncedAt,
          },
        } as never)
        .eq("connector_type" as never, "hubspot" as never)
        .eq("user_id" as never, SYSTEM_USER_ID as never);

      if (error) {
        // Non-critical: table may not exist or row may not exist
        this.log(`[HUBSPOT-STORE] Sync metadata update skipped: ${error.message}`);
      }
    } catch (err) {
      // Non-critical — log and continue
      const msg = err instanceof Error ? err.message : String(err);
      this.log(`[HUBSPOT-STORE] Sync metadata update failed: ${msg}`);
    }
  }
}

// ─── Row mapper ───

/**
 * Convert a HubSpotRecord to a generic crm_records DB row.
 *
 * Schema (from 030_integration_tables.sql):
 *   user_id UUID NOT NULL
 *   connector_source TEXT NOT NULL
 *   object_type TEXT NOT NULL
 *   external_id TEXT NOT NULL
 *   data JSONB NOT NULL         — raw HubSpotRecord (all fields)
 *   mapped_fields JSONB         — normalized key fields for quick access
 *   synced_at TIMESTAMPTZ
 *   UNIQUE(user_id, connector_source, object_type, external_id)
 *
 * If the record has been processed by the MappingEngine (via loadGenericPipeline),
 * it will have `_mapped_fields` attached. We merge those with the hardcoded defaults,
 * giving priority to the MappingEngine output (which supports user-confirmed,
 * rule-based, similarity, and LLM-resolved mappings).
 */
function toRow(record: HubSpotRecord & { _mapped_fields?: Record<string, unknown>; _mapping_confidence?: number }): Record<string, unknown> {
  const now = new Date().toISOString();

  // Hardcoded defaults — always available as baseline
  const defaultMappedFields: Record<string, unknown> = {
    display_name: record.displayName,
    email: record.email,
    phone: record.phone,
    company_name: record.companyName,
    domain: record.domain,
    industry: record.industry,
    stage: record.stage,
    pipeline: record.pipeline,
    amount: record.amount,
    currency: record.currency,
    close_date: record.closeDate,
    priority: record.priority,
    engagement_type: record.engagementType,
    engagement_timestamp: record.engagementTimestamp,
    owner_id: record.ownerId,
    hubspot_created_at: record.createdAt,
    hubspot_updated_at: record.updatedAt,
  };

  // Include association IDs for cross-referencing
  if (record.associations.length > 0) {
    defaultMappedFields.associated_company_ids = record.associations
      .filter((a) => a.objectType === "companies")
      .map((a) => a.objectId);
    defaultMappedFields.associated_contact_ids = record.associations
      .filter((a) => a.objectType === "contacts")
      .map((a) => a.objectId);
    defaultMappedFields.associated_deal_ids = record.associations
      .filter((a) => a.objectType === "deals")
      .map((a) => a.objectId);
  }

  // MappingEngine output takes priority when available (supports user-confirmed + learned mappings)
  const mappedFields = record._mapped_fields
    ? { ...defaultMappedFields, ...record._mapped_fields }
    : defaultMappedFields;

  return {
    user_id: SYSTEM_USER_ID,
    connector_source: "hubspot",
    object_type: record.objectType,
    external_id: record.externalId,

    // Raw data: full HubSpotRecord as JSONB
    data: {
      externalId: record.externalId,
      objectType: record.objectType,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      archived: record.archived,
      displayName: record.displayName,
      email: record.email,
      phone: record.phone,
      companyName: record.companyName,
      domain: record.domain,
      industry: record.industry,
      stage: record.stage,
      pipeline: record.pipeline,
      amount: record.amount,
      currency: record.currency,
      closeDate: record.closeDate,
      priority: record.priority,
      description: record.description,
      engagementType: record.engagementType,
      engagementTimestamp: record.engagementTimestamp,
      ownerId: record.ownerId,
      associations: record.associations,
      rawProperties: record.rawProperties,
    },

    // Mapped fields: MappingEngine output merged with hardcoded defaults
    mapped_fields: mappedFields,

    // Mapping metadata (when MappingEngine was used)
    ...(record._mapping_confidence != null ? { mapping_confidence: record._mapping_confidence } : {}),

    synced_at: now,
    updated_at: now,
  };
}

// ─── Utilities ───

/** Count records per HubSpot object type */
function countByType(records: HubSpotRecord[]): Partial<Record<HubSpotObjectType, number>> {
  const counts: Partial<Record<HubSpotObjectType, number>> = {};

  for (const r of records) {
    counts[r.objectType] = (counts[r.objectType] ?? 0) + 1;
  }

  return counts;
}

/** Format type counts for logging: "contact:5, company:3, deal:2" */
function formatTypeCounts(counts: Partial<Record<HubSpotObjectType, number>>): string {
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `${type}:${count}`)
    .join(", ");
}
