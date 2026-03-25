/**
 * UAT Block: form-submit
 *
 * Fill a form field and submit it, then verify the response.
 *
 * Params:
 *   selector: string — CSS selector for the input field
 *   value: string — text to type into the field
 *   submitSelector?: string — CSS selector for the submit button (default: nearby button[type="submit"])
 *   clearFirst?: boolean — clear the field before typing (default: true)
 *   fields?: Array<{ selector: string; value: string }> — multiple fields to fill
 */

import type { Page } from "@playwright/test";
import type { BlockExpectation, BlockResult } from "../types";
import { checkExpectations, captureFailure } from "./shared";

export async function executeFormSubmit(
  page: Page,
  params: Record<string, unknown>,
  expect?: BlockExpectation
): Promise<BlockResult> {
  const timeout = expect?.timeout ?? 10_000;
  const clearFirst = (params.clearFirst as boolean) ?? true;

  try {
    // Fill multiple fields if provided
    const fields = params.fields as Array<{ selector: string; value: string }> | undefined;

    if (fields && fields.length > 0) {
      for (const field of fields) {
        const el = page.locator(field.selector);
        if (clearFirst) {
          await el.clear({ timeout });
        }
        await el.fill(field.value, { timeout });
      }
    } else {
      // Single field mode
      const selector = params.selector as string;
      const value = params.value as string;

      if (!selector || value === undefined) {
        return {
          status: "fail",
          error: "form-submit: missing required params 'selector' and/or 'value'",
        };
      }

      const el = page.locator(selector);
      if (clearFirst) {
        await el.clear({ timeout });
      }
      await el.fill(value, { timeout });
    }

    // Submit
    const submitSelector = params.submitSelector as string | undefined;
    if (submitSelector) {
      await page.click(submitSelector, { timeout });
    } else {
      // Try pressing Enter on the last focused element
      await page.keyboard.press("Enter");
    }

    // Wait a moment for the response to render
    await page.waitForTimeout(500);

    return await checkExpectations(page, expect);
  } catch (err) {
    const screenshot = await captureFailure(page, "form-submit");
    return {
      status: "fail",
      error: `form-submit: ${(err as Error).message}`,
      screenshot,
    };
  }
}
