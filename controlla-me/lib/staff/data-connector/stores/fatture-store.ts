/**
 * Fatture in Cloud Store — Writes FattureRecord[] to the generic crm_records table via Supabase.
 *
 * Uses the generic JSONB schema from migration 030_integration_tables.sql:
 *   - user_id: system UUID (backend sync) or real user UUID (user-connected)
 *   - connector_source: "fatture_in_cloud"
 *   - object_type: "issued_invoice" | "received_invoice" | "client"
 *   - external_id: Fatture in Cloud object ID (fic_issued_123, fic_cli_456, etc.)
 *   - data: JSONB — full FattureRecord as raw data
 *   - mapped_fields: JSONB — normalized/key fields for quick access
 *
 * Upsert logic:
 *   ON CONFLICT (user_id, connector_source, object_type, external_id) DO UPDATE
 *   only when the incoming record is newer (updatedAt > existing updated_at).
 *   Records with the same or older timestamp are skipped (counted as "skipped").
 *
 * Batch size: 100 records per batch for efficiency.
 *
 * Same pattern as StripeStore, HubSpotStore, SalesforceStore.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { validateFattureRecord } from "../models/fatture-record-model";
import type { StoreInterface, StoreResult } from "../types";
import type { FattureRecord } from "../parsers/fatture-parser";

/** Batch size for Supabase upsert — 100 records per batch for efficiency */
const BATCH_SIZE = 100;

/** Connector source identifier for all Fatture in Cloud records */
const CONNECTOR_SOURCE = "fatture_in_cloud";

/**
 * System user UUID for backend syncs (no user context).
 * This is a well-known constant — all service-level connector syncs use this UUID.
 * It does NOT reference a real auth.users row; the crm_records table uses
 * service_role RLS policy which bypasses the FK check.
 */
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

export interface FattureStoreOptions {
  /** Override the user_id for per-user integrations (default: SYSTEM_USER_ID) */
  userId?: string;
}

export class FattureStore implements StoreInterface<FattureRecord> {
  private userId: string;

  constructor(
    private log: (msg: string) => void = console.log,
    options?: FattureStoreOptions
  ) {
    this.userId = options?.userId ?? SYSTEM_USER_ID;
  }

  async save(
    records: FattureRecord[],
    options?: { dryRun?: boolean }
  ): Promise<StoreResult> {
    if (options?.dryRun) {
      // Validate even in dry run to surface issues early
      const validCount = records.filter(
        (r) => validateFattureRecord(r).valid
      ).length;
      const invalidCount = records.length - validCount;
      this.log(
        `[FATTURE-STORE] DRY RUN | ${validCount} valid, ${invalidCount} invalid | no DB write`
      );
      return {
        inserted: 0,
        updated: 0,
        skipped: records.length,
        errors: 0,
        errorDetails: [],
      };
    }

    // ─── Phase 1: Validate all records ───
    const validRecords: FattureRecord[] = [];
    const errorDetails: Array<{ item: string; error: string }> = [];

    for (const record of records) {
      const validation = validateFattureRecord(record);
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
      this.log(
        `[FATTURE-STORE] No valid records to save (${errorDetails.length} validation errors)`
      );
      return {
        inserted: 0,
        updated: 0,
        skipped: 0,
        errors: errorDetails.length,
        errorDetails,
      };
    }

    this.log(
      `[FATTURE-STORE] ${validRecords.length} valid records, ${errorDetails.length} validation errors`
    );

    // ─── Phase 2: Fetch existing records for update-if-newer logic ───
    const admin = createAdminClient();
    const existingMap = await this.fetchExistingTimestamps(
      admin,
      validRecords
    );

    // ─── Phase 3: Classify records as insert, update, or skip ───
    const toInsert: FattureRecord[] = [];
    const toUpdate: FattureRecord[] = [];
    let skippedCount = 0;

    for (const record of validRecords) {
      const key = `${record.objectType}:${record.externalId}`;
      const existingUpdatedAt = existingMap.get(key);

      if (!existingUpdatedAt) {
        // New record — insert
        toInsert.push(record);
      } else if (isNewer(record.updatedAt ?? record.createdAt, existingUpdatedAt)) {
        // Newer record — update
        toUpdate.push(record);
      } else {
        // Same or older — skip
        skippedCount++;
      }
    }

    this.log(
      `[FATTURE-STORE] Classified: ${toInsert.length} insert, ${toUpdate.length} update, ${skippedCount} skip`
    );

    // ─── Phase 4: Batch upsert (inserts + updates together) ───
    const recordsToUpsert = [...toInsert, ...toUpdate];
    let totalInserted = 0;
    let totalUpdated = 0;

    if (recordsToUpsert.length > 0) {
      const totalBatches = Math.ceil(recordsToUpsert.length / BATCH_SIZE);

      for (let i = 0; i < recordsToUpsert.length; i += BATCH_SIZE) {
        const batch = recordsToUpsert.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;

        this.log(
          `[FATTURE-STORE] Batch ${batchNum}/${totalBatches} | ${batch.length} records`
        );

        try {
          const rows = batch.map((r) => this.toRow(r));

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

          const batchSuccess = data?.length ?? batch.length;

          // Estimate insert vs update based on classification
          const batchInserts = batch.filter((r) =>
            toInsert.includes(r)
          ).length;
          const batchUpdates = batchSuccess - batchInserts;

          totalInserted += Math.min(batchInserts, batchSuccess);
          totalUpdated += Math.max(0, batchUpdates);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.log(`[FATTURE-STORE] Batch ${batchNum} error: ${msg}`);

          for (const r of batch) {
            errorDetails.push({
              item: `${r.objectType}:${r.externalId}`,
              error: msg,
            });
          }
        }
      }
    }

    this.log(
      `[FATTURE-STORE] Done | inserted: ${totalInserted} | updated: ${totalUpdated} | skipped: ${skippedCount} | errors: ${errorDetails.length}`
    );

    return {
      inserted: totalInserted,
      updated: totalUpdated,
      skipped: skippedCount,
      errors: errorDetails.length,
      errorDetails,
    };
  }

  // ─── Internal: fetch existing record timestamps for dedup ───

  /**
   * Fetch the updated_at timestamps for existing records matching the incoming batch.
   * Returns a Map keyed by "objectType:externalId" -> ISO timestamp string.
   *
   * This enables update-if-newer logic: only overwrite records that are stale.
   */
  private async fetchExistingTimestamps(
    admin: ReturnType<typeof createAdminClient>,
    records: FattureRecord[]
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();

    // Collect unique external_ids per object_type
    const externalIds = records.map((r) => r.externalId);

    if (externalIds.length === 0) return result;

    try {
      // Fetch in batches of 500 to avoid URL length limits
      const ID_BATCH = 500;
      for (let i = 0; i < externalIds.length; i += ID_BATCH) {
        const idBatch = externalIds.slice(i, i + ID_BATCH);

        const { data, error } = await admin
          .from("crm_records" as "connector_sync_log")
          .select("object_type, external_id, updated_at")
          .eq("user_id", this.userId)
          .eq("connector_source", CONNECTOR_SOURCE)
          .in("external_id", idBatch as never[]);

        if (error) {
          this.log(
            `[FATTURE-STORE] Warning: could not fetch existing records: ${error.message}. Proceeding with full upsert.`
          );
          return result;
        }

        if (data) {
          for (const row of data as Array<{
            object_type: string;
            external_id: string;
            updated_at: string;
          }>) {
            const key = `${row.object_type}:${row.external_id}`;
            result.set(key, row.updated_at);
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log(
        `[FATTURE-STORE] Warning: existing record lookup failed: ${msg}. Proceeding with full upsert.`
      );
    }

    return result;
  }

  // ─── Row mapper ───

  /**
   * Convert a FattureRecord to a generic crm_records DB row.
   *
   * Schema (from 030_integration_tables.sql):
   *   user_id UUID NOT NULL
   *   connector_source TEXT NOT NULL
   *   object_type TEXT NOT NULL
   *   external_id TEXT NOT NULL
   *   data JSONB NOT NULL         — raw FattureRecord (all fields)
   *   mapped_fields JSONB         — normalized key fields for quick access
   *   synced_at TIMESTAMPTZ
   *   UNIQUE(user_id, connector_source, object_type, external_id)
   *
   * If the record has been processed by the MappingEngine (via loadGenericPipeline),
   * it will have `_mapped_fields` attached. We merge those with the hardcoded defaults,
   * giving priority to the MappingEngine output (which supports user-confirmed,
   * rule-based, similarity, and LLM-resolved mappings).
   */
  private toRow(
    record: FattureRecord & {
      _mapped_fields?: Record<string, unknown>;
      _mapping_confidence?: number;
    }
  ): Record<string, unknown> {
    const now = new Date().toISOString();

    // Hardcoded defaults — always available as baseline
    const defaultMappedFields: Record<string, unknown> = {
      // Invoice fields (amounts in cents)
      invoice_number: record.invoiceNumber,
      invoice_date: record.invoiceDate,
      net_amount_cents: record.netAmount,
      vat_amount_cents: record.vatAmount,
      gross_amount_cents: record.grossAmount,
      vat_rate: record.vatRate,
      document_type: record.documentType,
      payment_status: record.paymentStatus,
      payment_method: record.paymentMethod,
      e_invoice: record.eInvoice,
      fiscal_year: record.fiscalYear,
      // Entity fields
      company_name: record.companyName,
      vat_number: record.vatNumber,
      tax_code: record.taxCode,
      city: record.city,
      province: record.province,
      country: record.country,
      // General
      status: record.status,
      name: record.name,
      email: record.email,
      description: record.description,
      currency: record.currency,
      // Client-specific
      client_type: record.clientType,
      certified_email: record.certifiedEmail,
      phone: record.phone,
      sdi_code: record.sdiCode,
    };

    // MappingEngine output takes priority when available (supports user-confirmed + learned mappings)
    const mappedFields = record._mapped_fields
      ? { ...defaultMappedFields, ...record._mapped_fields }
      : defaultMappedFields;

    return {
      user_id: this.userId,
      connector_source: CONNECTOR_SOURCE,
      object_type: record.objectType,
      external_id: record.externalId,

      // Raw data: full FattureRecord as JSONB
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
        invoiceNumber: record.invoiceNumber,
        invoiceDate: record.invoiceDate,
        netAmount: record.netAmount,
        vatAmount: record.vatAmount,
        grossAmount: record.grossAmount,
        vatRate: record.vatRate,
        documentType: record.documentType,
        paymentStatus: record.paymentStatus,
        paymentMethod: record.paymentMethod,
        eInvoice: record.eInvoice,
        eInvoiceStatus: record.eInvoiceStatus,
        description: record.description,
        fiscalYear: record.fiscalYear,
        companyName: record.companyName,
        vatNumber: record.vatNumber,
        taxCode: record.taxCode,
        address: record.address,
        city: record.city,
        province: record.province,
        postalCode: record.postalCode,
        country: record.country,
        clientType: record.clientType,
        certifiedEmail: record.certifiedEmail,
        phone: record.phone,
        sdiCode: record.sdiCode,
        rawExtra: record.rawExtra,
      },

      // Mapped fields: MappingEngine output merged with hardcoded defaults
      mapped_fields: mappedFields,

      // Mapping metadata (when MappingEngine was used)
      ...(record._mapping_confidence != null
        ? { mapping_confidence: record._mapping_confidence }
        : {}),

      synced_at: now,
      updated_at: now,
    };
  }
}

// ─── Utilities ───

/**
 * Compare two ISO 8601 date strings.
 * Returns true if `incoming` is strictly newer than `existing`.
 * Returns false if dates are equal or `incoming` is older.
 * If either date is invalid/null, returns true (proceed with upsert as fallback).
 */
function isNewer(
  incoming: string | null | undefined,
  existing: string | null | undefined
): boolean {
  if (!incoming || !existing) return true;

  const incomingTime = new Date(incoming).getTime();
  const existingTime = new Date(existing).getTime();

  if (isNaN(incomingTime) || isNaN(existingTime)) return true;

  return incomingTime > existingTime;
}
