/**
 * COLLABORAZIONE Layer 5 -- Structured Multi-Agent Pattern Types
 *
 * Defines the interfaces for three collaboration patterns:
 * 1. Fan-Out / Fan-In -- Multi-department parallel task execution
 * 2. Department-as-Tool -- Wrap departments as callable tools
 * 3. Iteration Loop -- Generate-evaluate-refine iterative improvement
 *
 * See ADR-forma-mentis.md Layer 5 for design rationale.
 */

import type { Department, TaskPriority, TaskStatus } from "../types";

// ────────────────────────────────────────────────────────
// Fan-Out / Fan-In
// ────────────────────────────────────────────────────────

/**
 * Configuration for a fan-out operation.
 * Creates a parent task and N subtasks (one per department).
 */
export interface FanOutConfig {
  /** ID of an existing parent task to attach subtasks to, or null to create a new parent */
  parentTaskId?: string;
  /** Departments to fan-out to */
  departments: Department[];
  /** Title template for the parent task and subtasks */
  templateTitle: string;
  /** Description template -- shared context for all subtasks */
  templateDesc: string;
  /** Priority for parent and subtasks */
  priority?: TaskPriority;
  /** Who initiates the fan-out (default: 'cme') */
  createdBy?: string;
  /** Decision-tree routing classification */
  routing?: string;
  /** If true, aggregate results into parent task when all subtasks complete */
  aggregateOnComplete?: boolean;
  /** Shared context payload passed to all subtasks */
  sharedContext?: Record<string, unknown>;
}

/**
 * Status of a fan-out subtask.
 */
export interface FanOutSubtaskStatus {
  department: Department;
  taskId: string;
  status: TaskStatus;
  resultSummary: string | null;
  resultData: Record<string, unknown> | null;
}

/**
 * Result of a fan-out operation.
 */
export interface FanOutResult {
  /** The parent task that owns all subtasks */
  parentTaskId: string;
  /** Status of each department subtask */
  subtasks: FanOutSubtaskStatus[];
  /** Number of completed subtasks */
  completedCount: number;
  /** Number of pending subtasks (open + in_progress) */
  pendingCount: number;
  /** Whether all subtasks have completed (done or blocked) */
  allCompleted: boolean;
  /** Total elapsed time in ms since parent task creation */
  elapsedMs: number;
}

// ────────────────────────────────────────────────────────
// Department-as-Tool
// ────────────────────────────────────────────────────────

/**
 * Result of invoking a department skill.
 */
export interface DeptToolInvocation {
  /** Target department */
  department: string;
  /** Skill that was invoked */
  skillId: string;
  /** Parameters passed to the skill */
  parameters: Record<string, unknown>;
  /** Whether the invocation succeeded */
  success: boolean;
  /** The result data (if success) */
  result: unknown;
  /** Execution duration in ms */
  durationMs: number;
  /** Error message (if !success) */
  error?: string;
}

/**
 * Summary of an available skill across departments.
 */
export interface AvailableSkill {
  department: string;
  skillId: string;
  description: string;
  isDirectCallable: boolean;
  parameters: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }>;
  returns: string;
}

/**
 * Result of parameter validation.
 */
export interface SkillValidationResult {
  valid: boolean;
  errors: string[];
}

// ────────────────────────────────────────────────────────
// Iteration Loop
// ────────────────────────────────────────────────────────

/**
 * Configuration for an iteration loop.
 * Runs a generate-evaluate-refine loop up to maxIterations times.
 */
export interface IterationLoopConfig {
  /** Task ID of the parent task that this loop is part of */
  taskId: string;
  /** Maximum number of iterations before stopping */
  maxIterations: number;
  /** Department that owns the iteration work */
  department: Department;
  /** Title prefix for iteration subtasks */
  titlePrefix?: string;
  /**
   * Evaluator function: receives the result of each iteration
   * and returns whether the result meets the success criterion.
   */
  evaluator: (result: unknown, iteration: number) => boolean | Promise<boolean>;
  /**
   * Callback invoked after each iteration completes.
   * Receives the iteration number, result, and whether it converged.
   * Return the parameters for the next iteration, or null to stop early.
   */
  onIteration: (
    iteration: number,
    result: unknown,
    converged: boolean
  ) => Record<string, unknown> | null | Promise<Record<string, unknown> | null>;
  /** Initial parameters for the first iteration */
  initialParams: Record<string, unknown>;
  /** Who initiates the loop (default: 'cme') */
  createdBy?: string;
  /** Routing classification */
  routing?: string;
}

/**
 * Record of a single iteration.
 */
export interface IterationRecord {
  /** 1-based iteration number */
  number: number;
  /** Task ID for this iteration */
  taskId: string;
  /** Parameters used for this iteration */
  params: Record<string, unknown>;
  /** Result produced by this iteration */
  result: unknown;
  /** Whether this iteration met the success criterion */
  meetsSuccessCriterion: boolean;
  /** Duration in ms */
  durationMs: number;
}

/**
 * Final result of an iteration loop.
 */
export interface IterationResult {
  /** All iteration records */
  iterations: IterationRecord[];
  /** The best result across all iterations (last one that met criterion, or the last result) */
  finalResult: unknown;
  /** Whether the loop converged (met success criterion) */
  converged: boolean;
  /** Total number of iterations executed */
  totalIterations: number;
  /** Total duration across all iterations (ms) */
  totalDurationMs: number;
  /** 1-based index of the best iteration */
  bestIteration: number;
}

// ────────────────────────────────────────────────────────
// Skill Executor Registry
// ────────────────────────────────────────────────────────

/**
 * A function that executes a department skill.
 */
export type SkillExecutor = (params: Record<string, unknown>) => Promise<unknown>;
