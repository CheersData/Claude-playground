/**
 * RIFLESSIONE Layer 4 — Learning from Decisions Types
 *
 * Two data models:
 *   1. DecisionJournalEntry — tracks significant decisions with expected/actual outcomes
 *   2. ReflectionQuery / ReflectionResult — semantic search for past decisions
 *
 * See ADR-forma-mentis.md Layer 4 for design rationale.
 */

// ─── Decision Journal ───

export type DecisionType = "architectural" | "operational" | "strategic" | "tactical";
export type DecisionStatus = "active" | "reviewed" | "superseded" | "reverted";

export interface DecisionJournalEntry {
  id: string;
  title: string;
  description: string;
  department: string;
  decisionType: DecisionType;
  /** Task that triggered this decision */
  sourceTaskId: string | null;
  /** Session in which the decision was made */
  sourceSessionId: string | null;
  /** ADR reference, e.g. 'ADR-forma-mentis' */
  sourceAdr: string | null;
  /** Who made the decision: 'cme', 'boss', 'architect', etc. */
  decidedBy: string;
  /** What we expected to happen */
  expectedOutcome: string;
  /** Expected benefit in plain language */
  expectedBenefit: string | null;
  /** Measurable criteria for success */
  successCriteria: SuccessCriterion[];
  /** What actually happened (filled during review) */
  actualOutcome: string | null;
  /** 0.0 = total failure, 1.0 = exceeded expectations (filled during review) */
  outcomeScore: number | null;
  /** Notes on the outcome (filled during review) */
  outcomeNotes: string | null;
  /** When the outcome was evaluated */
  reviewedAt: string | null;
  /** Who performed the review */
  reviewedBy: string | null;
  /** When the decision was made */
  decidedAt: string;
  /** When to evaluate the outcome (typically 2-4 weeks after) */
  reviewDueAt: string | null;
  status: DecisionStatus;
  /** Extracted insights from this decision */
  learnings: DecisionLearning[];
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SuccessCriterion {
  /** Description of the criterion */
  criterion: string;
  /** Whether this criterion is quantitatively measurable */
  measurable: boolean;
  /** The metric name (if measurable), e.g. 'sharpe_ratio' */
  metric?: string;
  /** Target value for the metric */
  target?: number;
}

export interface DecisionLearning {
  /** The insight extracted from this decision */
  learning: string;
  /** How confident we are in this learning (0.0 - 1.0) */
  confidence: number;
  /** Which departments this learning applies to */
  applicableToDepartments: string[];
}

// ─── Decision Outcome (for reviewDecision) ───

export interface DecisionOutcome {
  actualOutcome: string;
  outcomeScore: number;
  outcomeNotes?: string;
  reviewedBy: string;
  learnings?: DecisionLearning[];
}

// ─── Semantic Search ───

export interface ReflectionQuery {
  /** Natural language query, e.g. "have we tried Voyage AI for embeddings before?" */
  query: string;
  /** Filter by department */
  department?: string;
  /** Filter by decision type */
  decisionType?: DecisionType;
  /** Minimum similarity threshold (0.0 - 1.0) */
  threshold?: number;
  /** Max results to return */
  limit?: number;
}

export interface ReflectionResult {
  decision: DecisionJournalEntry;
  similarity: number;
}

// ─── Input types for decision creation ───

export interface CreateDecisionInput {
  title: string;
  description: string;
  department: string;
  decisionType: DecisionType;
  sourceTaskId?: string;
  sourceSessionId?: string;
  sourceAdr?: string;
  decidedBy: string;
  expectedOutcome: string;
  expectedBenefit?: string;
  successCriteria?: SuccessCriterion[];
  reviewDueAt?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

// ─── Decision Patterns ───

export interface DecisionPattern {
  /** The recurring pattern identified */
  pattern: string;
  /** Number of decisions matching this pattern */
  count: number;
  /** Average outcome score of decisions matching this pattern */
  avgOutcomeScore: number | null;
  /** Department(s) where this pattern appears */
  departments: string[];
  /** Decision IDs matching this pattern */
  decisionIds: string[];
}
