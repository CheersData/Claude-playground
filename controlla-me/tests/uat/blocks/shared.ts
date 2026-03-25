/**
 * Shared utilities for UAT blocks.
 */

import type { Page } from "@playwright/test";
import type { BlockExpectation, BlockResult, PersonaContext } from "../types";

/**
 * Check "has" and "hasNot" expectations against the current page.
 * Each entry can be a CSS selector (starts with . # [ or contains :) or plain text.
 * When a PersonaContext is provided, timeouts are scaled by the persona's waitMultiplier
 * (slower users get more time to see elements appear).
 */
export async function checkExpectations(
  page: Page,
  expect?: BlockExpectation,
  personaCtx?: PersonaContext
): Promise<BlockResult> {
  if (!expect) {
    return { status: "pass" };
  }

  const baseTimeout = expect.timeout ?? 10_000;
  const multiplier = personaCtx?.persona.waitMultiplier ?? 1.0;
  const timeout = Math.round(baseTimeout * multiplier);
  const errors: string[] = [];

  // Check "has" — selectors/text that must be present
  if (expect.has) {
    for (const entry of expect.has) {
      try {
        if (isSelector(entry)) {
          await page.waitForSelector(entry, { state: "visible", timeout });
        } else {
          await page.waitForFunction(
            (text: string) => document.body.innerText.includes(text),
            entry,
            { timeout }
          );
        }
      } catch {
        errors.push(`Expected to find "${entry}" but it was not present`);
      }
    }
  }

  // Check "hasNot" — selectors/text that must NOT be present
  if (expect.hasNot) {
    for (const entry of expect.hasNot) {
      try {
        if (isSelector(entry)) {
          const el = await page.$(entry);
          if (el && await el.isVisible()) {
            errors.push(`Expected "${entry}" to NOT be present but it was found`);
          }
        } else {
          const text = await page.innerText("body").catch(() => "");
          if (text.includes(entry)) {
            errors.push(`Expected text "${entry}" to NOT be present but it was found`);
          }
        }
      } catch {
        // Not found = good for hasNot
      }
    }
  }

  if (errors.length > 0) {
    const screenshot = await captureFailure(page, "expect");
    return { status: "fail", error: errors.join("; "), screenshot };
  }

  return { status: "pass" };
}

/**
 * Heuristic: if a string looks like a CSS selector rather than plain text.
 */
function isSelector(s: string): boolean {
  return /^[.#\[]/.test(s) || /^[a-z]+\[/.test(s) || s.includes("[data-testid");
}

/**
 * Take a failure screenshot. Returns the path or undefined if it fails.
 */
export async function captureFailure(
  page: Page,
  prefix: string
): Promise<string | undefined> {
  try {
    const path = `test-results/uat-${prefix}-${Date.now()}.png`;
    await page.screenshot({ path, fullPage: true });
    return path;
  } catch {
    return undefined;
  }
}
