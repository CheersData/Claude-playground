/**
 * DAL — Knowledge
 *
 * Operations on document_chunks and legal_knowledge tables.
 * All writes use admin client (service_role, no RLS).
 */

import { createAdminClient } from "../supabase/admin";

// ─── Types ───

export interface ChunkRow {
  analysisId: string;
  chunkIndex: number;
  content: string;
  metadata: Record<string, unknown>;
  embedding: number[];
}

export interface KnowledgeUpsert {
  category: "law_reference" | "court_case" | "clause_pattern" | "risk_pattern";
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  embedding: number[];
  sourceAnalysisId: string;
}

export interface KnowledgeSearchResult {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
  category?: string;
  title?: string;
  timesSeen?: number;
}

export interface ChunkSearchResult {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

// ─── Document Chunks ───

/**
 * Delete existing chunks for an analysis, then insert new ones in batches.
 */
export async function indexDocumentChunks(
  analysisId: string,
  chunks: ChunkRow[]
): Promise<number> {
  const admin = createAdminClient();

  // Delete existing chunks (re-index)
  await admin.from("document_chunks").delete().eq("analysis_id", analysisId);

  // Build rows
  const rows = chunks.map((c) => ({
    analysis_id: c.analysisId,
    chunk_index: c.chunkIndex,
    content: c.content,
    metadata: c.metadata,
    embedding: JSON.stringify(c.embedding),
  }));

  // Insert in batches of 50
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const { error } = await admin.from("document_chunks").insert(batch);
    if (error) {
      console.error(`[DAL/knowledge] Chunk insert error batch ${i}: ${error.message}`);
    } else {
      inserted += batch.length;
    }
  }

  return inserted;
}

/**
 * Semantic search on document chunks.
 */
export async function searchDocumentChunks(
  embedding: number[],
  opts: { threshold?: number; limit?: number } = {}
): Promise<ChunkSearchResult[]> {
  const { threshold = 0.7, limit = 5 } = opts;
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("match_document_chunks", {
    query_embedding: JSON.stringify(embedding),
    match_threshold: threshold,
    match_count: limit,
  });

  if (error) {
    console.error(`[DAL/knowledge] Chunk search error: ${error.message}`);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    content: row.content as string,
    metadata: row.metadata as Record<string, unknown>,
    similarity: row.similarity as number,
  }));
}

// ─── Legal Knowledge ───

/**
 * Upsert a knowledge entry (law reference, court case, clause pattern, risk pattern).
 */
export async function upsertKnowledge(entry: KnowledgeUpsert): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("upsert_legal_knowledge", {
    p_category: entry.category,
    p_title: entry.title,
    p_content: entry.content,
    p_metadata: entry.metadata,
    p_embedding: JSON.stringify(entry.embedding),
    p_source_analysis_id: entry.sourceAnalysisId,
  });

  if (error) {
    console.error(`[DAL/knowledge] Upsert error "${entry.title}": ${error.message}`);
    return false;
  }
  return true;
}

/**
 * Semantic search on the legal knowledge base.
 */
export async function searchKnowledge(
  embedding: number[],
  opts: {
    category?: "law_reference" | "court_case" | "clause_pattern" | "risk_pattern";
    threshold?: number;
    limit?: number;
  } = {}
): Promise<KnowledgeSearchResult[]> {
  const { category, threshold = 0.65, limit = 5 } = opts;
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("match_legal_knowledge", {
    query_embedding: JSON.stringify(embedding),
    filter_category: category ?? null,
    match_threshold: threshold,
    match_count: limit,
  });

  if (error) {
    console.error(`[DAL/knowledge] Knowledge search error: ${error.message}`);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    content: row.content as string,
    metadata: row.metadata as Record<string, unknown>,
    similarity: row.similarity as number,
    category: row.category as string,
    title: row.title as string,
    timesSeen: row.times_seen as number,
  }));
}
