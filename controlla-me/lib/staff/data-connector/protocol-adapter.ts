/**
 * LegacyConnectorAdapter — Wrappa un ConnectorInterface<T> legacy in UniversalConnector<T>.
 *
 * Permette al pipeline di trattare connettori vecchi (BaseConnector, AuthenticatedBaseConnector)
 * esattamente come connettori nuovi, senza modificare una riga dei connettori esistenti.
 *
 * FASE 1A: Supporta 3 modalita di discovery:
 *   1. Legacy puro (Normattiva, EUR-Lex): catalogo minimale da connect()
 *   2. Discovery engine (HubSpot, business): delega al discovery engine se disponibile
 *   3. External catalog: catalogo pre-costruito passato nelle options
 *
 * Usage:
 *   // Legacy puro
 *   const legacy = new NormattivaConnector(source, log);
 *   const universal = new LegacyConnectorAdapter(legacy, "normattiva", source);
 *
 *   // Con discovery engine
 *   const universal = new LegacyConnectorAdapter(legacy, "hubspot", source, {
 *     capabilities: { discovery: true, multiEntity: true, auth: true },
 *     discoveryFn: (connectorType, connectionId, userId, fetchFn, log) =>
 *       runDiscovery(connectorType, connectionId, userId, fetchFn, log),
 *     connectionId: "uuid-here",
 *     userId: "uuid-here",
 *   });
 */

import type { ConnectorInterface, ConnectResult, FetchResult, DataSource } from "./types";
import type {
  UniversalConnector,
  ConnectorCapabilities,
  DiscoveryCatalog,
  FetchOptions,
  EntityCategory,
  SchemaGraphCompat,
} from "./protocol";
import { schemaGraphToCatalog } from "./protocol";

// ─── Types for discovery integration ───

/**
 * Risultato del discovery engine compatibile con la funzione bridge.
 * Corrisponde al sottoinsieme di DiscoveryResult necessario per la conversione.
 */
export interface DiscoveryResultCompat {
  graph: SchemaGraphCompat;
  syncOrder: string[];
  cached: boolean;
}

/**
 * Funzione di discovery opzionale. Quando fornita, l'adapter la usa
 * per discover() al posto del catalogo minimale da connect().
 *
 * Corrisponde alla signature di runDiscovery() in discovery/index.ts.
 */
export type DiscoveryFn = (
  connectorType: string,
  connectionId: string,
  userId: string,
  fetchFn: (url: string, init?: RequestInit) => Promise<Response>,
  log: (msg: string) => void
) => Promise<DiscoveryResultCompat>;

/**
 * Opzioni per configurare l'adapter.
 * Permette di sovrascrivere le capabilities auto-detected e di
 * iniettare il discovery engine per connettori business.
 */
export interface LegacyAdapterOptions {
  /** Override delle capabilities. Se non specificato, viene auto-rilevato da DataSource. */
  capabilities?: Partial<ConnectorCapabilities>;

  /**
   * Funzione di discovery esterna (es. runDiscovery() dal discovery engine).
   * Se fornita, discover() la invoca invece di costruire un catalogo minimale.
   * Richiede connectionId e userId.
   */
  discoveryFn?: DiscoveryFn;

  /** ID della connessione (per discovery engine). */
  connectionId?: string;

  /** ID dell'utente (per discovery engine cache). */
  userId?: string;

  /** Funzione fetch autenticata (per discovery engine). Se non fornita, usa global fetch. */
  authenticatedFetch?: (url: string, init?: RequestInit) => Promise<Response>;

  /** Logger. Se non fornito, usa console.log. */
  log?: (msg: string) => void;

  /**
   * Catalogo pre-costruito. Se fornito, discover() lo restituisce direttamente
   * senza invocare il discovery engine. Utile per test e per connettori con
   * schema fisso non-legacy (es. Fatture in Cloud con schema noto da OpenAPI).
   */
  staticCatalog?: DiscoveryCatalog;

  /**
   * Categoria default per le entita del catalogo minimale (quando il discovery
   * engine non e' disponibile). Default: "legal" per connettori legacy,
   * auto-detected da DataSource per gli altri.
   */
  defaultCategory?: EntityCategory;
}

/**
 * Adapter che trasforma un ConnectorInterface<T> nel protocollo UniversalConnector<T>.
 *
 * - connect() → delega al legacy
 * - discover() → 3 strategie:
 *     1. staticCatalog se fornito nelle options
 *     2. discoveryFn() se fornita (discovery engine)
 *     3. Catalogo minimale dai dati di connect() (fallback legacy)
 * - fetchAll()/fetchDelta() → delega al legacy (ignora `entity` option)
 * - capabilities → auto-rilevato: discovery=false (legacy), override via options
 */
export class LegacyConnectorAdapter<T = unknown> implements UniversalConnector<T> {
  readonly connectorId: string;
  readonly capabilities: ConnectorCapabilities;

  private lastConnectResult: ConnectResult | null = null;
  private cachedCatalog: DiscoveryCatalog | null = null;
  private readonly options: LegacyAdapterOptions;
  private readonly source?: DataSource;

  constructor(
    private readonly legacy: ConnectorInterface<T>,
    connectorId: string,
    source?: DataSource,
    options: LegacyAdapterOptions = {}
  ) {
    this.connectorId = connectorId;
    this.source = source;
    this.options = options;

    // Auto-detect capabilities da DataSource + override espliciti
    const hasAuth = source?.auth != null && source.auth.type !== "none";
    const hasDiscovery = !!options.discoveryFn || !!options.staticCatalog;
    this.capabilities = {
      discovery: hasDiscovery,
      delta: true,          // Tutti i legacy hanno fetchDelta()
      webhook: false,       // Nessun legacy supporta webhook
      multiEntity: false,   // Legacy = singola entita (un atto, una fonte)
      auth: hasAuth,
      ...options.capabilities,
    };
  }

  // ── Phase 1: CONNECT ──

  async connect(): Promise<ConnectResult> {
    const result = await this.legacy.connect();
    this.lastConnectResult = result;
    return result;
  }

  // ── Phase 1.5: DISCOVER ──

  /**
   * Discover schema using the best available strategy:
   *
   *   1. staticCatalog → restituisce direttamente (zero API calls)
   *   2. discoveryFn → invoca il discovery engine (ENUMERATE → INTROSPECT → RELATE → TAG → GRAPH)
   *   3. Fallback legacy → catalogo minimale dai dati di connect()
   *
   * Il risultato viene cachato in memoria: chiamate successive restituiscono
   * lo stesso catalogo senza re-discovery (invalidare con invalidateDiscoveryCache()).
   */
  async discover(): Promise<DiscoveryCatalog> {
    // Cache hit
    if (this.cachedCatalog) {
      return { ...this.cachedCatalog, cached: true };
    }

    // Strategy 1: Static catalog
    if (this.options.staticCatalog) {
      this.cachedCatalog = this.options.staticCatalog;
      return this.cachedCatalog;
    }

    // Strategy 2: Discovery engine
    if (this.options.discoveryFn && this.options.connectionId && this.options.userId) {
      const log = this.options.log ?? console.log;
      const fetchFn = this.options.authenticatedFetch ?? globalThis.fetch.bind(globalThis);

      try {
        const result = await this.options.discoveryFn(
          this.connectorId,
          this.options.connectionId,
          this.options.userId,
          fetchFn,
          log
        );

        const catalog = schemaGraphToCatalog(result.graph, result.syncOrder, result.cached);
        this.cachedCatalog = catalog;
        return catalog;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        (this.options.log ?? console.log)(
          `[ADAPTER] Discovery engine failed for ${this.connectorId}: ${msg} — falling back to minimal catalog`
        );
        // Fall through to legacy strategy
      }
    }

    // Strategy 3: Legacy fallback — minimal catalog from connect()
    return this.buildMinimalCatalog();
  }

  /**
   * Invalida la cache del catalogo. La prossima chiamata a discover()
   * rieseguira la discovery.
   */
  invalidateDiscoveryCache(): void {
    this.cachedCatalog = null;
  }

  // ── Phase 2: FETCH ──

  async fetchAll(options?: FetchOptions): Promise<FetchResult<T>> {
    return this.legacy.fetchAll({ limit: options?.limit });
  }

  async fetchDelta(since: string, options?: FetchOptions): Promise<FetchResult<T>> {
    return this.legacy.fetchDelta(since, { limit: options?.limit });
  }

  // ── Internal ──

  /**
   * Costruisce un catalogo minimale dal risultato di connect().
   * Usato come fallback quando il discovery engine non e' disponibile.
   */
  private async buildMinimalCatalog(): Promise<DiscoveryCatalog> {
    if (!this.lastConnectResult) {
      await this.connect();
    }

    const census = this.lastConnectResult!.census;
    const defaultCategory = this.options.defaultCategory
      ?? this.detectCategory();

    const catalog: DiscoveryCatalog = {
      connectorType: this.connectorId,
      entities: [
        {
          name: this.lastConnectResult!.sourceId,
          label: this.lastConnectResult!.message.split("|")[0]?.trim() || this.connectorId,
          estimatedCount: census.estimatedItems,
          category: defaultCategory,
          fields: census.sampleFields.map((fieldName) => ({
            name: fieldName,
            type: "string" as const,
            required: false,
          })),
          writable: false,
        },
      ],
      relationships: [],
      syncOrder: [this.lastConnectResult!.sourceId],
      discoveredAt: new Date().toISOString(),
      cached: false,
    };

    this.cachedCatalog = catalog;
    return catalog;
  }

  /**
   * Auto-detect la categoria dell'entita dalla DataSource.
   */
  private detectCategory(): EntityCategory {
    if (!this.source) return "legal";

    const vertical = this.source.vertical;
    const categoryMap: Record<string, EntityCategory> = {
      legal: "legal",
      medical: "medical",
      hr: "legal",
      "real-estate": "legal",
      consumer: "legal",
      crm: "crm",
      sales: "sales",
      accounting: "accounting",
    };

    return categoryMap[vertical] ?? "custom";
  }
}
