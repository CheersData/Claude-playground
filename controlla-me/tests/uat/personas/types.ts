/**
 * UAT Persona Layer — Type definitions
 *
 * Persona types model real human users with different behaviors,
 * demographics, and interaction patterns. This layer sits on top
 * of the UAT Fase 1 building blocks and modifies step execution
 * to simulate realistic user behavior.
 */

// ─── Behavior Enums ──────────────────────────────────────────────────────────

export type TypingSpeed = "slow" | "normal" | "fast";
export type ReadTime = "skimmer" | "reader" | "careful";
export type ScrollPattern = "linear" | "jumpy" | "none";
export type TechLevel = "low" | "medium" | "high";
export type PatienceLevel = "low" | "medium" | "high";

// ─── Core Interfaces ─────────────────────────────────────────────────────────

export interface PersonaDemographics {
  age: number;
  techLevel: TechLevel;
  patience: PatienceLevel;
}

export interface PersonaBehavior {
  /** Delay between keystrokes: slow=200ms, normal=80ms, fast=20ms */
  typingSpeed: TypingSpeed;
  /** Pause after page loads: skimmer=500ms, reader=2000ms, careful=5000ms */
  readTime: ReadTime;
  /** 20% chance of typo, then backspace and retype */
  errorProne: boolean;
  /** How the user scrolls: linear=smooth, jumpy=random jumps, none=no scroll */
  scrollPattern: ScrollPattern;
  /** How many times to retry a failed upload */
  uploadRetries: number;
  /** Use mobile viewport (375x667) */
  mobileUser: boolean;
}

export interface Persona {
  id: string;
  name: string;
  description: string;
  behavior: PersonaBehavior;
  demographics: PersonaDemographics;
}

// ─── Timing Constants ────────────────────────────────────────────────────────

export const TYPING_DELAYS: Record<TypingSpeed, number> = {
  slow: 200,
  normal: 80,
  fast: 20,
};

export const READ_DELAYS: Record<ReadTime, number> = {
  skimmer: 500,
  reader: 2000,
  careful: 5000,
};

export const MOBILE_VIEWPORT = { width: 375, height: 667 };

/** Probability of making a typo per character when errorProne=true */
export const TYPO_PROBABILITY = 0.2;

// ─── Persona-Scenario Matrix ─────────────────────────────────────────────────

export interface PersonaScenarioCombo {
  persona: Persona;
  scenarioId: string;
  scenarioName: string;
  department: string;
  tags: string[];
}
