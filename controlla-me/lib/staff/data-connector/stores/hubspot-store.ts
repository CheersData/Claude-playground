/**
 * HubSpot Store — Writes HubSpotRecord[] to the generic crm_records table via Supabase.
 *
 * Uses the generic JSONB schema from migration 030_integration_tables.sql:
 *   - user_id: system UUID (backend sync, no real user context)
 *   - connector_source: "hubspot"
 *   - object_type: "contact" | "company" | "deal" | "ticket"
 *   - external_id: HubSpot object ID (numeric string)
 *   - data: JSONB — full HubSpotRecord as raw data
 *   - mapped_fields: JSONB — normalized/key fields for quick access
 *
 * Upsert logic: ON CONFLICT (user_id, connector_source, object_type, external_id) DO UPDATE.
 * This ensures idempotent syncs — re-running the pipeline updates existing records
 * without creating duplicates.
 *
 * Same table as StripeStore — differentiated by connector_source = 'hubspot'.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { validateHubSpotRecord } from "../models/hubspot-record-model";
import type { StoreInterface, StoreResult } from "../types";
import type { HubSpotRecord } from "../parsers/hubspot-parser";

const BATCH_SIZE = 50;

/**
 * System user UUID for backend syncs (HubSpot has no user context in demo mode).
 * Same constant used by StripeStore — all service-level connector syncs use this UUID.
 */
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

export class HubSpotStore implements StoreInterface<HubSpotRecord> {
  constructor(private log: (msg: string) => void = console.log) {}

  async save(
    records: HubSpotRecord[],
    options?: { dryRun?: boolean }
  ): Promise<StoreResult> {
    if (options?.dryRun) {
      this.log(
        `[HUBSPOT-STORE] DRY RUN | ${records.length} records ready | no DB write`
      );
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

    if (validRecords.length === 0) {
      this.log(`[HUBSPOT-STORE] No valid records to save`);
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

      this.log(
        `[HUBSPOT-STORE] Batch ${batchNum}/${totalBatches} | ${batch.length} records`
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

        for (const r of batch) {
          errorDetails.push({
            item: `${r.objectType}:${r.externalId}`,
            error: msg,
          });
        }
      }
    }

    this.log(
      `[HUBSPOT-STORE] Done | inserted/updated: ${totalInserted} | errors: ${errorDetails.length}`
    );

    return {
      inserted: totalInserted,
      updated: 0, // Cannot distinguish — same as StripeStore
      skipped: 0,
      errors: errorDetails.length,
      errorDetails,
    };
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
 */
function toRow(record: HubSpotRecord): Record<string, unknown> {
  const now = new Date().toISOString();

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
      rawProperties: record.rawProperties,
    },

    // Mapped fields: normalized key fields for quick queries without digging into data JSONB
    mapped_fields: {
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
      hubspot_created_at: record.createdAt,
      hubspot_updated_at: record.updatedAt,
    },

    synced_at: now,
    updated_at: now,
  };
}
