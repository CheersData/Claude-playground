/**
 * Source Registry — Mappa le fonti da corpus-sources.ts in DataSource generiche.
 *
 * Supporta N verticali: ogni verticale è registrato via registerVertical()
 * nei file sorgente del verticale (es. hr-sources.ts).
 * Il verticale "legal" è pre-caricato da corpus-sources.ts.
 */

import {
  ALL_SOURCES,
  getSourcesByVertical as getCorpusSourcesByVertical,
  getAllSourcesAcrossVerticals,
  getVerticals as getCorpusVerticals,
  type CorpusSource,
} from "@/scripts/corpus-sources";
import { ALL_INTEGRATION_SOURCES } from "@/scripts/integration-sources";
import type { DataSource, DataType, SourceLifecycle } from "./types";

/** Mappa verticale → dataType. Estensibile senza modificare questo file. */
const VERTICAL_DATA_TYPE: Record<string, DataType> = {
  legal: "legal-articles",
  medical: "medical-articles",
  hr: "hr-articles",
  notarial: "legal-articles",      // stesso stack, filtrato per vertical
  "real-estate": "legal-articles", // stesso stack, filtrato per vertical
  consumer: "legal-articles",       // stesso stack, filtrato per vertical
};

function toDataSource(source: CorpusSource): DataSource {
  const vertical = source.vertical ?? "legal";
  const dataType = VERTICAL_DATA_TYPE[vertical] ?? "legal-articles";

  return {
    id: source.id,
    name: source.name,
    shortName: source.shortName,
    dataType,
    vertical,
    connector: source.type, // "normattiva" | "eurlex"
    config: {
      urn: source.urn,
      celexId: source.celexId,
      baseUrl: source.baseUrl,
      hierarchyLevels: source.hierarchyLevels,
      ...(source.connector ?? {}),
    },
    lifecycle: (source.lifecycle as SourceLifecycle) ?? "planned",
    estimatedItems: source.estimatedArticles,
  };
}

/** Tutte le fonti del verticale "legal" (backward compat). */
export function getAllSources(): DataSource[] {
  return ALL_SOURCES.map(toDataSource);
}

/** Tutte le fonti di tutti i verticali registrati (corpus + integration). */
export function getAllSourcesAllVerticals(): DataSource[] {
  return [
    ...getAllSourcesAcrossVerticals().map(toDataSource),
    ...ALL_INTEGRATION_SOURCES,
  ];
}

/** Fonti di un verticale specifico. */
export function getSourcesByVertical(vertical: string): DataSource[] {
  return getCorpusSourcesByVertical(vertical).map(toDataSource);
}

/** Lista verticali registrati. */
export function getVerticals(): string[] {
  return getCorpusVerticals();
}

export function getSourceById(id: string): DataSource | undefined {
  // 1. Cerca nelle fonti corpus (legal, medical, hr)
  const corpusSource = getAllSourcesAcrossVerticals().find((s) => s.id === id);
  if (corpusSource) return toDataSource(corpusSource);

  // 2. Cerca nelle fonti integration (CRM, ERP, etc.)
  const integrationSource = ALL_INTEGRATION_SOURCES.find((s) => s.id === id);
  if (integrationSource) return integrationSource;

  return undefined;
}

export function getSourcesByLifecycle(lifecycle: SourceLifecycle): DataSource[] {
  return getAllSources().filter((s) => s.lifecycle === lifecycle);
}

export function getLoadedSources(): DataSource[] {
  return getAllSources().filter(
    (s) => s.lifecycle === "loaded" || s.lifecycle === "delta-active"
  );
}

export function getSourcesByConnector(connector: string): DataSource[] {
  return getAllSources().filter((s) => s.connector === connector);
}
