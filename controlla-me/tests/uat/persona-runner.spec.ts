/**
 * UAT Persona Runner — Parametrized Playwright tests
 *
 * Generates persona x scenario combinations and runs each as a separate
 * Playwright test. Each test wraps block execution with persona-specific
 * behavior (typing delays, reading pauses, scroll patterns, upload retries).
 *
 * Usage:
 *   npx playwright test tests/uat/persona-runner.spec.ts                         # all combos
 *   npx playwright test tests/uat/persona-runner.spec.ts --grep "Mario"          # single persona
 *   npx playwright test tests/uat/persona-runner.spec.ts --grep "regression"     # by tag
 *   PERSONA=luca-avvocato npx playwright test tests/uat/persona-runner.spec.ts   # env filter
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import { generatePersonaMatrix, getScenarioById } from "./personas/persona-scenarios";
import { executeStepWithPersona, setupPersona } from "./personas/persona-runner";
import type { UATStep } from "./types";

// ─── Configuration ───────────────────────────────────────────────────────────

const PERSONA_FILTER = process.env.PERSONA ?? undefined;
const TAG_FILTER = process.env.UAT_TAGS?.split(",").map((t) => t.trim()) ?? undefined;

// ─── Matrix Generation ──────────────────────────────────────────────────────

const combos = generatePersonaMatrix(PERSONA_FILTER, TAG_FILTER);

// Group combos by persona for better test organization
const combosByPersona = new Map<string, typeof combos>();
for (const combo of combos) {
  const key = combo.persona.id;
  if (!combosByPersona.has(key)) {
    combosByPersona.set(key, []);
  }
  combosByPersona.get(key)!.push(combo);
}

// ─── Test Generation ─────────────────────────────────────────────────────────

for (const [personaId, personaCombos] of combosByPersona) {
  const persona = personaCombos[0].persona;

  test.describe(`Persona: ${persona.name}`, () => {
    for (const combo of personaCombos) {
      const scenario = getScenarioById(combo.scenarioId);
      if (!scenario) {
        test(`${combo.scenarioName} [MISSING SCENARIO]`, () => {
          expect(false, `Scenario ${combo.scenarioId} not found in manifests`).toBe(true);
        });
        continue;
      }

      const tags = combo.tags.map((t) => `[${t}]`).join(" ");
      const title = `${combo.scenarioName} ${tags} (${combo.department})`.trim();

      test(title, async ({ page }) => {
        // Apply persona setup (viewport, etc.)
        await setupPersona(page, persona);

        // Execute steps with persona behavior
        const stepResults: Array<{ blockType: string; status: string; error?: string }> = [];

        for (let i = 0; i < scenario.steps.length; i++) {
          const step = scenario.steps[i];
          const result = await executeStepWithPersona(page, step, persona);

          stepResults.push({
            blockType: step.type,
            status: result.status,
            error: result.error,
          });

          if (result.status === "fail") {
            const failMsg = [
              `Step ${i + 1}/${scenario.steps.length} (${step.type}) failed`,
              `Persona: ${persona.name} (${personaId})`,
              result.error,
              `Scenario: ${scenario.id}`,
              `Previous steps: ${stepResults
                .slice(0, i)
                .map((r) => `${r.blockType}:${r.status}`)
                .join(", ")}`,
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
            return;
          }
        }

        // All steps passed — test is green
      });
    }
  });
}

// ─── Fallback ────────────────────────────────────────────────────────────────

if (combos.length === 0) {
  test("UAT Persona: no persona-scenario combinations generated", () => {
    console.log("[UAT-Persona] No combinations found.");
    console.log("[UAT-Persona] Check that company/*/uat-scenarios.json manifests exist.");
    if (PERSONA_FILTER) {
      console.log(`[UAT-Persona] Persona filter: ${PERSONA_FILTER}`);
    }
    if (TAG_FILTER) {
      console.log(`[UAT-Persona] Tag filter: ${TAG_FILTER.join(", ")}`);
    }
    expect(true).toBe(true);
  });
}
