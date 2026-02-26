/**
 * Legal Corpus Store — Adattatore tra StoreInterface generico e ingestArticles() esistente.
 * Non reinventa nulla: riusa la pipeline embeddings + upsert di lib/legal-corpus.ts.
 */

import { ingestArticles, type LegalArticle } from "@/lib/legal-corpus";
import type { StoreInterface, StoreResult } from "../types";

const BATCH_SIZE = 50;

export class LegalCorpusStore implements StoreInterface<LegalArticle> {
  constructor(private log: (msg: string) => void = console.log) {}

  async save(
    articles: LegalArticle[],
    options?: { dryRun?: boolean; skipEmbeddings?: boolean }
  ): Promise<StoreResult> {
    if (options?.dryRun) {
      this.log(
        `[STORE] DRY RUN | ${articles.length} articoli pronti | nessuna scrittura DB`
      );
      return {
        inserted: 0,
        updated: 0,
        skipped: articles.length,
        errors: 0,
        errorDetails: [],
      };
    }

    let totalInserted = 0;
    let totalErrors = 0;
    const errorDetails: Array<{ item: string; error: string }> = [];
    const totalBatches = Math.ceil(articles.length / BATCH_SIZE);

    for (let i = 0; i < articles.length; i += BATCH_SIZE) {
      const batch = articles.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;

      this.log(
        `[STORE] Batch ${batchNum}/${totalBatches} | ${batch.length} articoli`
      );

      try {
        const result = await ingestArticles(batch);
        totalInserted += result.inserted;
        totalErrors += result.errors;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log(`[STORE] Errore batch ${batchNum}: ${msg}`);
        totalErrors += batch.length;
        for (const a of batch) {
          errorDetails.push({
            item: `${a.lawSource} ${a.articleReference}`,
            error: msg,
          });
        }
      }

      // Pausa tra batch per non saturare Voyage AI
      if (i + BATCH_SIZE < articles.length) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    return {
      inserted: totalInserted,
      updated: 0, // ingestArticles fa upsert, non distingue insert/update
      skipped: 0,
      errors: totalErrors,
      errorDetails,
    };
  }
}
