/**
 * Medical Corpus — Funzioni per il corpus medico di studia.me.
 *
 * Usa le stesse tabelle di legal_articles/legal_knowledge con vertical='medical'.
 * Chiama le RPC verticali create in migration 027 via Supabase.
 *
 * Pattern: Non modifica legal-corpus.ts. Funzioni standalone per il verticale medico.
 */

import { createClient } from "@supabase/supabase-js";
import { generateEmbedding } from "./embeddings";
import { getVertical } from "./verticals/config";

const VERTICAL = "medical";
const MEDICAL_CONFIG = getVertical("medical");
const EMBEDDING_MODEL = MEDICAL_CONFIG.embeddingModel; // "voyage-3"

// ─── Supabase Admin Client ───

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("[MEDICAL-CORPUS] Supabase non configurato");
  return createClient(url, key);
}

// ─── Types ───

export interface MedicalArticle {
  id: string;
  law_source: string;       // Nome fonte (es. "StatPearls", "OpenStax A&P")
  article_reference: string; // Riferimento (es. "Cap. 12.3", "Myocardial Infarction")
  article_title: string | null;
  article_text: string;
  hierarchy: Record<string, string>;
  keywords: string[];
  related_institutes: string[]; // Specialità/topic medici
  source_url: string | null;
  is_in_force: boolean;
  similarity?: number;
}

export interface MedicalCorpusStats {
  total_articles: number;
  total_with_embedding: number;
  total_sources: number;
  total_topics: number;
}

export interface MedicalSource {
  source_id: string;
  source_name: string;
  article_count: number;
}

// ─── Search Functions ───

/**
 * Ricerca semantica articoli medici via pgvector.
 * Usa la RPC match_articles_by_vertical creata in migration 027.
 */
export async function searchMedicalArticles(
  query: string,
  options: {
    lawSource?: string;
    institutes?: string[];
    threshold?: number;
    limit?: number;
  } = {}
): Promise<MedicalArticle[]> {
  const {
    lawSource = null,
    institutes = null,
    threshold = 0.4,
    limit = 10,
  } = options;

  // Generate embedding with medical model (voyage-3)
  const embedding = await generateEmbedding(query, "query", EMBEDDING_MODEL);
  if (!embedding) {
    console.log("[MEDICAL-CORPUS] Embedding non disponibile, skip ricerca semantica");
    return [];
  }

  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("match_articles_by_vertical", {
    p_vertical: VERTICAL,
    query_embedding: embedding,
    filter_law_source: lawSource,
    filter_institutes: institutes,
    match_threshold: threshold,
    match_count: limit,
  });

  if (error) {
    console.error("[MEDICAL-CORPUS] Errore ricerca:", error.message);
    return [];
  }

  return (data ?? []) as MedicalArticle[];
}

/**
 * Ricerca testuale articoli medici (fallback per query brevi).
 */
export async function searchMedicalArticlesText(
  query: string,
  options: { lawSource?: string; limit?: number } = {}
): Promise<MedicalArticle[]> {
  const { lawSource, limit = 20 } = options;
  const supabase = getSupabase();

  const pattern = `%${query}%`;
  let qb = supabase
    .from("legal_articles")
    .select("id, law_source, article_reference, article_title, article_text, hierarchy, keywords, related_institutes, source_url, is_in_force")
    .eq("vertical", VERTICAL)
    .or(`article_title.ilike.${pattern},article_reference.ilike.${pattern}`)
    .eq("is_in_force", true)
    .limit(limit);

  if (lawSource) {
    qb = qb.eq("law_source", lawSource);
  }

  const { data, error } = await qb;

  if (error) {
    console.error("[MEDICAL-CORPUS] Errore ricerca testo:", error.message);
    return [];
  }

  return (data ?? []) as MedicalArticle[];
}

// ─── Retrieval Functions ───

/**
 * Carica un articolo medico per ID.
 */
export async function getMedicalArticleById(
  id: string
): Promise<MedicalArticle | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("legal_articles")
    .select("*")
    .eq("id", id)
    .eq("vertical", VERTICAL)
    .single();

  if (error || !data) return null;
  return data as MedicalArticle;
}

/**
 * Lista fonti mediche con conteggio articoli.
 */
export async function getMedicalCorpusSources(): Promise<MedicalSource[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("legal_articles")
    .select("law_source")
    .eq("vertical", VERTICAL);

  if (error || !data) return [];

  // Count articles per source
  const counts: Record<string, number> = {};
  for (const row of data) {
    counts[row.law_source] = (counts[row.law_source] || 0) + 1;
  }

  return Object.entries(counts)
    .map(([source, count]) => ({
      source_id: source.toLowerCase().replace(/\s+/g, "_"),
      source_name: source,
      article_count: count,
    }))
    .sort((a, b) => b.article_count - a.article_count);
}

/**
 * Gerarchia navigabile per una fonte medica.
 * Usa la RPC get_articles_by_source_vertical.
 */
export async function getMedicalSourceHierarchy(
  sourceId: string
): Promise<{ articles: MedicalArticle[]; source_name: string }> {
  const supabase = getSupabase();

  // Try exact match first, then fuzzy
  let { data, error } = await supabase.rpc("get_articles_by_source_vertical", {
    p_vertical: VERTICAL,
    p_law_source: sourceId,
    p_limit: 500,
  });

  if (error || !data || data.length === 0) {
    // Fuzzy match: try finding the source by name
    const sources = await getMedicalCorpusSources();
    const match = sources.find(
      (s) => s.source_id === sourceId || s.source_name.toLowerCase().includes(sourceId.toLowerCase())
    );
    if (match) {
      const result = await supabase.rpc("get_articles_by_source_vertical", {
        p_vertical: VERTICAL,
        p_law_source: match.source_name,
        p_limit: 500,
      });
      data = result.data;
      error = result.error;
    }
  }

  if (error) {
    console.error("[MEDICAL-CORPUS] Errore gerarchia:", error.message);
    return { articles: [], source_name: sourceId };
  }

  return {
    articles: (data ?? []) as MedicalArticle[],
    source_name: data?.[0]?.law_source ?? sourceId,
  };
}

/**
 * Specialità/topic medici con conteggio.
 * Usa la RPC get_distinct_topics_vertical.
 */
export async function getMedicalTopics(): Promise<
  Array<{ topic: string; article_count: number }>
> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("get_distinct_topics_vertical", {
    p_vertical: VERTICAL,
  });

  if (error) {
    console.error("[MEDICAL-CORPUS] Errore topic:", error.message);
    return [];
  }

  return (data ?? []) as Array<{ topic: string; article_count: number }>;
}

/**
 * Articoli per specialità/topic medico.
 * Usa la RPC get_articles_by_topic_vertical.
 */
export async function getMedicalArticlesByTopic(
  topic: string,
  limit: number = 50
): Promise<MedicalArticle[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("get_articles_by_topic_vertical", {
    p_vertical: VERTICAL,
    p_topic: topic,
    p_limit: limit,
  });

  if (error) {
    console.error("[MEDICAL-CORPUS] Errore articoli per topic:", error.message);
    return [];
  }

  return (data ?? []) as MedicalArticle[];
}

/**
 * Statistiche corpus medico.
 * Usa la RPC get_vertical_stats.
 */
export async function getMedicalCorpusStats(): Promise<MedicalCorpusStats> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("get_vertical_stats", {
    p_vertical: VERTICAL,
  });

  if (error || !data || data.length === 0) {
    return {
      total_articles: 0,
      total_with_embedding: 0,
      total_sources: 0,
      total_topics: 0,
    };
  }

  return data[0] as MedicalCorpusStats;
}

/**
 * Ricerca knowledge medica (legal_knowledge con vertical='medical').
 * Usa la RPC match_knowledge_by_vertical.
 */
export async function searchMedicalKnowledge(
  query: string,
  options: { category?: string; threshold?: number; limit?: number } = {}
): Promise<Array<{ id: string; content: string; category: string; source_ref: string; similarity: number }>> {
  const { category = null, threshold = 0.5, limit = 5 } = options;

  const embedding = await generateEmbedding(query, "query", EMBEDDING_MODEL);
  if (!embedding) return [];

  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("match_knowledge_by_vertical", {
    p_vertical: VERTICAL,
    query_embedding: embedding,
    filter_category: category,
    match_threshold: threshold,
    match_count: limit,
  });

  if (error) {
    console.error("[MEDICAL-CORPUS] Errore knowledge search:", error.message);
    return [];
  }

  return (data ?? []) as Array<{ id: string; content: string; category: string; source_ref: string; similarity: number }>;
}
