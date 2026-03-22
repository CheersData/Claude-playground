/**
 * Types for Layer 1: MEMORIA -- Persistent Cross-Session Memory
 *
 * Three data models:
 *   1. CompanySession — structured summary of every Claude Code session
 *   2. DepartmentMemoryEntry — department-scoped persistent key-value memory
 *   3. CompanyKnowledgeEntry — company-wide operational intelligence (RAG)
 *
 * ADR: ADR-forma-mentis.md (Layer 1)
 */

// ─── Company Sessions ───

export interface CompanySession {
  id: string;
  sessionType: "interactive" | "console" | "task-runner" | "daemon";
  department: string | null;
  taskId: string | null;
  startedBy: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  summary: string;
  keyDecisions: SessionDecision[];
  filesModified: string[];
  tasksCreated: string[];
  tasksCompleted: string[];
  errorsEncountered: SessionError[];
  metadata: Record<string, unknown>;
}

export interface SessionDecision {
  decision: string;
  rationale: string;
  department: string;
  impact: "low" | "medium" | "high";
}

export interface SessionError {
  error: string;
  context: string;
  resolution: string | null;
}

// ─── Department Memory ───

export interface DepartmentMemoryEntry {
  id: string;
  department: string;
  category: "fact" | "learning" | "warning" | "preference" | "context";
  key: string;
  content: string;
  confidence: number;
  sourceSessionId: string | null;
  sourceTaskId: string | null;
  timesAccessed: number;
  lastAccessedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
}

// ─── Company Knowledge ───

export interface CompanyKnowledgeEntry {
  id: string;
  category: "pattern" | "decision" | "best_practice" | "incident" | "metric";
  title: string;
  content: string;
  departments: string[];
  sourceSessionId: string | null;
  sourceTaskId: string | null;
  sourceDecisionId: string | null;
  timesReferenced: number;
  isActive: boolean;
  metadata: Record<string, unknown>;
}
