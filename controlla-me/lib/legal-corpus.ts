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

/** Supabase restituisce max 1000 righe per query. Questa funzione pagina automaticamente. */
async function fetchAllRows<T>(
  queryBuilder: { range: (from: number, to: number) => { data: T[] | null; error: { message: string } | null } },
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await (queryBuilder as any).range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

// ─── Query Functions ───

/** Ottieni tutte le fonti con conteggio articoli */
export async function getCorpusSources() {
  const supabase = createAdminClient();

  // Usa conteggio aggregato via RPC per evitare di scaricare tutte le righe
  const { data, error } = await supabase
    .from("legal_articles")
    .select("source_id, source_name, source_type")
    .eq("in_force", true);

  if (error) throw new Error(`Errore query fonti: ${error.message}`);

  // Aggrega per fonte (max 1000 righe ma per il conteggio fonti basta)
  // Per il conteggio esatto usiamo una query separata count
  const sourcesMap = new Map<string, { source_name: string; source_type: string; count: number }>();
  for (const row of data || []) {
    const existing = sourcesMap.get(row.source_id);
    if (existing) {
      existing.count++;
    } else {
      sourcesMap.set(row.source_id, {
        source_name: row.source_name,
        source_type: row.source_type,
        count: 1,
      });
    }
  }

  // Per le fonti trovate, ottieni il conteggio esatto
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
      article_count: count || info.count,
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
      .order("article_number")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(`Errore query gerarchia: ${error.message}`);
    if (!data || data.length === 0) break;
    allData.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  if (allData.length === 0) return null;

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

/** Costruisci un albero navigabile dagli articoli */
function buildHierarchyTree(
  articles: Array<{
    id: string;
    article_number: string;
    article_title: string | null;
    hierarchy: Record<string, string>;
  }>
): HierarchyNode[] {
  // Determina i livelli gerarchici usati
  const levelOrder = ["book", "part", "title", "chapter", "section"];
  const usedLevels = new Set<string>();
  for (const art of articles) {
    for (const key of Object.keys(art.hierarchy || {})) {
      usedLevels.add(key);
    }
  }
  const orderedLevels = levelOrder.filter((l) => usedLevels.has(l));

  if (orderedLevels.length === 0) {
    // Nessuna gerarchia: lista piatta di articoli
    return [{
      key: "root",
      label: "Articoli",
      children: [],
      articles: articles.map((a) => ({
        id: a.id,
        article_number: a.article_number,
        article_title: a.article_title,
        hierarchy: a.hierarchy,
      })),
    }];
  }

  // Costruisci albero ricorsivo
  return buildLevel(articles, orderedLevels, 0);
}

function buildLevel(
  articles: Array<{
    id: string;
    article_number: string;
    article_title: string | null;
    hierarchy: Record<string, string>;
  }>,
  levels: string[],
  depth: number
): HierarchyNode[] {
  if (depth >= levels.length) {
    // Foglia: ritorna nodo con gli articoli
    return [];
  }

  const currentLevel = levels[depth];
  const groups = new Map<string, typeof articles>();

  for (const art of articles) {
    const key = (art.hierarchy as Record<string, string>)?.[currentLevel] || "(senza classificazione)";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(art);
  }

  const nodes: HierarchyNode[] = [];

  for (const [label, groupArticles] of groups) {
    const children = buildLevel(groupArticles, levels, depth + 1);
    const leafArticles = depth === levels.length - 1
      ? groupArticles.map((a) => ({
          id: a.id,
          article_number: a.article_number,
          article_title: a.article_title,
          hierarchy: a.hierarchy,
        }))
      : children.length === 0
        ? groupArticles.map((a) => ({
            id: a.id,
            article_number: a.article_number,
            article_title: a.article_title,
            hierarchy: a.hierarchy,
          }))
        : [];

    nodes.push({
      key: `${currentLevel}:${label}`,
      label,
      children,
      articles: leafArticles,
    });
  }

  return nodes;
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
