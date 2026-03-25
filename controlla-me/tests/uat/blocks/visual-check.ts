/**
 * UAT Block: visual-check
 *
 * Take a screenshot and verify elements are visible. Optionally check responsive breakpoints.
 *
 * Params:
 *   selectors?: string[] — CSS selectors that must be visible
 *   viewport?: { width: number; height: number } — set viewport before check
 *   screenshotName?: string — custom screenshot name
 *   fullPage?: boolean — capture full page (default: true)
 */

import type { Page } from "@playwright/test";
import type { BlockExpectation, BlockResult } from "../types";
import { checkExpectations, captureFailure } from "./shared";

export async function executeVisualCheck(
  page: Page,
  params: Record<string, unknown>,
  expect?: BlockExpectation
): Promise<BlockResult> {
  const selectors = params.selectors as string[] | undefined;
  const viewport = params.viewport as { width: number; height: number } | undefined;
  const screenshotName = (params.screenshotName as string) ?? `visual-${Date.now()}`;
  const fullPage = (params.fullPage as boolean) ?? true;
  const timeout = expect?.timeout ?? 10_000;

  try {
    // Set viewport if specified
    if (viewport) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(500); // Wait for responsive layout to settle
    }

    // Check specific selectors
    if (selectors) {
      for (const sel of selectors) {
        try {
          await page.waitForSelector(sel, { state: "visible", timeout });
        } catch {
          const screenshot = await captureFailure(page, screenshotName);
          return {
            status: "fail",
            error: `visual-check: selector "${sel}" not visible`,
            screenshot,
          };
        }
      }
    }

    // Take reference screenshot
    const screenshotPath = `test-results/uat-${screenshotName}.png`;
    try {
      await page.screenshot({ path: screenshotPath, fullPage });
    } catch {
      // Non-fatal: screenshot storage might not be available
    }

    // Check block-level expectations
    return await checkExpectations(page, expect);
  } catch (err) {
    const screenshot = await captureFailure(page, "visual-check");
    return {
      status: "fail",
      error: `visual-check: ${(err as Error).message}`,
      screenshot,
    };
  }
}
