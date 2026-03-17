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
 *
 * Features:
 *   - Text content storage: extracted text from Google Workspace exports and binary files
 *     (PDF/DOCX) is stored in mapped_fields.text_content for search/analysis
 *   - Version tracking: md5Checksum stored in mapped_fields for change detection.
 *     On upsert, the store compares checksums to detect actual content changes.
 *   - Batch upsert: 50 records per batch (smaller than CRM stores due to text content size)
 *   - Folder path enrichment: stores resolved folder paths for navigation
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { validateDriveRecord } from "../models/google-drive-record-model";
import type { StoreInterface, StoreResult } from "../types";
import type { DriveRecord } from "../parsers/google-drive-parser";

/** Batch size for upserts — smaller than CRM stores due to potential text content */
const BATCH_SIZE = 50;

/** Max text content size to store in mapped_fields (500 KB) */
const MAX_TEXT_CONTENT_SIZE = 512_000;

/**
 * System user UUID for backend syncs (Google Drive has no user context in demo mode).
 * Same well-known constant used by StripeStore.
 */
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

export class GoogleDriveStore implements StoreInterface<DriveRecord> {
  private previousChecksums: Map<string, string> | null = null;

  constructor(private log: (msg: string) => void = console.log) {}

  /**
   * Pre-load existing checksums from the DB for change detection.
   * Call this before save() to enable version tracking.
   * Records that haven't changed (same checksum) will be skipped.
   */
  async loadPreviousChecksums(): Promise<void> {
    try {
      const admin = createAdminClient();

      const { data, error } = await admin
        .from("crm_records" as "connector_sync_log")
        .select("external_id, mapped_fields")
        .eq("connector_source" as never, "google-drive" as never)
        .eq("user_id" as never, SYSTEM_USER_ID as never);

      if (error) {
        this.log(`[GDRIVE-STORE] Warning: could not load previous checksums: ${error.message}`);
        return;
      }

      this.previousChecksums = new Map();
      for (const row of data ?? []) {
        const mf = row.mapped_fields as Record<string, unknown> | null;
        const checksum = mf?.md5_checksum as string | null;
        if (checksum) {
          this.previousChecksums.set(
            row.external_id as string,
            checksum
          );
        }
      }

      this.log(
        `[GDRIVE-STORE] Loaded ${this.previousChecksums.size} previous checksums for version tracking`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log(`[GDRIVE-STORE] Warning: checksum preload failed: ${msg}`);
    }
  }

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
    let skippedUnchanged = 0;

    for (const record of records) {
      const validation = validateDriveRecord(record);
      if (!validation.valid) {
        errorDetails.push({
          item: record.externalId ?? "unknown",
          error: validation.errors.join("; "),
        });
        continue;
      }

      // Version tracking: skip records with unchanged checksum
      if (this.previousChecksums && record.md5Checksum) {
        const prev = this.previousChecksums.get(record.externalId);
        if (prev && prev === record.md5Checksum) {
          skippedUnchanged++;
          continue;
        }
      }

      validRecords.push(record);
    }

    if (skippedUnchanged > 0) {
      this.log(
        `[GDRIVE-STORE] Skipped ${skippedUnchanged} unchanged records (same checksum)`
      );
    }

    if (validRecords.length === 0) {
      this.log("[GDRIVE-STORE] No valid records to save");
      return {
        inserted: 0,
        updated: 0,
        skipped: skippedUnchanged,
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
      `[GDRIVE-STORE] Done | inserted/updated: ${totalInserted} | skipped: ${skippedUnchanged} | errors: ${errorDetails.length}`
    );

    return {
      inserted: totalInserted,
      updated: 0, // Cannot distinguish — same as StripeStore
      skipped: skippedUnchanged,
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
 *   data JSONB NOT NULL               — full DriveRecord (metadata only, no text to avoid bloat)
 *   mapped_fields JSONB               — normalized key fields + text content + checksum
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

  // Truncate text content if too large for JSONB storage
  let textContentForStorage: string | null = null;
  if (record.textContent) {
    if (record.textContent.length > MAX_TEXT_CONTENT_SIZE) {
      textContentForStorage =
        record.textContent.slice(0, MAX_TEXT_CONTENT_SIZE) + "\n[TRUNCATED]";
    } else {
      textContentForStorage = record.textContent;
    }
  }

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
    // Version tracking: store checksum for change detection
    md5_checksum: record.md5Checksum,
    // Text content: stored here for search/analysis access
    has_text_content: textContentForStorage !== null,
    text_content: textContentForStorage,
    text_extracted_from_binary: record.textExtractedFromBinary,
    // Folder path (resolved during traversal)
    folder_path: record.folderPath,
    // Last modifier for audit
    last_modified_by_email: record.lastModifiedByEmail,
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

    // Raw data: full DriveRecord as JSONB (metadata only — text omitted to avoid huge blobs)
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
      // Text content is stored in mapped_fields.text_content instead
      hasTextContent: record.textContent !== null,
      textExtractedFromBinary: record.textExtractedFromBinary,
      needsBinaryExtraction: record.needsBinaryExtraction,
      isGoogleFormat: record.isGoogleFormat,
      isFolder: record.isFolder,
      extension: record.extension,
      trashed: record.trashed,
      md5Checksum: record.md5Checksum,
      folderPath: record.folderPath,
      lastModifiedByEmail: record.lastModifiedByEmail,
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
