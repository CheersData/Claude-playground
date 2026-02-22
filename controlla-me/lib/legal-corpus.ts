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

// ─── Query Functions ───

/** Ottieni tutte le fonti con conteggio articoli */
export async function getCorpusSources() {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("legal_articles")
    .select("source_id, source_name, source_type")
    .eq("in_force", true);

  if (error) throw new Error(`Errore query fonti: ${error.message}`);

  // Aggrega per fonte
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

  return Array.from(sourcesMap.entries()).map(([source_id, info]) => ({
    source_id,
    source_name: info.source_name,
    source_type: info.source_type,
    article_count: info.count,
  }));
}

/** Ottieni la gerarchia navigabile per una fonte specifica */
export async function getSourceHierarchy(sourceId: string): Promise<SourceHierarchy | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("legal_articles")
    .select("id, source_id, source_name, source_type, article_number, article_title, hierarchy")
    .eq("source_id", sourceId)
    .eq("in_force", true)
    .order("article_number");

  if (error) throw new Error(`Errore query gerarchia: ${error.message}`);
  if (!data || data.length === 0) return null;

  const first = data[0];

  // Costruisci albero gerarchico
  const tree = buildHierarchyTree(data);

  return {
    source_id: first.source_id,
    source_name: first.source_name,
    source_type: first.source_type,
    article_count: data.length,
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
