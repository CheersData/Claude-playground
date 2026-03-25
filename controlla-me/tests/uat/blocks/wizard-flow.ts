/**
 * UAT Block: wizard-flow
 *
 * Navigate through a multi-step wizard (next/back/submit).
 *
 * Params:
 *   steps: Array<{
 *     action: "next" | "back" | "submit" | "fill" | "select" | "click";
 *     selector?: string;     — target element
 *     value?: string;        — value for fill/select
 *     waitFor?: string;      — selector to wait for after action
 *     expect?: { has?: string[]; hasNot?: string[] }  — per-step assertions
 *   }>
 *   nextSelector?: string — default next button selector (default: "[data-testid='wizard-next']")
 *   backSelector?: string — default back button selector (default: "[data-testid='wizard-back']")
 *   submitSelector?: string — default submit button selector (default: "[data-testid='wizard-submit']")
 */

import type { Page } from "@playwright/test";
import type { BlockExpectation, BlockResult } from "../types";
import { checkExpectations, captureFailure } from "./shared";

interface WizardStep {
  action: "next" | "back" | "submit" | "fill" | "select" | "click";
  selector?: string;
  value?: string;
  waitFor?: string;
  expect?: { has?: string[]; hasNot?: string[] };
}

export async function executeWizardFlow(
  page: Page,
  params: Record<string, unknown>,
  expect?: BlockExpectation
): Promise<BlockResult> {
  const steps = params.steps as WizardStep[] | undefined;
  const timeout = expect?.timeout ?? 10_000;
  const defaultNext = (params.nextSelector as string) ?? "[data-testid='wizard-next']";
  const defaultBack = (params.backSelector as string) ?? "[data-testid='wizard-back']";
  const defaultSubmit = (params.submitSelector as string) ?? "[data-testid='wizard-submit']";

  if (!steps || steps.length === 0) {
    return { status: "fail", error: "wizard-flow: missing required param 'steps'" };
  }

  try {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      switch (step.action) {
        case "next":
          await page.click(step.selector ?? defaultNext, { timeout });
          break;
        case "back":
          await page.click(step.selector ?? defaultBack, { timeout });
          break;
        case "submit":
          await page.click(step.selector ?? defaultSubmit, { timeout });
          break;
        case "fill":
          if (!step.selector || step.value === undefined) {
            return { status: "fail", error: `wizard-flow step ${i}: fill requires selector and value` };
          }
          await page.locator(step.selector).fill(step.value, { timeout });
          break;
        case "select":
          if (!step.selector || !step.value) {
            return { status: "fail", error: `wizard-flow step ${i}: select requires selector and value` };
          }
          await page.selectOption(step.selector, step.value, { timeout });
          break;
        case "click":
          if (!step.selector) {
            return { status: "fail", error: `wizard-flow step ${i}: click requires selector` };
          }
          await page.click(step.selector, { timeout });
          break;
      }

      // Wait for transition
      if (step.waitFor) {
        await page.waitForSelector(step.waitFor, { state: "visible", timeout });
      } else {
        await page.waitForTimeout(300);
      }

      // Per-step assertions
      if (step.expect) {
        const result = await checkExpectations(page, {
          has: step.expect.has,
          hasNot: step.expect.hasNot,
          timeout,
        });
        if (result.status === "fail") {
          return {
            status: "fail",
            error: `wizard-flow step ${i}: ${result.error}`,
            screenshot: result.screenshot,
          };
        }
      }
    }

    // Final assertions
    return await checkExpectations(page, expect);
  } catch (err) {
    const screenshot = await captureFailure(page, "wizard-flow");
    return {
      status: "fail",
      error: `wizard-flow: ${(err as Error).message}`,
      screenshot,
    };
  }
}
