/**
 * UAT Block: file-upload
 *
 * Upload a file via input[type=file] or drag-drop zone.
 *
 * Params:
 *   selector: string — CSS selector for the upload zone / input
 *   fixturePath: string — path relative to tests/uat/fixtures/
 *   mimeType?: string — MIME type (default: application/octet-stream)
 *   fileName?: string — override file name
 */

import * as path from "path";
import * as fs from "fs";
import type { Page } from "@playwright/test";
import type { BlockExpectation, BlockResult } from "../types";
import { checkExpectations, captureFailure } from "./shared";

const FIXTURES_DIR = path.resolve(__dirname, "../fixtures");

export async function executeFileUpload(
  page: Page,
  params: Record<string, unknown>,
  expect?: BlockExpectation
): Promise<BlockResult> {
  const selector = params.selector as string;
  const fixturePath = params.fixturePath as string;
  const mimeType = (params.mimeType as string) ?? "application/octet-stream";

  if (!selector || !fixturePath) {
    return {
      status: "fail",
      error: "file-upload: missing required params 'selector' and/or 'fixturePath'",
    };
  }

  const timeout = expect?.timeout ?? 10_000;
  const fullPath = path.join(FIXTURES_DIR, fixturePath);
  const fileName = (params.fileName as string) ?? path.basename(fixturePath);

  try {
    // Read the fixture file (or use a placeholder buffer if the file is a placeholder text)
    let buffer: Buffer;
    if (fs.existsSync(fullPath)) {
      buffer = fs.readFileSync(fullPath);
    } else {
      // Fallback: create a minimal buffer for testing
      buffer = Buffer.from(`Placeholder content for ${fixturePath}`);
    }

    // Try setting files via input[type="file"] first
    const fileInput = page.locator(`${selector} input[type="file"]`).or(
      page.locator('input[type="file"]').first()
    );

    try {
      await fileInput.setInputFiles(
        { name: fileName, mimeType, buffer },
        { timeout }
      );
    } catch {
      // Fallback: try using the filechooser event
      const fileChooserPromise = page.waitForEvent("filechooser", { timeout });
      await page.click(selector, { timeout });
      const chooser = await fileChooserPromise;
      await chooser.setFiles({ name: fileName, mimeType, buffer });
    }

    return await checkExpectations(page, expect);
  } catch (err) {
    const screenshot = await captureFailure(page, "file-upload");
    return {
      status: "fail",
      error: `file-upload: ${(err as Error).message}`,
      screenshot,
    };
  }
}
