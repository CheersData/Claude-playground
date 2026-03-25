/**
 * UAT Runner — Config-driven test runner for Controlla.me
 *
 * Discovers uat-scenarios.json manifests from company/*/uat-scenarios.json,
 * resolves prerequisites via topological sort, and executes each scenario
 * as a Playwright test using the building block system.
 *
 * Usage:
 *   npx playwright test tests/uat/runner.spec.ts                    # all scenarios
 *   npx playwright test tests/uat/runner.spec.ts --grep "legale"    # filter by dept
 *   npx playwright test tests/uat/runner.spec.ts --grep "smoke"     # filter by tag
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import type { UATManifest, UATScenario, UATStep, BlockType, BlockResult, PersonaContext } from "./types";
import { getBlockExecutor } from "./blocks";
import { getPersonasForScenario } from "./personas";
import { applyPersonaOverrides } from "./persona-behavior";
import { getPersona as getBehavioralPersona } from "./personas/personas";
import { executeStepWithPersona, setupPersona } from "./personas/persona-runner";
import type { Persona as BehavioralPersona } from "./personas/types";

// ─── Behavioral Persona Support ──────────────────────────────────────────────
// Set PERSONA env var to overlay behavioral simulation on all scenarios.
// Example: PERSONA=mario-pensionato npx playwright test tests/uat/runner.spec.ts
// This adds human-like delays, scroll patterns, upload retries on top of the
// existing role-based persona system.

const BEHAVIORAL_PERSONA: BehavioralPersona | undefined = process.env.PERSONA
  ? getBehavioralPersona(process.env.PERSONA)
  : undefined;

if (process.env.PERSONA && !BEHAVIORAL_PERSONA) {
  console.warn(`[UAT] Unknown behavioral persona "${process.env.PERSONA}". Running without behavioral simulation.`);
}

// ─── Manifest Discovery ─────────────────────────────────────────────────────

const COMPANY_DIR = path.resolve(__dirname, "../../company");

function discoverManifests(): UATManifest[] {
  const manifests: UATManifest[] = [];

  if (!fs.existsSync(COMPANY_DIR)) {
    return manifests;
  }

  const entries = fs.readdirSync(COMPANY_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(COMPANY_DIR, entry.name, "uat-scenarios.json");
    if (fs.existsSync(manifestPath)) {
      try {
        const raw = fs.readFileSync(manifestPath, "utf-8");
        const manifest: UATManifest = JSON.parse(raw);
        manifests.push(manifest);
      } catch (err) {
        console.warn(`[UAT] Failed to parse ${manifestPath}: ${(err as Error).message}`);
      }
    }
  }

  return manifests;
}

// ─── Topological Sort for Prerequisites ──────────────────────────────────────

function topologicalSort(scenarios: UATScenario[]): UATScenario[] {
  const idMap = new Map<string, UATScenario>();
  for (const s of scenarios) {
    idMap.set(s.id, s);
  }

  const visited = new Set<string>();
  const sorted: UATScenario[] = [];

  function visit(id: string, stack: Set<string>) {
    if (visited.has(id)) return;
    if (stack.has(id)) {
      console.warn(`[UAT] Circular prerequisite detected: ${id}`);
      return;
    }

    const scenario = idMap.get(id);
    if (!scenario) return;

    stack.add(id);
    for (const prereq of scenario.prerequisites ?? []) {
      visit(prereq, stack);
    }
    stack.delete(id);

    visited.add(id);
    sorted.push(scenario);
  }

  for (const s of scenarios) {
    visit(s.id, new Set());
  }

  return sorted;
}

// ─── Step Executor ───────────────────────────────────────────────────────────

async function executeStep(
  page: import("@playwright/test").Page,
  step: UATStep,
  personaCtx?: PersonaContext
): Promise<BlockResult> {
  if (step.type === "custom") {
    // Custom steps reference external spec files — skip in this runner
    return { status: "pass" };
  }

  // If a behavioral persona is active, delegate to the persona runner
  // which adds typing delays, scroll patterns, reading pauses, etc.
  if (BEHAVIORAL_PERSONA) {
    return executeStepWithPersona(page, step, BEHAVIORAL_PERSONA);
  }

  const executor = getBlockExecutor(step.type as BlockType);
  if (!executor) {
    return { status: "fail", error: `Unknown block type: ${step.type}` };
  }

  // Apply persona overrides to step params if persona context is available
  const params = personaCtx
    ? applyPersonaOverrides(step.params, personaCtx)
    : step.params;

  return executor(page, params, step.expect, personaCtx);
}

// ─── Test Generation ─────────────────────────────────────────────────────────

const manifests = discoverManifests();
const allScenarios = manifests.flatMap((m) => m.scenarios);
const sortedScenarios = topologicalSort(allScenarios);

// Track passed scenarios for prerequisite checking
const passedScenarios = new Set<string>();

for (const manifest of manifests) {
  const dept = manifest.department;

  test.describe(`UAT: ${dept}`, () => {
    // Get scenarios for this department in topological order
    const deptScenarios = sortedScenarios.filter((s) => s.department === dept);

    for (const scenario of deptScenarios) {
      // Expand scenario across applicable personas
      const personas = getPersonasForScenario(scenario.personas);

      for (const persona of personas) {
        // Build test title with persona name and tags for grep filtering
        const tags = scenario.tags?.map((t) => `[${t}]`).join(" ") ?? "";
        const personaLabel = personas.length > 1 ? ` [${persona.name}]` : "";
        const title = `${scenario.name}${personaLabel} ${tags}`.trim();

        // Build persona context with scenario-level overrides
        const personaCtx: PersonaContext = {
          persona,
          appliedOverrides: scenario.personaDataOverrides?.[persona.id],
        };

        test(title, async ({ page }) => {
          // Apply behavioral persona setup (viewport, etc.) if active
          if (BEHAVIORAL_PERSONA) {
            await setupPersona(page, BEHAVIORAL_PERSONA);
          }

          // Check prerequisites
          if (scenario.prerequisites && scenario.prerequisites.length > 0) {
            const unmet = scenario.prerequisites.filter((p) => !passedScenarios.has(p));
            if (unmet.length > 0) {
              test.skip(true, `Prerequisites not met: ${unmet.join(", ")}`);
              return;
            }
          }

          // Execute steps sequentially
          const stepResults: Array<{ blockType: string; status: string; error?: string }> = [];

          for (let i = 0; i < scenario.steps.length; i++) {
            const step = scenario.steps[i];
            const result = await executeStep(page, step, personaCtx);

            stepResults.push({
              blockType: step.type,
              status: result.status,
              error: result.error,
            });

            // If a step fails, fail the whole scenario
            if (result.status === "fail") {
              const failMsg = [
                `Step ${i + 1}/${scenario.steps.length} (${step.type}) failed`,
                result.error,
                `Scenario: ${scenario.id}`,
                `Persona: ${persona.name} (${persona.id})`,
                `Previous steps: ${stepResults.slice(0, i).map((r) => `${r.blockType}:${r.status}`).join(", ")}`,
              ]
                .filter(Boolean)
                .join("\n");

              // Attach screenshot if available
              if (result.screenshot) {
                const screenshotBuffer = fs.existsSync(result.screenshot)
                  ? fs.readFileSync(result.screenshot)
                  : undefined;
                if (screenshotBuffer) {
                  await test.info().attach("failure-screenshot", {
                    body: screenshotBuffer,
                    contentType: "image/png",
                  });
                }
              }

              expect(result.status, failMsg).toBe("pass");
              return; // Stop executing further steps
            }
          }

          // All steps passed
          passedScenarios.add(scenario.id);
        });
      }
    }
  });
}

// Fallback: if no manifests found, create a single placeholder test
if (manifests.length === 0) {
  test("UAT: no manifests found", () => {
    console.log("[UAT] No uat-scenarios.json manifests found in company/*/");
    console.log("[UAT] Create a manifest in company/<dept>/uat-scenarios.json to add UAT scenarios.");
    expect(true).toBe(true);
  });
}
