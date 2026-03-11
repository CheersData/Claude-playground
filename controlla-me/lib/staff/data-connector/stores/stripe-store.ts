/**
 * Stripe Store — Writes StripeRecord[] to the generic crm_records table via Supabase.
 *
 * Uses the generic JSONB schema from migration 030_integration_tables.sql:
 *   - user_id: system UUID (backend sync, no real user context)
 *   - connector_source: "stripe"
 *   - object_type: "customer" | "subscription" | "invoice" | "payment_intent"
 *   - external_id: Stripe object ID (cus_xxx, sub_xxx, etc.)
 *   - data: JSONB — full StripeRecord as raw data
 *   - mapped_fields: JSONB — normalized/key fields for quick access
 *
 * Upsert logic: ON CONFLICT (user_id, connector_source, object_type, external_id) DO UPDATE.
 * This ensures idempotent syncs — re-running the pipeline updates existing records
 * without creating duplicates.
 *
 * NOTE: Uses StoreInterface<StripeRecord> instead of StoreInterface<LegalArticle>.
 * This means it cannot be registered in the plugin-registry as-is (type mismatch).
 * The StripeConnector pipeline calls this store directly.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { validateStripeRecord } from "../models/stripe-record-model";
import type { StoreInterface, StoreResult } from "../types";
import type { StripeRecord } from "../parsers/stripe-parser";

const BATCH_SIZE = 50;

/**
 * System user UUID for backend syncs (Stripe has no user context).
 * This is a well-known constant — all service-level connector syncs use this UUID.
 * It does NOT reference a real auth.users row; the crm_records table uses
 * service_role RLS policy which bypasses the FK check.
 */
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

export class StripeStore implements StoreInterface<StripeRecord> {
  constructor(private log: (msg: string) => void = console.log) {}

  async save(
    records: StripeRecord[],
    options?: { dryRun?: boolean }
  ): Promise<StoreResult> {
    if (options?.dryRun) {
      this.log(
        `[STRIPE-STORE] DRY RUN | ${records.length} records ready | no DB write`
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
    const validRecords: StripeRecord[] = [];
    const errorDetails: Array<{ item: string; error: string }> = [];

    for (const record of records) {
      const validation = validateStripeRecord(record);
      if (validation.valid) {
        validRecords.push(record);
      } else {
        errorDetails.push({
          item: record.externalId ?? "unknown",
          error: validation.errors.join("; "),
        });
      }
    }

    if (validRecords.length === 0) {
      this.log(`[STRIPE-STORE] No valid records to save`);
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
    let totalUpdated = 0;
    const totalBatches = Math.ceil(validRecords.length / BATCH_SIZE);

    for (let i = 0; i < validRecords.length; i += BATCH_SIZE) {
      const batch = validRecords.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;

      this.log(
        `[STRIPE-STORE] Batch ${batchNum}/${totalBatches} | ${batch.length} records`
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
        // We count all successful rows as "inserted" (same as LegalCorpusStore)
        totalInserted += data?.length ?? batch.length;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log(`[STRIPE-STORE] Batch ${batchNum} error: ${msg}`);

        for (const r of batch) {
          errorDetails.push({
            item: `${r.objectType}:${r.externalId}`,
            error: msg,
          });
        }
      }
    }

    // If some records were already in DB and got updated, count them
    // Since Supabase upsert doesn't distinguish, we estimate:
    // if totalInserted == validRecords.length, assume all were upserted.
    totalUpdated = 0; // Cannot distinguish — same as LegalCorpusStore

    this.log(
      `[STRIPE-STORE] Done | inserted/updated: ${totalInserted} | errors: ${errorDetails.length}`
    );

    return {
      inserted: totalInserted,
      updated: totalUpdated,
      skipped: 0,
      errors: errorDetails.length,
      errorDetails,
    };
  }
}

// ─── Row mapper ───

/**
 * Convert a StripeRecord to a generic crm_records DB row.
 *
 * Schema (from 030_integration_tables.sql):
 *   user_id UUID NOT NULL
 *   connector_source TEXT NOT NULL
 *   object_type TEXT NOT NULL
 *   external_id TEXT NOT NULL
 *   data JSONB NOT NULL         — raw StripeRecord (all fields)
 *   mapped_fields JSONB         — normalized key fields for quick access
 *   synced_at TIMESTAMPTZ
 *   UNIQUE(user_id, connector_source, object_type, external_id)
 */
function toRow(record: StripeRecord): Record<string, unknown> {
  const now = new Date().toISOString();

  return {
    user_id: SYSTEM_USER_ID,
    connector_source: "stripe",
    object_type: record.objectType,
    external_id: record.externalId,

    // Raw data: full StripeRecord as JSONB
    data: {
      externalId: record.externalId,
      objectType: record.objectType,
      status: record.status,
      email: record.email,
      name: record.name,
      amount: record.amount,
      currency: record.currency,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      customerId: record.customerId,
      subscriptionId: record.subscriptionId,
      description: record.description,
      interval: record.interval,
      stripeMetadata: record.stripeMetadata,
      rawExtra: record.rawExtra,
    },

    // Mapped fields: normalized key fields for quick queries without digging into data JSONB
    mapped_fields: {
      status: record.status,
      email: record.email,
      name: record.name,
      amount: record.amount,
      currency: record.currency,
      customer_id: record.customerId,
      subscription_id: record.subscriptionId,
      description: record.description,
      stripe_created_at: record.createdAt,
      stripe_updated_at: record.updatedAt,
    },

    synced_at: now,
    updated_at: now,
  };
}
