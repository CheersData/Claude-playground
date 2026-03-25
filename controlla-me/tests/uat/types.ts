/**
 * UAT Framework — Type definitions
 *
 * Config-driven hybrid UAT framework for Controlla.me.
 * Departments declare test scenarios in uat-scenarios.json manifests,
 * and the universal runner (runner.spec.ts) discovers and executes them.
 */

// ─── Building Block Types ───────────────────────────────────────────────────

export type BlockType =
  | "page-load"
  | "file-upload"
  | "sse-stream"
  | "form-submit"
  | "wizard-flow"
  | "api-call"
  | "auth-setup"
  | "visual-check";

export interface BlockExpectation {
  /** Expected HTTP status code (for api-call, sse-stream) */
  status?: number;
  /** CSS selectors or text strings that must be present on page */
  has?: string[];
  /** CSS selectors or text strings that must NOT be present on page */
  hasNot?: string[];
  /** JSON schema for API response validation */
  responseSchema?: Record<string, unknown>;
  /** Timeout in ms, default 10000 */
  timeout?: number;
}

export interface UATBlock {
  type: BlockType;
  params: Record<string, unknown>;
  expect?: BlockExpectation;
}

export interface CustomBlock {
  type: "custom";
  specFile: string;
}

export type UATStep = UATBlock | CustomBlock;

// ─── Scenario & Manifest ────────────────────────────────────────────────────

export interface UATScenario {
  id: string;
  name: string;
  department: string;
  vertical?: string;
  description: string;
  prerequisites?: string[];
  fixtures?: string[];
  steps: UATStep[];
  tags?: string[];
  /** If set, only run for these personas; otherwise defaults to consumer */
  personas?: PersonaType[];
  /** Per-persona data overrides for step params */
  personaDataOverrides?: Partial<Record<PersonaType, Record<string, unknown>>>;
}

export interface UATManifest {
  department: string;
  scenarios: UATScenario[];
}

// ─── Results ────────────────────────────────────────────────────────────────

export interface UATStepResult {
  blockType: string;
  status: "pass" | "fail" | "skip";
  error?: string;
  screenshot?: string;
}

export interface UATResult {
  scenarioId: string;
  status: "pass" | "fail" | "skip";
  duration: number;
  steps: UATStepResult[];
  timestamp: string;
}

// ─── Block Executor Interface ───────────────────────────────────────────────

export interface BlockResult {
  status: "pass" | "fail";
  error?: string;
  screenshot?: string;
}

export type BlockExecutor = (
  page: import("@playwright/test").Page,
  params: Record<string, unknown>,
  expect?: BlockExpectation,
  personaCtx?: PersonaContext
) => Promise<BlockResult>;

// === FASE 2: Persona Layer ════════════════════════════════════════════════════

export type PersonaType = "consumer" | "pmi-owner" | "accountant" | "operator" | "admin";

export interface PersonaProfile {
  id: PersonaType;
  name: string;
  email: string;
  subscriptionTier?: "free" | "pro" | "enterprise";
  previousAnalyses?: number;
  features?: string[];
  waitMultiplier?: number; // simulate slow/fast users (default 1.0)
  typoRate?: number; // 0-1, probability of typo in form fields (human imperfection)
  customizations?: Record<string, unknown>;
}

export interface PersonaContext {
  persona: PersonaProfile;
  appliedOverrides?: Record<string, unknown>;
}
