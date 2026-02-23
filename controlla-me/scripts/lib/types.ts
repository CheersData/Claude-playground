/**
 * Tipi condivisi per il loader del corpus.
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
  /** ID della fonte (corpus-sources.ts) — mappato a source_id in DB */
  sourceId?: string;
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

/** Profilo di caricamento — ogni profilo definisce quali fonti caricare */
export interface LoaderProfile {
  /** ID univoco del profilo */
  id: string;
  /** Nome visualizzato */
  name: string;
  /** Descrizione */
  description: string;
  /** Funzione che restituisce le fonti da caricare */
  getSources: () => import("../corpus-sources").CorpusSource[];
  /** Variabili d'ambiente richieste (oltre a quelle base) */
  requiredEnv?: string[];
}
