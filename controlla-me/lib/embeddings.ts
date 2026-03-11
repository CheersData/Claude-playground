/**
 * Embeddings client — genera vettori semantici via Voyage AI.
 *
 * Voyage AI è raccomandato da Anthropic e ha modelli specifici per testi legali.
 * Modelli disponibili:
 *   - voyage-3:     general purpose, 1024 dims (default)
 *   - voyage-law-2: specifico per testi legali, 1024 dims (consigliato)
 *
 * Richiede: VOYAGE_API_KEY nel .env.local
 * Se la chiave non è presente, tutte le operazioni vector DB vengono saltate silenziosamente.
 */

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const DEFAULT_MODEL = "voyage-law-2"; // Ottimizzato per testi legali italiani
const EMBEDDING_DIMENSIONS = 1024;
const MAX_BATCH_SIZE = 128; // Voyage AI max batch size

export { EMBEDDING_DIMENSIONS };

interface VoyageResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  usage: {
    total_tokens: number;
  };
}

/** Check if vector DB features are available (Voyage API key present) */
export function isVectorDBEnabled(): boolean {
  return !!process.env.VOYAGE_API_KEY;
}

/**
 * Generate embedding for a single text string.
 * Returns null if Voyage API key is not configured.
 */
export async function generateEmbedding(
  text: string,
  inputType: "document" | "query" = "document",
  model?: string
): Promise<number[] | null> {
  if (!process.env.VOYAGE_API_KEY) {
    return null;
  }

  const result = await generateEmbeddings([text], inputType, model);
  return result ? result[0] : null;
}

/**
 * Generate embeddings for multiple texts in batch.
 * Returns null if Voyage API key is not configured.
 */
export async function generateEmbeddings(
  texts: string[],
  inputType: "document" | "query" = "document",
  model?: string
): Promise<number[][] | null> {
  if (!process.env.VOYAGE_API_KEY) {
    console.log("[EMBEDDINGS] Voyage API key non configurata — skip");
    return null;
  }

  if (texts.length === 0) return [];

  const allEmbeddings: number[][] = [];

  const useModel = model ?? DEFAULT_MODEL;

  // Process in batches
  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE);

    const response = await fetch(VOYAGE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({
        model: useModel,
        input: batch,
        input_type: inputType,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[EMBEDDINGS] Errore Voyage API (${response.status}): ${errorText}`
      );

      // On rate limit, wait and retry once
      if (response.status === 429) {
        console.log("[EMBEDDINGS] Rate limit — attendo 5s e riprovo...");
        await new Promise((r) => setTimeout(r, 5000));

        const retry = await fetch(VOYAGE_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
          },
          body: JSON.stringify({
            model: useModel,
            input: batch,
            input_type: inputType,
          }),
        });

        if (!retry.ok) {
          console.error("[EMBEDDINGS] Retry fallito — skip batch");
          return null;
        }

        const retryData: VoyageResponse = await retry.json();
        const sorted = retryData.data.sort((a, b) => a.index - b.index);
        allEmbeddings.push(...sorted.map((d) => d.embedding));

        console.log(
          `[EMBEDDINGS] Retry OK | batch ${i / MAX_BATCH_SIZE + 1} | ${retryData.usage.total_tokens} tokens`
        );
        continue;
      }

      return null;
    }

    const data: VoyageResponse = await response.json();

    // Sort by index to maintain order
    const sorted = data.data.sort((a, b) => a.index - b.index);
    allEmbeddings.push(...sorted.map((d) => d.embedding));

    console.log(
      `[EMBEDDINGS] Batch ${Math.floor(i / MAX_BATCH_SIZE) + 1}/${Math.ceil(texts.length / MAX_BATCH_SIZE)} | ${batch.length} testi | ${data.usage.total_tokens} tokens`
    );
  }

  return allEmbeddings;
}

/**
 * Truncate text to fit within Voyage's token limits.
 * Voyage-3 supports up to 32K tokens, but we keep chunks smaller for better results.
 */
export function truncateForEmbedding(text: string, maxChars: number = 8000): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "...";
}
