/**
 * Generazione embeddings Voyage AI in batch + upload Supabase.
 *
 * Voyage AI (voyage-law-2):
 * - Modello specifico per testi legali, 1024 dimensioni
 * - Max 128 testi per batch (noi usiamo 50 per sicurezza)
 * - Rate limit: gestito con retry + backoff
 */

import { fetchWithRetry, sleep } from "./utils";
import type { LegalArticle } from "./types";

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-law-2";
const BATCH_SIZE = 50;

interface VoyageResponse {
  data: Array<{ embedding: number[]; index: number }>;
  usage: { total_tokens: number };
}

/**
 * Genera embeddings per un batch di testi via Voyage AI.
 * Gestisce rate limit con retry.
 */
async function generateBatch(texts: string[]): Promise<number[][] | null> {
  const body = JSON.stringify({
    model: VOYAGE_MODEL,
    input: texts.map((t) => t.slice(0, 8000)),
    input_type: "document",
  });

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
  };

  const response = await fetchWithRetry(VOYAGE_API_URL, {
    method: "POST",
    headers,
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`  [VOYAGE] Errore ${response.status}: ${errorText.slice(0, 200)}`);

    if (response.status === 429) {
      console.log("  [VOYAGE] Rate limit — attendo 10s...");
      await sleep(10000);

      const retry = await fetchWithRetry(VOYAGE_API_URL, {
        method: "POST",
        headers,
        body,
      });

      if (!retry.ok) return null;
      const retryData: VoyageResponse = await retry.json();
      return retryData.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
    }
    return null;
  }

  const data: VoyageResponse = await response.json();
  return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

/**
 * Genera embeddings e carica articoli su Supabase.
 * Processa in batch da 50, con pausa tra batch per evitare rate limit.
 */
export async function generateEmbeddingsAndUpload(
  supabase: { from: (table: string) => any },
  articles: LegalArticle[]
): Promise<{ inserted: number; errors: number }> {
  let totalInserted = 0;
  let totalErrors = 0;
  const totalBatches = Math.ceil(articles.length / BATCH_SIZE);

  for (let batchIdx = 0; batchIdx < articles.length; batchIdx += BATCH_SIZE) {
    const batch = articles.slice(batchIdx, batchIdx + BATCH_SIZE);
    const batchNum = Math.floor(batchIdx / BATCH_SIZE) + 1;

    // Prepara testi per embedding
    const texts = batch.map((a) =>
      `${a.lawSource} ${a.articleReference}${a.articleTitle ? ` — ${a.articleTitle}` : ""}\n${a.articleText}`
    );

    // Genera embeddings
    const embeddings = await generateBatch(texts);

    if (!embeddings) {
      console.error(`  [BATCH ${batchNum}/${totalBatches}] Errore embeddings — skip`);
      totalErrors += batch.length;
      continue;
    }

    // Upsert su Supabase
    for (let i = 0; i < batch.length; i++) {
      const article = batch[i];
      const { error } = await supabase
        .from("legal_articles")
        .upsert(
          {
            law_source: article.lawSource,
            article_reference: article.articleReference,
            article_title: article.articleTitle,
            article_text: article.articleText,
            hierarchy: article.hierarchy ?? {},
            keywords: article.keywords ?? [],
            related_institutes: article.relatedInstitutes ?? [],
            embedding: JSON.stringify(embeddings[i]),
            source_url: article.sourceUrl,
            is_in_force: article.isInForce ?? true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "law_source,article_reference" }
        );

      if (error) {
        console.error(`  [ERR] ${article.lawSource} ${article.articleReference}: ${error.message}`);
        totalErrors++;
      } else {
        totalInserted++;
      }
    }

    console.log(
      `  [BATCH ${batchNum}/${totalBatches}] ${batch.length} art. — tot: ${totalInserted} ok, ${totalErrors} err`
    );

    // Pausa tra batch
    if (batchIdx + BATCH_SIZE < articles.length) {
      await sleep(2000);
    }
  }

  return { inserted: totalInserted, errors: totalErrors };
}
