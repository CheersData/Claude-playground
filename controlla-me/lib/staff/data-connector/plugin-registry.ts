/**
 * Plugin Registry — Consente di registrare connector/model/store senza modificare
 * le factory function in index.ts.
 *
 * Pattern: ogni verticalita registra i propri handler una volta.
 * La pipeline risolve per ID invece di switch hardcoded.
 *
 * ADR-1: Generalizzato con tipi generici per supportare connettori business
 * che producono tipi diversi da ParsedArticle/LegalArticle.
 *
 * Uso (legal/medical — backward compatible):
 *   import { registerConnector } from "./plugin-registry";
 *   registerConnector("my-source", (source, log) => new MyConnector(source, log));
 *
 * Uso (business — generic):
 *   import { registerGenericConnector } from "./plugin-registry";
 *   registerGenericConnector<SalesforceRecord>("salesforce", (source, log) => new SalesforceConnector(source, log));
 */

import type { DataSource, ConnectorInterface, ModelInterface, StoreInterface, ParsedArticle } from "./types";
import type { LegalArticle } from "@/lib/legal-corpus";
import type { HubSpotRecord } from "./parsers/hubspot-parser";
import type { SalesforceRecord } from "./parsers/salesforce-parser";
import type { StripeRecord } from "./parsers/stripe-parser";
import type { FattureRecord } from "./parsers/fatture-parser";
import type { UniversalConnector } from "./protocol";
import { LegacyConnectorAdapter } from "./protocol-adapter";

// ─── Tipi factory (backward compatible — ParsedArticle/LegalArticle) ───

export type ConnectorFactory = (
  source: DataSource,
  log: (msg: string) => void
) => ConnectorInterface<ParsedArticle>;

export type ModelFactory = (source: DataSource) => ModelInterface;

export type StoreFactory = (
  source: DataSource,
  log: (msg: string) => void
) => StoreInterface<LegalArticle>;

// ─── Tipi factory generici (ADR-1 — per connettori business) ───

export type GenericConnectorFactory<T = unknown> = (
  source: DataSource,
  log: (msg: string) => void
) => ConnectorInterface<T>;

export type GenericStoreFactory<T = unknown> = (
  source: DataSource,
  log: (msg: string) => void
) => StoreInterface<T>;

// ─── Tipi factory UniversalConnector (FASE 1A) ───

export type UniversalConnectorFactory<T = unknown> = (
  source: DataSource,
  log: (msg: string) => void
) => UniversalConnector<T>;

// ─── Registry maps ───

// Registry tipizzato per legal/medical (backward compatible)
const connectorRegistry = new Map<string, ConnectorFactory>();
const modelRegistry = new Map<string, ModelFactory>();
const storeRegistry = new Map<string, StoreFactory>();

// Registry generico per connettori business (ADR-1)
// Usa `unknown` come tipo di runtime — il type safety e' garantito
// a compile-time dal chiamante tramite i generici.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const genericConnectorRegistry = new Map<string, GenericConnectorFactory<any>>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const genericStoreRegistry = new Map<string, GenericStoreFactory<any>>();

// Registry per UniversalConnector (FASE 1A — nuovo protocollo unificato)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const universalConnectorRegistry = new Map<string, UniversalConnectorFactory<any>>();

// ─── Registrazione (backward compatible) ───

export function registerConnector(connectorId: string, factory: ConnectorFactory): void {
  connectorRegistry.set(connectorId, factory);
}

export function registerModel(dataType: string, factory: ModelFactory): void {
  modelRegistry.set(dataType, factory);
}

export function registerStore(dataType: string, factory: StoreFactory): void {
  storeRegistry.set(dataType, factory);
}

// ─── Registrazione generica (ADR-1) ───

/**
 * Registra un connettore con output di tipo generico T.
 * Per connettori business che non producono ParsedArticle.
 */
export function registerGenericConnector<T>(
  connectorId: string,
  factory: GenericConnectorFactory<T>
): void {
  genericConnectorRegistry.set(connectorId, factory);
}

/**
 * Registra uno store con input di tipo generico T.
 * Per store business che non consumano LegalArticle.
 */
export function registerGenericStore<T>(
  dataType: string,
  factory: GenericStoreFactory<T>
): void {
  genericStoreRegistry.set(dataType, factory);
}

// ─── Lookup (backward compatible) ───

export function resolveConnector(
  source: DataSource,
  log: (msg: string) => void
): ConnectorInterface<ParsedArticle> {
  const factory = connectorRegistry.get(source.connector);
  if (!factory) {
    throw new Error(
      `Connettore non registrato: "${source.connector}" per fonte "${source.id}". ` +
      `Connettori disponibili: ${[...connectorRegistry.keys()].join(", ") || "(nessuno)"}. ` +
      `Connettori generici: ${[...genericConnectorRegistry.keys()].join(", ") || "(nessuno)"}`
    );
  }
  return factory(source, log);
}

export function resolveModel(source: DataSource): ModelInterface {
  // 1. Chiave composita "dataType:connector" (es. "crm-records:hubspot")
  const compositeKey = `${source.dataType}:${source.connector}`;
  const compositeFactory = modelRegistry.get(compositeKey);
  if (compositeFactory) {
    return compositeFactory(source);
  }

  // 2. Solo dataType (es. "legal-articles")
  const factory = modelRegistry.get(source.dataType);
  if (!factory) {
    throw new Error(
      `Model non registrato per dataType: "${source.dataType}" (cercato anche "${compositeKey}"). ` +
      `DataType disponibili: ${[...modelRegistry.keys()].join(", ") || "(nessuno)"}`
    );
  }
  return factory(source);
}

export function resolveStore(
  source: DataSource,
  log: (msg: string) => void
): StoreInterface<LegalArticle> {
  const factory = storeRegistry.get(source.dataType);
  if (!factory) {
    throw new Error(
      `Store non registrato per dataType: "${source.dataType}". ` +
      `DataType disponibili: ${[...storeRegistry.keys()].join(", ") || "(nessuno)"}. ` +
      `Store generici: ${[...genericStoreRegistry.keys()].join(", ") || "(nessuno)"}`
    );
  }
  return factory(source, log);
}

// ─── Lookup generico (ADR-1) ───

/**
 * Risolve un connettore generico per connectorId.
 * Cerca prima nel registry generico, poi nel registry legacy (ParsedArticle).
 */
export function resolveGenericConnector<T>(
  source: DataSource,
  log: (msg: string) => void
): ConnectorInterface<T> {
  // Prima cerca nel registry generico
  const genericFactory = genericConnectorRegistry.get(source.connector);
  if (genericFactory) {
    return genericFactory(source, log) as ConnectorInterface<T>;
  }

  // Fallback al registry legacy (per backward compat)
  const legacyFactory = connectorRegistry.get(source.connector);
  if (legacyFactory) {
    return legacyFactory(source, log) as unknown as ConnectorInterface<T>;
  }

  throw new Error(
    `Connettore non registrato: "${source.connector}" per fonte "${source.id}". ` +
    `Connettori disponibili: ${[...connectorRegistry.keys(), ...genericConnectorRegistry.keys()].join(", ") || "(nessuno)"}`
  );
}

/**
 * Risolve uno store generico per dataType.
 * Cerca prima con chiave composita "dataType:connector" (per differenziare
 * store diversi sullo stesso dataType, es. crm-records:hubspot vs crm-records:stripe),
 * poi per solo dataType, poi nel registry legacy (LegalArticle).
 */
export function resolveGenericStore<T>(
  source: DataSource,
  log: (msg: string) => void
): StoreInterface<T> {
  // 1. Chiave composita "dataType:connector" (es. "crm-records:hubspot")
  const compositeKey = `${source.dataType}:${source.connector}`;
  const compositeFactory = genericStoreRegistry.get(compositeKey);
  if (compositeFactory) {
    return compositeFactory(source, log) as StoreInterface<T>;
  }

  // 2. Solo dataType (es. "crm-records")
  const genericFactory = genericStoreRegistry.get(source.dataType);
  if (genericFactory) {
    return genericFactory(source, log) as StoreInterface<T>;
  }

  // 3. Fallback al registry legacy
  const legacyFactory = storeRegistry.get(source.dataType);
  if (legacyFactory) {
    return legacyFactory(source, log) as unknown as StoreInterface<T>;
  }

  throw new Error(
    `Store non registrato per dataType: "${source.dataType}" (cercato anche "${compositeKey}"). ` +
    `DataType disponibili: ${[...storeRegistry.keys(), ...genericStoreRegistry.keys()].join(", ") || "(nessuno)"}`
  );
}

// ─── Registrazione UniversalConnector (FASE 1A) ───

/**
 * Registra un connettore che implementa direttamente UniversalConnector.
 * Nuovi connettori dovrebbero usare questa funzione.
 */
export function registerUniversalConnector<T>(
  connectorId: string,
  factory: UniversalConnectorFactory<T>
): void {
  universalConnectorRegistry.set(connectorId, factory);
}

// ─── Lookup UniversalConnector (FASE 1A) ───

/**
 * Risolve un UniversalConnector per connectorId.
 *
 * Strategia di lookup (3 livelli):
 *   1. Registry UniversalConnector (connettori nuovi)
 *   2. Registry generico (ADR-1) → wrappato con LegacyConnectorAdapter
 *   3. Registry legacy (ParsedArticle) → wrappato con LegacyConnectorAdapter
 *
 * Questo garantisce che TUTTI i connettori esistenti funzionino senza modifiche.
 */
export function resolveUniversalConnector<T>(
  source: DataSource,
  log: (msg: string) => void
): UniversalConnector<T> {
  // 1. Cerca nel registry UniversalConnector
  const universalFactory = universalConnectorRegistry.get(source.connector);
  if (universalFactory) {
    return universalFactory(source, log) as UniversalConnector<T>;
  }

  // 2. Cerca nel registry generico (ADR-1) e wrappa
  const genericFactory = genericConnectorRegistry.get(source.connector);
  if (genericFactory) {
    const legacy = genericFactory(source, log) as ConnectorInterface<T>;
    return new LegacyConnectorAdapter<T>(legacy, source.connector, source, {
      capabilities: { auth: true },
    });
  }

  // 3. Cerca nel registry legacy (ParsedArticle) e wrappa
  const legacyFactory = connectorRegistry.get(source.connector);
  if (legacyFactory) {
    const legacy = legacyFactory(source, log) as unknown as ConnectorInterface<T>;
    return new LegacyConnectorAdapter<T>(legacy, source.connector, source);
  }

  throw new Error(
    `Connettore non registrato: "${source.connector}" per fonte "${source.id}". ` +
    `Registries: universal=[${[...universalConnectorRegistry.keys()].join(", ")}], ` +
    `generic=[${[...genericConnectorRegistry.keys()].join(", ")}], ` +
    `legacy=[${[...connectorRegistry.keys()].join(", ")}]`
  );
}

// ─── Listing ───

export function listRegistered(): {
  connectors: string[];
  models: string[];
  stores: string[];
  genericConnectors: string[];
  genericStores: string[];
  universalConnectors: string[];
} {
  return {
    connectors: [...connectorRegistry.keys()],
    models: [...modelRegistry.keys()],
    stores: [...storeRegistry.keys()],
    genericConnectors: [...genericConnectorRegistry.keys()],
    genericStores: [...genericStoreRegistry.keys()],
    universalConnectors: [...universalConnectorRegistry.keys()],
  };
}

// ─── Registrazioni di default (connettori built-in) ───

function registerDefaults(): void {
  // Normattiva connector
  registerConnector("normattiva", (source, log) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NormattivaConnector } = require("./connectors/normattiva");
    return new NormattivaConnector(source, log);
  });

  // EUR-Lex connector
  registerConnector("eurlex", (source, log) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { EurLexConnector } = require("./connectors/eurlex");
    return new EurLexConnector(source, log);
  });

  // legal-articles model
  registerModel("legal-articles", (_source) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { LegalArticleModel } = require("./models/legal-article-model");
    return new LegalArticleModel();
  });

  // legal-articles store (usato anche da hr-articles, immobiliare, consumer)
  registerStore("legal-articles", (_source, log) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { LegalCorpusStore } = require("./stores/legal-corpus-store");
    return new LegalCorpusStore(log);
  });

  // Alias: hr-articles usa lo stesso stack di legal-articles
  // (stessa tabella legal_articles, stessa struttura)
  registerModel("hr-articles", (_source) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { LegalArticleModel } = require("./models/legal-article-model");
    return new LegalArticleModel();
  });

  registerStore("hr-articles", (_source, log) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { LegalCorpusStore } = require("./stores/legal-corpus-store");
    return new LegalCorpusStore(log);
  });

  // ── Medical connectors (studia.me) ──

  // StatPearls — NCBI Bookshelf (E-utilities API)
  registerConnector("ncbi-bookshelf", (source, log) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { StatPearlsConnector } = require("./connectors/statpearls");
    return new StatPearlsConnector(source, log);
  });

  // Europe PMC — Open Access biomedical papers
  registerConnector("europe-pmc", (source, log) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { EuropePMCConnector } = require("./connectors/europepmc");
    return new EuropePMCConnector(source, log);
  });

  // OpenStax — Open access university textbooks
  registerConnector("openstax", (source, log) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { OpenStaxConnector } = require("./connectors/openstax");
    return new OpenStaxConnector(source, log);
  });

  // ── Business connectors (ADR-1 — generic pipeline) ──

  // HubSpot CRM — contacts, companies, deals, tickets
  // BUG 5 FIX: Pipeline mode uses source.auth (api-key from HUBSPOT_API_KEY env var).
  // For OAuth2 user-facing mode, the sync route creates the connector with explicit
  // accessToken retrieved from the vault.
  registerGenericConnector<HubSpotRecord>("hubspot", (source, log) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { HubSpotConnector } = require("./connectors/hubspot");
    return new HubSpotConnector(source, log, {});
  });

  registerGenericStore<HubSpotRecord>("crm-records:hubspot", (_source, log) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { HubSpotStore } = require("./stores/hubspot-store");
    return new HubSpotStore(log);
  });

  // HubSpot record model (uses same crm_records table as Stripe)
  registerModel("crm-records:hubspot", (_source) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { HubSpotRecordModel } = require("./models/hubspot-record-model");
    return new HubSpotRecordModel();
  });

  // Salesforce CRM — accounts, contacts, opportunities, leads, cases
  registerGenericConnector<SalesforceRecord>("salesforce", (source, log) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SalesforceConnector } = require("./connectors/salesforce");
    return new SalesforceConnector(source, log);
  });

  registerGenericStore<SalesforceRecord>("crm-records:salesforce", (_source, log) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SalesforceStore } = require("./stores/salesforce-store");
    return new SalesforceStore(log);
  });

  // Salesforce record model (uses same crm_records table as HubSpot)
  registerModel("crm-records:salesforce", (_source) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SalesforceRecordModel } = require("./models/salesforce-record-model");
    return new SalesforceRecordModel();
  });

  // Google Drive — file metadata, folder structure, document content (demo)
  registerGenericConnector<import("./parsers/google-drive-parser").DriveRecord>(
    "google-drive",
    (source, log) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { GoogleDriveConnector } = require("./connectors/google-drive");
      return new GoogleDriveConnector(source, log);
    }
  );

  // Google Drive record model (uses same crm_records table)
  registerModel("crm-records:google-drive", (_source) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GoogleDriveRecordModel } = require("./models/google-drive-record-model");
    return new GoogleDriveRecordModel();
  });

  registerGenericStore<import("./parsers/google-drive-parser").DriveRecord>(
    "crm-records:google-drive",
    (_source, log) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { GoogleDriveStore } = require("./stores/google-drive-store");
      return new GoogleDriveStore(log);
    }
  );

  // Stripe — customers, subscriptions, invoices, payment intents
  registerGenericConnector<StripeRecord>("stripe", (source, log) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { StripeConnector } = require("./connectors/stripe");
    return new StripeConnector(source, log);
  });

  registerGenericStore<StripeRecord>("crm-records:stripe", (_source, log) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { StripeStore } = require("./stores/stripe-store");
    return new StripeStore(log);
  });

  // Stripe record model (uses same crm_records table as HubSpot/Salesforce)
  registerModel("crm-records:stripe", (_source) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { StripeRecordModel } = require("./models/stripe-record-model");
    return new StripeRecordModel();
  });

  // Fatture in Cloud — fatture emesse/ricevute, clienti (ERP italiano #1)
  registerGenericConnector<FattureRecord>("fatture-in-cloud", (source, log) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { FattureInCloudConnector } = require("./connectors/fatture-in-cloud");
    return new FattureInCloudConnector(source, log);
  });

  registerGenericStore<FattureRecord>("crm-records:fatture-in-cloud", (_source, log) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { FattureStore } = require("./stores/fatture-store");
    return new FattureStore(log);
  });

  // Fatture in Cloud record model (uses same crm_records table as Stripe/HubSpot/Salesforce)
  registerModel("crm-records:fatture-in-cloud", (_source) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { FattureRecordModel } = require("./models/fatture-record-model");
    return new FattureRecordModel();
  });

  // Alias: medical-articles usa lo stesso model/store di legal-articles
  // (stessa tabella legal_articles, filtrata per vertical='medical')
  registerModel("medical-articles", (_source) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { LegalArticleModel } = require("./models/legal-article-model");
    return new LegalArticleModel();
  });

  registerStore("medical-articles", (_source, log) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { LegalCorpusStore } = require("./stores/legal-corpus-store");
    return new LegalCorpusStore(log);
  });
}

// Eseguito al primo import
registerDefaults();
