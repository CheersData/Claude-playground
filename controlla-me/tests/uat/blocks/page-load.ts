/**
 * UAT Block: page-load
 *
 * Navigate to a URL and verify title/selectors/text are present.
 *
 * Params:
 *   url: string — path relative to baseURL (e.g. "/" or "/corpus")
 *   waitFor?: string — optional selector to wait for before checking expectations
 */

import type { Page } from "@playwright/test";
import type { BlockExpectation, BlockResult } from "../types";
import { checkExpectations } from "./shared";

export async function executePageLoad(
  page: Page,
  params: Record<string, unknown>,
  expect?: BlockExpectation
): Promise<BlockResult> {
  const url = params.url as string;
  if (!url) {
    return { status: "fail", error: "page-load: missing required param 'url'" };
  }

  const timeout = expect?.timeout ?? 10_000;

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout });

    if (params.waitFor) {
      await page.waitForSelector(params.waitFor as string, { timeout });
    }

    return await checkExpectations(page, expect);
  } catch (err) {
    const screenshot = await captureFailure(page, "page-load");
    return {
      status: "fail",
      error: `page-load: ${(err as Error).message}`,
      screenshot,
    };
  }
}

async function captureFailure(page: Page, prefix: string): Promise<string | undefined> {
  try {
    const path = `test-results/uat-${prefix}-${Date.now()}.png`;
    await page.screenshot({ path, fullPage: true });
    return path;
  } catch {
    return undefined;
  }
}
