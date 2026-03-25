/**
 * UAT Persona-Scenario Matrix Generator
 *
 * Generates the cross-product of personas and scenarios for parametrized testing.
 *
 * Rules:
 * - Scenarios tagged 'regression' run with ALL personas
 * - Scenarios tagged 'smoke' run with DEFAULT persona only (giulia-freelancer)
 * - Scenarios with no tags run with DEFAULT persona only
 */

import * as fs from "fs";
import * as path from "path";
import type { UATManifest, UATScenario } from "../types";
import type { Persona, PersonaScenarioCombo } from "./types";
import { getAllPersonas } from "./personas";
import { DEFAULT_PERSONA_ID } from "./personas";

const COMPANY_DIR = path.resolve(__dirname, "../../../company");

// ─── Manifest Discovery (reused from runner.spec.ts logic) ──────────────────

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
        console.warn(`[UAT-Persona] Failed to parse ${manifestPath}: ${(err as Error).message}`);
      }
    }
  }

  return manifests;
}

// ─── Matrix Generation ──────────────────────────────────────────────────────

/**
 * Generate the persona x scenario matrix.
 *
 * @param filterPersonaId - optional: only generate combos for this persona
 * @param filterTags - optional: only include scenarios with these tags
 * @returns Array of persona-scenario combinations
 */
export function generatePersonaMatrix(
  filterPersonaId?: string,
  filterTags?: string[]
): PersonaScenarioCombo[] {
  const manifests = discoverManifests();
  const allScenarios = manifests.flatMap((m) => m.scenarios);
  const allPersonas = getAllPersonas();

  const combos: PersonaScenarioCombo[] = [];

  for (const scenario of allScenarios) {
    // Apply tag filter if provided
    if (filterTags && filterTags.length > 0) {
      const scenarioTags = scenario.tags ?? [];
      if (!filterTags.some((ft) => scenarioTags.includes(ft))) {
        continue;
      }
    }

    const personas = getPersonasForScenario(scenario, allPersonas, filterPersonaId);

    for (const persona of personas) {
      combos.push({
        persona,
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        department: scenario.department,
        tags: scenario.tags ?? [],
      });
    }
  }

  return combos;
}

/**
 * Determine which personas should run a given scenario.
 *
 * - 'regression' tagged scenarios: ALL personas (or filtered persona)
 * - 'smoke' tagged scenarios: DEFAULT persona only
 * - No tags: DEFAULT persona only
 */
function getPersonasForScenario(
  scenario: UATScenario,
  allPersonas: Persona[],
  filterPersonaId?: string
): Persona[] {
  const tags = scenario.tags ?? [];
  const isRegression = tags.includes("regression");

  // If a specific persona is requested, use only that one
  if (filterPersonaId) {
    const filtered = allPersonas.filter((p) => p.id === filterPersonaId);
    return filtered.length > 0 ? filtered : [];
  }

  // Regression scenarios: test with all personas
  if (isRegression) {
    return allPersonas;
  }

  // Smoke/other: only default persona
  const defaultPersona = allPersonas.find((p) => p.id === DEFAULT_PERSONA_ID);
  return defaultPersona ? [defaultPersona] : [];
}

/**
 * Get all discovered scenarios (flat list).
 * Useful for the persona runner spec to access scenario definitions.
 */
export function getAllScenarios(): UATScenario[] {
  const manifests = discoverManifests();
  return manifests.flatMap((m) => m.scenarios);
}

/**
 * Get a scenario by ID.
 */
export function getScenarioById(id: string): UATScenario | undefined {
  return getAllScenarios().find((s) => s.id === id);
}
