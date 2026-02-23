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

  return (data ?? []).map((row: Record<string, unknown>) => ({
    ...mapRowToArticle(row),
    similarity: row.similarity as number,
  }));
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
          ...(article.sourceId ? { source_id: article.sourceId } : {}),
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

  // Fetch paginato per superare il limite di 1000 righe
  const allSourceRows: Array<{ law_source: string }> = [];
  let statsOffset = 0;
  const statsPageSize = 1000;

  while (true) {
    const { data: page } = await admin
      .from("legal_articles")
      .select("law_source")
      .range(statsOffset, statsOffset + statsPageSize - 1);

    if (!page || page.length === 0) break;
    allSourceRows.push(...(page as Array<{ law_source: string }>));
    if (page.length < statsPageSize) break;
    statsOffset += statsPageSize;
  }

  const bySource: Record<string, number> = {};
  for (const row of allSourceRows) {
    bySource[row.law_source] = (bySource[row.law_source] ?? 0) + 1;
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

// ─── Query: Navigazione gerarchica del corpus ───

/**
 * Lista tutte le fonti legislative presenti nel corpus con conteggio articoli.
 * Usato dalla pagina /corpus per mostrare l'albero navigabile.
 */
export async function getCorpusSources(): Promise<
  Array<{ lawSource: string; articleCount: number }>
> {
  const admin = createAdminClient();

  // Prova prima la RPC server-side (più efficiente, no limit 1000)
  const { data: rpcData, error: rpcError } = await admin.rpc("get_corpus_sources_count");
  if (!rpcError && rpcData) {
    return (rpcData as Array<{ law_source: string; article_count: number }>).map((r) => ({
      lawSource: r.law_source,
      articleCount: r.article_count,
    }));
  }

  // Fallback: fetch paginato per superare il limite di 1000 righe
  const allRows: Array<{ law_source: string }> = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data } = await admin
      .from("legal_articles")
      .select("law_source")
      .eq("is_in_force", true)
      .range(offset, offset + pageSize - 1);

    if (!data || data.length === 0) break;
    allRows.push(...(data as Array<{ law_source: string }>));
    if (data.length < pageSize) break; // ultima pagina
    offset += pageSize;
  }

  const counts: Record<string, number> = {};
  for (const row of allRows) {
    counts[row.law_source] = (counts[row.law_source] ?? 0) + 1;
  }

  return Object.entries(counts)
    .map(([lawSource, articleCount]) => ({ lawSource, articleCount }))
    .sort((a, b) => a.lawSource.localeCompare(b.lawSource));
}

/**
 * Restituisce la struttura gerarchica di una fonte (Libri/Titoli/Capi).
 * Usato per l'albero espandibile nella pagina /corpus.
 */
export async function getSourceHierarchy(
  lawSource: string
): Promise<Array<{ hierarchy: Record<string, string>; articleCount: number; articles: Array<{ ref: string; title: string | null }> }>> {
  const admin = createAdminClient();

  // Fetch paginato per superare il limite di 1000 righe di Supabase
  const allData: Array<Record<string, unknown>> = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data } = await admin
      .from("legal_articles")
      .select("article_reference, article_title, hierarchy")
      .eq("law_source", lawSource)
      .eq("is_in_force", true)
      .order("article_reference")
      .range(offset, offset + pageSize - 1);

    if (!data || data.length === 0) break;
    allData.push(...(data as Array<Record<string, unknown>>));
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  const data = allData;
  if (!data.length) return [];

  // Raggruppa per gerarchia
  const groups = new Map<string, {
    hierarchy: Record<string, string>;
    articles: Array<{ ref: string; title: string | null }>;
  }>();

  for (const row of data) {
    const h = (row as any).hierarchy as Record<string, string> ?? {};
    const key = JSON.stringify(h);

    if (!groups.has(key)) {
      groups.set(key, { hierarchy: h, articles: [] });
    }

    groups.get(key)!.articles.push({
      ref: (row as any).article_reference as string,
      title: (row as any).article_title as string | null,
    });
  }

  return Array.from(groups.values()).map((g) => ({
    hierarchy: g.hierarchy,
    articleCount: g.articles.length,
    articles: g.articles,
  }));
}

/**
 * Cerca articoli per testo (full-text search) all'interno di una fonte.
 */
export async function searchArticlesFullText(
  query: string,
  lawSource?: string,
  limit: number = 20
): Promise<LegalArticle[]> {
  const admin = createAdminClient();

  let q = admin
    .from("legal_articles")
    .select("*")
    .eq("is_in_force", true)
    .or(`article_text.ilike.%${query}%,article_title.ilike.%${query}%,article_reference.ilike.%${query}%`)
    .limit(limit);

  if (lawSource) {
    q = q.eq("law_source", lawSource);
  }

  const { data, error } = await q;

  if (error) {
    console.error(`[CORPUS] Errore ricerca full-text: ${error.message}`);
    return [];
  }

  return (data ?? []).map(mapRowToArticle);
}

/**
 * Recupera un singolo articolo per fonte + riferimento.
 */
export async function getArticle(
  lawSource: string,
  articleReference: string
): Promise<LegalArticle | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("legal_articles")
    .select("*")
    .eq("law_source", lawSource)
    .eq("article_reference", articleReference)
    .single();

  if (error || !data) return null;
  return mapRowToArticle(data as Record<string, unknown>);
}

/**
 * Dati per breadcrumb: fonte → gerarchia → articolo
 */
export interface BreadcrumbData {
  lawSource: string;
  hierarchy: Record<string, string>;
  articleReference: string;
  articleTitle: string | null;
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
 * "D.Lgs. 122/2005" → "D.Lgs. 122/2005"
 * "Art. 6 D.Lgs. 122/2005" → "D.Lgs. 122/2005"
 */
function normalizeLawSource(reference: string): string | null {
  const ref = reference.trim();

  // Codice Civile
  if (/c\.c\./i.test(ref) || /codice\s+civile/i.test(ref)) {
    return "Codice Civile";
  }

  // Codice di Procedura Civile
  if (/c\.p\.c\./i.test(ref) || /procedura\s+civile/i.test(ref)) {
    return "Codice di Procedura Civile";
  }

  // D.Lgs. / Decreto Legislativo
  const dlgs = ref.match(/D\.?\s*Lgs\.?\s*(?:n\.?\s*)?(\d+)\s*\/\s*(\d+)/i);
  if (dlgs) return `D.Lgs. ${dlgs[1]}/${dlgs[2]}`;

  // DPR
  const dpr = ref.match(/D\.?P\.?R\.?\s*(?:n\.?\s*)?(\d+)\s*\/\s*(\d+)/i);
  if (dpr) return `DPR ${dpr[1]}/${dpr[2]}`;

  // Legge
  const legge = ref.match(/L\.?\s*(?:n\.?\s*)?(\d+)\s*\/\s*(\d+)/i);
  if (legge) return `L. ${legge[1]}/${legge[2]}`;

  // Codice del Consumo
  if (/consumo/i.test(ref) || /206\/2005/i.test(ref)) {
    return "D.Lgs. 206/2005";
  }

  // TU Edilizia
  if (/edilizia/i.test(ref) || /380\/2001/i.test(ref)) {
    return "DPR 380/2001";
  }

  return null;
}
