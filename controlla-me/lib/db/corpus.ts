/**
 * DAL — Corpus
 *
 * Operations on the legal_articles table.
 * All operations use admin client (service_role, no RLS).
 */

import { createAdminClient } from "../supabase/admin";

// ─── Types ───

export interface CorpusArticle {
  id?: string;
  lawSource: string;
  articleReference: string;
  articleTitle: string | null;
  articleText: string;
  hierarchy?: Record<string, string>;
  keywords?: string[];
  relatedInstitutes?: string[];
  sourceUrl?: string;
  isInForce?: boolean;
  domain?: string;
}

export interface CorpusArticleSearchResult extends CorpusArticle {
  similarity: number;
}

export interface CorpusStats {
  totalArticles: number;
  bySource: Record<string, number>;
  hasEmbeddings: number;
}

// ─── Lookup Queries ───

/**
 * Get articles from a specific law source.
 * Example: getArticlesBySource("D.Lgs. 122/2005")
 */
export async function getArticlesBySource(
  lawSource: string,
  limit: number = 50,
  domain?: string
): Promise<CorpusArticle[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_articles_by_source", {
    p_law_source: lawSource,
    p_limit: limit,
    p_domain: domain ?? null,
  });

  if (error) {
    console.error(`[DAL/corpus] Source lookup error "${lawSource}": ${error.message}`);
    return [];
  }

  return (data ?? []).map(mapRowToArticle);
}

/**
 * Get articles by juridical institute.
 * Example: getArticlesByInstitute("vendita_a_corpo")
 */
export async function getArticlesByInstitute(
  institute: string,
  limit: number = 20,
  domain?: string
): Promise<CorpusArticle[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_articles_by_institute", {
    p_institute: institute,
    p_limit: limit,
    p_domain: domain ?? null,
  });

  if (error) {
    console.error(`[DAL/corpus] Institute lookup error "${institute}": ${error.message}`);
    return [];
  }

  return (data ?? []).map(mapRowToArticle);
}

// ─── Semantic Search ───

/**
 * Semantic search on legal articles by pre-computed embedding.
 */
export async function searchArticlesBySemantic(
  embedding: number[],
  opts: {
    lawSource?: string;
    institutes?: string[];
    domain?: string;
    threshold?: number;
    limit?: number;
  } = {}
): Promise<CorpusArticleSearchResult[]> {
  const { lawSource, institutes, domain, threshold = 0.6, limit = 10 } = opts;
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("match_legal_articles", {
    query_embedding: JSON.stringify(embedding),
    filter_law_source: lawSource ?? null,
    filter_institutes: institutes ?? null,
    filter_domain: domain ?? null,
    match_threshold: threshold,
    match_count: limit,
  });

  if (error) {
    console.error(`[DAL/corpus] Semantic search error: ${error.message}`);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    ...mapRowToArticle(row),
    similarity: row.similarity as number,
  }));
}

// ─── Ingest ───

/**
 * Upsert articles with embeddings into the corpus.
 * Idempotent via composite key (law_source, article_reference).
 */
export async function ingestArticles(
  articles: Array<CorpusArticle & { embedding: number[] }>
): Promise<{ inserted: number; errors: number }> {
  const admin = createAdminClient();
  let inserted = 0;
  let errors = 0;

  for (const article of articles) {
    // Extract article number from reference (e.g. "Art. 123" → "123")
    const artNumMatch = article.articleReference.match(/Art\.\s*(\d+(?:-\w+)?)/);
    const articleNumber = artNumMatch ? artNumMatch[1] : article.articleReference;

    // Build source_id from lawSource (e.g. "Codice Civile" → "codice_civile")
    const sourceId = article.lawSource
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, "_");

    const { error } = await admin
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
          embedding: JSON.stringify(article.embedding),
          source_url: article.sourceUrl,
          is_in_force: article.isInForce ?? true,
          domain: article.domain ?? "legal",
          updated_at: new Date().toISOString(),
          source_id: sourceId,
          source_name: article.lawSource,
          source_type: "huggingface",
          article_number: articleNumber,
          in_force: article.isInForce ?? true,
          url: article.sourceUrl,
        },
        { onConflict: "law_source,article_reference" }
      );

    if (error) {
      console.error(
        `[DAL/corpus] Ingest error ${article.lawSource} ${article.articleReference}: ${error.message}`
      );
      errors++;
    } else {
      inserted++;
    }
  }

  return { inserted, errors };
}

// ─── Stats ───

/**
 * Get corpus statistics.
 */
export async function getCorpusStats(): Promise<CorpusStats> {
  const admin = createAdminClient();

  const { count: totalArticles } = await admin
    .from("legal_articles")
    .select("*", { count: "exact", head: true });

  const { data: sourceRows } = await admin
    .from("legal_articles")
    .select("law_source");

  const bySource: Record<string, number> = {};
  for (const row of sourceRows ?? []) {
    const src = (row as { law_source: string }).law_source;
    bySource[src] = (bySource[src] ?? 0) + 1;
  }

  const { count: hasEmbeddings } = await admin
    .from("legal_articles")
    .select("*", { count: "exact", head: true })
    .not("embedding", "is", null);

  return {
    totalArticles: totalArticles ?? 0,
    bySource,
    hasEmbeddings: hasEmbeddings ?? 0,
  };
}

// ─── Internal ───

function mapRowToArticle(row: Record<string, unknown>): CorpusArticle {
  return {
    id: row.id as string,
    lawSource: row.law_source as string,
    articleReference: row.article_reference as string,
    articleTitle: row.article_title as string | null,
    articleText: row.article_text as string,
    hierarchy: row.hierarchy as Record<string, string>,
    keywords: row.keywords as string[],
    relatedInstitutes: row.related_institutes as string[],
    sourceUrl: row.source_url as string,
    isInForce: row.is_in_force as boolean,
  };
}
