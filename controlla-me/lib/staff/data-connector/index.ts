/**
 * Data Connector — Orchestratore pipeline CONNECT → MODEL → LOAD.
 *
 * API pubblica del servizio. Il CLI e il cron route usano solo queste funzioni.
 */

import { getSourceById, getAllSources } from "./registry";
import { startSync, completeSync, getLastSuccessfulSync } from "./sync-log";
import { validateBatch } from "./validators/article-validator";
import {
  resolveConnector,
  resolveModel,
  resolveStore,
  registerConnector,
  registerModel,
  registerStore,
  listRegistered,
} from "./plugin-registry";
import type { LegalArticle } from "@/lib/legal-corpus";
import type {
  DataSource,
  ConnectorInterface,
  ModelInterface,
  StoreInterface,
  PipelineOptions,
  PipelineResult,
  ConnectResult,
  ModelResult,
  StoreResult,
  ParsedArticle,
} from "./types";

// Re-export per permettere a verticali esterni di registrare plugin senza
// modificare questo file (open/closed principle).
export { registerConnector, registerModel, registerStore, listRegistered };

// ─── Factory (ora via plugin registry — nessuno switch hardcoded) ───

function createConnector(
  source: DataSource,
  log: (msg: string) => void
): ConnectorInterface<ParsedArticle> {
  return resolveConnector(source, log);
}

function createModel(source: DataSource): ModelInterface {
  return resolveModel(source);
}

function createStore(
  source: DataSource,
  log: (msg: string) => void
): StoreInterface<LegalArticle> {
  return resolveStore(source, log);
}

// ─── Pipeline orchestrata ───

export async function runPipeline(
  sourceId: string,
  options: PipelineOptions = {},
  log: (msg: string) => void = console.log
): Promise<PipelineResult> {
  const startTime = Date.now();
  const source = getSourceById(sourceId);
  if (!source) {
    throw new Error(`Fonte non trovata: "${sourceId}"`);
  }

  const stopAfter = options.stopAfter ?? "load";
  const result: PipelineResult = {
    sourceId,
    stoppedAt: "connect",
    durationMs: 0,
  };

  // ─── FASE 1: CONNECT ───
  log(`\n━━━ CONNECT | ${source.name} ━━━`);
  const syncId = await startSync(sourceId, options.mode ?? "full", "connect");

  let connectResult: ConnectResult;
  try {
    const connector = createConnector(source, log);
    connectResult = await connector.connect();
    result.connectResult = connectResult;

    if (!connectResult.ok) {
      result.stoppedReason = `CONNECT fallito: ${connectResult.message}`;
      await completeSync(syncId, "failed", {
        metadata: { error: connectResult.message },
      });
      result.durationMs = Date.now() - startTime;
      return result;
    }

    log(
      `[CONNECT] OK | ${connectResult.census.estimatedItems} items stimati | formati: ${connectResult.census.availableFormats.join(", ")}`
    );
    await completeSync(syncId, "completed", {
      itemsFetched: connectResult.census.estimatedItems,
      metadata: { census: connectResult.census },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.stoppedReason = `CONNECT errore: ${msg}`;
    await completeSync(syncId, "failed", { metadata: { error: msg } });
    result.durationMs = Date.now() - startTime;
    return result;
  }

  if (stopAfter === "connect") {
    result.stoppedAt = "connect";
    result.durationMs = Date.now() - startTime;
    return result;
  }

  // ─── FASE 2: MODEL ───
  log(`\n━━━ MODEL | ${source.name} ━━━`);
  const modelSyncId = await startSync(sourceId, "model", "model");

  let modelResult: ModelResult;
  try {
    const model = createModel(source);

    // Analizza sample data dal CONNECT per decidere struttura ottimale
    const sampleData = connectResult.census.sampleData ?? [];
    const spec = await model.analyze(sampleData);
    log(`[MODEL] Struttura: ${model.describeTransform(spec)}`);

    // Verifica schema DB
    modelResult = await model.checkSchema(spec);
    result.modelResult = modelResult;

    if (!modelResult.ready) {
      log(`[MODEL] Schema non pronto: ${modelResult.message}`);
      if (modelResult.spec.migrationSQL) {
        log(`[MODEL] Migration SQL suggerita:\n${modelResult.spec.migrationSQL}`);
      }
      result.stoppedAt = "model";
      result.stoppedReason = `Schema non pronto: ${modelResult.message}`;
      await completeSync(modelSyncId, "failed", {
        metadata: { message: modelResult.message },
      });
      result.durationMs = Date.now() - startTime;
      return result;
    }

    log(`[MODEL] OK | ${modelResult.message}`);
    await completeSync(modelSyncId, "completed", {
      metadata: { spec: modelResult.spec },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.stoppedAt = "model";
    result.stoppedReason = `MODEL errore: ${msg}`;
    await completeSync(modelSyncId, "failed", { metadata: { error: msg } });
    result.durationMs = Date.now() - startTime;
    return result;
  }

  if (stopAfter === "model") {
    result.stoppedAt = "model";
    result.durationMs = Date.now() - startTime;
    return result;
  }

  // ─── FASE 3: LOAD ───
  log(`\n━━━ LOAD | ${source.name} ━━━`);
  const loadSyncId = await startSync(
    sourceId,
    options.mode ?? "full",
    "load"
  );

  try {
    const connector = createConnector(source, log);
    const store = createStore(source, log);

    // Fetch dati (full o delta)
    let fetchResult;
    if (options.mode === "delta") {
      const lastSync = await getLastSuccessfulSync(sourceId);
      const since =
        options.deltaSince ?? lastSync?.completedAt ?? "2020-01-01";
      log(`[LOAD] Delta dal ${since}`);
      fetchResult = await connector.fetchDelta(since, {
        limit: options.limit,
      });
    } else {
      log(`[LOAD] Full fetch${options.limit ? ` (limit: ${options.limit})` : ""}`);
      fetchResult = await connector.fetchAll({ limit: options.limit });
    }

    log(`[LOAD] ${fetchResult.items.length} articoli fetchati`);

    // Validazione
    const articles = fetchResult.items as ParsedArticle[];
    const validation = validateBatch(articles);
    log(
      `[LOAD] Validazione: ${validation.validCount} validi | ${validation.warningCount} con warning | ${validation.errorCount} con errori`
    );

    // Filtra solo i validi
    const validArticles = articles.filter((_, i) => {
      const detail = validation.details[i];
      return detail?.result.valid ?? false;
    });

    if (validArticles.length === 0) {
      result.stoppedAt = "load";
      result.stoppedReason = "Nessun articolo valido dopo validazione";
      await completeSync(loadSyncId, "failed", {
        itemsFetched: fetchResult.items.length,
        errors: validation.errorCount,
      });
      result.durationMs = Date.now() - startTime;
      return result;
    }

    // Trasforma in formato per lo store (usa la source come law_source)
    const lawSource = source.shortName;
    const itemsForStore: LegalArticle[] = validArticles.map((a) => ({
      lawSource,
      articleReference: `Art. ${a.articleNumber}`,
      articleTitle: a.articleTitle ?? "",
      articleText: a.articleText,
      hierarchy: a.hierarchy ?? {},
      keywords: [] as string[],
      relatedInstitutes: [] as string[],
      sourceUrl: a.sourceUrl ?? (source.config.baseUrl as string) ?? "",
      isInForce: a.isInForce ?? true,
    }));

    // Salva
    const storeResult: StoreResult = await store.save(itemsForStore, {
      dryRun: options.dryRun,
      skipEmbeddings: options.skipEmbeddings,
    });

    result.loadResult = storeResult;
    result.stoppedAt = "load";

    log(
      `[LOAD] ${options.dryRun ? "DRY RUN | " : ""}Inseriti: ${storeResult.inserted} | Aggiornati: ${storeResult.updated} | Saltati: ${storeResult.skipped} | Errori: ${storeResult.errors}`
    );

    await completeSync(loadSyncId, storeResult.errors > 0 ? "failed" : "completed", {
      itemsFetched: fetchResult.items.length,
      itemsInserted: storeResult.inserted,
      itemsUpdated: storeResult.updated,
      itemsSkipped: storeResult.skipped,
      errors: storeResult.errors,
      errorDetails: storeResult.errorDetails,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.stoppedAt = "load";
    result.stoppedReason = `LOAD errore: ${msg}`;
    await completeSync(loadSyncId, "failed", { metadata: { error: msg } });
  }

  result.durationMs = Date.now() - startTime;
  return result;
}

// ─── Comandi singoli (per CLI) ───

export async function connectSource(
  sourceId: string,
  log: (msg: string) => void = console.log
): Promise<ConnectResult> {
  const result = await runPipeline(sourceId, { stopAfter: "connect" }, log);
  if (!result.connectResult) {
    throw new Error(result.stoppedReason ?? "CONNECT fallito");
  }
  return result.connectResult;
}

export async function modelSource(
  sourceId: string,
  log: (msg: string) => void = console.log
): Promise<ModelResult> {
  const result = await runPipeline(sourceId, { stopAfter: "model" }, log);
  if (!result.modelResult) {
    throw new Error(result.stoppedReason ?? "MODEL fallito");
  }
  return result.modelResult;
}

export async function loadSource(
  sourceId: string,
  options: {
    dryRun?: boolean;
    limit?: number;
    skipEmbeddings?: boolean;
  } = {},
  log: (msg: string) => void = console.log
): Promise<StoreResult> {
  const result = await runPipeline(
    sourceId,
    { stopAfter: "load", ...options },
    log
  );
  if (!result.loadResult) {
    throw new Error(result.stoppedReason ?? "LOAD fallito");
  }
  return result.loadResult;
}

export async function updateSource(
  sourceId: string,
  log: (msg: string) => void = console.log
): Promise<StoreResult> {
  const result = await runPipeline(
    sourceId,
    { stopAfter: "load", mode: "delta" },
    log
  );
  if (!result.loadResult) {
    throw new Error(result.stoppedReason ?? "UPDATE fallito");
  }
  return result.loadResult;
}

// ─── Status ───

export { getAllSources, getSourceById } from "./registry";
export {
  getLastSuccessfulSync,
  getSyncHistory,
  getConnectorStatus,
} from "./sync-log";
