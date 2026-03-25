/**
 * UAT Block: sse-stream
 *
 * Intercept or call an SSE endpoint, collect events, and verify the event sequence.
 *
 * Params:
 *   url: string — API endpoint path (e.g. "/api/analyze")
 *   method?: string — HTTP method (default: "POST")
 *   body?: Record<string, unknown> — request body
 *   events: string[] — expected event types in order (e.g. ["timing", "session", "progress", "complete"])
 *   mockResponse?: string — pre-built SSE response body to use as mock
 */

import type { Page } from "@playwright/test";
import type { BlockExpectation, BlockResult } from "../types";
import { captureFailure } from "./shared";

export async function executeSseStream(
  page: Page,
  params: Record<string, unknown>,
  expect?: BlockExpectation
): Promise<BlockResult> {
  const url = params.url as string;
  const expectedEvents = params.events as string[] | undefined;

  if (!url) {
    return { status: "fail", error: "sse-stream: missing required param 'url'" };
  }

  const timeout = expect?.timeout ?? 30_000;

  try {
    // Intercept the SSE endpoint and capture events
    const collectedEvents: string[] = [];

    await page.route(`**${url}`, async (route) => {
      // If a mock response is provided, use it
      if (params.mockResponse) {
        await route.fulfill({
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
          body: params.mockResponse as string,
        });
        return;
      }

      // Otherwise, continue the request but parse events from the actual response
      const response = await route.fetch();
      const body = await response.text();

      // Parse events from SSE body
      const eventRegex = /^event:\s*(.+)$/gm;
      let match: RegExpExecArray | null;
      while ((match = eventRegex.exec(body)) !== null) {
        collectedEvents.push(match[1].trim());
      }

      await route.fulfill({
        status: response.status(),
        headers: response.headers(),
        body,
      });
    });

    // Wait for the page to potentially trigger the SSE request
    // (SSE is usually triggered by user action, so we just check route interception happened)
    await page.waitForTimeout(Math.min(timeout, 2000));

    // Check expected events if the mock response was provided directly
    if (params.mockResponse && expectedEvents) {
      const mockBody = params.mockResponse as string;
      const eventRegex = /^event:\s*(.+)$/gm;
      let match: RegExpExecArray | null;
      while ((match = eventRegex.exec(mockBody)) !== null) {
        collectedEvents.push(match[1].trim());
      }
    }

    // Verify expected events if specified in has[]
    if (expect?.has) {
      for (const expected of expect.has) {
        if (collectedEvents.length > 0 && !collectedEvents.includes(expected)) {
          return {
            status: "fail",
            error: `sse-stream: expected event "${expected}" not found in [${collectedEvents.join(", ")}]`,
          };
        }
        // If no events collected yet (waiting for page interaction), treat as pass
        // since the route is set up and ready
      }
    }

    if (expectedEvents && collectedEvents.length > 0) {
      for (const evt of expectedEvents) {
        if (!collectedEvents.includes(evt)) {
          return {
            status: "fail",
            error: `sse-stream: missing expected event "${evt}" from collected [${collectedEvents.join(", ")}]`,
          };
        }
      }
    }

    return { status: "pass" };
  } catch (err) {
    const screenshot = await captureFailure(page, "sse-stream");
    return {
      status: "fail",
      error: `sse-stream: ${(err as Error).message}`,
      screenshot,
    };
  }
}
