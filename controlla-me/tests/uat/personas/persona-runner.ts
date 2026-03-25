/**
 * UAT Persona Runner — Wraps block execution with human-like behavior
 *
 * Takes a UAT scenario + a persona and modifies how each step is executed
 * to simulate realistic user interaction patterns (typing speed, reading
 * pauses, scroll behavior, error correction, mobile viewport, upload retries).
 *
 * This is a WRAPPER layer: it does not modify the building blocks themselves.
 * It intercepts step execution and injects persona-driven delays and behaviors.
 */

import type { Page } from "@playwright/test";
import type { UATStep, BlockType, BlockResult, BlockExpectation } from "../types";
import { getBlockExecutor } from "../blocks";
import type { Persona } from "./types";
import { TYPING_DELAYS, READ_DELAYS, MOBILE_VIEWPORT, TYPO_PROBABILITY } from "./types";

// ─── Persona-Aware Step Executor ─────────────────────────────────────────────

/**
 * Execute a UAT step with persona behavior applied.
 *
 * Wraps the standard block executor with:
 * - Pre-step: viewport setup (mobile), scroll simulation
 * - During: typing delays, error-prone typos
 * - Post-step: read-time pause
 * - On failure: upload retries
 */
export async function executeStepWithPersona(
  page: Page,
  step: UATStep,
  persona: Persona
): Promise<BlockResult> {
  if (step.type === "custom") {
    return { status: "pass" };
  }

  const blockType = step.type as BlockType;
  const executor = getBlockExecutor(blockType);
  if (!executor) {
    return { status: "fail", error: `Unknown block type: ${blockType}` };
  }

  // Pre-step: apply viewport for mobile users
  if (persona.behavior.mobileUser) {
    await page.setViewportSize(MOBILE_VIEWPORT);
  }

  // Determine if this step involves typing (form-submit)
  const isFormStep = blockType === "form-submit";
  const isUploadStep = blockType === "file-upload";
  const isPageStep = blockType === "page-load" || blockType === "visual-check";

  // For form steps, apply typing behavior
  if (isFormStep && persona.behavior.typingSpeed !== "fast") {
    return executeFormWithPersona(page, step.params, step.expect, persona);
  }

  // For upload steps, apply retry behavior
  if (isUploadStep && persona.behavior.uploadRetries > 0) {
    return executeUploadWithRetries(page, step.params, step.expect, persona, executor);
  }

  // Execute the step normally
  const result = await executor(page, step.params, step.expect);

  // Post-step: reading pause for page loads
  if (isPageStep && result.status === "pass") {
    const readDelay = READ_DELAYS[persona.behavior.readTime];
    await page.waitForTimeout(readDelay);
  }

  // Post-step: scroll simulation
  if (isPageStep && result.status === "pass") {
    await simulateScroll(page, persona);
  }

  return result;
}

// ─── Form Typing with Persona Behavior ───────────────────────────────────────

/**
 * Execute a form-submit step with persona-specific typing behavior.
 * Simulates character-by-character typing with delays, and optionally
 * introduces typos that get corrected (errorProne behavior).
 */
async function executeFormWithPersona(
  page: Page,
  params: Record<string, unknown>,
  expect: BlockExpectation | undefined,
  persona: Persona
): Promise<BlockResult> {
  const timeout = expect?.timeout ?? 10_000;
  const clearFirst = (params.clearFirst as boolean) ?? true;
  const delay = TYPING_DELAYS[persona.behavior.typingSpeed];

  try {
    const fields = params.fields as Array<{ selector: string; value: string }> | undefined;

    if (fields && fields.length > 0) {
      for (const field of fields) {
        await typeWithPersona(page, field.selector, field.value, delay, persona.behavior.errorProne, clearFirst, timeout);
      }
    } else {
      const selector = params.selector as string;
      const value = params.value as string;
      if (!selector || value === undefined) {
        return { status: "fail", error: "form-submit: missing required params" };
      }
      await typeWithPersona(page, selector, value, delay, persona.behavior.errorProne, clearFirst, timeout);
    }

    // Submit
    const submitSelector = params.submitSelector as string | undefined;
    if (submitSelector) {
      await page.click(submitSelector, { timeout });
    } else {
      await page.keyboard.press("Enter");
    }

    await page.waitForTimeout(500);

    // Check expectations using the standard shared utility
    const { checkExpectations } = await import("../blocks/shared");
    return await checkExpectations(page, expect);
  } catch (err) {
    const { captureFailure } = await import("../blocks/shared");
    const screenshot = await captureFailure(page, "persona-form");
    return {
      status: "fail",
      error: `persona-form: ${(err as Error).message}`,
      screenshot,
    };
  }
}

/**
 * Type text character-by-character with persona-specific delays.
 * If errorProne, randomly introduces a typo (wrong char) and corrects it.
 */
async function typeWithPersona(
  page: Page,
  selector: string,
  value: string,
  delayMs: number,
  errorProne: boolean,
  clearFirst: boolean,
  timeout: number
): Promise<void> {
  const el = page.locator(selector);
  if (clearFirst) {
    await el.clear({ timeout });
  }

  await el.click({ timeout });

  for (let i = 0; i < value.length; i++) {
    // Error-prone: 20% chance of typing wrong character
    if (errorProne && Math.random() < TYPO_PROBABILITY) {
      // Type a random wrong character
      const wrongChar = getRandomChar();
      await page.keyboard.type(wrongChar, { delay: delayMs });
      // Brief pause (noticing the mistake)
      await page.waitForTimeout(delayMs * 2);
      // Backspace to correct
      await page.keyboard.press("Backspace");
      await page.waitForTimeout(delayMs);
    }

    // Type the correct character
    await page.keyboard.type(value[i], { delay: delayMs });
  }
}

/** Get a random lowercase letter for simulating typos */
function getRandomChar(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  return chars[Math.floor(Math.random() * chars.length)];
}

// ─── Upload with Retries ─────────────────────────────────────────────────────

/**
 * Execute a file-upload step with persona-specific retry behavior.
 * If the upload fails, retries up to persona.behavior.uploadRetries times.
 */
async function executeUploadWithRetries(
  page: Page,
  params: Record<string, unknown>,
  expect: BlockExpectation | undefined,
  persona: Persona,
  executor: (page: Page, params: Record<string, unknown>, expect?: BlockExpectation) => Promise<BlockResult>
): Promise<BlockResult> {
  const maxRetries = persona.behavior.uploadRetries;
  let lastResult: BlockResult = { status: "fail", error: "No attempts made" };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    lastResult = await executor(page, params, expect);

    if (lastResult.status === "pass") {
      return lastResult;
    }

    // If not the last attempt, wait before retrying (human hesitation)
    if (attempt < maxRetries) {
      const hesitationMs = persona.behavior.readTime === "careful" ? 3000 : 1500;
      await page.waitForTimeout(hesitationMs);
    }
  }

  return lastResult;
}

// ─── Scroll Simulation ───────────────────────────────────────────────────────

/**
 * Simulate scrolling behavior based on persona's scrollPattern.
 * - linear: smooth scroll down the page in steps
 * - jumpy: random scroll positions
 * - none: no scrolling
 */
async function simulateScroll(page: Page, persona: Persona): Promise<void> {
  const pattern = persona.behavior.scrollPattern;

  if (pattern === "none") {
    return;
  }

  const viewportHeight = page.viewportSize()?.height ?? 667;

  if (pattern === "linear") {
    // Scroll down in 3 smooth steps
    for (let i = 1; i <= 3; i++) {
      await page.evaluate(
        ([scrollY]) => window.scrollTo({ top: scrollY, behavior: "smooth" }),
        [viewportHeight * i * 0.5]
      );
      await page.waitForTimeout(300);
    }
  } else if (pattern === "jumpy") {
    // Jump to 2-3 random positions
    const jumps = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < jumps; i++) {
      const randomY = Math.floor(Math.random() * viewportHeight * 3);
      await page.evaluate(
        ([scrollY]) => window.scrollTo({ top: scrollY }),
        [randomY]
      );
      await page.waitForTimeout(200);
    }
  }

  // Scroll back to top
  await page.evaluate(() => window.scrollTo({ top: 0 }));
}

// ─── Setup Helper ────────────────────────────────────────────────────────────

/**
 * Apply persona-level setup to a page before test execution.
 * Called once at the start of a persona test run.
 */
export async function setupPersona(page: Page, persona: Persona): Promise<void> {
  // Set mobile viewport if needed
  if (persona.behavior.mobileUser) {
    await page.setViewportSize(MOBILE_VIEWPORT);
  }
}
