/**
 * Auto-Analyzer — Automatic legal analysis on documents imported via integration sync.
 *
 * Receives synced records from the sync dispatcher's ANALYZE stage and determines
 * which ones need legal analysis. Eligible documents are run through the full
 * 4-agent pipeline (orchestrator.ts) and results are stored in the `analyses` table.
 *
 * Design principles:
 * - **Cost-conscious**: Configurable cap on max analyses per sync run (default 10).
 * - **Rate-limit respectful**: Analyses run in series, never parallel.
 * - **Robust**: Individual document failures never crash the pipeline.
 * - **Dedup-aware**: Skips documents already analyzed (by document hash).
 * - **Notification-ready**: Creates notification records for each completed analysis.
 *
 * Pipeline integration:
 *   sync-dispatcher.ts executeFullSync() → Stage 4 ANALYZE → autoAnalyzeRecords()
 */

import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SyncItem, RecordAnalysisResult, SyncEventCallback } from "./sync-dispatcher";
import type { OrchestratorResult } from "@/lib/agents/orchestrator";

// ─── Configuration ───

/** Default maximum analyses per sync run (prevents runaway API costs). */
const DEFAULT_MAX_ANALYSES = 10;

/** Minimum text length required for analysis (skip trivial content). */
const MIN_TEXT_LENGTH = 200;

/** Entity types eligible for automatic legal analysis. */
const ANALYZABLE_ENTITY_TYPES = new Set([
  "file",               // Google Drive files (contracts, agreements)
  "document",           // Generic documents
  "contract",           // Explicit contracts
  "issued_invoice",     // Fatture in Cloud — issued invoices
  "received_invoice",   // Fatture in Cloud — received invoices
  "invoice",            // Generic invoices
  "attachment",         // Email/CRM attachments (HubSpot deal docs)
]);

/** MIME types that typically contain analyzable legal content. */
const ANALYZABLE_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
  "text/html",
  "application/vnd.google-apps.document",
]);

// ─── Types ───

/** Configuration for the auto-analyzer. */
export interface AutoAnalyzerConfig {
  /** Maximum documents to analyze per sync run. Default: 10. */
  maxAnalyses?: number;
  /** Override entity types eligible for analysis. */
  analyzeEntityTypes?: string[];
  /** Skip the dedup check (analyze even if already analyzed). */
  skipDedup?: boolean;
  /** User ID that owns these records (for DB storage). */
  userId: string;
  /** Connection ID from integration_connections (for metadata tracking). */
  connectionId: string;
  /** Connector ID (e.g. "hubspot", "google-drive"). */
  connectorId: string;
  /** OAuth2 access token for downloading file content. */
  accessToken: string;
  /** Callback for emitting progress events. */
  onEvent?: SyncEventCallback;
  /** Logger function. */
  log?: (msg: string) => void;
}

/** Per-document analysis result with extra metadata. */
export interface AutoAnalysisResult extends RecordAnalysisResult {
  /** Document name/title for notification display. */
  documentName: string;
  /** Key findings summary for notification. */
  findingsSummary: string;
  /** Hash of the document text (for dedup). */
  documentHash: string;
  /** ID in the analyses table. */
  analysisDbId?: string;
}

/** Summary of the auto-analysis run. */
export interface AutoAnalyzerSummary {
  /** Total records evaluated for eligibility. */
  totalEvaluated: number;
  /** Records that passed eligibility filters. */
  eligible: number;
  /** Records skipped (already analyzed, ineligible, etc.). */
  skipped: number;
  /** Records where text extraction failed. */
  extractionFailed: number;
  /** Records successfully analyzed. */
  analyzed: number;
  /** Records where analysis failed. */
  analysisFailed: number;
  /** Per-document results. */
  results: AutoAnalysisResult[];
  /** Total duration in milliseconds. */
  durationMs: number;
}

// ─── Eligibility Checks ───

/**
 * Determines if a synced record is eligible for automatic legal analysis.
 *
 * Checks:
 * 1. Entity type is in the allowed set
 * 2. MIME type is analyzable OR record has inline text content
 * 3. File name suggests a legal document (if available)
 */
function isEligibleForAnalysis(
  item: SyncItem,
  allowedTypes?: string[]
): boolean {
  const eligibleTypes = allowedTypes
    ? new Set(allowedTypes)
    : ANALYZABLE_ENTITY_TYPES;

  if (!eligibleTypes.has(item.entity_type)) return false;

  // Check MIME type
  const mimeType = String(
    item.data.mimeType ?? item.data.mime_type ?? item.data.content_type ?? ""
  );
  if (mimeType && ANALYZABLE_MIME_TYPES.has(mimeType)) return true;

  // Check inline text content
  for (const field of ["body", "content", "description", "notes", "text", "articleText"]) {
    const val = item.data[field];
    if (typeof val === "string" && val.length >= MIN_TEXT_LENGTH) return true;
  }

  // Check file extension
  const fileName = String(item.data.name ?? item.data.fileName ?? item.data.file_name ?? "");
  if (/\.(pdf|docx?|txt)$/i.test(fileName)) return true;

  return false;
}

/**
 * Computes a SHA-256 hash of the document text (first 16 hex chars).
 * Used for deduplication against existing analyses.
 */
function hashText(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/**
 * Extracts a human-readable document name from a synced record.
 */
function getDocumentName(item: SyncItem): string {
  return String(
    item.data.name ??
    item.data.fileName ??
    item.data.file_name ??
    item.data.subject ??
    item.data.title ??
    `${item.entity_type} ${item.external_id}`
  );
}

/**
 * Checks if a document with this text hash has already been analyzed.
 * Prevents re-analyzing the same document content across sync runs.
 */
async function isAlreadyAnalyzed(
  admin: SupabaseClient,
  userId: string,
  documentHash: string
): Promise<boolean> {
  // Check analysis_sessions table (used by the orchestrator for caching)
  const { data } = await admin
    .from("analysis_sessions")
    .select("session_id")
    .eq("document_hash", documentHash)
    .not("advice", "is", null) // Only completed analyses
    .limit(1)
    .maybeSingle();

  return !!data;
}

// ─── Text Extraction ───

/**
 * Extracts analyzable text from a synced record.
 * Handles inline text, file downloads, and Google Docs export.
 *
 * This is similar to extractRecordText in sync-dispatcher.ts but
 * returns null with logging rather than throwing on failure.
 */
async function extractText(
  item: SyncItem,
  connectorId: string,
  accessToken: string,
  log: (msg: string) => void
): Promise<string | null> {
  const prefix = `[AutoAnalyzer:${connectorId}] ${item.external_id}`;

  // Priority 1: Inline text fields
  for (const field of ["body", "content", "description", "notes", "text", "articleText"]) {
    const text = item.data[field];
    if (typeof text === "string" && text.length >= MIN_TEXT_LENGTH) {
      log(`${prefix}: Using inline text from '${field}' (${text.length} chars)`);
      return text;
    }
  }

  // Priority 2: Download file content
  const downloadUrl = item.data.downloadUrl ?? item.data.download_url ?? item.data.webContentLink;
  const mimeType = String(item.data.mimeType ?? item.data.mime_type ?? "");

  if (typeof downloadUrl === "string" && downloadUrl.startsWith("http")) {
    try {
      log(`${prefix}: Downloading file...`);
      const response = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        log(`${prefix}: Download failed (${response.status})`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Size guard: skip files > 20MB
      if (buffer.length > 20 * 1024 * 1024) {
        log(`${prefix}: File too large (${(buffer.length / 1024 / 1024).toFixed(1)}MB), skipping`);
        return null;
      }

      const fileName = getDocumentName(item);
      const { extractText: extractFromFile } = await import("@/lib/extract-text");
      const text = await extractFromFile(buffer, mimeType, fileName);

      if (text && text.trim().length >= MIN_TEXT_LENGTH) {
        log(`${prefix}: Extracted ${text.length} chars from ${fileName}`);
        return text;
      } else {
        log(`${prefix}: Extracted text too short (${text?.trim().length ?? 0} chars)`);
        return null;
      }
    } catch (err) {
      log(`${prefix}: Text extraction failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  // Priority 3: Google Drive export link for native docs
  if (connectorId === "google-drive" && mimeType === "application/vnd.google-apps.document") {
    try {
      const fileId = item.external_id;
      const exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
      log(`${prefix}: Exporting Google Doc as text...`);

      const response = await fetch(exportUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (response.ok) {
        const text = await response.text();
        if (text.trim().length >= MIN_TEXT_LENGTH) {
          log(`${prefix}: Exported ${text.length} chars from Google Doc`);
          return text;
        }
      }
    } catch (err) {
      log(`${prefix}: Google Doc export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return null;
}

// ─── Results Storage ───

/**
 * Stores the analysis result in the `analyses` table, linked to user and connector.
 *
 * Creates a new record with status "completed" and populates all 4 agent result
 * columns. Stores the integration_connection_id in a JSONB metadata envelope
 * so the UI can trace which connector produced this analysis.
 */
async function storeAnalysisResult(
  admin: SupabaseClient,
  userId: string,
  connectionId: string,
  connectorId: string,
  documentName: string,
  result: OrchestratorResult
): Promise<string | null> {
  try {
    const { data: inserted, error } = await admin
      .from("analyses")
      .insert({
        user_id: userId,
        file_name: documentName,
        status: "completed",
        document_type: result.classification?.documentTypeLabel ?? null,
        classification: result.classification,
        analysis: result.analysis,
        investigation: result.investigation,
        advice: result.advice,
        fairness_score: result.advice?.fairnessScore ?? null,
        summary: result.advice?.summary ?? null,
        completed_at: new Date().toISOString(),
        // Store integration metadata as a JSONB field in the file_url column
        // (repurposed: file_url is unused for integration-sourced analyses)
        file_url: JSON.stringify({
          source: "integration",
          connectorId,
          connectionId,
          sessionId: result.sessionId,
          autoAnalyzed: true,
        }),
      })
      .select("id")
      .single();

    if (error) {
      console.error(`[AutoAnalyzer] Failed to store analysis: ${error.message}`);
      return null;
    }

    return inserted?.id ?? null;
  } catch (err) {
    console.error(`[AutoAnalyzer] Store error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Builds a concise findings summary for notification display.
 * Extracts the most important information from the analysis result.
 */
function buildFindingsSummary(result: OrchestratorResult): string {
  const parts: string[] = [];

  // Overall risk
  if (result.analysis?.overallRisk) {
    const riskLabels: Record<string, string> = {
      critical: "Rischio critico",
      high: "Rischio alto",
      medium: "Rischio medio",
      low: "Rischio basso",
    };
    parts.push(riskLabels[result.analysis.overallRisk] ?? result.analysis.overallRisk);
  }

  // Fairness score
  if (result.advice?.fairnessScore != null) {
    parts.push(`Score: ${result.advice.fairnessScore}/10`);
  }

  // Key clauses count
  const criticalCount = result.analysis?.clauses?.filter(
    (c) => c.riskLevel === "critical" || c.riskLevel === "high"
  ).length ?? 0;
  if (criticalCount > 0) {
    parts.push(`${criticalCount} clausole critiche/alte`);
  }

  // Needs lawyer flag
  if (result.advice?.needsLawyer) {
    parts.push("Consigliato avvocato");
  }

  // Short summary
  if (result.advice?.summary) {
    const shortSummary = result.advice.summary.slice(0, 120);
    parts.push(shortSummary + (result.advice.summary.length > 120 ? "..." : ""));
  }

  return parts.join(" | ");
}

// ─── Notification Creation ───

/**
 * Creates a notification record for a completed auto-analysis.
 * The UI polls /api/notifications to display these to the user.
 */
async function createAnalysisNotification(
  admin: SupabaseClient,
  userId: string,
  analysisDbId: string | null,
  documentName: string,
  result: OrchestratorResult,
  connectorId: string
): Promise<void> {
  try {
    const overallRisk = result.analysis?.overallRisk ?? "unknown";
    const fairnessScore = result.advice?.fairnessScore ?? null;
    const summary = buildFindingsSummary(result);

    await admin.from("integration_notifications").insert({
      user_id: userId,
      type: "auto_analysis_complete",
      title: `Analisi completata: ${documentName}`,
      message: summary,
      severity: overallRisk === "critical" || overallRisk === "high" ? "warning" : "info",
      data: {
        analysisId: analysisDbId,
        sessionId: result.sessionId,
        connectorId,
        documentName,
        overallRisk,
        fairnessScore,
        clauseCount: result.analysis?.clauses?.length ?? 0,
        criticalCount: result.analysis?.clauses?.filter(
          (c) => c.riskLevel === "critical"
        ).length ?? 0,
        highCount: result.analysis?.clauses?.filter(
          (c) => c.riskLevel === "high"
        ).length ?? 0,
        needsLawyer: result.advice?.needsLawyer ?? false,
      },
    });
  } catch (err) {
    // Notification failure is non-fatal
    console.error(
      `[AutoAnalyzer] Failed to create notification: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

// ─── Main Entry Point ───

/**
 * Run automatic legal analysis on eligible synced records.
 *
 * This is the main entry point called from the sync dispatcher's ANALYZE stage.
 * It filters eligible records, extracts text, runs the 4-agent pipeline,
 * stores results, and creates notifications.
 *
 * @param admin - Supabase admin client (service role)
 * @param items - Synced records from the FETCH+MAP stages
 * @param config - Auto-analyzer configuration
 * @returns Summary of the analysis run
 */
export async function autoAnalyzeRecords(
  admin: SupabaseClient,
  items: SyncItem[],
  config: AutoAnalyzerConfig
): Promise<AutoAnalyzerSummary> {
  const log = config.log ?? console.log;
  const emit = config.onEvent ?? (() => {});
  const maxAnalyses = config.maxAnalyses ?? DEFAULT_MAX_ANALYSES;
  const startTime = Date.now();

  const summary: AutoAnalyzerSummary = {
    totalEvaluated: items.length,
    eligible: 0,
    skipped: 0,
    extractionFailed: 0,
    analyzed: 0,
    analysisFailed: 0,
    results: [],
    durationMs: 0,
  };

  // Step 1: Filter eligible records
  const eligible = items.filter((item) =>
    isEligibleForAnalysis(item, config.analyzeEntityTypes)
  );
  summary.eligible = eligible.length;
  summary.skipped = items.length - eligible.length;

  if (eligible.length === 0) {
    log(`[AutoAnalyzer:${config.connectorId}] No eligible records for analysis`);
    summary.durationMs = Date.now() - startTime;
    return summary;
  }

  // Cap to maxAnalyses
  const toAnalyze = eligible.slice(0, maxAnalyses);
  if (eligible.length > maxAnalyses) {
    log(
      `[AutoAnalyzer:${config.connectorId}] Capped from ${eligible.length} to ${maxAnalyses} analyses`
    );
    summary.skipped += eligible.length - maxAnalyses;
  }

  log(
    `[AutoAnalyzer:${config.connectorId}] Starting analysis of ${toAnalyze.length} documents ` +
    `(${summary.skipped} skipped, ${maxAnalyses} max)`
  );

  emit({
    stage: "analyze",
    connectorId: config.connectorId,
    progress: { current: 0, total: toAnalyze.length },
    message: `Analisi automatica di ${toAnalyze.length} documenti...`,
  });

  // Step 2: Process each document sequentially (respects API rate limits)
  for (let i = 0; i < toAnalyze.length; i++) {
    const item = toAnalyze[i];
    const documentName = getDocumentName(item);

    const analysisResult: AutoAnalysisResult = {
      externalId: item.external_id,
      entityType: item.entity_type,
      documentName,
      findingsSummary: "",
      documentHash: "",
    };

    try {
      // Step 2a: Extract text
      const text = await extractText(item, config.connectorId, config.accessToken, log);

      if (!text || text.trim().length < MIN_TEXT_LENGTH) {
        analysisResult.error = "Testo insufficiente per analisi";
        summary.extractionFailed++;
        summary.results.push(analysisResult);

        emit({
          stage: "analyze",
          connectorId: config.connectorId,
          progress: { current: i + 1, total: toAnalyze.length },
          message: `Documento ${i + 1}/${toAnalyze.length}: testo non estraibile`,
          data: { externalId: item.external_id, skipped: true },
        });
        continue;
      }

      // Step 2b: Dedup check
      const docHash = hashText(text);
      analysisResult.documentHash = docHash;

      if (!config.skipDedup) {
        const alreadyDone = await isAlreadyAnalyzed(admin, config.userId, docHash);
        if (alreadyDone) {
          log(`[AutoAnalyzer:${config.connectorId}] ${item.external_id}: Already analyzed (hash=${docHash}), skipping`);
          analysisResult.error = "Documento gia analizzato";
          summary.skipped++;
          summary.results.push(analysisResult);

          emit({
            stage: "analyze",
            connectorId: config.connectorId,
            progress: { current: i + 1, total: toAnalyze.length },
            message: `Documento ${i + 1}/${toAnalyze.length}: gia analizzato`,
            data: { externalId: item.external_id, skipped: true, hash: docHash },
          });
          continue;
        }
      }

      // Step 2c: Run the 4-agent legal analysis pipeline
      log(`[AutoAnalyzer:${config.connectorId}] ${item.external_id}: Analyzing "${documentName}" (${text.length} chars)...`);

      emit({
        stage: "analyze",
        connectorId: config.connectorId,
        progress: { current: i + 1, total: toAnalyze.length },
        message: `Analisi documento ${i + 1}/${toAnalyze.length}: ${documentName}`,
        data: { externalId: item.external_id, phase: "starting" },
      });

      const { runOrchestrator } = await import("@/lib/agents/orchestrator");

      const orchestratorResult: OrchestratorResult = await runOrchestrator(
        text,
        {
          onProgress: (phase, status) => {
            emit({
              stage: "analyze",
              connectorId: config.connectorId,
              progress: { current: i + 1, total: toAnalyze.length },
              message: `Documento ${i + 1}/${toAnalyze.length}: ${phase} ${status}`,
              data: { externalId: item.external_id, phase, status },
            });
          },
          onError: (phase, error) => {
            log(`[AutoAnalyzer:${config.connectorId}] ${item.external_id}: ${phase} error: ${error}`);
          },
          onComplete: () => {
            log(`[AutoAnalyzer:${config.connectorId}] ${item.external_id}: Pipeline complete`);
          },
        },
        undefined, // no resumeSessionId
        `Auto-analisi da ${config.connectorId}: ${item.entity_type} "${documentName}"`
      );

      // Step 2d: Store results in analyses table
      const analysisDbId = await storeAnalysisResult(
        admin,
        config.userId,
        config.connectionId,
        config.connectorId,
        documentName,
        orchestratorResult
      );

      // Step 2e: Update crm_record with analysis reference
      await admin
        .from("crm_records")
        .update({
          mapped_fields: {
            ...(item.mapped_fields ?? {}),
            _analysis_id: orchestratorResult.sessionId,
            _analysis_db_id: analysisDbId,
            _fairness_score: orchestratorResult.advice?.fairnessScore,
            _overall_risk: orchestratorResult.analysis?.overallRisk,
            _analyzed_at: new Date().toISOString(),
          },
        })
        .eq("user_id", config.userId)
        .eq("connector_source", config.connectorId)
        .eq("external_id", item.external_id);

      // Step 2f: Create user notification
      await createAnalysisNotification(
        admin,
        config.userId,
        analysisDbId,
        documentName,
        orchestratorResult,
        config.connectorId
      );

      // Populate result
      analysisResult.analysisId = orchestratorResult.sessionId;
      analysisResult.analysisDbId = analysisDbId ?? undefined;
      analysisResult.fairnessScore = orchestratorResult.advice?.fairnessScore;
      analysisResult.overallRisk = orchestratorResult.analysis?.overallRisk;
      analysisResult.findingsSummary = buildFindingsSummary(orchestratorResult);

      summary.analyzed++;

      log(
        `[AutoAnalyzer:${config.connectorId}] ${item.external_id}: ` +
        `Completed — score=${analysisResult.fairnessScore ?? "N/A"}, ` +
        `risk=${analysisResult.overallRisk ?? "N/A"}, ` +
        `dbId=${analysisDbId ?? "N/A"}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      analysisResult.error = message;
      summary.analysisFailed++;

      log(`[AutoAnalyzer:${config.connectorId}] ${item.external_id}: Failed — ${message}`);
    }

    summary.results.push(analysisResult);

    emit({
      stage: "analyze",
      connectorId: config.connectorId,
      progress: { current: i + 1, total: toAnalyze.length },
      message: `Documento ${i + 1}/${toAnalyze.length} completato`,
      data: {
        externalId: item.external_id,
        result: {
          analysisId: analysisResult.analysisId,
          overallRisk: analysisResult.overallRisk,
          fairnessScore: analysisResult.fairnessScore,
          error: analysisResult.error,
        },
      },
    });
  }

  summary.durationMs = Date.now() - startTime;

  log(
    `[AutoAnalyzer:${config.connectorId}] Complete: ` +
    `${summary.analyzed} analyzed, ${summary.analysisFailed} failed, ` +
    `${summary.extractionFailed} extraction failed, ${summary.skipped} skipped ` +
    `in ${(summary.durationMs / 1000).toFixed(1)}s`
  );

  return summary;
}
