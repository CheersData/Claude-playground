/**
 * COSCIENZA Layer 3 — Goal Monitoring & Self-Awareness
 *
 * Re-exports all public types and functions from the coscienza module.
 */

// Types
export type {
  CompanyGoal,
  GoalStatus,
  GoalAction,
  GoalValueEntry,
  DaemonReport,
  DaemonBoardSummary,
  DaemonSignal,
  DaemonSuggestion,
  DaemonAlert,
  GoalCheckResult,
  AlertEscalation,
  CreateGoalInput,
  UpdateGoalInput,
} from "./types";

// Goal Monitor
export {
  getActiveGoals,
  getGoal,
  createGoal,
  updateGoal,
  updateGoalValue,
  checkGoals,
  createGoalAlert,
  seedInitialGoals,
} from "./goal-monitor";

// Daemon Reports
export {
  saveDaemonReport,
  getRecentReports,
  getReportHistory,
  getReport,
  getLatestReport,
  getDaemonReportDiff,
  cleanupOldReports,
} from "./daemon-reports";
export type { DaemonReportDiff } from "./daemon-reports";
