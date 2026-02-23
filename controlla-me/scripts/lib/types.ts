/**
 * Tipi condivisi per lo script di seed del corpus.
 */

export interface LegalArticle {
  lawSource: string;
  articleReference: string;
  articleTitle: string | null;
  articleText: string;
  hierarchy: Record<string, string>;
  keywords: string[];
  relatedInstitutes: string[];
  sourceUrl?: string;
  isInForce: boolean;
}

export interface SourceResult {
  sourceId: string;
  sourceName: string;
  fetched: number;
  inserted: number;
  skipped: number;
  errors: number;
  elapsed: number;
}
