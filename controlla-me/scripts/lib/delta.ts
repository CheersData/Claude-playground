/**
 * Delta loading — Evita di rigenerare embeddings per articoli invariati.
 *
 * Come funziona:
 * 1. Carica dal DB tutti gli articoli esistenti per una data law_source
 * 2. Confronta l'hash MD5 del testo di ogni articolo
 * 3. Restituisce solo gli articoli nuovi o modificati
 *
 * Questo risparmia chiamate Voyage AI (costose) quando lo script viene
 * rieseguito su dati che non sono cambiati.
 */

import { textHash } from "./utils";
import type { LegalArticle } from "./types";

export interface DeltaResult {
  /** Articoli da caricare (nuovi o modificati) */
  toInsert: LegalArticle[];
  /** Numero di articoli invariati (skippati) */
  skipped: number;
  /** Totale articoli nella fonte */
  total: number;
}

export async function computeDelta(
  supabase: { from: (table: string) => any },
  articles: LegalArticle[],
  lawSource: string
): Promise<DeltaResult> {
  const { data: existing } = await supabase
    .from("legal_articles")
    .select("article_reference, article_text")
    .eq("law_source", lawSource);

  if (!existing || existing.length === 0) {
    return { toInsert: articles, skipped: 0, total: articles.length };
  }

  // Mappa: reference → hash del testo esistente
  const existingMap = new Map<string, string>();
  for (const row of existing) {
    existingMap.set(row.article_reference, textHash(row.article_text));
  }

  const toInsert: LegalArticle[] = [];
  let skipped = 0;

  for (const article of articles) {
    const existingHash = existingMap.get(article.articleReference);
    if (existingHash && existingHash === textHash(article.articleText)) {
      skipped++;
    } else {
      toInsert.push(article);
    }
  }

  console.log(
    `  [DELTA] ${lawSource}: ${articles.length} totali, ${skipped} invariati (skip), ${toInsert.length} da caricare`
  );

  return { toInsert, skipped, total: articles.length };
}

export async function forceDeleteSource(
  supabase: { from: (table: string) => any },
  lawSource: string
): Promise<number> {
  const { data, error } = await supabase
    .from("legal_articles")
    .delete()
    .eq("law_source", lawSource)
    .select("id");

  if (error) {
    console.error(`  [FORCE] Errore delete "${lawSource}": ${error.message}`);
    return 0;
  }

  const count = data?.length ?? 0;
  console.log(`  [FORCE] Eliminati ${count} articoli per "${lawSource}"`);
  return count;
}
