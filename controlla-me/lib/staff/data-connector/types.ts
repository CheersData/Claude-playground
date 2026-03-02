/**
 * Data Connector — Interfacce generiche per il servizio di connessione dati.
 *
 * Architettura pipeline a 3 fasi: CONNECT → MODEL → LOAD
 * Ogni DataType ha il suo trio: Connector + Model + Store.
 *
 * Oggi: legal-articles (Normattiva + EUR-Lex)
 * Domani: market-data, model-benchmark, feed-items, ecc.
 */

// ─── Data Source ───

export type DataType =
  | "legal-articles"
  | "hr-articles"          // Diritto del lavoro + sicurezza — stesso stack di legal-articles
  | "market-data"
  | "model-benchmark"
  | "feed-items";

export type SourceLifecycle =
  | "planned"        // Fonte definita, nessun test
  | "api-tested"     // CONNECT completato: API funziona
  | "schema-ready"   // MODEL completato: schema DB verificato/creato
  | "loaded"         // LOAD completato: dati in DB
  | "delta-active";  // Delta updates automatici attivi

export interface DataSource {
  id: string;
  name: string;
  shortName: string;
  dataType: DataType;
  /** Dominio verticale: "legal" | "hr" | "real-estate" | ... (default: "legal") */
  vertical: string;
  connector: string;                       // "normattiva" | "eurlex" | "rss" | "api"
  config: Record<string, unknown>;         // config specifica del connettore
  lifecycle: SourceLifecycle;
  estimatedItems: number;
  schedule?: {
    deltaInterval: "daily" | "weekly" | "monthly";
    cronExpression?: string;
  };
}

// ─── FASE 1: CONNECT ───

export interface ConnectResult {
  sourceId: string;
  ok: boolean;
  message: string;
  census: {
    estimatedItems: number;
    availableFormats: string[];
    sampleFields: string[];
    sampleData?: unknown[];
  };
}

export interface ConnectorInterface<T = unknown> {
  /** Test connessione + censimento: quanti dati, che formato, che campi */
  connect(): Promise<ConnectResult>;
  /** Fetch tutti i dati (dopo che MODEL ha confermato lo schema) */
  fetchAll(options?: { limit?: number }): Promise<FetchResult<T>>;
  /** Fetch solo dati modificati da una certa data */
  fetchDelta(since: string, options?: { limit?: number }): Promise<FetchResult<T>>;
}

export interface FetchResult<T = unknown> {
  sourceId: string;
  items: T[];
  fetchedAt: string;
  metadata: Record<string, unknown>;
}

// ─── FASE 2: MODEL ───

export interface DataModelSpec {
  tableName: string;
  columns: Array<{
    name: string;
    type: string;
    purpose: string;
    exists: boolean;
  }>;
  indexes: Array<{
    name: string;
    type: string;
    purpose: string;
    exists: boolean;
  }>;
  embeddingStrategy?: {
    model: string;
    dimensions: number;
    fields: string[];
    inputType: string;
  };
  transformRules: Array<{
    sourceField: string;
    targetColumn: string;
    transform: string;
  }>;
  migrationSQL?: string;
}

export interface ModelResult {
  ready: boolean;
  spec: DataModelSpec;
  message: string;
}

export interface ModelInterface {
  /** Analizza i dati grezzi e produce la specifica del modello dati ottimale */
  analyze(sampleData: unknown[]): Promise<DataModelSpec>;
  /** Verifica che lo schema DB corrisponda alla specifica */
  checkSchema(spec: DataModelSpec): Promise<ModelResult>;
  /** Descrive la trasformazione raw → DB in formato leggibile */
  describeTransform(spec: DataModelSpec): string;
}

// ─── FASE 3: LOAD ───

export interface StoreResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  errorDetails: Array<{ item: string; error: string }>;
}

export interface StoreInterface<T = unknown> {
  save(items: T[], options?: { dryRun?: boolean; skipEmbeddings?: boolean }): Promise<StoreResult>;
}

// ─── Pipeline Orchestrazione ───

export interface PipelineOptions {
  stopAfter?: "connect" | "model" | "load";
  mode?: "full" | "delta";
  dryRun?: boolean;
  skipEmbeddings?: boolean;
  limit?: number;
  deltaSince?: string;
}

export interface PipelineResult {
  sourceId: string;
  connectResult?: ConnectResult;
  modelResult?: ModelResult;
  loadResult?: StoreResult;
  stoppedAt: "connect" | "model" | "load";
  stoppedReason?: string;
  durationMs: number;
}

// ─── Tipi specifici: articoli legali ───

export interface ParsedArticle {
  articleNumber: string;
  articleTitle: string | null;
  articleText: string;
  hierarchy: Record<string, string>;
  sourceUrl?: string;
  isInForce?: boolean;
  rawMeta?: Record<string, unknown>;
}

// ─── Sync Log ───

export interface SyncLogEntry {
  id: string;
  sourceId: string;
  syncType: string;
  phase: string | null;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt: string | null;
  itemsFetched: number;
  itemsInserted: number;
  itemsUpdated: number;
  itemsSkipped: number;
  errors: number;
  errorDetails: Array<{ item: string; error: string }>;
  metadata: Record<string, unknown>;
}
