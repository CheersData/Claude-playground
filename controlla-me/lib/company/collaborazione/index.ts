/**
 * COLLABORAZIONE Layer 5 -- Re-exports
 *
 * Three structural patterns for multi-department collaboration:
 *
 * 1. Fan-Out / Fan-In -- Parallel multi-department task execution
 * 2. Department-as-Tool -- Invoke department skills programmatically
 * 3. Iteration Loop -- Generate-evaluate-refine iterative improvement
 *
 * See ADR-forma-mentis.md Layer 5 for design rationale.
 */

// Types
export type {
  FanOutConfig,
  FanOutResult,
  FanOutSubtaskStatus,
  DeptToolInvocation,
  AvailableSkill,
  SkillValidationResult,
  IterationLoopConfig,
  IterationRecord,
  IterationResult,
  SkillExecutor,
} from "./types";

// Fan-Out / Fan-In
export {
  createFanOut,
  checkFanOutStatus,
  isFanOutComplete,
  aggregateFanOutResults,
} from "./fan-out";

// Department-as-Tool
export {
  invokeDepartmentSkill,
  listAvailableSkills,
  validateSkillParams,
  registerSkillExecutor,
  unregisterSkillExecutor,
  hasSkillExecutor,
} from "./dept-as-tool";

// Iteration Loop
export {
  runIterationLoop,
  createIterationTask,
  evaluateIteration,
} from "./iteration-loop";
