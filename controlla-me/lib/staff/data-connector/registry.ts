/**
 * Source Registry — Mappa le fonti da corpus-sources.ts in DataSource generiche.
 */

import { ALL_SOURCES, type CorpusSource } from "@/scripts/corpus-sources";
import type { DataSource, SourceLifecycle } from "./types";

function toDataSource(source: CorpusSource): DataSource {
  return {
    id: source.id,
    name: source.name,
    shortName: source.shortName,
    dataType: "legal-articles",
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

export function getAllSources(): DataSource[] {
  return ALL_SOURCES.map(toDataSource);
}

export function getSourceById(id: string): DataSource | undefined {
  const source = ALL_SOURCES.find((s) => s.id === id);
  return source ? toDataSource(source) : undefined;
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
