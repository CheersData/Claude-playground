/**
 * SINAPSI Layer 2 — Inter-Department Communication Types
 *
 * Machine-readable department card schema for capability discovery,
 * direct query authorization, and skill invocation.
 *
 * See ADR-forma-mentis.md Layer 2 for design rationale.
 */

/** What inputs a department accepts */
export type InputMode = 'task' | 'direct-query' | 'event' | 'cron';

/** What outputs a department produces */
export type OutputMode = 'task-result' | 'direct-response' | 'event' | 'report';

/**
 * Machine-readable API surface of a department.
 * Published as `company/<dept>/department-card.json`.
 */
export interface DepartmentCard {
  /** Department identifier (matches Department type from lib/company/types.ts) */
  id: string;

  /** Human-readable display name */
  name: string;

  /** What this department can do (machine-readable capabilities) */
  capabilities: DepartmentCapability[];

  /** What inputs this department accepts */
  inputModes: InputMode[];

  /** What outputs this department produces */
  outputModes: OutputMode[];

  /** Skills: named operations this department can perform directly */
  skills: DepartmentSkill[];

  /** Departments this department can query directly (without CME routing) */
  directQueryTargets: string[];

  /** Departments that can query this department directly */
  directQuerySources: string[];

  /** Current operational status */
  status: 'active' | 'degraded' | 'offline';

  /** Version of the card schema */
  schemaVersion: 1;
}

/**
 * A named capability that a department offers.
 * Used for discovery: "who can do X?"
 */
export interface DepartmentCapability {
  /** Unique capability identifier, e.g. 'legal-analysis', 'cost-estimation' */
  id: string;

  /** Human-readable description of what this capability does */
  description: string;

  /** What type of input this capability requires */
  inputType: string;

  /** What type of output this capability produces */
  outputType: string;

  /** Estimated duration in milliseconds (optional) */
  estimatedDurationMs?: number;

  /** Cost estimate string, e.g. '~gratis', '~$0.05', '~$0.50' */
  costEstimate?: string;
}

/**
 * A named operation that a department can perform.
 * Skills map to actual CLI commands, runbook procedures, or API calls.
 */
export interface DepartmentSkill {
  /** Unique skill identifier, e.g. 'run-tests', 'estimate-cost' */
  id: string;

  /** Human-readable description of what this skill does */
  description: string;

  /** Parameters this skill accepts */
  parameters: SkillParameter[];

  /** Description of the return value */
  returns: string;

  /** If true, this skill can be called directly without creating a task */
  isDirectCallable: boolean;
}

/**
 * A parameter for a department skill.
 */
export interface SkillParameter {
  /** Parameter name */
  name: string;

  /** Parameter type */
  type: 'string' | 'number' | 'boolean' | 'object';

  /** Whether this parameter is required */
  required: boolean;

  /** Human-readable description */
  description: string;
}
