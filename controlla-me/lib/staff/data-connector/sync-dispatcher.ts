/**
 * Sync Dispatcher — End-to-end pipeline for integration sync.
 *
 * Full pipeline: FETCH → MAP → PERSIST → ANALYZE → INDEX → NOTIFY
 *
 * Replaces hardcoded SYNC_HANDLERS in the sync route with a plugin-based
 * registry. Adding a new connector to this registry + integration-sources.ts
 * is all that's needed for it to work with /api/integrations/[connectorId]/sync.
 *
 * Each connector registers a SyncHandlerFactory that creates a ConnectorInterface
 * given an access token (from the credential vault) and a DataSource config.
 *
 * The dispatcher handles the common pattern:
 *   1. FETCH — Resolve DataSource, create connector, call fetchAll()
 *   2. MAP — Apply field mapping via FieldMapper (rule → similarity → LLM)
 *   3. PERSIST — Upsert mapped records to crm_records (external_id dedup)
 *   4. ANALYZE — For document-type records, extract text + run 4-agent legal pipeline
 *   5. INDEX — Auto-index analysis results in vector DB for future searches
 *   6. NOTIFY — Emit events/callbacks for UI updates (SSE or polling-compatible)
 *
 * Architecture note: This registry is SEPARATE from plugin-registry.ts because
 * the sync route has a fundamentally different lifecycle — it receives an
 * access token from the vault (user-facing OAuth2) rather than reading from
 * env vars (pipeline/CLI mode). The plugin-registry is for the data-connector
 * pipeline; this is for the per-user sync API route.
 */

import type { ConnectorInterface, DataSource } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getIntegrationSourcesByConnector } from "@/scripts/integration-sources";
import { FieldMapper } from "./mapping";

// ─── Sync Result (same contract as before) ───

export interface SyncItem {
  external_id: string;
  source: string;
  entity_type: string;
  data: Record<string, unknown>;
  mapped_fields?: Record<string, unknown>;
  mapping_confidence?: number;
}

export interface SyncResult {
  itemCount: number;
  items: SyncItem[];
  error?: string;
}

// ─── Full Sync Result (end-to-end pipeline) ───

/** Per-record analysis result produced by the legal analysis pipeline. */
export interface RecordAnalysisResult {
  externalId: string;
  entityType: string;
  analysisId?: string;
  fairnessScore?: number;
  overallRisk?: string;
  error?: string;
}

/** Persist step result. */
export interface PersistResult {
  stored: number;
  failed: number;
  errors: Array<{ external_id: string; error: string }>;
}

/** Full end-to-end sync result across all pipeline stages. */
export interface FullSyncResult {
  // Stage 1-2: Fetch + Map
  itemsFetched: number;
  itemsMapped: number;
  fetchError?: string;

  // Stage 3: Persist
  persist: PersistResult;

  // Stage 4-5: Analyze + Index
  analysisResults: RecordAnalysisResult[];
  analysisSkipped: number;

  // Stage 6: Notify
  notified: boolean;

  // Timing
  durationMs: number;
  stageDurations: {
    fetchMs: number;
    mapMs: number;
    persistMs: number;
    analyzeMs: number;
    indexMs: number;
  };
}

/** Notification event emitted during sync. */
export interface SyncEvent {
  stage: "fetch" | "map" | "persist" | "analyze" | "index" | "complete" | "error";
  connectorId: string;
  progress?: { current: number; total: number };
  message: string;
  data?: Record<string, unknown>;
}

/** Callback for receiving sync progress events. */
export type SyncEventCallback = (event: SyncEvent) => void;

/** Options for the full end-to-end sync pipeline. */
export interface FullSyncOptions {
  fetchLimit?: number;
  skipMapping?: boolean;
  /** Skip the analysis pipeline (steps 4-5). Default: false. */
  skipAnalysis?: boolean;
  /** Only analyze records matching these entity types (e.g. "file", "invoice").
   *  If empty/undefined, only document-like entity types are analyzed. */
  analyzeEntityTypes?: string[];
  /** Maximum records to analyze per sync (prevents runaway costs). Default: 10. */
  maxAnalysisRecords?: number;
  /** Per-user connection config (from integration_connections.config). */
  connectionConfig?: Record<string, unknown>;
  /** Connection ID from integration_connections (for tracking auto-analysis source). */
  connectionId?: string;
  /** Callback for progress events (SSE, WebSocket, or polling updates). */
  onEvent?: SyncEventCallback;
  log?: (msg: string) => void;
}

// ─── Sync Handler Factory ───

/**
 * Factory function that creates a ConnectorInterface given:
 * - source: DataSource config from integration-sources.ts
 * - accessToken: OAuth2 token retrieved from the credential vault
 * - log: logging function
 *
 * The factory must return a connector that uses the provided accessToken
 * for all API calls (not env vars).
 */
export type SyncConnectorFactory = (
  source: DataSource,
  accessToken: string,
  log: (msg: string) => void
) => ConnectorInterface<Record<string, unknown>>;

/**
 * Transforms raw connector records into SyncItems.
 * If not provided, a default transformer is used that extracts
 * externalId and objectType from standard record shapes.
 */
export type RecordTransformer = (
  record: Record<string, unknown>,
  connectorId: string
) => { externalId: string; entityType: string };

// ─── Registry ───

interface SyncRegistryEntry {
  factory: SyncConnectorFactory;
  transformer?: RecordTransformer;
}

const syncRegistry = new Map<string, SyncRegistryEntry>();

/**
 * Register a connector's sync handler factory.
 *
 * @param connectorId - The connector ID as used in URL params (e.g. "hubspot", "google-drive")
 * @param factory - Factory that creates a ConnectorInterface with the given access token
 * @param transformer - Optional record transformer for extracting externalId/entityType
 */
export function registerSyncHandler(
  connectorId: string,
  factory: SyncConnectorFactory,
  transformer?: RecordTransformer
): void {
  syncRegistry.set(connectorId, { factory, transformer });
}

/**
 * Check if a sync handler is registered for a given connectorId.
 */
export function hasSyncHandler(connectorId: string): boolean {
  return syncRegistry.has(connectorId);
}

/**
 * List all registered sync handler connector IDs.
 */
export function listSyncHandlers(): string[] {
  return [...syncRegistry.keys()];
}

// ─── Default record transformer ───

/**
 * Default transformer that extracts externalId and entityType from records
 * following the common connector patterns:
 *   - externalId from: externalId, external_id, id
 *   - entityType from: objectType, object_type, entity_type, type
 */
function defaultTransformer(
  record: Record<string, unknown>,
  connectorId: string
): { externalId: string; entityType: string } {
  const externalId = String(
    record.externalId ?? record.external_id ?? record.id ?? ""
  );
  const entityType = String(
    record.objectType ?? record.object_type ?? record.entity_type ?? record.type ?? "record"
  );

  // If entityType is still generic, use connectorId as prefix
  return {
    externalId,
    entityType: entityType === "record" ? `${connectorId}_record` : entityType,
  };
}

// ─── Sync Execution ───

/**
 * Execute a sync for a given connector using the registered handler.
 *
 * This is the main entry point for the sync route. It:
 * 1. Looks up the connector's sync handler from the registry
 * 2. Finds the DataSource config from integration-sources
 * 3. Creates the connector with the vault-provided access token
 * 4. Calls fetchAll() to retrieve records
 * 5. Applies field mapping via FieldMapper
 * 6. Returns a SyncResult
 *
 * @param connectorId - Connector ID from URL params (e.g. "hubspot")
 * @param accessToken - OAuth2 access token from credential vault
 * @param options - Optional: fetchLimit, skipMapping
 * @returns SyncResult with items and metadata
 */
export async function executeSyncForConnector(
  connectorId: string,
  accessToken: string,
  options?: {
    fetchLimit?: number;
    skipMapping?: boolean;
    log?: (msg: string) => void;
    /** Per-user connection config (from integration_connections.config).
     *  Merged into DataSource.config so connectors can access user-specific
     *  settings like companyId, instanceUrl, etc. */
    connectionConfig?: Record<string, unknown>;
  }
): Promise<SyncResult> {
  const log = options?.log ?? console.log;

  // 1. Resolve sync handler from registry
  const entry = syncRegistry.get(connectorId);
  if (!entry) {
    return {
      itemCount: 0,
      items: [],
      error: `Sync non supportato per connettore '${connectorId}'. ` +
        `Connettori registrati: ${listSyncHandlers().join(", ") || "(nessuno)"}`,
    };
  }

  // 2. Find DataSource config from integration-sources
  const sources = getIntegrationSourcesByConnector(connectorId);
  if (sources.length === 0) {
    return {
      itemCount: 0,
      items: [],
      error: `Nessuna configurazione trovata per connettore '${connectorId}' in integration-sources`,
    };
  }

  // Use the first source config, merged with per-user connection config.
  // Per-user config (e.g. companyId, instanceUrl) overrides template defaults.
  const templateSource = sources[0];
  const source: DataSource = options?.connectionConfig
    ? { ...templateSource, config: { ...templateSource.config, ...options.connectionConfig } }
    : templateSource;

  try {
    // 3. Create connector with vault-provided access token
    const connector = entry.factory(source, accessToken, log);

    // 4. Fetch records
    const fetchResult = await connector.fetchAll({
      limit: options?.fetchLimit ?? 200,
    });

    // 5. Transform and map fields
    const transformer = entry.transformer ?? defaultTransformer;
    const mapper = options?.skipMapping ? null : new FieldMapper();

    const items: SyncItem[] = await Promise.all(
      fetchResult.items.map(async (rawRecord) => {
        const record = rawRecord as Record<string, unknown>;
        const { externalId, entityType } = transformer(record, connectorId);

        const item: SyncItem = {
          external_id: externalId,
          source: connectorId,
          entity_type: entityType,
          data: record,
        };

        // Apply field mapping if not skipped
        if (mapper) {
          try {
            const mapped = await mapper.mapFields(
              record,
              connectorId,
              entityType,
              { skipLLM: true }
            );
            item.mapped_fields = mapped.fields;
            item.mapping_confidence = mapped.confidence;
          } catch (err) {
            log(
              `[Sync:${connectorId}] Mapping failed for ${entityType} ${externalId}: ` +
                (err instanceof Error ? err.message : String(err))
            );
          }
        }

        return item;
      })
    );

    return { itemCount: items.length, items };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { itemCount: 0, items: [], error: message };
  }
}

// ─── Entity types eligible for document analysis ───

/** Entity types that contain document content eligible for legal analysis.
 *  These are records where the raw data includes extractable text
 *  (e.g. PDF invoices, contracts from Google Drive, attached documents). */
const DOCUMENT_ENTITY_TYPES = new Set([
  "file",               // Google Drive files
  "document",           // Generic documents
  "issued_invoice",     // Fatture in Cloud — issued invoices (may have PDF attachment)
  "received_invoice",   // Fatture in Cloud — received invoices
  "invoice",            // Generic invoices
  "contract",           // Contracts
  "attachment",         // Email/CRM attachments
]);

/** MIME types that contain analyzable text content. */
const ANALYZABLE_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
  "text/html",
  "application/vnd.google-apps.document", // Google Docs (exportable to text)
]);

// ─── Persist SyncItems into crm_records ───

/**
 * Upserts SyncItems into the crm_records table.
 *
 * Uses the UNIQUE constraint on (user_id, connector_source, object_type, external_id)
 * to update existing records on re-sync rather than creating duplicates.
 *
 * Processes items in batches to avoid hitting Supabase request size limits.
 * Individual record failures do not kill the batch.
 */
export async function persistSyncItems(
  admin: SupabaseClient,
  userId: string,
  connectorId: string,
  items: SyncItem[]
): Promise<PersistResult> {
  if (items.length === 0) {
    return { stored: 0, failed: 0, errors: [] };
  }

  const BATCH_SIZE = 50;
  let stored = 0;
  let failed = 0;
  const errors: Array<{ external_id: string; error: string }> = [];

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);

    const rows = batch.map((item) => ({
      user_id: userId,
      connector_source: connectorId,
      object_type: item.entity_type,
      external_id: item.external_id,
      data: item.data,
      mapped_fields: item.mapped_fields ?? {},
      synced_at: new Date().toISOString(),
    }));

    const { data, error } = await admin
      .from("crm_records")
      .upsert(rows, {
        onConflict: "user_id,connector_source,object_type,external_id",
        ignoreDuplicates: false,
      })
      .select("id");

    if (error) {
      // Batch failed — fall back to individual inserts for granular error tracking
      console.error(
        `[Sync:${connectorId}] Batch upsert failed (${batch.length} items): ${error.message}`
      );

      for (const item of batch) {
        const { error: itemError } = await admin
          .from("crm_records")
          .upsert(
            {
              user_id: userId,
              connector_source: connectorId,
              object_type: item.entity_type,
              external_id: item.external_id,
              data: item.data,
              mapped_fields: item.mapped_fields ?? {},
              synced_at: new Date().toISOString(),
            },
            {
              onConflict: "user_id,connector_source,object_type,external_id",
              ignoreDuplicates: false,
            }
          );

        if (itemError) {
          failed++;
          errors.push({
            external_id: item.external_id,
            error: itemError.message,
          });
        } else {
          stored++;
        }
      }
    } else {
      stored += data?.length ?? batch.length;
    }
  }

  return { stored, failed, errors };
}

// ─── Document text extraction helpers ───

/**
 * Determines if a synced record contains analyzable document content.
 * Checks entity type, MIME type, and whether text content is available.
 */
function isAnalyzableRecord(
  item: SyncItem,
  allowedTypes?: string[]
): boolean {
  // Custom allowed entity types override the defaults
  const eligibleTypes = allowedTypes
    ? new Set(allowedTypes)
    : DOCUMENT_ENTITY_TYPES;

  if (!eligibleTypes.has(item.entity_type)) return false;

  // Check if the record has a MIME type we can analyze
  const mimeType = String(
    item.data.mimeType ?? item.data.mime_type ?? item.data.content_type ?? ""
  );
  if (mimeType && ANALYZABLE_MIME_TYPES.has(mimeType)) return true;

  // Check if the record has inline text content (e.g. description, body, notes)
  const textContent = item.data.description ?? item.data.body ?? item.data.notes ?? item.data.content;
  if (typeof textContent === "string" && textContent.length >= 50) return true;

  // Check if file name suggests a document
  const fileName = String(item.data.name ?? item.data.fileName ?? item.data.file_name ?? "");
  if (/\.(pdf|docx?|txt)$/i.test(fileName)) return true;

  return false;
}

/**
 * Extracts analyzable text from a synced record.
 * Handles inline text content and file download+extraction.
 *
 * @returns Extracted text or null if not extractable
 */
async function extractRecordText(
  item: SyncItem,
  connectorId: string,
  accessToken: string,
  log: (msg: string) => void
): Promise<string | null> {
  // Priority 1: Inline text fields in the record data
  for (const field of ["body", "content", "description", "notes", "text", "articleText"]) {
    const text = item.data[field];
    if (typeof text === "string" && text.length >= 50) {
      log(`[Analyze:${connectorId}] ${item.external_id}: Using inline text from '${field}' (${text.length} chars)`);
      return text;
    }
  }

  // Priority 2: Download file content via connector-specific URL
  const downloadUrl = item.data.downloadUrl ?? item.data.download_url ?? item.data.webContentLink;
  const mimeType = String(item.data.mimeType ?? item.data.mime_type ?? "");

  if (typeof downloadUrl === "string" && downloadUrl.startsWith("http")) {
    try {
      log(`[Analyze:${connectorId}] ${item.external_id}: Downloading file...`);
      const response = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        log(`[Analyze:${connectorId}] ${item.external_id}: Download failed (${response.status})`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Size guard: skip files > 20MB
      if (buffer.length > 20 * 1024 * 1024) {
        log(`[Analyze:${connectorId}] ${item.external_id}: File too large (${(buffer.length / 1024 / 1024).toFixed(1)}MB), skipping`);
        return null;
      }

      const fileName = String(item.data.name ?? item.data.fileName ?? "document");
      const { extractText } = await import("@/lib/extract-text");
      const text = await extractText(buffer, mimeType, fileName);

      if (text && text.trim().length >= 50) {
        log(`[Analyze:${connectorId}] ${item.external_id}: Extracted ${text.length} chars from ${fileName}`);
        return text;
      }
    } catch (err) {
      log(`[Analyze:${connectorId}] ${item.external_id}: Text extraction failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Priority 3: Google Drive export link for native docs
  if (connectorId === "google-drive" && item.data.mimeType === "application/vnd.google-apps.document") {
    try {
      const fileId = item.external_id;
      const exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
      log(`[Analyze:${connectorId}] ${item.external_id}: Exporting Google Doc as text...`);

      const response = await fetch(exportUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.ok) {
        const text = await response.text();
        if (text.trim().length >= 50) {
          log(`[Analyze:${connectorId}] ${item.external_id}: Exported ${text.length} chars from Google Doc`);
          return text;
        }
      }
    } catch (err) {
      log(`[Analyze:${connectorId}] ${item.external_id}: Google Doc export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return null;
}

// ─── Full End-to-End Sync Pipeline ───

/**
 * Execute the full end-to-end sync pipeline for a connector.
 *
 * Pipeline stages:
 *   1. FETCH — Retrieve records from the external connector
 *   2. MAP — Apply field mapping (rule -> similarity -> LLM)
 *   3. PERSIST — Upsert mapped records to crm_records table
 *   4. ANALYZE — For document records, run the 4-agent legal analysis pipeline
 *   5. INDEX — Auto-index analysis results in vector DB
 *   6. NOTIFY — Emit completion event with summary
 *
 * Error resilience: individual record failures at any stage do not kill the
 * pipeline. Failed records are tracked in the result and the pipeline
 * continues with the remaining records.
 *
 * @param admin - Supabase admin client (service role)
 * @param userId - Authenticated user ID
 * @param connectorId - Connector ID from URL params (e.g. "hubspot")
 * @param accessToken - OAuth2 access token from credential vault
 * @param options - Pipeline configuration
 * @returns FullSyncResult with per-stage metrics
 */
export async function executeFullSync(
  admin: SupabaseClient,
  userId: string,
  connectorId: string,
  accessToken: string,
  options: FullSyncOptions = {}
): Promise<FullSyncResult> {
  const log = options.log ?? console.log;
  const emit = options.onEvent ?? (() => {});
  const pipelineStart = Date.now();

  const stageDurations = {
    fetchMs: 0,
    mapMs: 0,
    persistMs: 0,
    analyzeMs: 0,
    indexMs: 0,
  };

  const result: FullSyncResult = {
    itemsFetched: 0,
    itemsMapped: 0,
    persist: { stored: 0, failed: 0, errors: [] },
    analysisResults: [],
    analysisSkipped: 0,
    notified: false,
    durationMs: 0,
    stageDurations,
  };

  // ── Stage 1-2: FETCH + MAP (delegates to executeSyncForConnector) ──

  const fetchStart = Date.now();
  emit({
    stage: "fetch",
    connectorId,
    message: `Avvio sync da ${connectorId}...`,
  });

  const syncResult = await executeSyncForConnector(connectorId, accessToken, {
    fetchLimit: options.fetchLimit,
    skipMapping: options.skipMapping,
    connectionConfig: options.connectionConfig,
    log,
  });

  stageDurations.fetchMs = Date.now() - fetchStart;

  if (syncResult.error) {
    result.fetchError = syncResult.error;
    result.durationMs = Date.now() - pipelineStart;
    emit({
      stage: "error",
      connectorId,
      message: `Errore fetch: ${syncResult.error}`,
      data: { error: syncResult.error },
    });
    return result;
  }

  result.itemsFetched = syncResult.itemCount;
  result.itemsMapped = syncResult.items.filter((i) => i.mapped_fields).length;

  emit({
    stage: "map",
    connectorId,
    progress: { current: result.itemsMapped, total: syncResult.itemCount },
    message: `${syncResult.itemCount} record recuperati, ${result.itemsMapped} mappati`,
  });

  log(
    `[FullSync:${connectorId}] Fetch+Map: ${syncResult.itemCount} fetched, ${result.itemsMapped} mapped in ${stageDurations.fetchMs}ms`
  );

  // ── Stage 3: PERSIST ──

  const persistStart = Date.now();
  emit({
    stage: "persist",
    connectorId,
    progress: { current: 0, total: syncResult.itemCount },
    message: `Salvataggio ${syncResult.itemCount} record...`,
  });

  result.persist = await persistSyncItems(
    admin,
    userId,
    connectorId,
    syncResult.items
  );

  stageDurations.persistMs = Date.now() - persistStart;

  emit({
    stage: "persist",
    connectorId,
    progress: { current: result.persist.stored, total: syncResult.itemCount },
    message: `${result.persist.stored} salvati, ${result.persist.failed} errori`,
    data: {
      stored: result.persist.stored,
      failed: result.persist.failed,
    },
  });

  log(
    `[FullSync:${connectorId}] Persist: ${result.persist.stored} stored, ${result.persist.failed} failed in ${stageDurations.persistMs}ms`
  );

  // ── Stage 4-5: ANALYZE + INDEX (document-type records only) ──
  //
  // Delegates to auto-analyzer.ts for the full analysis pipeline:
  //   - Eligibility filtering (entity type, MIME, text length)
  //   - Dedup check (skip already-analyzed documents by hash)
  //   - Text extraction (inline, download, Google Docs export)
  //   - 4-agent legal analysis pipeline (orchestrator.ts)
  //   - Results storage in analyses table
  //   - User notification creation
  //   - crm_records metadata update
  //
  // The auto-analyzer runs analyses in series to respect API rate limits.

  if (options.skipAnalysis) {
    result.analysisSkipped = syncResult.itemCount;
    log(`[FullSync:${connectorId}] Analysis: skipped (skipAnalysis=true)`);
  } else {
    const analyzeStart = Date.now();

    try {
      const { autoAnalyzeRecords } = await import("./auto-analyzer");

      const analyzerSummary = await autoAnalyzeRecords(
        admin,
        syncResult.items,
        {
          userId,
          connectionId: options.connectionId ?? "",
          connectorId,
          accessToken,
          maxAnalyses: options.maxAnalysisRecords ?? 10,
          analyzeEntityTypes: options.analyzeEntityTypes,
          onEvent: options.onEvent,
          log,
        }
      );

      // Map auto-analyzer results back to FullSyncResult format
      result.analysisResults = analyzerSummary.results.map((r) => ({
        externalId: r.externalId,
        entityType: r.entityType,
        analysisId: r.analysisId,
        fairnessScore: r.fairnessScore,
        overallRisk: r.overallRisk,
        error: r.error,
      }));
      result.analysisSkipped = analyzerSummary.skipped + analyzerSummary.extractionFailed;

      log(
        `[FullSync:${connectorId}] Analysis: ${analyzerSummary.analyzed} analyzed, ` +
        `${analyzerSummary.analysisFailed} failed, ${analyzerSummary.skipped} skipped, ` +
        `${analyzerSummary.extractionFailed} extraction failed ` +
        `in ${(analyzerSummary.durationMs / 1000).toFixed(1)}s`
      );
    } catch (err) {
      // Auto-analyzer failure should not kill the sync pipeline
      const errMsg = err instanceof Error ? err.message : String(err);
      log(`[FullSync:${connectorId}] Analysis: auto-analyzer failed — ${errMsg}`);
      result.analysisSkipped = syncResult.itemCount;
    }

    stageDurations.analyzeMs = Date.now() - analyzeStart;

    // ── Stage 5: INDEX (non-document records metadata) ──
    //
    // Note: document analysis indexing is handled automatically by the
    // orchestrator's Step 6 (autoIndexAnalysis), which is fire-and-forget.
    // This step indexes CRM/ERP metadata for non-document records so they
    // become searchable context for future analyses.

    const indexStart = Date.now();

    try {
      const { isVectorDBEnabled } = await import("@/lib/embeddings");
      if (isVectorDBEnabled() && syncResult.items.length > 0) {
        const { indexSyncMetadata } = await import("./sync-indexer");
        const indexed = await indexSyncMetadata(
          connectorId,
          userId,
          syncResult.items,
          log
        );
        if (indexed > 0) {
          log(`[FullSync:${connectorId}] Index: ${indexed} metadata entries indexed`);
        }
      }
    } catch {
      // Non-fatal: vector DB indexing is optional
      log(`[FullSync:${connectorId}] Index: skipped (vector DB not available or indexer not found)`);
    }

    stageDurations.indexMs = Date.now() - indexStart;
  }

  // ── Stage 6: NOTIFY ──

  const analysisSuccessCount = result.analysisResults.filter((r) => r.analysisId).length;
  const analysisFailCount = result.analysisResults.filter((r) => r.error).length;

  result.notified = true;
  result.durationMs = Date.now() - pipelineStart;

  emit({
    stage: "complete",
    connectorId,
    message:
      `Sync completato: ${result.persist.stored} record salvati` +
      (analysisSuccessCount > 0 ? `, ${analysisSuccessCount} analizzati` : "") +
      (analysisFailCount > 0 ? `, ${analysisFailCount} analisi fallite` : "") +
      ` in ${(result.durationMs / 1000).toFixed(1)}s`,
    data: {
      itemsFetched: result.itemsFetched,
      itemsMapped: result.itemsMapped,
      stored: result.persist.stored,
      failed: result.persist.failed,
      analyzed: analysisSuccessCount,
      analysisFailed: analysisFailCount,
      durationMs: result.durationMs,
    },
  });

  log(
    `[FullSync:${connectorId}] Complete: ` +
    `${result.itemsFetched} fetched → ${result.itemsMapped} mapped → ` +
    `${result.persist.stored} stored → ${analysisSuccessCount} analyzed ` +
    `in ${(result.durationMs / 1000).toFixed(1)}s ` +
    `(fetch=${stageDurations.fetchMs}ms, persist=${stageDurations.persistMs}ms, ` +
    `analyze=${stageDurations.analyzeMs}ms, index=${stageDurations.indexMs}ms)`
  );

  return result;
}

// ─── Built-in sync handler registrations ───
// Each connector registers how to create itself in "sync mode" (with vault token).

registerSyncHandler(
  "google-drive",
  (_source, accessToken, _log) => {
    // Google Drive in sync mode: direct API calls with Bearer token.
    // We create a lightweight adapter that implements ConnectorInterface
    // since GoogleDriveConnector reads auth from env vars, not from vault.
    return {
      async connect() {
        return {
          sourceId: _source.id,
          ok: true,
          message: "Google Drive sync mode",
          census: { estimatedItems: 0, availableFormats: [], sampleFields: [] },
        };
      },
      async fetchAll(options) {
        const limit = options?.limit ?? 50;
        const response = await fetch(
          `https://www.googleapis.com/drive/v3/files?pageSize=${limit}&fields=files(id,name,mimeType,size,createdTime,modifiedTime,parents,shared)`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Google Drive API error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const files = (data.files ?? []) as Record<string, unknown>[];

        return {
          sourceId: _source.id,
          items: files,
          fetchedAt: new Date().toISOString(),
          metadata: { authMode: "vault-token" },
        };
      },
      async fetchDelta(_since, options) {
        // Delta not used by sync route, delegate to fetchAll
        return this.fetchAll(options);
      },
    };
  },
  // Google Drive records use 'id' as externalId and 'mimeType' categorized as entityType
  (record) => ({
    externalId: String(record.id ?? ""),
    entityType: "file",
  })
);

registerSyncHandler(
  "hubspot",
  (source, accessToken, log) => {
    // HubSpot supports explicit accessToken via constructor options
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { HubSpotConnector } = require("./connectors/hubspot");
    return new HubSpotConnector(source, log, { accessToken });
  },
  (record) => ({
    externalId: String(record.externalId ?? record.id ?? ""),
    entityType: String(record.objectType ?? "record"),
  })
);

registerSyncHandler(
  "salesforce",
  (source, accessToken, log) => {
    // Salesforce: create connector and override the access token.
    // The SalesforceConnector reads SALESFORCE_ACCESS_TOKEN from env,
    // but in sync mode we need to use the vault-provided token.
    // We temporarily set the env var and create the connector.
    const originalToken = process.env.SALESFORCE_ACCESS_TOKEN;
    process.env.SALESFORCE_ACCESS_TOKEN = accessToken;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { SalesforceConnector } = require("./connectors/salesforce");
      return new SalesforceConnector(source, log);
    } finally {
      // Restore original env var
      if (originalToken !== undefined) {
        process.env.SALESFORCE_ACCESS_TOKEN = originalToken;
      } else {
        delete process.env.SALESFORCE_ACCESS_TOKEN;
      }
    }
  },
  (record) => ({
    externalId: String(record.externalId ?? record.Id ?? record.id ?? ""),
    entityType: String(record.objectType ?? "record"),
  })
);

registerSyncHandler(
  "fatture-in-cloud",
  (source, accessToken, _log) => {
    // Fatture in Cloud uses AuthenticatedBaseConnector.
    // In sync mode, we need to inject the vault token.
    // The connector expects OAuth2 via parent class — we create it with
    // auth options that will use the explicit token.
    // For now, we create a lightweight fetch-based adapter similar to google-drive.
    return {
      async connect() {
        return {
          sourceId: source.id,
          ok: true,
          message: "Fatture in Cloud sync mode",
          census: { estimatedItems: 0, availableFormats: [], sampleFields: [] },
        };
      },
      async fetchAll(options) {
        const limit = options?.limit ?? 50;
        const companyId = source.config.companyId as string | undefined;
        if (!companyId) {
          throw new Error("Fatture in Cloud: companyId mancante nella config");
        }

        const API_BASE = "https://api-v2.fattureincloud.it";
        const allItems: Record<string, unknown>[] = [];

        // Fetch issued invoices
        const issuedRes = await fetch(
          `${API_BASE}/c/${companyId}/issued_documents/invoices?type=invoice&per_page=${Math.min(limit, 50)}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: "application/json",
            },
          }
        );
        if (issuedRes.ok) {
          const body = await issuedRes.json() as { data?: Record<string, unknown>[] };
          for (const inv of body.data ?? []) {
            allItems.push({ ...inv, _sync_type: "issued_invoice" });
          }
        }

        // Fetch received invoices (if under limit)
        if (allItems.length < limit) {
          const receivedRes = await fetch(
            `${API_BASE}/c/${companyId}/received_documents?type=invoice&per_page=${Math.min(limit - allItems.length, 50)}`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/json",
              },
            }
          );
          if (receivedRes.ok) {
            const body = await receivedRes.json() as { data?: Record<string, unknown>[] };
            for (const inv of body.data ?? []) {
              allItems.push({ ...inv, _sync_type: "received_invoice" });
            }
          }
        }

        return {
          sourceId: source.id,
          items: allItems,
          fetchedAt: new Date().toISOString(),
          metadata: { companyId, authMode: "vault-token" },
        };
      },
      async fetchDelta(_since, options) {
        return this.fetchAll(options);
      },
    };
  },
  (record) => ({
    externalId: String(record.id ?? ""),
    entityType: String(record._sync_type ?? "invoice"),
  })
);

registerSyncHandler(
  "stripe",
  (source, _accessToken, log) => {
    // Stripe uses STRIPE_SECRET_KEY from env (not OAuth2 per-user).
    // The accessToken from vault is typically not used for Stripe
    // (Stripe uses API keys, not OAuth2 tokens).
    // We still register it so the sync route doesn't reject it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { StripeConnector } = require("./connectors/stripe");
    return new StripeConnector(source, log);
  },
  (record) => ({
    externalId: String(record.externalId ?? record.id ?? ""),
    entityType: String(record.objectType ?? "record"),
  })
);

// ── Universal REST Connector (any API) ──
// Sync handler for user-configured REST APIs. The accessToken is injected
// as a Bearer Authorization header via the source's auth config.
registerSyncHandler(
  "universal-rest",
  (source, accessToken, log) => {
    // Inject the vault-provided token into the source auth config.
    // UniversalRESTConnector extends AuthenticatedBaseConnector which
    // reads auth from source.auth. We override it with the vault token.
    const enrichedSource = {
      ...source,
      auth: {
        type: "api-key" as const,
        header: "Authorization",
        prefix: "Bearer ",
        // Signal to AuthenticatedBaseConnector to use this token
        envVar: "__SYNC_VAULT_TOKEN__",
      },
    };
    // Temporarily set the env var so AuthenticatedBaseConnector can read it
    const prevVal = process.env.__SYNC_VAULT_TOKEN__;
    process.env.__SYNC_VAULT_TOKEN__ = accessToken;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { UniversalRESTConnector } = require("./connectors/universal-rest");
      return new UniversalRESTConnector(enrichedSource, log);
    } finally {
      if (prevVal !== undefined) {
        process.env.__SYNC_VAULT_TOKEN__ = prevVal;
      } else {
        delete process.env.__SYNC_VAULT_TOKEN__;
      }
    }
  },
  (record) => ({
    externalId: String(record.externalId ?? record.id ?? ""),
    entityType: String(record.objectType ?? record.entity_type ?? "record"),
  })
);

// ── CSV/Excel Connector (file upload) ──
// CSV doesn't use access tokens — files are provided inline or via URL.
// We register it so the sync route can orchestrate CSV imports too.
registerSyncHandler(
  "csv",
  (source, _accessToken, log) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { CSVConnector } = require("./connectors/csv-connector");
    return new CSVConnector(source, log);
  },
  (record) => ({
    externalId: String(record.externalId ?? record.id ?? `row-${Math.random().toString(36).slice(2, 8)}`),
    entityType: String(record.objectType ?? record.entityType ?? "csv_record"),
  })
);
