/**
 * RIFLESSIONE Layer 4 — Decision Journal
 *
 * Records significant decisions, tracks expected vs actual outcomes,
 * supports semantic search for "have we faced this before?", and
 * extracts learnings that feed back into company knowledge + department memory.
 *
 * Pattern: same as lib/company/tasks.ts (createAdminClient, mapRow).
 * ADR: ADR-forma-mentis.md Layer 4
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateEmbedding,
  isVectorDBEnabled,
  truncateForEmbedding,
} from "@/lib/embeddings";
import type {
  DecisionJournalEntry,
  DecisionOutcome,
  DecisionLearning,
  DecisionPattern,
  CreateDecisionInput,
  ReflectionQuery,
  ReflectionResult,
  DecisionStatus,
  SuccessCriterion,
} from "./types";

// ─── Record ───

/**
 * Record a new decision in the journal.
 * Generates an embedding for future semantic search.
 */
export async function recordDecision(
  input: CreateDecisionInput
): Promise<DecisionJournalEntry> {
  const admin = createAdminClient();

  // Generate embedding from title + description + expected outcome
  const embeddingText = [
    input.title,
    input.description,
    `Expected: ${input.expectedOutcome}`,
    input.expectedBenefit ? `Benefit: ${input.expectedBenefit}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  let embedding: number[] | null = null;
  if (isVectorDBEnabled()) {
    embedding = await generateEmbedding(
      truncateForEmbedding(embeddingText),
      "document"
    );
  }

  const { data, error } = await admin
    .from("decision_journal")
    .insert({
      title: input.title,
      description: input.description,
      department: input.department,
      decision_type: input.decisionType,
      source_task_id: input.sourceTaskId ?? null,
      source_session_id: input.sourceSessionId ?? null,
      source_adr: input.sourceAdr ?? null,
      decided_by: input.decidedBy,
      expected_outcome: input.expectedOutcome,
      expected_benefit: input.expectedBenefit ?? null,
      success_criteria: input.successCriteria ?? [],
      review_due_at: input.reviewDueAt ?? null,
      status: "active",
      learnings: [],
      tags: input.tags ?? [],
      metadata: input.metadata ?? {},
      embedding: embedding ? JSON.stringify(embedding) : null,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(
      `[RIFLESSIONE] Error recording decision: ${error.message}`
    );
  }

  return mapDecisionRow(data!);
}

// ─── Review ───

/**
 * Get decisions that are past their review_due_at date and still active.
 * These need outcome evaluation.
 */
export async function getDecisionsPendingReview(): Promise<
  DecisionJournalEntry[]
> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data, error } = await admin
    .from("decision_journal")
    .select("*")
    .eq("status", "active")
    .not("review_due_at", "is", null)
    .lte("review_due_at", now)
    .order("review_due_at", { ascending: true });

  if (error || !data) {
    console.error(
      "[RIFLESSIONE] Error fetching pending reviews:",
      error?.message
    );
    return [];
  }

  return data.map(mapDecisionRow);
}

/**
 * Review a decision with its actual outcome.
 * Updates the decision record, extracts learnings, and
 * marks it as reviewed.
 */
export async function reviewDecision(
  decisionId: string,
  outcome: DecisionOutcome
): Promise<DecisionJournalEntry | null> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  // Validate score range
  const score = Math.max(0, Math.min(1, outcome.outcomeScore));

  const { data, error } = await admin
    .from("decision_journal")
    .update({
      actual_outcome: outcome.actualOutcome,
      outcome_score: score,
      outcome_notes: outcome.outcomeNotes ?? null,
      reviewed_at: now,
      reviewed_by: outcome.reviewedBy,
      status: "reviewed",
      learnings: outcome.learnings ?? [],
      updated_at: now,
    })
    .eq("id", decisionId)
    .select("*")
    .single();

  if (error) {
    console.error(
      `[RIFLESSIONE] Error reviewing decision ${decisionId}:`,
      error.message
    );
    return null;
  }

  return mapDecisionRow(data!);
}

// ─── Semantic Search ───

/**
 * Search for similar past decisions using semantic similarity.
 * This is the "have we faced this before?" query.
 *
 * Returns decisions ordered by similarity score, along with
 * their outcomes (if reviewed) to inform the current decision.
 */
export async function searchSimilarDecisions(
  query: ReflectionQuery
): Promise<ReflectionResult[]> {
  if (!isVectorDBEnabled()) {
    console.log(
      "[RIFLESSIONE] Vector DB not enabled — skipping semantic search"
    );
    return [];
  }

  const embedding = await generateEmbedding(
    truncateForEmbedding(query.query),
    "query"
  );

  if (!embedding) {
    console.error("[RIFLESSIONE] Failed to generate embedding for query");
    return [];
  }

  const admin = createAdminClient();

  const { data, error } = await admin.rpc("match_decisions", {
    query_embedding: JSON.stringify(embedding),
    filter_department: query.department ?? null,
    filter_type: query.decisionType ?? null,
    match_threshold: query.threshold ?? 0.3,
    match_count: query.limit ?? 5,
  });

  if (error) {
    console.error(
      "[RIFLESSIONE] Error in semantic search:",
      error.message
    );
    return [];
  }

  if (!data || data.length === 0) return [];

  // Fetch full decision records for the matched IDs
  const matchedIds = data.map(
    (d: Record<string, unknown>) => d.id as string
  );
  const { data: fullDecisions, error: fetchError } = await admin
    .from("decision_journal")
    .select("*")
    .in("id", matchedIds);

  if (fetchError || !fullDecisions) {
    console.error(
      "[RIFLESSIONE] Error fetching full decision records:",
      fetchError?.message
    );
    return [];
  }

  // Build a similarity map from the RPC results
  const similarityMap = new Map<string, number>();
  for (const row of data) {
    similarityMap.set(
      row.id as string,
      row.similarity as number
    );
  }

  // Map and sort by similarity
  return fullDecisions
    .map((row) => ({
      decision: mapDecisionRow(row as Record<string, unknown>),
      similarity: similarityMap.get(row.id as string) ?? 0,
    }))
    .sort((a, b) => b.similarity - a.similarity);
}

// ─── Learning Indexing ───

/**
 * Index learnings from a reviewed decision into company_knowledge
 * and department_memory tables.
 *
 * This is the feedback loop: insights from past decisions become
 * retrievable knowledge for future decisions.
 */
export async function indexLearnings(
  decision: DecisionJournalEntry
): Promise<void> {
  if (!decision.learnings || decision.learnings.length === 0) {
    return;
  }

  const admin = createAdminClient();

  for (const learning of decision.learnings) {
    // 1. Index into company_knowledge (company-wide)
    try {
      let knowledgeEmbedding: number[] | null = null;
      if (isVectorDBEnabled()) {
        knowledgeEmbedding = await generateEmbedding(
          truncateForEmbedding(
            `${decision.title}: ${learning.learning}`
          ),
          "document"
        );
      }

      await admin.from("company_knowledge").insert({
        category: "decision",
        title: `Learning from: ${decision.title}`,
        content: learning.learning,
        departments:
          learning.applicableToDepartments.length > 0
            ? learning.applicableToDepartments
            : [decision.department],
        source_decision_id: decision.id,
        embedding: knowledgeEmbedding
          ? JSON.stringify(knowledgeEmbedding)
          : null,
        metadata: {
          decisionType: decision.decisionType,
          outcomeScore: decision.outcomeScore,
          confidence: learning.confidence,
          decidedAt: decision.decidedAt,
          reviewedAt: decision.reviewedAt,
        },
      });
    } catch (err) {
      console.error(
        "[RIFLESSIONE] Error indexing learning to company_knowledge:",
        err instanceof Error ? err.message : err
      );
    }

    // 2. Index into department_memory (department-specific)
    const targetDepts =
      learning.applicableToDepartments.length > 0
        ? learning.applicableToDepartments
        : [decision.department];

    for (const dept of targetDepts) {
      try {
        let memoryEmbedding: number[] | null = null;
        if (isVectorDBEnabled()) {
          memoryEmbedding = await generateEmbedding(
            truncateForEmbedding(learning.learning),
            "document"
          );
        }

        // Upsert: use decision ID + dept as unique key to avoid duplicates
        const memoryKey = `decision_${decision.id}_${dept}`;

        await admin.from("department_memory").upsert(
          {
            department: dept,
            category: "learning",
            key: memoryKey,
            content: `[Decision: ${decision.title}] ${learning.learning}`,
            confidence: learning.confidence,
            source_session_id: decision.sourceSessionId,
            source_task_id: decision.sourceTaskId,
            embedding: memoryEmbedding
              ? JSON.stringify(memoryEmbedding)
              : null,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "department,key" }
        );
      } catch (err) {
        console.error(
          `[RIFLESSIONE] Error indexing learning to department_memory (${dept}):`,
          err instanceof Error ? err.message : err
        );
      }
    }
  }

  console.log(
    `[RIFLESSIONE] Indexed ${decision.learnings.length} learnings from decision "${decision.title}"`
  );
}

// ─── Patterns ───

/**
 * Identify recurring decision patterns within a department.
 * Groups decisions by decision_type and analyzes outcome scores.
 *
 * This helps answer: "What types of decisions do we make most often,
 * and how well do they turn out?"
 */
export async function getDecisionPatterns(
  department?: string
): Promise<DecisionPattern[]> {
  const admin = createAdminClient();

  let query = admin
    .from("decision_journal")
    .select("*")
    .order("decided_at", { ascending: false });

  if (department) {
    query = query.eq("department", department);
  }

  const { data, error } = await query;

  if (error || !data) {
    console.error(
      "[RIFLESSIONE] Error fetching decision patterns:",
      error?.message
    );
    return [];
  }

  // Group by decision_type + department
  const groups = new Map<
    string,
    {
      decisions: Array<Record<string, unknown>>;
      departments: Set<string>;
    }
  >();

  for (const row of data) {
    const type = row.decision_type as string;
    const dept = row.department as string;
    const key = department ? type : `${type}:${dept}`;

    if (!groups.has(key)) {
      groups.set(key, { decisions: [], departments: new Set() });
    }
    const group = groups.get(key)!;
    group.decisions.push(row as Record<string, unknown>);
    group.departments.add(dept);
  }

  // Build patterns from groups
  const patterns: DecisionPattern[] = [];

  for (const [key, group] of groups.entries()) {
    if (group.decisions.length < 2) continue; // Need at least 2 decisions for a pattern

    const reviewed = group.decisions.filter(
      (d) => d.status === "reviewed" && d.outcome_score != null
    );

    const avgScore =
      reviewed.length > 0
        ? reviewed.reduce(
            (sum, d) => sum + Number(d.outcome_score),
            0
          ) / reviewed.length
        : null;

    patterns.push({
      pattern: key,
      count: group.decisions.length,
      avgOutcomeScore: avgScore,
      departments: Array.from(group.departments),
      decisionIds: group.decisions.map((d) => d.id as string),
    });
  }

  // Sort by count descending (most frequent patterns first)
  return patterns.sort((a, b) => b.count - a.count);
}

// ─── Query helpers ───

/**
 * Get a single decision by ID.
 */
export async function getDecision(
  decisionId: string
): Promise<DecisionJournalEntry | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("decision_journal")
    .select("*")
    .eq("id", decisionId)
    .maybeSingle();

  if (error || !data) return null;
  return mapDecisionRow(data);
}

/**
 * Get decisions by department, optionally filtered by status and type.
 */
export async function getDecisions(filters?: {
  department?: string;
  status?: DecisionStatus;
  decisionType?: string;
  limit?: number;
}): Promise<DecisionJournalEntry[]> {
  const admin = createAdminClient();

  let query = admin
    .from("decision_journal")
    .select("*")
    .order("decided_at", { ascending: false });

  if (filters?.department) {
    query = query.eq("department", filters.department);
  }
  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.decisionType) {
    query = query.eq("decision_type", filters.decisionType);
  }

  query = query.limit(filters?.limit ?? 50);

  const { data, error } = await query;
  if (error || !data) return [];
  return data.map(mapDecisionRow);
}

/**
 * Mark a decision as superseded by a newer decision.
 */
export async function supersededDecision(
  decisionId: string,
  supersededByDecisionId: string
): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin
    .from("decision_journal")
    .update({
      status: "superseded",
      updated_at: new Date().toISOString(),
      metadata: {
        superseded_by: supersededByDecisionId,
      },
    })
    .eq("id", decisionId);

  if (error) {
    console.error(
      `[RIFLESSIONE] Error marking decision as superseded:`,
      error.message
    );
  }
}

/**
 * Mark a decision as reverted (the decision was undone).
 */
export async function revertDecision(
  decisionId: string,
  reason: string
): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin
    .from("decision_journal")
    .update({
      status: "reverted",
      outcome_notes: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", decisionId);

  if (error) {
    console.error(
      `[RIFLESSIONE] Error marking decision as reverted:`,
      error.message
    );
  }
}

// ─── Row Mapper ───

function mapDecisionRow(
  row: Record<string, unknown>
): DecisionJournalEntry {
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string,
    department: row.department as string,
    decisionType: row.decision_type as DecisionJournalEntry["decisionType"],
    sourceTaskId: (row.source_task_id as string) ?? null,
    sourceSessionId: (row.source_session_id as string) ?? null,
    sourceAdr: (row.source_adr as string) ?? null,
    decidedBy: row.decided_by as string,
    expectedOutcome: row.expected_outcome as string,
    expectedBenefit: (row.expected_benefit as string) ?? null,
    successCriteria: (row.success_criteria as SuccessCriterion[]) ?? [],
    actualOutcome: (row.actual_outcome as string) ?? null,
    outcomeScore: row.outcome_score != null ? Number(row.outcome_score) : null,
    outcomeNotes: (row.outcome_notes as string) ?? null,
    reviewedAt: (row.reviewed_at as string) ?? null,
    reviewedBy: (row.reviewed_by as string) ?? null,
    decidedAt: row.decided_at as string,
    reviewDueAt: (row.review_due_at as string) ?? null,
    status: row.status as DecisionStatus,
    learnings: (row.learnings as DecisionLearning[]) ?? [],
    tags: (row.tags as string[]) ?? [],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
