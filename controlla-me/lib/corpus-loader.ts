/**
 * Corpus Loader — Parametric loader for any domain.
 *
 * Reads a CorpusConfig JSON, downloads data from sources,
 * applies hierarchy/institute/term classifications,
 * generates embeddings, and ingests into Supabase via DAL.
 */

import { corpus } from "./db";
import type { CorpusArticle } from "./db/corpus";
import { generateEmbeddings, isVectorDBEnabled } from "./embeddings";
import type {
  CorpusConfig,
  DataSourceConfig,
  HierarchyRule,
  InstituteRule,
  TermPatternRule,
  LoadResult,
} from "./types/corpus-config";

const HUGGINGFACE_API = "https://datasets-server.huggingface.co/rows";
const PAGE_SIZE = 100;
const EMBEDDING_BATCH_SIZE = 50;

// ─── Public API ───

export async function loadCorpusFromConfig(config: CorpusConfig): Promise<LoadResult> {
  console.log(`\n[LOADER] Loading corpus: ${config.name} (domain: ${config.domain})`);

  const result: LoadResult = {
    domain: config.domain,
    totalProcessed: 0,
    inserted: 0,
    errors: 0,
    sources: [],
  };

  for (const source of config.dataSources) {
    console.log(`\n[LOADER] Source: ${source.name} (${source.type})`);

    // 1. Download raw data
    const rawRows = await downloadSource(source);
    console.log(`[LOADER] Downloaded ${rawRows.length} rows from ${source.name}`);

    // 2. Transform to CorpusArticle with classifications
    const articles = transformRows(rawRows, source, config);
    console.log(`[LOADER] Transformed ${articles.length} articles`);

    // 3. Generate embeddings and ingest
    const sourceResult = await embedAndIngest(articles, config);

    result.totalProcessed += articles.length;
    result.inserted += sourceResult.inserted;
    result.errors += sourceResult.errors;
    result.sources.push({
      name: source.name,
      articlesProcessed: articles.length,
    });
  }

  console.log(
    `\n[LOADER] Done | ${result.inserted} inserted | ${result.errors} errors | ${result.totalProcessed} total`
  );

  return result;
}

export async function loadCorpusFromFile(configPath: string): Promise<LoadResult> {
  const fs = await import("fs");
  const raw = fs.readFileSync(configPath, "utf-8");
  const config: CorpusConfig = JSON.parse(raw);
  return loadCorpusFromConfig(config);
}

// ─── Download ───

interface RawRow {
  [key: string]: unknown;
}

async function downloadSource(source: DataSourceConfig): Promise<RawRow[]> {
  switch (source.type) {
    case "huggingface":
      return downloadHuggingFace(source);
    default:
      console.warn(`[LOADER] Source type "${source.type}" not yet implemented, skipping`);
      return [];
  }
}

async function downloadHuggingFace(source: DataSourceConfig): Promise<RawRow[]> {
  if (!source.dataset) {
    console.error(`[LOADER] HuggingFace source "${source.name}" missing dataset ID`);
    return [];
  }

  const allRows: RawRow[] = [];
  let offset = 0;
  let totalRows = 0;

  // First request to discover total
  const firstUrl = `${HUGGINGFACE_API}?dataset=${encodeURIComponent(source.dataset)}&config=default&split=train&offset=0&length=${PAGE_SIZE}`;
  const firstResp = await fetchWithRetry(firstUrl);
  const firstData = await firstResp.json();

  totalRows = firstData.num_rows_total;
  for (const item of firstData.rows) {
    allRows.push(item.row);
  }

  offset = PAGE_SIZE;

  while (offset < totalRows) {
    const url = `${HUGGINGFACE_API}?dataset=${encodeURIComponent(source.dataset)}&config=default&split=train&offset=${offset}&length=${PAGE_SIZE}`;
    const resp = await fetchWithRetry(url);
    const data = await resp.json();

    for (const item of data.rows) {
      allRows.push(item.row);
    }

    const page = Math.floor(offset / PAGE_SIZE) + 1;
    const totalPages = Math.ceil(totalRows / PAGE_SIZE);
    if (page % 5 === 0 || page === totalPages) {
      console.log(`[LOADER/HF] Page ${page}/${totalPages} — ${allRows.length}/${totalRows}`);
    }

    offset += PAGE_SIZE;
    await sleep(300);
  }

  return allRows;
}

// ─── Transform ───

function transformRows(
  rows: RawRow[],
  source: DataSourceConfig,
  config: CorpusConfig
): CorpusArticle[] {
  const articles: CorpusArticle[] = [];
  const fm = source.fieldMapping;

  for (const row of rows) {
    const articleId = String(row[fm.id] ?? "");
    const articleTitle = row[fm.title] ? String(row[fm.title]) : null;
    const articleText = String(row[fm.text] ?? "").replace(/\n{3,}/g, "\n\n").replace(/[ \t]+/g, " ").trim();

    if (articleText.length < 10) continue;

    const articleNum = extractArticleNumber(articleId);
    const articleRef = formatArticleReference(articleId);

    // Apply hierarchy
    const hierarchy = articleNum
      ? getHierarchy(articleNum, config.hierarchy)
      : { book: source.lawSource };

    // Apply institutes and keywords
    const { institutes, keywords } = articleNum
      ? getInstitutesAndKeywords(articleNum, config.institutes)
      : { institutes: [] as string[], keywords: [] as string[] };

    // Add keywords from title
    if (articleTitle) {
      const titleWords = articleTitle
        .toLowerCase()
        .replace(/[^\w\sàèéìòùç]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 3);
      for (const w of titleWords) {
        if (!keywords.includes(w)) keywords.push(w);
      }
    }

    // Apply term patterns
    const terms = extractTerms(articleText, config.termPatterns);
    for (const t of terms) {
      if (!keywords.includes(t)) keywords.push(t);
    }

    articles.push({
      lawSource: source.lawSource,
      articleReference: articleRef,
      articleTitle,
      articleText,
      hierarchy,
      keywords,
      relatedInstitutes: institutes,
      sourceUrl: `https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:codice.civile:1942-03-16;262~${articleRef.replace("Art. ", "art")}`,
      isInForce: true,
      domain: config.domain,
    });
  }

  return articles;
}

// ─── Embed & Ingest ───

async function embedAndIngest(
  articles: CorpusArticle[],
  config: CorpusConfig
): Promise<{ inserted: number; errors: number }> {
  if (!isVectorDBEnabled()) {
    console.log("[LOADER] Voyage API not configured — skip");
    return { inserted: 0, errors: 0 };
  }

  let totalInserted = 0;
  let totalErrors = 0;

  for (let i = 0; i < articles.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = articles.slice(i, i + EMBEDDING_BATCH_SIZE);
    const batchNum = Math.floor(i / EMBEDDING_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(articles.length / EMBEDDING_BATCH_SIZE);

    // Generate embeddings
    const texts = batch.map(
      (a) => `${a.lawSource} ${a.articleReference}${a.articleTitle ? ` — ${a.articleTitle}` : ""}\n${a.articleText}`
    );
    const embeddings = await generateEmbeddings(texts, "document", config.embeddingModel);

    if (!embeddings) {
      console.error(`[LOADER] Embedding error batch ${batchNum} — skip`);
      totalErrors += batch.length;
      continue;
    }

    // Ingest via DAL
    const withEmbeddings = batch.map((article, j) => ({
      ...article,
      embedding: embeddings[j],
    }));

    const result = await corpus.ingestArticles(withEmbeddings);
    totalInserted += result.inserted;
    totalErrors += result.errors;

    if (batchNum % 5 === 0 || batchNum === totalBatches) {
      console.log(`[LOADER] Batch ${batchNum}/${totalBatches} — ${totalInserted} inserted, ${totalErrors} errors`);
    }

    // Rate limit between batches
    if (i + EMBEDDING_BATCH_SIZE < articles.length) {
      await sleep(2000);
    }
  }

  return { inserted: totalInserted, errors: totalErrors };
}

// ─── Classification helpers ───

function extractArticleNumber(articleId: string): number | null {
  const match = articleId.match(/art(\d+)/i);
  if (match) return parseInt(match[1], 10);
  const matchBis = articleId.match(/art(\d+)(bis|ter|quater|quinquies|sexies|septies|octies)/i);
  if (matchBis) return parseInt(matchBis[1], 10);
  return null;
}

function formatArticleReference(articleId: string): string {
  const match = articleId.match(/art(\d+)(bis|ter|quater|quinquies|sexies|septies|octies)?/i);
  if (!match) return articleId;
  const num = match[1];
  const suffix = match[2] ? `-${match[2].toLowerCase()}` : "";
  return `Art. ${num}${suffix}`;
}

function getHierarchy(
  articleNum: number,
  rules: HierarchyRule[]
): Record<string, string> {
  let best: Record<string, string> = { book: "Codice Civile" };
  for (const rule of rules) {
    if (articleNum >= rule.from && articleNum <= rule.to) {
      best = { ...rule.hierarchy };
    }
  }
  return best;
}

function getInstitutesAndKeywords(
  articleNum: number,
  rules: InstituteRule[]
): { institutes: string[]; keywords: string[] } {
  const institutes = new Set<string>();
  const keywords = new Set<string>();

  for (const rule of rules) {
    if (articleNum >= rule.from && articleNum <= rule.to) {
      rule.institutes.forEach((i) => institutes.add(i));
      rule.keywords.forEach((k) => keywords.add(k));
    }
  }

  return {
    institutes: Array.from(institutes),
    keywords: Array.from(keywords),
  };
}

function extractTerms(text: string, patterns: TermPatternRule[]): string[] {
  const terms: string[] = [];
  const lower = text.toLowerCase();

  for (const { pattern, term } of patterns) {
    try {
      const re = new RegExp(pattern, "i");
      if (re.test(lower)) {
        terms.push(term);
      }
    } catch {
      // Invalid pattern — skip
    }
  }

  return terms;
}

// ─── Utility ───

async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url);
      return response;
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxRetries) {
        const waitMs = Math.pow(2, attempt + 1) * 1000;
        console.log(`[LOADER] Retry ${attempt + 1}/${maxRetries} — waiting ${waitMs / 1000}s...`);
        await sleep(waitMs);
      }
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
