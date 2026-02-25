/**
 * Corpus Configuration Types
 *
 * Defines the schema for domain-specific corpus configurations.
 * Each domain (legal, fiscal, etc.) has a JSON config file in corpus-configs/.
 */

export interface CorpusConfig {
  domain: string;
  name: string;
  embeddingModel: string;
  dataSources: DataSourceConfig[];
  hierarchy: HierarchyRule[];
  institutes: InstituteRule[];
  termPatterns: TermPatternRule[];
}

export interface DataSourceConfig {
  name: string;
  type: "huggingface" | "api" | "csv" | "connector";
  /** HuggingFace dataset ID (e.g. "AndreaSimeri/Italian_Civil_Code") */
  dataset?: string;
  /** API endpoint or file path */
  endpoint?: string;
  /** Connector ID from connectors/registry.json */
  connectorId?: string;
  /** Law source label (e.g. "Codice Civile", "D.Lgs. 322/1998") */
  lawSource: string;
  /** Maps source fields to our schema */
  fieldMapping: {
    id: string;
    title: string;
    text: string;
    references?: string;
  };
}

export interface HierarchyRule {
  from: number;
  to: number;
  hierarchy: {
    book: string;
    title?: string;
    chapter?: string;
  };
}

export interface InstituteRule {
  from: number;
  to: number;
  institutes: string[];
  keywords: string[];
}

export interface TermPatternRule {
  /** Regex pattern as string */
  pattern: string;
  /** Extracted term identifier */
  term: string;
}

/** Result of a corpus load operation */
export interface LoadResult {
  domain: string;
  totalProcessed: number;
  inserted: number;
  errors: number;
  sources: Array<{
    name: string;
    articlesProcessed: number;
  }>;
}
