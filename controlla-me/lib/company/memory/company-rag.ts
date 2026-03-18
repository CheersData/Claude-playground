/**
 * Company RAG — build context blocks for company operations.
 *
 * Searches across all 3 MEMORIA tables in parallel:
 *   1. company_knowledge — operational patterns, decisions, best practices
 *   2. department_memory — department-scoped facts, learnings, warnings
 *   3. company_sessions — session history (what happened before)
 *
 * Returns a formatted text block injectable into agent prompts,
 * following the exact pattern of buildRAGContext() in vector-store.ts.
 *
 * ADR: ADR-forma-mentis.md (Layer 1, section 1.4)
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateEmbedding,
  isVectorDBEnabled,
  truncateForEmbedding,
} from "@/lib/embeddings";

// ─── Types for search results ───

interface KnowledgeResult {
  category: string;
  title: string;
  content: string;
  departments: string[];
  times_referenced: number;
  similarity: number;
}

interface MemoryResult {
  department: string;
  category: string;
  key: string;
  content: string;
  confidence: number;
  times_accessed: number;
  similarity: number;
}

interface SessionResult {
  session_type: string;
  department: string;
  summary: string;
  key_decisions: Array<{ decision: string; rationale: string }>;
  started_at: string;
  duration_ms: number;
  similarity: number;
}

// ─── Main Entry Point ───

/**
 * Build a RAG context block for a company operation.
 * Searches across company_knowledge, department_memory, and session history
 * in parallel. Returns a formatted text block injectable into agent prompts.
 *
 * If vector DB is not enabled, returns an empty string silently.
 *
 * @param query - The search query (natural language)
 * @param options.department - Scope search to a specific department
 * @param options.maxChars - Maximum characters in the output (default: 2000)
 * @param options.includeSessionHistory - Include past session summaries (default: true)
 * @param options.categories - Filter company_knowledge by category
 */
export async function buildCompanyRAGContext(
  query: string,
  options: {
    department?: string;
    maxChars?: number;
    includeSessionHistory?: boolean;
    categories?: string[];
  } = {}
): Promise<string> {
  if (!isVectorDBEnabled()) return "";

  const {
    department,
    maxChars = 2000,
    includeSessionHistory = true,
  } = options;

  const embedding = await generateEmbedding(
    truncateForEmbedding(query),
    "query"
  );
  if (!embedding) return "";

  const admin = createAdminClient();
  const embeddingJson = JSON.stringify(embedding);

  // Build parallel search promises across all 3 memory layers
  type SearchResult = { type: "knowledge" | "memory" | "session"; data: unknown[] };
  const searchPromises: Array<Promise<SearchResult>> = [];

  // 1. Company knowledge (always searched)
  searchPromises.push(
    Promise.resolve(
      admin
        .rpc("match_company_knowledge", {
          query_embedding: embeddingJson,
          filter_category: null,
          filter_departments: department ? [department] : null,
          match_threshold: 0.3,
          match_count: 5,
        })
        .then(({ data, error }): SearchResult => {
          if (error) {
            console.error(
              `[MEMORY] Company knowledge search error: ${error.message}`
            );
            return { type: "knowledge", data: [] };
          }
          return { type: "knowledge", data: (data ?? []) as unknown[] };
        })
    )
  );

  // 2. Department memory (only if department is specified)
  if (department) {
    searchPromises.push(
      Promise.resolve(
        admin
          .rpc("match_department_memory", {
            query_embedding: embeddingJson,
            filter_department: department,
            filter_category: null,
            match_threshold: 0.3,
            match_count: 5,
          })
          .then(({ data, error }): SearchResult => {
            if (error) {
              console.error(
                `[MEMORY] Department memory search error: ${error.message}`
              );
              return { type: "memory", data: [] };
            }
            return { type: "memory", data: (data ?? []) as unknown[] };
          })
      )
    );
  }

  // 3. Session history (optional, default: on)
  if (includeSessionHistory) {
    searchPromises.push(
      Promise.resolve(
        admin
          .rpc("match_company_sessions", {
            query_embedding: embeddingJson,
            filter_department: department ?? null,
            filter_type: null,
            match_threshold: 0.3,
            match_count: 3,
          })
          .then(({ data, error }): SearchResult => {
            if (error) {
              console.error(
                `[MEMORY] Session history search error: ${error.message}`
              );
              return { type: "session", data: [] };
            }
            return { type: "session", data: (data ?? []) as unknown[] };
          })
      )
    );
  }

  // Execute all searches in parallel
  const results = await Promise.all(searchPromises);

  // Collect results by type
  const knowledgeResults: KnowledgeResult[] = [];
  const memoryResults: MemoryResult[] = [];
  const sessionResults: SessionResult[] = [];

  for (const result of results) {
    if (result.type === "knowledge") {
      knowledgeResults.push(
        ...(result.data as KnowledgeResult[])
      );
    } else if (result.type === "memory") {
      memoryResults.push(
        ...(result.data as MemoryResult[])
      );
    } else if (result.type === "session") {
      sessionResults.push(
        ...(result.data as SessionResult[])
      );
    }
  }

  // Check if we have any results at all
  const totalResults =
    knowledgeResults.length + memoryResults.length + sessionResults.length;
  if (totalResults === 0) return "";

  // Format into a text block (same pattern as buildRAGContext in vector-store.ts)
  let context = "--- CONTESTO COMPANY (da sessioni e memoria precedenti) ---\n";
  let charCount = context.length;

  // Section 1: Company knowledge
  if (knowledgeResults.length > 0) {
    const sectionHeader = "\n[COMPANY KNOWLEDGE]\n";
    if (charCount + sectionHeader.length < maxChars) {
      context += sectionHeader;
      charCount += sectionHeader.length;

      for (const k of knowledgeResults) {
        const entry = `  [${k.category.toUpperCase()}] ${k.title} (sim: ${(k.similarity * 100).toFixed(0)}%, ref: ${k.times_referenced ?? 1}x)\n  ${k.content}\n\n`;
        if (charCount + entry.length > maxChars) break;
        context += entry;
        charCount += entry.length;
      }
    }
  }

  // Section 2: Department memory
  if (memoryResults.length > 0) {
    const sectionHeader = `\n[MEMORIA ${department?.toUpperCase() ?? "DEPT"}]\n`;
    if (charCount + sectionHeader.length < maxChars) {
      context += sectionHeader;
      charCount += sectionHeader.length;

      for (const m of memoryResults) {
        const confidenceLabel =
          m.confidence >= 0.8
            ? "alta"
            : m.confidence >= 0.5
              ? "media"
              : "bassa";
        const entry = `  [${m.category.toUpperCase()}] ${m.key} (sim: ${(m.similarity * 100).toFixed(0)}%, fiducia: ${confidenceLabel})\n  ${m.content}\n\n`;
        if (charCount + entry.length > maxChars) break;
        context += entry;
        charCount += entry.length;
      }
    }
  }

  // Section 3: Session history
  if (sessionResults.length > 0) {
    const sectionHeader = "\n[SESSIONI PRECEDENTI]\n";
    if (charCount + sectionHeader.length < maxChars) {
      context += sectionHeader;
      charCount += sectionHeader.length;

      for (const s of sessionResults) {
        const durationMin = s.duration_ms
          ? `${Math.round(s.duration_ms / 60000)}min`
          : "?";
        const dept = s.department ?? "cross-dept";
        const decisions =
          (s.key_decisions ?? []).length > 0
            ? ` | decisioni: ${(s.key_decisions ?? []).map((d) => d.decision).join("; ")}`
            : "";
        const dateStr = s.started_at
          ? new Date(s.started_at).toLocaleDateString("it-IT")
          : "?";
        const entry = `  [${s.session_type.toUpperCase()}] ${dateStr} | ${dept} | ${durationMin}${decisions}\n  ${s.summary}\n\n`;
        if (charCount + entry.length > maxChars) break;
        context += entry;
        charCount += entry.length;
      }
    }
  }

  context += "--- FINE CONTESTO COMPANY ---\n";

  console.log(
    `[MEMORY] Company RAG context built | knowledge: ${knowledgeResults.length} | memory: ${memoryResults.length} | sessions: ${sessionResults.length} | ${charCount} chars`
  );

  return context;
}
