/**
 * Legal Corpus — Gestione del corpus legislativo italiano in pgvector.
 *
 * Tre tipi di query:
 * 1. Lookup diretto: "dammi tutti gli articoli del D.Lgs. 122/2005"
 * 2. Ricerca per istituto: "vendita_a_corpo" → Art. 1537, 1538, 1539 c.c.
 * 3. Ricerca semantica: "tolleranza superficie vendita" → Art. 1538 c.c.
 *
 * La ricerca semantica è quella che avrebbe corretto l'errore sulla vendita a corpo:
 * il modello ha citato Art. 34-bis DPR 380/2001 (2% edilizio) perché non aveva
 * il testo di Art. 1538 c.c. sotto gli occhi. Con il vector DB lo trova.
 */

import { createAdminClient } from "./supabase/admin";
import {
  generateEmbedding,
  generateEmbeddings,
  isVectorDBEnabled,
} from "./embeddings";

// ─── Tipi ───

export interface LegalArticle {
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
}

export interface LegalArticleSearchResult extends LegalArticle {
  similarity: number;
}

// ─── Query: Lookup singolo articolo per ID ───

/**
 * Recupera un singolo articolo per UUID.
 * Formato compatibile con la UI di /corpus (ArticleDetail).
 */
export async function getArticleById(
  id: string
): Promise<{
  id: string;
  source_id: string;
  source_name: string;
  article_number: string;
  article_title: string | null;
  article_text: string;
  hierarchy: Record<string, string>;
  keywords: string[];
  related_institutes: string[];
  url: string | null;
} | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("legal_articles")
    .select("id, law_source, article_reference, article_title, article_text, hierarchy, keywords, related_institutes, source_url")
    .eq("id", id)
    .single();

  if (error || !data) {
    console.error(`[CORPUS] Errore getArticleById("${id}"): ${error?.message}`);
    return null;
  }

  const r = data as {
    id: string;
    law_source: string;
    article_reference: string;
    article_title: string | null;
    article_text: string;
    hierarchy: Record<string, string> | null;
    keywords: string[] | null;
    related_institutes: string[] | null;
    source_url: string | null;
  };

  return {
    id: r.id,
    source_id: sourceToId(r.law_source),
    source_name: r.law_source,
    article_number: r.article_reference,
    article_title: r.article_title,
    article_text: r.article_text,
    hierarchy: r.hierarchy ?? {},
    keywords: r.keywords ?? [],
    related_institutes: r.related_institutes ?? [],
    url: r.source_url,
  };
}

// ─── Query: Lookup diretto per fonte ───

/**
 * Recupera tutti gli articoli di una specifica fonte legislativa.
 * Esempio: getArticlesBySource("D.Lgs. 122/2005") → tutti gli articoli del decreto
 */
export async function getArticlesBySource(
  lawSource: string,
  limit: number = 50
): Promise<LegalArticle[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_articles_by_source", {
    p_law_source: lawSource,
    p_limit: limit,
  });

  if (error) {
    console.error(`[CORPUS] Errore lookup per fonte "${lawSource}": ${error.message}`);
    return [];
  }

  return (data ?? []).map(mapRowToArticle);
}

// ─── Query: Ricerca per istituto giuridico ───

/**
 * Trova articoli correlati a un istituto giuridico specifico.
 * Esempio: getArticlesByInstitute("vendita_a_corpo") → Art. 1537, 1538, 1539 c.c.
 */
export async function getArticlesByInstitute(
  institute: string,
  limit: number = 20
): Promise<LegalArticle[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("get_articles_by_institute", {
    p_institute: institute,
    p_limit: limit,
  });

  if (error) {
    console.error(`[CORPUS] Errore lookup per istituto "${institute}": ${error.message}`);
    return [];
  }

  return (data ?? []).map(mapRowToArticle);
}

/**
 * Ricerca per istituto RANKED: filtra per istituto ma ordina per similarità alla query.
 * Riusa match_legal_articles con filter_institutes e un embedding pre-calcolato.
 *
 * A differenza di getArticlesByInstitute (ordine alfabetico), qui i primi N risultati
 * sono quelli semanticamente più vicini alla domanda. Risolve il problema degli istituti
 * grandi (78+ articoli) dove quelli rilevanti finivano tagliati dal limit.
 */
export async function searchArticlesByInstitute(
  institute: string,
  queryEmbedding: number[],
  limit: number = 30
): Promise<LegalArticleSearchResult[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("match_legal_articles", {
    query_embedding: JSON.stringify(queryEmbedding),
    filter_law_source: null,
    filter_institutes: [institute],
    match_threshold: 0.3,
    match_count: limit,
  });

  if (error) {
    console.error(`[CORPUS] Errore ricerca ranked per istituto "${institute}": ${error.message}`);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    ...mapRowToArticle(row),
    similarity: row.similarity as number,
  }));
}

// ─── Query: Ricerca semantica ───

/**
 * Cerca articoli per similarità semantica con una query testuale.
 * Questo è il metodo che corregge le hallucination normative.
 *
 * Esempio: searchArticles("tolleranza superficie vendita immobile")
 *   → Art. 1537 c.c. (Vendita a corpo), Art. 1538 c.c. (Eccedenza/deficienza),
 *     Art. 1539 c.c. (Vendita a misura)
 */
export async function searchArticles(
  query: string,
  options: {
    lawSource?: string;
    institutes?: string[];
    threshold?: number;
    limit?: number;
  } = {}
): Promise<LegalArticleSearchResult[]> {
  if (!isVectorDBEnabled()) return [];

  const { lawSource, institutes, threshold = 0.6, limit = 10 } = options;

  const embedding = await generateEmbedding(query, "query");
  if (!embedding) return [];

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("match_legal_articles", {
    query_embedding: JSON.stringify(embedding),
    filter_law_source: lawSource ?? null,
    filter_institutes: institutes ?? null,
    match_threshold: threshold,
    match_count: limit,
  });

  if (error) {
    console.error(`[CORPUS] Errore ricerca semantica: ${error.message}`);
    return [];
  }

  const semanticResults = (data ?? []).map((row: Record<string, unknown>) => ({
    ...mapRowToArticle(row),
    similarity: row.similarity as number,
  }));

  // Fallback testuale: se la ricerca semantica trova <3 risultati, integra con keyword search
  const MIN_SEMANTIC_RESULTS = 3;
  if (semanticResults.length < MIN_SEMANTIC_RESULTS) {
    const textResults = await searchArticlesText(query, { lawSource, limit });
    const existingRefs = new Set(semanticResults.map((r: LegalArticleSearchResult) => r.articleReference));
    const newResults = textResults.filter((r: LegalArticleSearchResult) => !existingRefs.has(r.articleReference));
    const merged = [...semanticResults, ...newResults].slice(0, limit);
    if (newResults.length > 0) {
      console.log(
        `[CORPUS] Fallback testuale "${query}" | semantici: ${semanticResults.length} | testo: +${newResults.length} | totale: ${merged.length}`
      );
    }
    return merged;
  }

  return semanticResults;
}

// ─── Query: Ricerca testuale (fallback per query corte) ───

/**
 * Cerca articoli con ILIKE su article_title e article_reference.
 * Usata come fallback quando la ricerca semantica non trova risultati
 * (es. query molto corte come "vizi" che hanno embedding troppo generico).
 */
export async function searchArticlesText(
  query: string,
  options: { lawSource?: string; limit?: number } = {}
): Promise<LegalArticleSearchResult[]> {
  const { lawSource, limit = 20 } = options;
  const admin = createAdminClient();

  // Use word-boundary pattern to avoid matching substrings (e.g. "vizi" in "servizio")
  // PostgreSQL ILIKE doesn't support \b, so we search with spaces/start/end anchors
  const words = query.trim().toLowerCase().split(/\s+/);
  const fields = "id, law_source, article_reference, article_title, article_text, hierarchy, keywords, related_institutes, source_url, is_in_force";

  // Search in article_title using word-aware patterns
  // For each word, require it as a whole word (surrounded by spaces, punctuation, or start/end)
  // Use PostgreSQL `~*` (case-insensitive regex) via RPC or filter in post
  const pattern = `%${query}%`;

  let queryBuilder = admin
    .from("legal_articles")
    .select(fields)
    .ilike("article_title", pattern)
    .order("article_reference")
    .limit(limit * 3); // Fetch extra to filter

  if (lawSource) {
    queryBuilder = queryBuilder.eq("law_source", lawSource);
  }

  const { data: titleData, error: titleError } = await queryBuilder;

  if (titleError) {
    console.error(`[CORPUS] Errore ricerca testuale titolo: ${titleError.message}`);
    return [];
  }

  // Post-filter: require each query word as a whole word in the title
  const filtered = (titleData ?? []).filter((row: Record<string, unknown>) => {
    const title = ((row.article_title as string) || "").toLowerCase();
    return words.every((w) => {
      // Match word boundaries: start/end of string, space, punctuation
      const regex = new RegExp(`(^|[\\s.,;:()'"\\-/])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([\\s.,;:()'"\\-/]|$)`, "i");
      return regex.test(title);
    });
  });

  const results = filtered.slice(0, limit).map((row: Record<string, unknown>) => ({
    ...mapRowToArticle(row),
    similarity: 1.0, // Text match = max relevance
  }));

  console.log(`[CORPUS] Ricerca testuale "${query}" → ${results.length} risultati (filtrati da ${(titleData ?? []).length})`);
  return results;
}

// ─── Query combinata per la pipeline ───

/**
 * Recupera contesto normativo completo per un documento analizzato.
 * Combina:
 * 1. Lookup diretto per le leggi identificate dal Classifier
 * 2. Ricerca per istituti giuridici identificati
 * 3. Ricerca semantica per le clausole problematiche
 *
 * Questo è il punto di inserimento tra Classifier e Analyzer.
 */
export async function retrieveLegalContext(params: {
  applicableLaws: Array<{ reference: string; name: string }>;
  relevantInstitutes?: string[];
  clauseTexts?: string[];
  maxArticles?: number;
}): Promise<{
  bySource: Record<string, LegalArticle[]>;
  byInstitute: Record<string, LegalArticle[]>;
  bySemantic: LegalArticleSearchResult[];
}> {
  const {
    applicableLaws,
    relevantInstitutes = [],
    clauseTexts = [],
    maxArticles = 30,
  } = params;

  const bySource: Record<string, LegalArticle[]> = {};
  const byInstitute: Record<string, LegalArticle[]> = {};
  let bySemantic: LegalArticleSearchResult[] = [];

  // 1. Lookup diretto per ogni fonte legislativa
  const sourcePromises = applicableLaws.map(async (law) => {
    // Normalizza il riferimento: "D.Lgs. 122/2005" o "Art. 1538 c.c."
    const source = normalizeLawSource(law.reference);
    if (source) {
      const articles = await getArticlesBySource(source, 20);
      if (articles.length > 0) {
        bySource[source] = articles;
      }
    }
  });

  // 2. Ricerca per istituti giuridici
  const institutePromises = relevantInstitutes.map(async (institute) => {
    const articles = await getArticlesByInstitute(institute, 10);
    if (articles.length > 0) {
      byInstitute[institute] = articles;
    }
  });

  // Esegui lookup diretto e per istituto in parallelo
  await Promise.all([...sourcePromises, ...institutePromises]);

  // 3. Ricerca semantica per clausole (se il vector DB è attivo)
  if (clauseTexts.length > 0 && isVectorDBEnabled()) {
    // Combina le clausole in una query unica per efficienza
    const combinedQuery = clauseTexts.slice(0, 5).join("\n\n");
    bySemantic = await searchArticles(combinedQuery, {
      threshold: 0.55,
      limit: maxArticles,
    });
  }

  const totalArticles =
    Object.values(bySource).flat().length +
    Object.values(byInstitute).flat().length +
    bySemantic.length;

  console.log(
    `[CORPUS] Contesto normativo recuperato | ` +
      `${Object.keys(bySource).length} fonti (${Object.values(bySource).flat().length} art.) | ` +
      `${Object.keys(byInstitute).length} istituti (${Object.values(byInstitute).flat().length} art.) | ` +
      `${bySemantic.length} semantici | totale: ${totalArticles}`
  );

  return { bySource, byInstitute, bySemantic };
}

/**
 * Formatta il contesto normativo in un blocco di testo per il prompt dell'Analyzer.
 * Produce un output strutturato che l'agente può usare direttamente.
 */
export function formatLegalContextForPrompt(context: {
  bySource: Record<string, LegalArticle[]>;
  byInstitute: Record<string, LegalArticle[]>;
  bySemantic: LegalArticleSearchResult[];
}, maxChars: number = 6000): string {
  const sections: string[] = [];
  let totalChars = 0;

  // Sezione 1: Articoli per fonte legislativa
  for (const [source, articles] of Object.entries(context.bySource)) {
    if (totalChars >= maxChars) break;
    const section = `\n══ ${source} ══\n` +
      articles
        .map((a) => `${a.articleReference}${a.articleTitle ? ` — ${a.articleTitle}` : ""}\n${a.articleText}`)
        .join("\n\n");
    if (totalChars + section.length <= maxChars) {
      sections.push(section);
      totalChars += section.length;
    }
  }

  // Sezione 2: Articoli per istituto giuridico
  for (const [institute, articles] of Object.entries(context.byInstitute)) {
    if (totalChars >= maxChars) break;
    const section = `\n── Istituto: ${institute.replace(/_/g, " ")} ──\n` +
      articles
        .map((a) => `${a.lawSource} ${a.articleReference}${a.articleTitle ? ` — ${a.articleTitle}` : ""}\n${a.articleText}`)
        .join("\n\n");
    if (totalChars + section.length <= maxChars) {
      sections.push(section);
      totalChars += section.length;
    }
  }

  // Sezione 3: Articoli trovati per similarità semantica (i più rilevanti)
  if (context.bySemantic.length > 0) {
    const semanticSection = `\n── Norme correlate (ricerca semantica) ──\n` +
      context.bySemantic
        .filter((a) => totalChars + a.articleText.length < maxChars)
        .map((a) => `${a.lawSource} ${a.articleReference} (pertinenza: ${(a.similarity * 100).toFixed(0)}%)\n${a.articleText}`)
        .join("\n\n");
    if (semanticSection.length > 50) {
      sections.push(semanticSection);
    }
  }

  if (sections.length === 0) return "";

  return `\n╔══════════════════════════════════════════════╗
║  CONTESTO NORMATIVO (dal corpus legislativo)  ║
╚══════════════════════════════════════════════╝
${sections.join("\n")}
╔══════════════════════════════════════════════╗
║  FINE CONTESTO NORMATIVO                     ║
╚══════════════════════════════════════════════╝\n`;
}

// ─── Ingest: caricamento articoli nel DB ───

/**
 * Carica un batch di articoli nel vector DB con embeddings.
 * Usato dallo script di ingest per popolare il corpus iniziale.
 */
export async function ingestArticles(
  articles: LegalArticle[]
): Promise<{ inserted: number; errors: number }> {
  if (!isVectorDBEnabled()) {
    console.log("[CORPUS] Voyage API non configurata — skip ingest");
    return { inserted: 0, errors: 0 };
  }

  const admin = createAdminClient();
  let inserted = 0;
  let errors = 0;

  // Genera embeddings in batch
  const texts = articles.map((a) =>
    `${a.lawSource} ${a.articleReference}${a.articleTitle ? ` — ${a.articleTitle}` : ""}\n${a.articleText}`
  );
  const embeddings = await generateEmbeddings(texts);

  if (!embeddings) {
    console.error("[CORPUS] Errore generazione embeddings per ingest");
    return { inserted: 0, errors: articles.length };
  }

  // Inserisci in batch con upsert
  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const { error } = await admin
      .from("legal_articles")
      .upsert(
        {
          // Colonne originali (migration 003)
          source_id: sourceToId(article.lawSource),
          source_name: article.lawSource,
          source_type: detectSourceType(article.lawSource),
          article_number: article.articleReference.replace(/^Art\.\s*/i, ""),
          // Colonne aggiuntive (usate da ingestArticles/seed-corpus)
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
      console.error(
        `[CORPUS] Errore ingest ${article.lawSource} ${article.articleReference}: ${error.message}`
      );
      errors++;
    } else {
      inserted++;
    }
  }

  console.log(
    `[CORPUS] Ingest completato | ${inserted} inseriti | ${errors} errori | ${articles.length} totali`
  );

  return { inserted, errors };
}

/**
 * Statistiche sul corpus caricato.
 */
export async function getCorpusStats(): Promise<{
  totalArticles: number;
  bySource: Record<string, number>;
  hasEmbeddings: number;
}> {
  const admin = createAdminClient();

  const { count: totalArticles } = await admin
    .from("legal_articles")
    .select("*", { count: "exact", head: true });

  const bySource: Record<string, number> = {};
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const { data: page } = await admin
      .from("legal_articles")
      .select("law_source")
      .range(offset, offset + pageSize - 1);
    if (!page || page.length === 0) break;
    for (const row of page) {
      const src = (row as { law_source: string }).law_source;
      bySource[src] = (bySource[src] ?? 0) + 1;
    }
    offset += page.length;
    if (page.length < pageSize) break;
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

// ─── Query: istituti giuridici (per API /corpus/institutes) ───

export interface InstituteInfo {
  name: string;
  label: string;
  count: number;
}

/**
 * Lista tutti gli istituti giuridici distinti con conteggio articoli.
 * Usa unnest(related_institutes) per espandere gli array.
 */
export async function getDistinctInstitutes(): Promise<InstituteInfo[]> {
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("get_distinct_institutes");

  if (error) {
    console.error(`[CORPUS] Errore getDistinctInstitutes: ${error.message}`);
    // Fallback: query manuale paginata
    return getDistinctInstitutesFallback();
  }

  return ((data as Array<{ institute: string; count: number }>) ?? []).map((row) => ({
    name: row.institute,
    label: formatInstituteLabel(row.institute),
    count: row.count,
  }));
}

/**
 * Fallback per getDistinctInstitutes se la RPC non esiste.
 * Legge tutti gli articoli e aggrega lato client.
 */
async function getDistinctInstitutesFallback(): Promise<InstituteInfo[]> {
  const admin = createAdminClient();
  const counts: Record<string, number> = {};
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data: page } = await admin
      .from("legal_articles")
      .select("related_institutes")
      .not("related_institutes", "eq", "{}")
      .range(offset, offset + pageSize - 1);
    if (!page || page.length === 0) break;
    for (const row of page) {
      const institutes = (row as { related_institutes: string[] | null }).related_institutes;
      if (institutes) {
        for (const inst of institutes) {
          counts[inst] = (counts[inst] ?? 0) + 1;
        }
      }
    }
    offset += page.length;
    if (page.length < pageSize) break;
  }

  return Object.entries(counts)
    .map(([name, count]) => ({
      name,
      label: formatInstituteLabel(name),
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Recupera articoli per un dato istituto (per la UI /corpus).
 * Restituisce info leggere (no testo completo).
 */
export async function getArticlesByInstituteForUI(
  institute: string,
  limit: number = 100
): Promise<Array<{
  id: string;
  article_number: string;
  article_title: string | null;
  source_name: string;
  hierarchy: Record<string, string>;
}>> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("legal_articles")
    .select("id, article_reference, article_title, law_source, hierarchy")
    .contains("related_institutes", [institute])
    .order("law_source")
    .order("article_reference")
    .limit(limit);

  if (error) {
    console.error(`[CORPUS] Errore getArticlesByInstituteForUI("${institute}"): ${error.message}`);
    return [];
  }

  return ((data as Array<{
    id: string;
    article_reference: string;
    article_title: string | null;
    law_source: string;
    hierarchy: Record<string, string> | null;
  }>) ?? []).map((r) => ({
    id: r.id,
    article_number: r.article_reference,
    article_title: r.article_title,
    source_name: r.law_source,
    hierarchy: r.hierarchy ?? {},
  }));
}

/**
 * Formatta nome istituto: vendita_a_corpo → Vendita a corpo
 */
export function formatInstituteLabel(name: string): string {
  const s = name.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Query: fonti e gerarchia (per API /corpus/hierarchy) ───

interface SourceInfo {
  source_id: string;
  source_name: string;
  source_type: string;
  article_count: number;
}

interface HierarchyNode {
  key: string;
  label: string;
  children: HierarchyNode[];
  articles: Array<{
    id: string;
    article_number: string;
    article_title: string | null;
    hierarchy: Record<string, string>;
  }>;
}

/**
 * Determina il tipo di fonte (normattiva per italiane, eurlex per EU).
 */
function detectSourceType(lawSource: string): string {
  if (/Dir\.|Reg\.|GDPR|DSA|DMA|EUR/i.test(lawSource)) return "eurlex";
  return "normattiva";
}

/**
 * Genera un ID slug dalla fonte.
 */
function sourceToId(lawSource: string): string {
  return lawSource
    .toLowerCase()
    .replace(/[.\s/]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Lista tutte le fonti legislative nel corpus con conteggio articoli.
 * Formato compatibile con la UI di /corpus.
 */
export async function getCorpusSources(): Promise<SourceInfo[]> {
  const admin = createAdminClient();
  const counts: Record<string, number> = {};
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const { data: page, error } = await admin
      .from("legal_articles")
      .select("law_source")
      .range(offset, offset + pageSize - 1);
    if (error) {
      console.error(`[CORPUS] Errore getCorpusSources: ${error.message}`);
      break;
    }
    if (!page || page.length === 0) break;
    for (const row of page) {
      const src = (row as { law_source: string }).law_source;
      counts[src] = (counts[src] ?? 0) + 1;
    }
    offset += page.length;
    if (page.length < pageSize) break;
  }

  return Object.entries(counts)
    .map(([source, count]) => ({
      source_id: sourceToId(source),
      source_name: source,
      source_type: detectSourceType(source),
      article_count: count,
    }))
    .sort((a, b) => b.article_count - a.article_count);
}

/**
 * Restituisce l'albero navigabile di una fonte legislativa.
 * Raggruppa gli articoli per hierarchy (libro, titolo, capo, sezione).
 * Formato compatibile con la UI di /corpus (HierarchyNode[]).
 */
export async function getSourceHierarchy(
  sourceId: string
): Promise<{
  source_id: string;
  source_name: string;
  source_type: string;
  article_count: number;
  tree: HierarchyNode[];
} | null> {
  // sourceId può essere uno slug o il nome diretto della fonte
  const admin = createAdminClient();
  const fields = "id, law_source, article_reference, article_title, hierarchy";

  // Funzione helper per fetch paginato
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function fetchAllPages(queryBuilder: () => any) {
    const allRows: Record<string, unknown>[] = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data: page } = await queryBuilder().range(offset, offset + pageSize - 1);
      if (!page || page.length === 0) break;
      allRows.push(...(page as Record<string, unknown>[]));
      offset += page.length;
      if (page.length < pageSize) break;
    }
    return allRows;
  }

  // Prova prima un match esatto
  let data = await fetchAllPages(() =>
    admin.from("legal_articles").select(fields).eq("law_source", sourceId).order("article_reference")
  );

  // Se non trova, prova con ilike (slug → nome originale)
  if (data.length === 0) {
    const pattern = sourceId.replace(/_/g, "%");
    data = await fetchAllPages(() =>
      admin.from("legal_articles").select(fields).ilike("law_source", `%${pattern}%`).order("article_reference")
    );
  }

  if (data.length === 0) return null;

  const sourceName = (data[0] as { law_source: string }).law_source;

  // Costruisci albero HierarchyNode[] dai dati
  const rootMap = new Map<string, HierarchyNode>();

  for (const row of data) {
    const r = row as {
      id: string;
      law_source: string;
      article_reference: string;
      article_title: string | null;
      hierarchy: Record<string, string> | null;
    };

    const h = r.hierarchy ?? {};
    const keys = Object.keys(h);
    const articleEntry = {
      id: r.id,
      article_number: r.article_reference,
      article_title: r.article_title,
      hierarchy: h,
    };

    if (keys.length === 0) {
      // Articolo senza gerarchia → nodo radice fittizio
      const rootKey = "__root__";
      if (!rootMap.has(rootKey)) {
        rootMap.set(rootKey, {
          key: rootKey,
          label: "Articoli",
          children: [],
          articles: [],
        });
      }
      rootMap.get(rootKey)!.articles.push(articleEntry);
    } else {
      // Naviga/crea i nodi per ogni livello di hierarchy
      const topKey = h[keys[0]];
      if (!rootMap.has(topKey)) {
        rootMap.set(topKey, {
          key: topKey,
          label: topKey,
          children: [],
          articles: [],
        });
      }

      let currentNode = rootMap.get(topKey)!;

      for (let i = 1; i < keys.length; i++) {
        const val = h[keys[i]];
        let child = currentNode.children.find((c) => c.key === val);
        if (!child) {
          child = { key: val, label: val, children: [], articles: [] };
          currentNode.children.push(child);
        }
        currentNode = child;
      }

      currentNode.articles.push(articleEntry);
    }
  }

  return {
    source_id: sourceToId(sourceName),
    source_name: sourceName,
    source_type: detectSourceType(sourceName),
    article_count: data.length,
    tree: Array.from(rootMap.values()),
  };
}

// ─── Utility ───

function mapRowToArticle(row: Record<string, unknown>): LegalArticle {
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

/**
 * Normalizza un riferimento legislativo in un nome di fonte.
 * "Art. 1538 c.c." → "Codice Civile"
 * "D.Lgs. 122/2005" → "Tutela acquirenti immobili da costruire"
 * "Art. 6 D.Lgs. 122/2005" → "Tutela acquirenti immobili da costruire"
 * "GDPR" → "GDPR (Reg. 2016/679)"
 * "Dir. 93/13" → "Direttiva clausole abusive (93/13/CEE)"
 */

// Mappa D.Lgs./DPR/L. numeri → nomi canonici (da corpus-sources.ts)
const DECREE_TO_CANONICAL: Record<string, string> = {
  "206/2005": "Codice del Consumo",
  "122/2005": "Tutela acquirenti immobili da costruire",
  "231/2001": "Responsabilita amministrativa enti",
};

const DPR_TO_CANONICAL: Record<string, string> = {
  "380/2001": "Testo Unico Edilizia",
};

const LEGGE_TO_CANONICAL: Record<string, string> = {
  "300/1970": "Statuto dei Lavoratori",
};

function normalizeLawSource(reference: string): string | null {
  const ref = reference.trim();

  // Codice Civile
  if (/c\.c\./i.test(ref) || /codice\s+civile/i.test(ref)) {
    return "Codice Civile";
  }

  // Codice Penale
  if (/c\.p\.\s*[^c]/i.test(ref) || /c\.p\.$/i.test(ref) || /codice\s+penale/i.test(ref)) {
    return "Codice Penale";
  }

  // Codice di Procedura Civile
  if (/c\.p\.c\./i.test(ref) || /procedura\s+civile/i.test(ref)) {
    return "Codice di Procedura Civile";
  }

  // Codice del Consumo (check prima dei D.Lgs. generici)
  if (/consumo/i.test(ref) || /206\/2005/.test(ref)) {
    return "Codice del Consumo";
  }

  // TU Edilizia (check prima dei DPR generici)
  if (/edilizia/i.test(ref) || /380\/2001/.test(ref)) {
    return "Testo Unico Edilizia";
  }

  // Statuto dei Lavoratori
  if (/statuto\s+dei\s+lavoratori/i.test(ref) || /300\/1970/.test(ref)) {
    return "Statuto dei Lavoratori";
  }

  // GDPR / Regolamento privacy
  if (/gdpr/i.test(ref) || /2016\/679/.test(ref) || /protezione\s+dati/i.test(ref)) {
    return "GDPR (Reg. 2016/679)";
  }

  // DSA / Digital Services Act
  if (/\bdsa\b/i.test(ref) || /2022\/2065/.test(ref) || /digital\s+services/i.test(ref)) {
    return "Digital Services Act (Reg. 2022/2065)";
  }

  // Direttiva clausole abusive
  if (/93\/13/i.test(ref) || /clausole\s+abusive/i.test(ref)) {
    return "Direttiva clausole abusive (93/13/CEE)";
  }

  // Direttiva consumatori
  if (/2011\/83/i.test(ref) || /diritti\s+dei\s+consumatori/i.test(ref)) {
    return "Direttiva diritti dei consumatori (2011/83/UE)";
  }

  // Direttiva vendita beni
  if (/2019\/771/i.test(ref) || /vendita\s+beni/i.test(ref)) {
    return "Direttiva vendita beni (2019/771/UE)";
  }

  // Regolamento Roma I
  if (/roma\s*i/i.test(ref) || /593\/2008/i.test(ref)) {
    return "Regolamento Roma I (593/2008)";
  }

  // D.Lgs. / Decreto Legislativo — con lookup canonico
  const dlgs = ref.match(/D\.?\s*Lgs\.?\s*(?:n\.?\s*)?(\d+)\s*\/\s*(\d+)/i);
  if (dlgs) {
    const key = `${dlgs[1]}/${dlgs[2]}`;
    return DECREE_TO_CANONICAL[key] || `D.Lgs. ${dlgs[1]}/${dlgs[2]}`;
  }

  // DPR — con lookup canonico
  const dpr = ref.match(/D\.?P\.?R\.?\s*(?:n\.?\s*)?(\d+)\s*\/\s*(\d+)/i);
  if (dpr) {
    const key = `${dpr[1]}/${dpr[2]}`;
    return DPR_TO_CANONICAL[key] || `DPR ${dpr[1]}/${dpr[2]}`;
  }

  // Legge — con lookup canonico
  const legge = ref.match(/L\.?\s*(?:n\.?\s*)?(\d+)\s*\/\s*(\d+)/i);
  if (legge) {
    const key = `${legge[1]}/${legge[2]}`;
    return LEGGE_TO_CANONICAL[key] || `L. ${legge[1]}/${legge[2]}`;
  }

  return null;
}
