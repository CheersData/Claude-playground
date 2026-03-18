/**
 * Company Knowledge — company-wide operational intelligence.
 *
 * Similar to `legal_knowledge` in vector-store.ts but for operational data:
 * patterns, architectural decisions, best practices, incidents, metrics.
 * Uses the same Voyage AI embeddings and HNSW index pattern.
 *
 * Categories:
 *   - pattern: recurring operational pattern ("task-runner fails on Windows when claude not in PATH")
 *   - decision: architectural/business decision ("chose Voyage AI over OpenAI for legal embeddings")
 *   - best_practice: proven approach ("always run type-check before build in CI")
 *   - incident: post-mortem knowledge ("2026-03-05 Normattiva API returned 503 for 4 hours")
 *   - metric: performance baseline ("average analysis pipeline takes 77s on Partner tier")
 *
 * ADR: ADR-forma-mentis.md (Layer 1, section 1.3)
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateEmbedding,
  isVectorDBEnabled,
  truncateForEmbedding,
} from "@/lib/embeddings";
import type { CompanyKnowledgeEntry } from "./types";

// ─── Search Result Type ───

export interface CompanyKnowledgeSearchResult {
  id: string;
  category: string;
  title: string;
  content: string;
  departments: string[];
  metadata: Record<string, unknown>;
  timesReferenced: number;
  similarity: number;
}

// ─── Indexing ───

/**
 * Index a new piece of company knowledge.
 * Generates an embedding for semantic retrieval and stores it in company_knowledge.
 *
 * Returns the created entry's ID, or null if indexing failed.
 */
export async function indexCompanyKnowledge(
  entry: Pick<
    CompanyKnowledgeEntry,
    "category" | "title" | "content"
  > & {
    departments?: string[];
    sourceSessionId?: string;
    sourceTaskId?: string;
    sourceDecisionId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<string | null> {
  const admin = createAdminClient();

  // Generate embedding from title + content
  let embedding: number[] | null = null;
  if (isVectorDBEnabled()) {
    const embeddingText = `${entry.title}\n${entry.content}`;
    embedding = await generateEmbedding(
      truncateForEmbedding(embeddingText),
      "document"
    );
  }

  const { data, error } = await admin
    .from("company_knowledge")
    .insert({
      category: entry.category,
      title: entry.title,
      content: entry.content,
      departments: entry.departments ?? [],
      source_session_id: entry.sourceSessionId ?? null,
      source_task_id: entry.sourceTaskId ?? null,
      source_decision_id: entry.sourceDecisionId ?? null,
      embedding: embedding ? JSON.stringify(embedding) : null,
      metadata: entry.metadata ?? {},
      is_active: true,
      times_referenced: 1,
    })
    .select("id")
    .single();

  if (error) {
    console.error(
      `[MEMORY] Failed to index company knowledge "${entry.title}": ${error.message}`
    );
    return null;
  }

  console.log(
    `[MEMORY] Knowledge indexed | "${entry.title}" | category: ${entry.category} | depts: ${(entry.departments ?? []).join(",") || "all"} | embedding: ${embedding ? "yes" : "no"}`
  );

  return data!.id;
}

// ─── Semantic Search ───

/**
 * Search company knowledge semantically via match_company_knowledge RPC.
 * Returns entries ranked by cosine similarity, optionally filtered by
 * category and/or departments.
 *
 * Returns empty array if vector DB is not enabled.
 */
export async function searchCompanyKnowledge(
  query: string,
  options: {
    category?: CompanyKnowledgeEntry["category"];
    departments?: string[];
    threshold?: number;
    limit?: number;
  } = {}
): Promise<CompanyKnowledgeSearchResult[]> {
  if (!isVectorDBEnabled()) return [];

  const { category, departments, threshold = 0.3, limit = 5 } = options;

  const embedding = await generateEmbedding(query, "query");
  if (!embedding) return [];

  const admin = createAdminClient();

  const { data, error } = await admin.rpc("match_company_knowledge", {
    query_embedding: JSON.stringify(embedding),
    filter_category: category ?? null,
    filter_departments: departments ?? null,
    match_threshold: threshold,
    match_count: limit,
  });

  if (error) {
    console.error(
      `[MEMORY] Company knowledge search failed: ${error.message}`
    );
    return [];
  }

  const results = (data ?? []).map(
    (row: Record<string, unknown>): CompanyKnowledgeSearchResult => ({
      id: row.id as string,
      category: row.category as string,
      title: row.title as string,
      content: row.content as string,
      departments: (row.departments ?? []) as string[],
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
      timesReferenced: (row.times_referenced as number) ?? 1,
      similarity: row.similarity as number,
    })
  );

  // Re-rank: boost entries referenced more often (same pattern as legal_knowledge)
  // Formula: score = similarity * 0.8 + min(log10(timesReferenced+1)/2, 0.25)
  results.sort((a: CompanyKnowledgeSearchResult, b: CompanyKnowledgeSearchResult) => {
    const scoreA =
      a.similarity * 0.8 +
      Math.min(Math.log10((a.timesReferenced ?? 1) + 1) / 2, 0.25);
    const scoreB =
      b.similarity * 0.8 +
      Math.min(Math.log10((b.timesReferenced ?? 1) + 1) / 2, 0.25);
    return scoreB - scoreA;
  });

  return results;
}

// ─── Chronological Retrieval ───

/**
 * Get recent knowledge entries in chronological order (newest first).
 * Non-semantic retrieval for browsing or context loading.
 */
export async function getRecentKnowledge(
  limit = 10
): Promise<CompanyKnowledgeEntry[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("company_knowledge")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error(
      `[MEMORY] Failed to get recent knowledge: ${error.message}`
    );
    return [];
  }

  return (data ?? []).map(mapKnowledgeRow);
}

// ─── Helpers ───

function mapKnowledgeRow(
  row: Record<string, unknown>
): CompanyKnowledgeEntry {
  return {
    id: row.id as string,
    category: row.category as CompanyKnowledgeEntry["category"],
    title: row.title as string,
    content: row.content as string,
    departments: (row.departments ?? []) as string[],
    sourceSessionId: (row.source_session_id as string) ?? null,
    sourceTaskId: (row.source_task_id as string) ?? null,
    sourceDecisionId: (row.source_decision_id as string) ?? null,
    timesReferenced: (row.times_referenced as number) ?? 1,
    isActive: (row.is_active as boolean) ?? true,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
  };
}
