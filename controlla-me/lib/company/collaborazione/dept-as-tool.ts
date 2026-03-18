/**
 * COLLABORAZIONE Layer 5 -- Department-as-Tool Pattern
 *
 * Wraps departments as callable tools. Each department with `isDirectCallable`
 * skills in its department-card.json becomes invocable programmatically.
 *
 * This does NOT change agent-runner.ts (which handles AI model invocation).
 * Instead, it adds a higher-level layer for inter-department collaboration.
 *
 * Usage:
 *   // List what's available
 *   const skills = listAvailableSkills();
 *   const qaSkills = listAvailableSkills('quality-assurance');
 *
 *   // Validate before invoking
 *   const validation = validateSkillParams('quality-assurance', 'run-tests', { suite: 'unit' });
 *   if (validation.valid) {
 *     const result = await invokeDepartmentSkill('quality-assurance', 'run-tests', { suite: 'unit' });
 *   }
 *
 * Authorization: the caller must be in the target department's directQuerySources,
 * OR the caller must be 'cme' (CME can invoke any department).
 *
 * See ADR-forma-mentis.md Layer 5, Section 5.1 for design rationale.
 */

import {
  loadDepartmentCards,
  canQueryDirectly,
} from "../sinapsi/department-discovery";
import type { DepartmentSkill } from "../sinapsi/types";
import type {
  DeptToolInvocation,
  AvailableSkill,
  SkillValidationResult,
  SkillExecutor,
} from "./types";

// ────────────────────────────────────────────────────────
// Skill Executor Registry
// ────────────────────────────────────────────────────────

/**
 * Registry of skill executors. Maps "department:skillId" to implementation.
 * Implementations are registered at startup, not dynamically loaded.
 *
 * Example:
 *   registerSkillExecutor('quality-assurance', 'run-tests', async (params) => {
 *     const result = execSync('npx vitest run ...', { encoding: 'utf-8' });
 *     return { passed: 42, failed: 0 };
 *   });
 */
const skillExecutors: Map<string, SkillExecutor> = new Map();

/**
 * Register an executor for a department skill.
 *
 * @param department - Department ID
 * @param skillId - Skill ID from department-card.json
 * @param executor - Async function that executes the skill
 */
export function registerSkillExecutor(
  department: string,
  skillId: string,
  executor: SkillExecutor
): void {
  const key = `${department}:${skillId}`;
  skillExecutors.set(key, executor);
  console.log(`[COLLABORAZIONE] Registered executor: ${key}`);
}

/**
 * Unregister a skill executor. Useful for testing.
 */
export function unregisterSkillExecutor(
  department: string,
  skillId: string
): void {
  skillExecutors.delete(`${department}:${skillId}`);
}

/**
 * Check if a skill executor is registered.
 */
export function hasSkillExecutor(
  department: string,
  skillId: string
): boolean {
  return skillExecutors.has(`${department}:${skillId}`);
}

// ────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────

/**
 * Invoke a department skill directly.
 *
 * This is the programmatic equivalent of CME saying:
 * "QA, run the test suite and tell me the results."
 *
 * @param dept - Target department ID
 * @param skillId - Skill ID from the department's card
 * @param params - Parameters to pass to the skill executor
 * @param callerDept - Who is calling (default: 'cme')
 */
export async function invokeDepartmentSkill(
  dept: string,
  skillId: string,
  params: Record<string, unknown> = {},
  callerDept: string = "cme"
): Promise<DeptToolInvocation> {
  const start = Date.now();
  const baseResult: Omit<DeptToolInvocation, "success" | "result" | "error"> = {
    department: dept,
    skillId,
    parameters: params,
    durationMs: 0,
  };

  // 1. Authorization check
  if (callerDept !== "cme" && !canQueryDirectly(callerDept, dept)) {
    return {
      ...baseResult,
      success: false,
      result: null,
      durationMs: Date.now() - start,
      error: `Department "${callerDept}" is not authorized to query "${dept}" directly. Use the task system instead.`,
    };
  }

  // 2. Find the department card
  const cards = loadDepartmentCards();
  const card = cards.get(dept);
  if (!card) {
    return {
      ...baseResult,
      success: false,
      result: null,
      durationMs: Date.now() - start,
      error: `Department "${dept}" not found or has no department-card.json.`,
    };
  }

  // 3. Find the skill
  const skill = card.skills.find((s) => s.id === skillId);
  if (!skill) {
    const available = card.skills.map((s) => s.id).join(", ");
    return {
      ...baseResult,
      success: false,
      result: null,
      durationMs: Date.now() - start,
      error: `Skill "${skillId}" not found in department "${dept}". Available skills: ${available || "(none)"}`,
    };
  }

  // 4. Check if skill is directly callable
  if (!skill.isDirectCallable) {
    return {
      ...baseResult,
      success: false,
      result: null,
      durationMs: Date.now() - start,
      error: `Skill "${skillId}" is not directly callable. Create a task instead.`,
    };
  }

  // 5. Validate parameters
  const validation = validateSkillParamsInternal(skill, params);
  if (!validation.valid) {
    return {
      ...baseResult,
      success: false,
      result: null,
      durationMs: Date.now() - start,
      error: `Invalid parameters: ${validation.errors.join("; ")}`,
    };
  }

  // 6. Execute the skill
  const executor = skillExecutors.get(`${dept}:${skillId}`);
  if (!executor) {
    return {
      ...baseResult,
      success: false,
      result: null,
      durationMs: Date.now() - start,
      error:
        `No executor registered for ${dept}:${skillId}. ` +
        `Register one with registerSkillExecutor().`,
    };
  }

  try {
    const result = await executor(params);
    console.log(
      `[COLLABORAZIONE] Invoked ${dept}:${skillId} -- ${Date.now() - start}ms`
    );
    return {
      ...baseResult,
      success: true,
      result,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      ...baseResult,
      success: false,
      result: null,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * List all available skills across departments, or for a specific department.
 *
 * @param dept - Optional department filter. If omitted, returns skills from all departments.
 * @returns Array of available skills with their metadata
 */
export function listAvailableSkills(dept?: string): AvailableSkill[] {
  const cards = loadDepartmentCards();
  const result: AvailableSkill[] = [];

  const cardsToScan = dept
    ? [cards.get(dept)].filter(Boolean)
    : Array.from(cards.values());

  for (const card of cardsToScan) {
    if (!card) continue;
    for (const skill of card.skills) {
      result.push({
        department: card.id,
        skillId: skill.id,
        description: skill.description,
        isDirectCallable: skill.isDirectCallable,
        parameters: skill.parameters.map((p) => ({
          name: p.name,
          type: p.type,
          required: p.required,
          description: p.description,
        })),
        returns: skill.returns,
      });
    }
  }

  return result;
}

/**
 * Validate parameters against a skill's parameter schema.
 *
 * @param dept - Department ID
 * @param skillId - Skill ID
 * @param params - Parameters to validate
 * @returns Validation result with errors if any
 */
export function validateSkillParams(
  dept: string,
  skillId: string,
  params: Record<string, unknown>
): SkillValidationResult {
  const cards = loadDepartmentCards();
  const card = cards.get(dept);

  if (!card) {
    return {
      valid: false,
      errors: [`Department "${dept}" not found or has no department-card.json.`],
    };
  }

  const skill = card.skills.find((s) => s.id === skillId);
  if (!skill) {
    return {
      valid: false,
      errors: [
        `Skill "${skillId}" not found in department "${dept}".`,
      ],
    };
  }

  return validateSkillParamsInternal(skill, params);
}

// ────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────

/**
 * Validate parameters against a skill's parameter definitions.
 */
function validateSkillParamsInternal(
  skill: DepartmentSkill,
  params: Record<string, unknown>
): SkillValidationResult {
  const errors: string[] = [];

  for (const paramDef of skill.parameters) {
    const value = params[paramDef.name];

    // Check required parameters
    if (paramDef.required && (value === undefined || value === null)) {
      errors.push(
        `Required parameter "${paramDef.name}" is missing (${paramDef.description})`
      );
      continue;
    }

    // Skip type check for optional parameters that are not provided
    if (value === undefined || value === null) continue;

    // Type check
    const actualType = typeof value;
    if (paramDef.type === "object") {
      if (actualType !== "object" || Array.isArray(value)) {
        errors.push(
          `Parameter "${paramDef.name}" should be object, got ${Array.isArray(value) ? "array" : actualType}`
        );
      }
    } else if (actualType !== paramDef.type) {
      errors.push(
        `Parameter "${paramDef.name}" should be ${paramDef.type}, got ${actualType}`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}
