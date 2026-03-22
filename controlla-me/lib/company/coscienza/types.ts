/**
 * COSCIENZA Layer 3 — Goal Monitoring & Self-Awareness Types
 *
 * Three data models:
 *   1. CompanyGoal — explicit goal tracking with value history
 *   2. DaemonReport — versioned, append-only daemon cycle reports
 *   3. GoalCheckResult / AlertEscalation — runtime goal evaluation
 *
 * See ADR-forma-mentis.md Layer 3 for design rationale.
 */

// ─── Company Goals ───

export interface CompanyGoal {
  id: string;
  title: string;
  description: string | null;
  /** Machine-readable metric name, e.g. 'sharpe_ratio', 'test_pass_rate' */
  metric: string;
  targetValue: number;
  currentValue: number;
  /** Display unit, e.g. '%', 'ratio', 'count', 'USD' */
  unit: string;
  department: string;
  ownerAgent: string | null;
  /** ISO timestamp deadline, null = ongoing */
  deadline: string | null;
  status: GoalStatus;
  /** Actions to take when goal is behind schedule */
  actionsIfBehind: GoalAction[];
  lastCheckedAt: string | null;
  /** How often daemon should check this goal (minutes) */
  checkIntervalMinutes: number;
  /** Append-only history of value changes */
  valueHistory: GoalValueEntry[];
  /** Parent goal ID for hierarchical goals (OKR: O -> KR) */
  parentGoalId: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type GoalStatus = "active" | "achieved" | "at_risk" | "missed" | "paused";

export interface GoalAction {
  /** Description of action to take, e.g. 'Create task for grid search optimization' */
  action: string;
  /** Trigger when current_value / target_value ratio falls below this threshold */
  triggerThreshold: number;
  /** Escalation level: L1=log+task, L2=L1+CME, L3=L2+Telegram boss */
  escalationLevel: "L1" | "L2" | "L3";
}

export interface GoalValueEntry {
  value: number;
  timestamp: string;
  /** Source of this value update: 'daemon', 'manual', or a task_id */
  source: string;
}

// ─── Daemon Reports (Versioned) ───

export interface DaemonReport {
  id: string;
  /** Board summary: total, open, inProgress, done task counts */
  board: DaemonBoardSummary;
  /** Array of signal objects from department scans */
  signals: DaemonSignal[];
  /** LLM-generated analysis text (when available) */
  llmAnalysis: string | null;
  /** LLM-generated suggestions */
  llmSuggestions: DaemonSuggestion[];
  /** Alert objects */
  alerts: DaemonAlert[];
  /** Results of goal checks performed in this cycle */
  goalChecks: GoalCheckResult[];
  /** How long the daemon cycle took in ms */
  durationMs: number | null;
  /** Monotonically increasing cycle counter */
  cycleNumber: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface DaemonBoardSummary {
  total: number;
  open: number;
  inProgress: number;
  done: number;
}

export interface DaemonSignal {
  deptId: string;
  sourceId: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  routing: string;
  requiresHuman: boolean;
}

export interface DaemonSuggestion {
  title: string;
  text: string;
  priority: "high" | "medium" | "low";
}

export interface DaemonAlert {
  type: string;
  message: string;
  severity: "info" | "warning" | "critical";
}

// ─── Goal Check Results ───

export interface GoalCheckResult {
  goalId: string;
  goalTitle: string;
  department: string;
  metric: string;
  previousValue: number;
  currentValue: number;
  targetValue: number;
  /** Progress ratio: currentValue / targetValue (0.0 - 1.0+) */
  progressRatio: number;
  status: GoalStatus;
  /** Status before this check (to detect transitions) */
  previousStatus: GoalStatus;
  /** Action taken during this check, if any */
  actionTaken: string | null;
}

// ─── Alert Escalation ───

export interface AlertEscalation {
  goalId: string;
  goalTitle: string;
  department: string;
  level: "L1" | "L2" | "L3";
  action: string;
  /** Task ID created for this escalation (L1+) */
  taskId: string | null;
  /** Whether Telegram alert was sent (L3) */
  telegramSent: boolean;
  timestamp: string;
}

// ─── Input types for goal creation ───

export interface CreateGoalInput {
  title: string;
  description?: string;
  metric: string;
  targetValue: number;
  currentValue?: number;
  unit?: string;
  department: string;
  ownerAgent?: string;
  deadline?: string;
  actionsIfBehind?: GoalAction[];
  checkIntervalMinutes?: number;
  parentGoalId?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateGoalInput {
  currentValue?: number;
  status?: GoalStatus;
  description?: string;
  targetValue?: number;
  deadline?: string;
  actionsIfBehind?: GoalAction[];
  checkIntervalMinutes?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}
