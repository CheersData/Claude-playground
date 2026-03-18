/**
 * Session Recorder — persists structured summaries of Claude Code sessions.
 *
 * Every session (interactive, console, task-runner, daemon) gets a row in
 * `company_sessions`. At session start, `openSession()` creates a placeholder.
 * At session end, `closeSession()` fills in the summary, decisions, files,
 * and generates an embedding for future semantic retrieval.
 *
 * ADR: ADR-forma-mentis.md (Layer 1, section 1.1 + 1.5)
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateEmbedding,
  isVectorDBEnabled,
  truncateForEmbedding,
} from "@/lib/embeddings";
import type { CompanySession, SessionDecision, SessionError } from "./types";

// ─── Open / Close ───

/**
 * Open a new session record. Call at session start.
 * Returns the session ID (UUID) for later updates via closeSession().
 */
export async function openSession(params: {
  sessionType: CompanySession["sessionType"];
  department?: string;
  taskId?: string;
  startedBy: string;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("company_sessions")
    .insert({
      session_type: params.sessionType,
      department: params.department ?? null,
      task_id: params.taskId ?? null,
      started_by: params.startedBy,
      summary: "", // placeholder until close
      metadata: params.metadata ?? {},
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`[MEMORY] Failed to open session: ${error.message}`);
  }

  console.log(
    `[MEMORY] Session opened | id: ${data!.id} | type: ${params.sessionType} | dept: ${params.department ?? "n/a"}`
  );

  return data!.id;
}

/**
 * Close a session with a summary and optional structured data.
 * Generates an embedding from summary + key decisions for semantic search.
 *
 * Computes duration_ms from the difference between now and started_at.
 */
export async function closeSession(
  sessionId: string,
  params: {
    summary: string;
    keyDecisions?: SessionDecision[];
    filesModified?: string[];
    tasksCreated?: string[];
    tasksCompleted?: string[];
    errorsEncountered?: SessionError[];
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const admin = createAdminClient();

  // Build text for embedding: summary + decision descriptions
  const embeddingText = [
    params.summary,
    ...(params.keyDecisions ?? []).map(
      (d) => `${d.decision}: ${d.rationale}`
    ),
  ].join("\n");

  // Generate embedding if vector DB is available
  let embedding: number[] | null = null;
  if (isVectorDBEnabled()) {
    embedding = await generateEmbedding(
      truncateForEmbedding(embeddingText),
      "document"
    );
  }

  // Fetch started_at to compute duration
  const { data: sessionRow } = await admin
    .from("company_sessions")
    .select("started_at")
    .eq("id", sessionId)
    .single();

  const endedAt = new Date().toISOString();
  let durationMs: number | null = null;
  if (sessionRow?.started_at) {
    durationMs = new Date(endedAt).getTime() - new Date(sessionRow.started_at as string).getTime();
  }

  const { error } = await admin
    .from("company_sessions")
    .update({
      summary: params.summary,
      key_decisions: params.keyDecisions ?? [],
      files_modified: params.filesModified ?? [],
      tasks_created: params.tasksCreated ?? [],
      tasks_completed: params.tasksCompleted ?? [],
      errors_encountered: params.errorsEncountered ?? [],
      metadata: params.metadata ?? {},
      embedding: embedding ? JSON.stringify(embedding) : null,
      ended_at: endedAt,
      duration_ms: durationMs,
    })
    .eq("id", sessionId);

  if (error) {
    console.error(`[MEMORY] Failed to close session ${sessionId}: ${error.message}`);
    return;
  }

  const durationSec = durationMs ? (durationMs / 1000).toFixed(0) : "?";
  console.log(
    `[MEMORY] Session closed | id: ${sessionId} | duration: ${durationSec}s | embedding: ${embedding ? "yes" : "no"}`
  );
}

// ─── Retrieval ───

/**
 * Get recent sessions in chronological order (newest first).
 * Optionally filter by department.
 */
export async function getRecentSessions(
  department?: string,
  limit = 10
): Promise<CompanySession[]> {
  const admin = createAdminClient();

  let query = admin
    .from("company_sessions")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);

  if (department) {
    query = query.eq("department", department);
  }

  const { data, error } = await query;

  if (error) {
    console.error(`[MEMORY] Failed to get recent sessions: ${error.message}`);
    return [];
  }

  return (data ?? []).map(mapSessionRow);
}

// ─── Helpers ───

/**
 * Map a raw Supabase row to the CompanySession interface.
 * Handles snake_case → camelCase conversion and null defaults.
 */
export function mapSessionRow(row: Record<string, unknown>): CompanySession {
  return {
    id: row.id as string,
    sessionType: row.session_type as CompanySession["sessionType"],
    department: (row.department as string) ?? null,
    taskId: (row.task_id as string) ?? null,
    startedBy: row.started_by as string,
    startedAt: row.started_at as string,
    endedAt: (row.ended_at as string) ?? null,
    durationMs: (row.duration_ms as number) ?? null,
    summary: row.summary as string,
    keyDecisions: (row.key_decisions ?? []) as SessionDecision[],
    filesModified: (row.files_modified ?? []) as string[],
    tasksCreated: (row.tasks_created ?? []) as string[],
    tasksCompleted: (row.tasks_completed ?? []) as string[],
    errorsEncountered: (row.errors_encountered ?? []) as SessionError[],
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
  };
}
