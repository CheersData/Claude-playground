/**
 * UAT Persona Registry — Fase 2: Persona Layer
 *
 * Predefined user personas that simulate different user types
 * interacting with the platform. Each persona has behavioral
 * characteristics (speed, typo rate) and role-based features.
 */

import type { PersonaProfile, PersonaType } from "./types";

export const PERSONA_REGISTRY: Record<PersonaType, PersonaProfile> = {
  consumer: {
    id: "consumer",
    name: "Maria Rossi",
    email: "maria.rossi@example.com",
    subscriptionTier: "free",
    previousAnalyses: 1,
    features: ["analyze", "corpus-qa"],
    waitMultiplier: 1.0,
    typoRate: 0.05,
  },
  "pmi-owner": {
    id: "pmi-owner",
    name: "Giuseppe Verdi",
    email: "g.verdi@impresa-esempio.it",
    subscriptionTier: "pro",
    previousAnalyses: 12,
    features: ["analyze", "corpus-qa", "deep-search", "integrations"],
    waitMultiplier: 1.2,
    typoRate: 0.08,
  },
  accountant: {
    id: "accountant",
    name: "Prof. Laura Bianchi",
    email: "l.bianchi@studio-contabile.it",
    subscriptionTier: "enterprise",
    previousAnalyses: 87,
    features: ["analyze", "corpus-qa", "deep-search", "batch-upload", "api-access"],
    waitMultiplier: 0.8, // power user, faster
    typoRate: 0.02,
  },
  operator: {
    id: "operator",
    name: "Support Ops",
    email: "ops@controlla.me",
    subscriptionTier: "enterprise",
    features: ["console", "analytics"],
    waitMultiplier: 0.7,
    typoRate: 0,
  },
  admin: {
    id: "admin",
    name: "Admin",
    email: "admin@controlla.me",
    subscriptionTier: "enterprise",
    features: ["console", "analytics", "user-management"],
    waitMultiplier: 0.5,
    typoRate: 0,
  },
};

/**
 * Get a persona profile by ID.
 */
export function getPersona(id: PersonaType): PersonaProfile {
  return PERSONA_REGISTRY[id];
}

/**
 * Get the list of personas a scenario should run against.
 * If no personas are specified, defaults to consumer only (avoids test explosion).
 */
export function getPersonasForScenario(scenarioPersonas?: PersonaType[]): PersonaProfile[] {
  if (!scenarioPersonas || scenarioPersonas.length === 0) {
    return [PERSONA_REGISTRY.consumer];
  }
  return scenarioPersonas.map((id) => PERSONA_REGISTRY[id]);
}
