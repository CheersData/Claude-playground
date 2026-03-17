/**
 * Data Connector — Interfacce generiche per il servizio di connessione dati.
 *
 * Architettura pipeline a 3 fasi: CONNECT → MODEL → LOAD
 * Ogni DataType ha il suo trio: Connector + Model + Store.
 *
 * Oggi: legal-articles (Normattiva + EUR-Lex), medical-articles, hr-articles
 * Domani: market-data, model-benchmark, feed-items, crm-records, erp-records, ecc.
 */

import type { AuthStrategy } from "./auth/types";

// ─── Data Source ───

export type DataType =
  | "legal-articles"
  | "medical-articles"     // Corpus medico — stesso schema legal_articles, vertical = 'medical'
  | "hr-articles"          // Diritto del lavoro + sicurezza — stesso stack di legal-articles
  | "market-data"
  | "model-benchmark"
  | "feed-items"
  | "crm-records"          // Salesforce, HubSpot — contatti, aziende, deal
  | "erp-records"          // SAP, NetSuite — ordini, fatture, anagrafiche
  | "accounting-records"   // QuickBooks — contabilita, pagamenti
  // Entity-oriented types per Integration Office (ADR-1)
  | "contacts"             // Rubrica contatti da CRM/ERP
  | "invoices"             // Fatture da ERP/accounting
  | "tickets"              // Ticket supporto da helpdesk
  | "documents";           // Documenti da DMS/cloud storage

/**
 * Tipi di entita business per connettori CRM/ERP.
 * Usato per specializzare il mapping nella fase MODEL.
 */
export type BusinessDataType =
  | "contacts"
  | "companies"
  | "deals"
  | "invoices"
  | "payments"
  | "documents"
  | "custom";

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
  connector: string;                       // "normattiva" | "eurlex" | "rss" | "api" | "salesforce" | ...
  config: Record<string, unknown>;         // config specifica del connettore
  lifecycle: SourceLifecycle;
  estimatedItems: number;
  schedule?: {
    deltaInterval: "daily" | "weekly" | "monthly";
    cronExpression?: string;
  };

  // ─── Campi aggiunti da ADR-1 (tutti opzionali — backward compatible) ───

  /** Strategia di autenticazione. Default: { type: "none" } per fonti pubbliche. */
  auth?: AuthStrategy;
  /** Tipo di entita business per connettori CRM/ERP. */
  businessDataType?: BusinessDataType;
  /** Direzione del flusso dati. Default: "pull". */
  direction?: "pull" | "push" | "bidirectional";
  /** Override rate limit per-provider (sostituisce il default 1s di BaseConnector). */
  rateLimit?: {
    requestsPerSecond?: number;
    requestsPerMinute?: number;
    concurrency?: number;
  };
  /** Configurazione webhook per fonti event-driven (fase 2). */
  webhookConfig?: {
    /** Riferimento al vault per HMAC secret (ADR-3) */
    secretRef: string;
    /** Eventi sottoscritti (es. ["contact.created", "deal.updated"]) */
    events: string[];
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
  /** Push records al sistema target (opzionale — solo connettori bidirezionali) */
  push?(items: T[], options?: PushOptions): Promise<PushResult>;
}

// ─── Push Interface (Hub → Target) ───

export interface PushOptions {
  /** Tipo entità target (es. "contacts", "companies") */
  entityType?: string;
  /** Se true, aggiorna record esistenti (match su externalId), altrimenti crea nuovi */
  upsert?: boolean;
  /** Dry run — valida senza inviare */
  dryRun?: boolean;
  /** Batch size per l'invio (default: connector-specific) */
  batchSize?: number;
}

export interface PushResult {
  /** Record creati con successo */
  created: number;
  /** Record aggiornati (upsert match) */
  updated: number;
  /** Record falliti */
  failed: number;
  /** Dettaglio errori per record falliti */
  errors: Array<{ externalId?: string; error: string }>;
  /** ID dei record creati/aggiornati nel sistema target */
  targetIds?: string[];
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
    /** Origine del mapping (ADR-002): rule = deterministico, llm = AI, manual = operatore */
    mappedBy?: "rule" | "llm" | "manual";
    /** Confidenza del mapping (0.0-1.0). 1.0 = match esatto regola, < 0.8 = LLM needed */
    confidence?: number;
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
