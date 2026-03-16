/**
 * Google Drive Store — Writes DriveRecord[] to the generic crm_records table via Supabase.
 *
 * Uses the generic JSONB schema from migration 030_integration_tables.sql:
 *   - user_id: system UUID (backend sync, no real user context)
 *   - connector_source: "google-drive"
 *   - object_type: file mimeType category (document, spreadsheet, pdf, folder, image, other)
 *   - external_id: Google Drive file ID
 *   - data: JSONB — full DriveRecord as raw data
 *   - mapped_fields: JSONB — normalized/key fields for quick access
 *
 * Upsert logic: ON CONFLICT (user_id, connector_source, object_type, external_id) DO UPDATE.
 * This ensures idempotent syncs — re-running the pipeline updates existing records
 * without creating duplicates.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { validateDriveRecord } from "../models/google-drive-record-model";
import type { StoreInterface, StoreResult } from "../types";
import type { DriveRecord } from "../parsers/google-drive-parser";

const BATCH_SIZE = 50;

/**
 * System user UUID for backend syncs (Google Drive has no user context in demo mode).
 * Same well-known constant used by StripeStore.
 */
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

export class GoogleDriveStore implements StoreInterface<DriveRecord> {
  constructor(private log: (msg: string) => void = console.log) {}

  async save(
    records: DriveRecord[],
    options?: { dryRun?: boolean }
  ): Promise<StoreResult> {
    if (options?.dryRun) {
      this.log(
        `[GDRIVE-STORE] DRY RUN | ${records.length} records ready | no DB write`
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
    const validRecords: DriveRecord[] = [];
    const errorDetails: Array<{ item: string; error: string }> = [];

    for (const record of records) {
      const validation = validateDriveRecord(record);
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
      this.log("[GDRIVE-STORE] No valid records to save");
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
        `[GDRIVE-STORE] Batch ${batchNum}/${totalBatches} | ${batch.length} records`
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

        totalInserted += data?.length ?? batch.length;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log(`[GDRIVE-STORE] Batch ${batchNum} error: ${msg}`);

        for (const r of batch) {
          errorDetails.push({
            item: `${r.objectType}:${r.externalId}`,
            error: msg,
          });
        }
      }
    }

    this.log(
      `[GDRIVE-STORE] Done | inserted/updated: ${totalInserted} | errors: ${errorDetails.length}`
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
 * Convert a DriveRecord to a generic crm_records DB row.
 *
 * Schema (from 030_integration_tables.sql):
 *   user_id UUID NOT NULL
 *   connector_source TEXT NOT NULL    — "google-drive"
 *   object_type TEXT NOT NULL         — document | spreadsheet | pdf | folder | image | other
 *   external_id TEXT NOT NULL         — Google Drive file ID
 *   data JSONB NOT NULL               — full DriveRecord
 *   mapped_fields JSONB               — normalized key fields for quick access
 *   synced_at TIMESTAMPTZ
 *   UNIQUE(user_id, connector_source, object_type, external_id)
 *
 * If the record has been processed by the MappingEngine (via loadGenericPipeline),
 * it will have `_mapped_fields` attached. We merge those with the hardcoded defaults,
 * giving priority to the MappingEngine output (which supports user-confirmed,
 * rule-based, similarity, and LLM-resolved mappings).
 */
function toRow(record: DriveRecord & { _mapped_fields?: Record<string, unknown>; _mapping_confidence?: number }): Record<string, unknown> {
  const now = new Date().toISOString();

  // Hardcoded defaults — always available as baseline
  const defaultMappedFields: Record<string, unknown> = {
    name: record.name,
    mime_type: record.mimeType,
    size_bytes: record.sizeBytes,
    owner_name: record.ownerName,
    owner_email: record.ownerEmail,
    shared: record.shared,
    is_folder: record.isFolder,
    is_google_format: record.isGoogleFormat,
    extension: record.extension,
    web_view_link: record.webViewLink,
    created_at: record.createdAt,
    modified_at: record.modifiedAt,
    parent_ids: record.parents,
  };

  // MappingEngine output takes priority when available (supports user-confirmed + learned mappings)
  const mappedFields = record._mapped_fields
    ? { ...defaultMappedFields, ...record._mapped_fields }
    : defaultMappedFields;

  return {
    user_id: SYSTEM_USER_ID,
    connector_source: "google-drive",
    object_type: record.objectType,
    external_id: record.externalId,

    // Raw data: full DriveRecord as JSONB
    data: {
      externalId: record.externalId,
      objectType: record.objectType,
      name: record.name,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      createdAt: record.createdAt,
      modifiedAt: record.modifiedAt,
      parents: record.parents,
      ownerName: record.ownerName,
      ownerEmail: record.ownerEmail,
      shared: record.shared,
      webViewLink: record.webViewLink,
      iconLink: record.iconLink,
      // Omit textContent from raw data to avoid huge JSONB blobs
      // (text content is available via export API on demand)
      hasTextContent: record.textContent !== null,
      isGoogleFormat: record.isGoogleFormat,
      isFolder: record.isFolder,
      extension: record.extension,
      trashed: record.trashed,
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
