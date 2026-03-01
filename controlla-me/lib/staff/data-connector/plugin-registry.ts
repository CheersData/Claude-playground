/**
 * Plugin Registry — Consente di registrare connector/model/store senza modificare
 * le factory function in index.ts.
 *
 * Pattern: ogni verticalità registra i propri handler una volta.
 * La pipeline risolve per ID invece di switch hardcoded.
 *
 * Uso:
 *   import { registerConnector } from "./plugin-registry";
 *   registerConnector("my-source", (source, log) => new MyConnector(source, log));
 */

import type { DataSource, ConnectorInterface, ModelInterface, StoreInterface, ParsedArticle } from "./types";
import type { LegalArticle } from "@/lib/legal-corpus";

// ─── Tipi factory ───

export type ConnectorFactory = (
  source: DataSource,
  log: (msg: string) => void
) => ConnectorInterface<ParsedArticle>;

export type ModelFactory = (source: DataSource) => ModelInterface;

export type StoreFactory = (
  source: DataSource,
  log: (msg: string) => void
) => StoreInterface<LegalArticle>;

// ─── Registry maps ───

const connectorRegistry = new Map<string, ConnectorFactory>();
const modelRegistry = new Map<string, ModelFactory>();
const storeRegistry = new Map<string, StoreFactory>();

// ─── Registrazione ───

export function registerConnector(connectorId: string, factory: ConnectorFactory): void {
  connectorRegistry.set(connectorId, factory);
}

export function registerModel(dataType: string, factory: ModelFactory): void {
  modelRegistry.set(dataType, factory);
}

export function registerStore(dataType: string, factory: StoreFactory): void {
  storeRegistry.set(dataType, factory);
}

// ─── Lookup ───

export function resolveConnector(
  source: DataSource,
  log: (msg: string) => void
): ConnectorInterface<ParsedArticle> {
  const factory = connectorRegistry.get(source.connector);
  if (!factory) {
    throw new Error(
      `Connettore non registrato: "${source.connector}" per fonte "${source.id}". ` +
      `Connettori disponibili: ${[...connectorRegistry.keys()].join(", ") || "(nessuno)"}`
    );
  }
  return factory(source, log);
}

export function resolveModel(source: DataSource): ModelInterface {
  const factory = modelRegistry.get(source.dataType);
  if (!factory) {
    throw new Error(
      `Model non registrato per dataType: "${source.dataType}". ` +
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
      `DataType disponibili: ${[...storeRegistry.keys()].join(", ") || "(nessuno)"}`
    );
  }
  return factory(source, log);
}

export function listRegistered(): {
  connectors: string[];
  models: string[];
  stores: string[];
} {
  return {
    connectors: [...connectorRegistry.keys()],
    models: [...modelRegistry.keys()],
    stores: [...storeRegistry.keys()],
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
}

// Eseguito al primo import
registerDefaults();
