/**
 * Utility per query sul corpus giuridico.
 * Usato sia dall'API hierarchy che dagli agenti per filtro gerarchico.
 */

import { createAdminClient } from "./supabase/admin";

// ─── Tipi ───

export interface ArticleSummary {
  id: string;
  article_number: string;
  article_title: string | null;
  hierarchy: Record<string, string>;
}

export interface HierarchyNode {
  key: string;
  label: string;
  children: HierarchyNode[];
  articles: ArticleSummary[];
}

export interface SourceHierarchy {
  source_id: string;
  source_name: string;
  source_type: string;
  article_count: number;
  tree: HierarchyNode[];
}

export interface ArticleDetail {
  id: string;
  source_id: string;
  source_name: string;
  source_type: string;
  article_number: string;
  article_title: string | null;
  article_text: string;
  hierarchy: Record<string, string>;
  url: string | null;
  in_force: boolean;
}

// ─── Helpers ───

/** Ordinamento numerico per article_number ("2" prima di "10", "2 bis" dopo "2") */
function compareArticleNumber(a: string, b: string): number {
  const numA = parseInt(a, 10);
  const numB = parseInt(b, 10);
  if (!isNaN(numA) && !isNaN(numB)) {
    if (numA !== numB) return numA - numB;
    // Stesso numero: "2" < "2 bis" < "2 ter"
    return a.localeCompare(b, "it", { numeric: true });
  }
  return a.localeCompare(b, "it", { numeric: true });
}

/** Pulisci etichette gerarchiche malformate (parentesi extra, spazi, ecc.) */
function cleanHierarchyLabel(label: string): string {
  return label
    .replace(/\)+\s*$/, "")     // rimuovi parentesi chiuse finali orfane
    .replace(/\(\s*$/, "")       // rimuovi parentesi aperte finali orfane
    .replace(/\s{2,}/g, " ")     // normalizza spazi multipli
    .trim();
}

// ─── Query Functions ───

/** Ottieni tutte le fonti con conteggio articoli */
export async function getCorpusSources() {
  const supabase = createAdminClient();

  // Scopri tutte le fonti paginando (Supabase torna max 1000 righe per query)
  const PAGE_SIZE = 1000;
  const sourcesMap = new Map<string, { source_name: string; source_type: string }>();
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("legal_articles")
      .select("source_id, source_name, source_type")
      .eq("in_force", true)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(`Errore query fonti: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (!sourcesMap.has(row.source_id)) {
        sourcesMap.set(row.source_id, {
          source_name: row.source_name,
          source_type: row.source_type,
        });
      }
    }

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  // Per ogni fonte, ottieni il conteggio esatto con head: true
  const results = [];
  for (const [source_id, info] of sourcesMap) {
    const { count } = await supabase
      .from("legal_articles")
      .select("*", { count: "exact", head: true })
      .eq("source_id", source_id)
      .eq("in_force", true);

    results.push({
      source_id,
      source_name: info.source_name,
      source_type: info.source_type,
      article_count: count ?? 0,
    });
  }

  return results;
}

/** Ottieni la gerarchia navigabile per una fonte specifica */
export async function getSourceHierarchy(sourceId: string): Promise<SourceHierarchy | null> {
  const supabase = createAdminClient();

  // Pagina per superare il limite di 1000 righe di Supabase
  const PAGE_SIZE = 1000;
  const allData: Array<{
    id: string;
    source_id: string;
    source_name: string;
    source_type: string;
    article_number: string;
    article_title: string | null;
    hierarchy: Record<string, string>;
  }> = [];

  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("legal_articles")
      .select("id, source_id, source_name, source_type, article_number, article_title, hierarchy")
      .eq("source_id", sourceId)
      .eq("in_force", true)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(`Errore query gerarchia: ${error.message}`);
    if (!data || data.length === 0) break;
    allData.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  if (allData.length === 0) return null;

  // Ordina per numero articolo (numerico)
  allData.sort((a, b) => compareArticleNumber(a.article_number, b.article_number));

  const first = allData[0];

  // Costruisci albero gerarchico
  const tree = buildHierarchyTree(allData);

  return {
    source_id: first.source_id,
    source_name: first.source_name,
    source_type: first.source_type,
    article_count: allData.length,
    tree,
  };
}

// ─── Tipi interni per il tree builder ───

type RawArticle = {
  id: string;
  article_number: string;
  article_title: string | null;
  hierarchy: Record<string, string>;
};

function toSummary(a: RawArticle): ArticleSummary {
  return {
    id: a.id,
    article_number: a.article_number,
    article_title: a.article_title,
    hierarchy: a.hierarchy,
  };
}

/** Costruisci un albero navigabile dagli articoli */
function buildHierarchyTree(articles: RawArticle[]): HierarchyNode[] {
  // Determina i livelli gerarchici usati (solo quelli con almeno 1 articolo)
  const levelOrder = ["book", "part", "title", "chapter", "section"];
  const usedLevels = new Set<string>();
  for (const art of articles) {
    for (const key of Object.keys(art.hierarchy || {})) {
      if (art.hierarchy[key]) usedLevels.add(key);
    }
  }
  const orderedLevels = levelOrder.filter((l) => usedLevels.has(l));

  if (orderedLevels.length === 0) {
    // Nessuna gerarchia: lista piatta di articoli
    return [{
      key: "root",
      label: "Articoli",
      children: [],
      articles: articles.map(toSummary),
    }];
  }

  // Costruisci albero ricorsivo
  const result = buildLevel(articles, orderedLevels, 0);

  // Se ci sono articoli senza nessun livello gerarchico, aggiungili come nodo separato
  if (result.directArticles.length > 0) {
    if (result.nodes.length > 0) {
      result.nodes.push({
        key: "root:_altri",
        label: "Altre disposizioni",
        children: [],
        articles: result.directArticles,
      });
    } else {
      // Solo articoli senza gerarchia
      return [{
        key: "root",
        label: "Articoli",
        children: [],
        articles: result.directArticles,
      }];
    }
  }

  return result.nodes;
}

interface BuildResult {
  nodes: HierarchyNode[];
  directArticles: ArticleSummary[];
}

/**
 * Costruisce ricorsivamente l'albero.
 * Logica: per il livello corrente, se un articolo ha un valore per quel livello
 * viene raggruppato; se non ce l'ha, viene passato ai livelli successivi.
 * Niente piu "(senza classificazione)" annidato.
 */
function buildLevel(articles: RawArticle[], levels: string[], depth: number): BuildResult {
  // Salta livelli dove NESSUN articolo del gruppo ha un valore
  while (depth < levels.length) {
    const level = levels[depth];
    if (articles.some((a) => a.hierarchy?.[level])) break;
    depth++;
  }

  if (depth >= levels.length) {
    // Nessun livello rimasto: tutti gli articoli sono foglie
    return { nodes: [], directArticles: articles.map(toSummary) };
  }

  const currentLevel = levels[depth];

  // Separa: articoli con valore per questo livello vs senza
  const grouped = new Map<string, RawArticle[]>();
  const ungrouped: RawArticle[] = [];

  for (const art of articles) {
    const val = art.hierarchy?.[currentLevel];
    if (val) {
      const cleanVal = cleanHierarchyLabel(val);
      if (!grouped.has(cleanVal)) grouped.set(cleanVal, []);
      grouped.get(cleanVal)!.push(art);
    } else {
      ungrouped.push(art);
    }
  }

  const nodes: HierarchyNode[] = [];

  // Costruisci nodi per ogni gruppo
  for (const [label, groupArticles] of grouped) {
    const result = buildLevel(groupArticles, levels, depth + 1);
    nodes.push({
      key: `${currentLevel}:${label}`,
      label,
      children: result.nodes,
      articles: result.directArticles,
    });
  }

  // Articoli senza questo livello: prova livelli piu profondi
  let directArticles: ArticleSummary[] = [];
  if (ungrouped.length > 0) {
    const result = buildLevel(ungrouped, levels, depth + 1);
    if (result.nodes.length > 0) {
      // Hanno trovato struttura piu in profondita — aggiungili come nodi fratelli
      nodes.push(...result.nodes);
    }
    // Articoli davvero senza struttura: risalgono al genitore
    directArticles = result.directArticles;
  }

  return { nodes, directArticles };
}

/** Ottieni un singolo articolo per ID */
export async function getArticleById(id: string): Promise<ArticleDetail | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("legal_articles")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data;
}

/** Cerca articoli per testo (full-text search) */
export async function searchArticles(query: string, sourceId?: string, limit = 20) {
  const supabase = createAdminClient();

  let q = supabase
    .from("legal_articles")
    .select("id, source_id, source_name, article_number, article_title, hierarchy, article_text")
    .eq("in_force", true)
    .ilike("article_text", `%${query}%`)
    .limit(limit);

  if (sourceId) {
    q = q.eq("source_id", sourceId);
  }

  const { data, error } = await q;
  if (error) throw new Error(`Errore ricerca: ${error.message}`);
  return data || [];
}

/** Cerca articoli filtrati per gerarchia (per gli agenti) */
export async function searchByHierarchy(
  sourceId: string,
  hierarchyFilter: Record<string, string>,
  limit = 50
) {
  const supabase = createAdminClient();

  let q = supabase
    .from("legal_articles")
    .select("id, source_id, source_name, article_number, article_title, article_text, hierarchy, url")
    .eq("source_id", sourceId)
    .eq("in_force", true)
    .limit(limit);

  // Filtra per campi gerarchia
  for (const [key, value] of Object.entries(hierarchyFilter)) {
    q = q.contains("hierarchy", { [key]: value });
  }

  const { data, error } = await q;
  if (error) throw new Error(`Errore ricerca gerarchica: ${error.message}`);
  return data || [];
}

/** Genera breadcrumb da un campo hierarchy */
export function hierarchyToBreadcrumb(
  hierarchy: Record<string, string>,
  sourceName?: string
): string[] {
  const levelOrder = ["book", "part", "title", "chapter", "section"];
  const crumbs: string[] = [];

  if (sourceName) crumbs.push(sourceName);

  for (const level of levelOrder) {
    if (hierarchy[level]) {
      crumbs.push(hierarchy[level]);
    }
  }

  return crumbs;
}
