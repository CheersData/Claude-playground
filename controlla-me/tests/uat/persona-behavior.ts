/**
 * UAT Persona Behavior — Fase 2: Human-like simulation utilities
 *
 * These utilities simulate realistic human interaction patterns:
 * variable typing speed, occasional typos, natural scrolling,
 * and persona-specific timing adjustments.
 */

import type { Page } from "@playwright/test";
import type { PersonaContext } from "./types";

/**
 * Add human-like delay based on persona speed.
 * Includes random jitter (70%-130% of base) for realism.
 */
export async function humanDelay(persona?: PersonaContext, baseMs = 300): Promise<void> {
  if (!persona) return;
  const multiplier = persona.persona.waitMultiplier ?? 1.0;
  const jitter = 0.7 + Math.random() * 0.6; // 70%-130% variance
  const delay = Math.round(baseMs * multiplier * jitter);
  if (delay > 0) await new Promise((r) => setTimeout(r, delay));
}

/**
 * Simulate human typing with variable speed and occasional typos.
 * Typos are immediately corrected with backspace (realistic self-correction).
 */
export async function humanType(
  page: Page,
  selector: string,
  text: string,
  persona?: PersonaContext
): Promise<void> {
  const typoRate = persona?.persona.typoRate ?? 0;
  const baseDelay = (persona?.persona.waitMultiplier ?? 1) * 50;

  await page.click(selector);
  await humanDelay(persona, 200);

  for (let i = 0; i < text.length; i++) {
    // Occasional typo: type wrong char, pause, backspace, type correct
    if (typoRate > 0 && Math.random() < typoRate) {
      const offset = Math.random() > 0.5 ? 1 : -1;
      const wrongChar = String.fromCharCode(text.charCodeAt(i) + offset);
      await page.keyboard.type(wrongChar, { delay: baseDelay });
      await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));
      await page.keyboard.press("Backspace");
      await new Promise((r) => setTimeout(r, 100));
    }
    await page.keyboard.type(text[i], { delay: baseDelay + Math.random() * 30 });
  }
}

/**
 * Simulate human scroll behavior (incremental, not instant jump).
 */
export async function humanScroll(
  page: Page,
  direction: "down" | "up" = "down",
  persona?: PersonaContext
): Promise<void> {
  const steps = 2 + Math.floor(Math.random() * 3);
  const scrollAmount = direction === "down" ? 300 : -300;

  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, scrollAmount + Math.random() * 100);
    await humanDelay(persona, 150);
  }
}

/**
 * Apply persona-specific overrides to step params.
 * Auto-injects persona email where the params already define an email field.
 */
export function applyPersonaOverrides(
  params: Record<string, unknown>,
  persona: PersonaContext
): Record<string, unknown> {
  return {
    ...params,
    ...(persona.appliedOverrides ?? {}),
    // Auto-inject persona email where relevant
    ...(params.email !== undefined ? { email: persona.persona.email } : {}),
  };
}
