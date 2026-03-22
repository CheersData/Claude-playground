/**
 * Forma Mentis Daemon Integration — Public API
 *
 * Re-exports key functions for cme-autorun.ts integration.
 * Consolidates the 5 layers + SINAPSI status reader into a clean interface.
 *
 * Usage in cme-autorun.ts:
 *   import { loadFormaMentisContext, registerDaemonExecutors } from "@/lib/company/memoria-daemon-integration";
 *   registerDaemonExecutors(); // at startup
 *   const { context, memoryBlock, goalBlock, statusBlock } = await loadFormaMentisContext();
 */

// Forma Mentis Layer 1: MEMORIA
export {
  openSession,
  closeSession,
  getRecentSessions,
} from "./memory/session-recorder";

export {
  getDepartmentMemories,
  upsertDepartmentMemory,
  searchDepartmentMemory,
  expireDepartmentMemories,
} from "./memory/department-memory";

export {
  indexCompanyKnowledge,
  searchCompanyKnowledge,
} from "./memory/company-knowledge";

export {
  buildCompanyRAGContext,
} from "./memory/company-rag";

// Forma Mentis Layer 1: Context Loader
export {
  loadFormaMentisContext,
  type FormaMentisContext,
} from "./memory/daemon-context-loader";

// Forma Mentis Layer 3: COSCIENZA
export {
  getActiveGoals,
  createGoal,
  updateGoal,
  updateGoalValue,
  checkGoals,
} from "./coscienza/goal-monitor";

export {
  saveDaemonReport,
  getRecentReports,
  getReportHistory,
} from "./coscienza/daemon-reports";

// Forma Mentis Layer 4: RIFLESSIONE
export {
  recordDecision,
  getDecisionsPendingReview,
  reviewDecision,
  searchSimilarDecisions,
} from "./riflessione/decision-journal";

// Forma Mentis Layer 5: COLLABORAZIONE
export {
  createFanOut,
  checkFanOutStatus,
  aggregateFanOutResults,
} from "./collaborazione/fan-out";

export {
  invokeDepartmentSkill,
  listAvailableSkills,
  validateSkillParams,
  registerSkillExecutor,
} from "./collaborazione/dept-as-tool";

// SINAPSI: Department Status Readers (for daemon)
export {
  readQAStatus,
  readDataEngineeringStatus,
  readOperationsStatus,
  readTradingStatus,
  readAllDepartmentStatuses,
  formatDepartmentStatusSummary,
} from "./collaborazione/department-status-reader";

export {
  registerDaemonExecutors,
  checkDaemonExecutorHealth,
} from "./collaborazione/register-daemon-executors";
