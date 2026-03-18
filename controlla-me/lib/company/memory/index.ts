/**
 * Layer 1: MEMORIA — Persistent Cross-Session Memory
 *
 * Public API re-exports for the company memory system.
 *
 * Usage:
 *   import { openSession, closeSession, buildCompanyRAGContext } from '@/lib/company/memory';
 *
 * ADR: ADR-forma-mentis.md (Layer 1)
 */

// ─── Types ───
export type {
  CompanySession,
  SessionDecision,
  SessionError,
  DepartmentMemoryEntry,
  CompanyKnowledgeEntry,
} from "./types";

// ─── Session Recorder ───
export {
  openSession,
  closeSession,
  getRecentSessions,
  mapSessionRow,
} from "./session-recorder";

// ─── Department Memory ───
export {
  getDepartmentMemories,
  upsertDepartmentMemory,
  searchDepartmentMemory,
  expireDepartmentMemories,
} from "./department-memory";

// ─── Company Knowledge ───
export type { CompanyKnowledgeSearchResult } from "./company-knowledge";
export {
  indexCompanyKnowledge,
  searchCompanyKnowledge,
  getRecentKnowledge,
} from "./company-knowledge";

// ─── Company RAG ───
export { buildCompanyRAGContext } from "./company-rag";
