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
 * Upsert logic: ON CONFLICT (user_id, connector_source, object_type, external_id) DO UPDATE.
 * This ensures idempotent syncs — re-running the pipeline updates existing records
 * without creating duplicates.
 *
 * Same pattern as StripeStore, HubSpotStore, SalesforceStore.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { validateFattureRecord } from "../models/fatture-record-model";
import type { StoreInterface, StoreResult } from "../types";
import type { FattureRecord } from "../parsers/fatture-parser";

const BATCH_SIZE = 50;

/**
 * System user UUID for backend syncs (no user context).
 * This is a well-known constant — all service-level connector syncs use this UUID.
 * It does NOT reference a real auth.users row; the crm_records table uses
 * service_role RLS policy which bypasses the FK check.
 */
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

export class FattureStore implements StoreInterface<FattureRecord> {
  constructor(private log: (msg: string) => void = console.log) {}

  async save(
    records: FattureRecord[],
    options?: { dryRun?: boolean }
  ): Promise<StoreResult> {
    if (options?.dryRun) {
      this.log(
        `[FATTURE-STORE] DRY RUN | ${records.length} records ready | no DB write`
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
      this.log(`[FATTURE-STORE] No valid records to save`);
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
        `[FATTURE-STORE] Batch ${batchNum}/${totalBatches} | ${batch.length} records`
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
        this.log(`[FATTURE-STORE] Batch ${batchNum} error: ${msg}`);

        for (const r of batch) {
          errorDetails.push({
            item: `${r.objectType}:${r.externalId}`,
            error: msg,
          });
        }
      }
    }

    this.log(
      `[FATTURE-STORE] Done | inserted/updated: ${totalInserted} | errors: ${errorDetails.length}`
    );

    return {
      inserted: totalInserted,
      updated: 0, // Cannot distinguish — same as StripeStore/HubSpotStore
      skipped: 0,
      errors: errorDetails.length,
      errorDetails,
    };
  }
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
function toRow(record: FattureRecord & { _mapped_fields?: Record<string, unknown>; _mapping_confidence?: number }): Record<string, unknown> {
  const now = new Date().toISOString();

  // Hardcoded defaults — always available as baseline
  const defaultMappedFields: Record<string, unknown> = {
    // Invoice fields
    invoice_number: record.invoiceNumber,
    invoice_date: record.invoiceDate,
    net_amount: record.netAmount,
    vat_amount: record.vatAmount,
    gross_amount: record.grossAmount,
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
  };

  // MappingEngine output takes priority when available (supports user-confirmed + learned mappings)
  const mappedFields = record._mapped_fields
    ? { ...defaultMappedFields, ...record._mapped_fields }
    : defaultMappedFields;

  return {
    user_id: SYSTEM_USER_ID,
    connector_source: "fatture_in_cloud",
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
    ...(record._mapping_confidence != null ? { mapping_confidence: record._mapping_confidence } : {}),

    synced_at: now,
    updated_at: now,
  };
}
