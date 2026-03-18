/**
 * Department Memory — persistent key-value memory scoped to each department.
 *
 * Unlike company_sessions (append-only), department_memory is actively managed:
 * entries are created, updated (via upsert on dept+key), and expired.
 *
 * Categories:
 *   - fact: verified information ("Normattiva ZIP format changed in March 2026")
 *   - learning: insight from experience ("slope threshold 0.005 generates false signals")
 *   - warning: known pitfall ("EUR-Lex Cellar returns 503 during maintenance windows")
 *   - preference: team/agent preference ("use Gemini Flash for corpus Q&A")
 *   - context: situational context ("backtest cycle #4 in progress")
 *
 * ADR: ADR-forma-mentis.md (Layer 1, section 1.2)
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateEmbedding,
  isVectorDBEnabled,
  truncateForEmbedding,
} from "@/lib/embeddings";
import type { DepartmentMemoryEntry } from "./types";

// ─── Retrieval ───

/**
 * Get active department memories, optionally filtered by categories.
 * Returns entries ordered by last_accessed_at (most recently used first),
 * excluding expired entries.
 */
export async function getDepartmentMemories(
  department: string,
  options: {
    categories?: DepartmentMemoryEntry["category"][];
    limit?: number;
  } = {}
): Promise<DepartmentMemoryEntry[]> {
  const { categories, limit = 20 } = options;

  const admin = createAdminClient();

  let query = admin
    .from("department_memory")
    .select("*")
    .eq("department", department)
    .eq("is_active", true)
    .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
    .order("last_accessed_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (categories && categories.length > 0) {
    query = query.in("category", categories);
  }

  const { data, error } = await query;

  if (error) {
    console.error(
      `[MEMORY] Failed to get department memories for ${department}: ${error.message}`
    );
    return [];
  }

  return (data ?? []).map(mapMemoryRow);
}

// ─── Upsert ───

/**
 * Create or update a department memory entry.
 * Uses the unique constraint on (department, key) for upsert.
 * Generates an embedding for semantic search if vector DB is available.
 */
export async function upsertDepartmentMemory(
  entry: Pick<
    DepartmentMemoryEntry,
    "department" | "category" | "key" | "content"
  > & {
    confidence?: number;
    sourceSessionId?: string;
    sourceTaskId?: string;
    expiresAt?: string;
  }
): Promise<void> {
  const admin = createAdminClient();

  // Generate embedding for semantic retrieval
  let embedding: number[] | null = null;
  if (isVectorDBEnabled()) {
    const embeddingText = `${entry.key}: ${entry.content}`;
    embedding = await generateEmbedding(
      truncateForEmbedding(embeddingText),
      "document"
    );
  }

  const row = {
    department: entry.department,
    category: entry.category,
    key: entry.key,
    content: entry.content,
    confidence: entry.confidence ?? 1.0,
    source_session_id: entry.sourceSessionId ?? null,
    source_task_id: entry.sourceTaskId ?? null,
    expires_at: entry.expiresAt ?? null,
    embedding: embedding ? JSON.stringify(embedding) : null,
    is_active: true,
    updated_at: new Date().toISOString(),
    last_accessed_at: new Date().toISOString(),
  };

  const { error } = await admin.from("department_memory").upsert(row, {
    onConflict: "department,key",
  });

  if (error) {
    console.error(
      `[MEMORY] Failed to upsert department memory ${entry.department}/${entry.key}: ${error.message}`
    );
    return;
  }

  console.log(
    `[MEMORY] Department memory upserted | ${entry.department}/${entry.key} | category: ${entry.category} | embedding: ${embedding ? "yes" : "no"}`
  );
}

// ─── Semantic Search ───

/**
 * Search department memory semantically via the match_department_memory RPC.
 * Returns entries ranked by cosine similarity.
 * Falls back to empty results if vector DB is not enabled.
 */
export async function searchDepartmentMemory(
  department: string,
  query: string,
  options: {
    category?: DepartmentMemoryEntry["category"];
    threshold?: number;
    limit?: number;
  } = {}
): Promise<
  Array<DepartmentMemoryEntry & { similarity: number }>
> {
  if (!isVectorDBEnabled()) return [];

  const { category, threshold = 0.3, limit = 10 } = options;

  const embedding = await generateEmbedding(query, "query");
  if (!embedding) return [];

  const admin = createAdminClient();

  const { data, error } = await admin.rpc("match_department_memory", {
    query_embedding: JSON.stringify(embedding),
    filter_department: department,
    filter_category: category ?? null,
    match_threshold: threshold,
    match_count: limit,
  });

  if (error) {
    console.error(
      `[MEMORY] Semantic search failed for ${department}: ${error.message}`
    );
    return [];
  }

  // Increment times_accessed for returned entries (fire-and-forget)
  const ids = (data ?? []).map((r: Record<string, unknown>) => r.id as string);
  if (ids.length > 0) {
    admin
      .rpc("increment_department_memory_access", { memory_ids: ids })
      .then(({ error: incErr }) => {
        if (incErr) {
          // Fallback: update each row individually
          for (const id of ids) {
            admin
              .from("department_memory")
              .update({
                times_accessed: undefined, // will be handled by raw SQL if available
                last_accessed_at: new Date().toISOString(),
              })
              .eq("id", id)
              .then(() => {});
          }
        }
      });
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    department: row.department as string,
    category: row.category as DepartmentMemoryEntry["category"],
    key: row.key as string,
    content: row.content as string,
    confidence: row.confidence as number,
    sourceSessionId: null,
    sourceTaskId: null,
    timesAccessed: row.times_accessed as number,
    lastAccessedAt: null,
    expiresAt: null,
    isActive: true,
    similarity: row.similarity as number,
  }));
}

// ─── Expiration ───

/**
 * Expire (soft-delete) department memories that have passed their expires_at.
 * Returns the count of expired entries.
 */
export async function expireDepartmentMemories(
  department: string
): Promise<number> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("department_memory")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("department", department)
    .eq("is_active", true)
    .lt("expires_at", new Date().toISOString())
    .not("expires_at", "is", null)
    .select("id");

  if (error) {
    console.error(
      `[MEMORY] Failed to expire memories for ${department}: ${error.message}`
    );
    return 0;
  }

  const count = data?.length ?? 0;
  if (count > 0) {
    console.log(
      `[MEMORY] Expired ${count} department memories for ${department}`
    );
  }

  return count;
}

// ─── Helpers ───

function mapMemoryRow(row: Record<string, unknown>): DepartmentMemoryEntry {
  return {
    id: row.id as string,
    department: row.department as string,
    category: row.category as DepartmentMemoryEntry["category"],
    key: row.key as string,
    content: row.content as string,
    confidence: (row.confidence as number) ?? 1.0,
    sourceSessionId: (row.source_session_id as string) ?? null,
    sourceTaskId: (row.source_task_id as string) ?? null,
    timesAccessed: (row.times_accessed as number) ?? 0,
    lastAccessedAt: (row.last_accessed_at as string) ?? null,
    expiresAt: (row.expires_at as string) ?? null,
    isActive: (row.is_active as boolean) ?? true,
  };
}
