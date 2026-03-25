/**
 * UAT Block: api-call
 *
 * Make a direct API call (via Playwright request context) and verify the response.
 *
 * Params:
 *   url: string — API endpoint path (e.g. "/api/corpus/hierarchy")
 *   method?: string — HTTP method (default: "GET")
 *   body?: Record<string, unknown> — request body (for POST/PUT)
 *   headers?: Record<string, string> — extra headers
 *   mockRoute?: { status: number; body: unknown } — if provided, intercepts the route with this mock
 */

import type { Page } from "@playwright/test";
import type { BlockExpectation, BlockResult } from "../types";
import { captureFailure } from "./shared";

export async function executeApiCall(
  page: Page,
  params: Record<string, unknown>,
  expect?: BlockExpectation
): Promise<BlockResult> {
  const url = params.url as string;
  const method = ((params.method as string) ?? "GET").toUpperCase();
  const body = params.body as Record<string, unknown> | undefined;
  const headers = (params.headers as Record<string, string>) ?? {};
  const mockRoute = params.mockRoute as { status: number; body: unknown } | undefined;

  if (!url) {
    return { status: "fail", error: "api-call: missing required param 'url'" };
  }

  try {
    // If mock route is provided, set it up
    if (mockRoute) {
      await page.route(`**${url}`, async (route) => {
        await route.fulfill({
          status: mockRoute.status,
          contentType: "application/json",
          body: JSON.stringify(mockRoute.body),
        });
      });
    }

    // Make the API call using page.request (shares cookies/auth)
    const requestOptions: {
      headers?: Record<string, string>;
      data?: Record<string, unknown>;
    } = {};

    if (Object.keys(headers).length > 0) {
      requestOptions.headers = headers;
    }
    if (body) {
      requestOptions.data = body;
    }

    const baseURL = page.url().startsWith("http")
      ? new URL(page.url()).origin
      : "http://localhost:3000";
    const fullUrl = `${baseURL}${url}`;

    let response;
    switch (method) {
      case "POST":
        response = await page.request.post(fullUrl, requestOptions);
        break;
      case "PUT":
        response = await page.request.put(fullUrl, requestOptions);
        break;
      case "DELETE":
        response = await page.request.delete(fullUrl, requestOptions);
        break;
      case "PATCH":
        response = await page.request.patch(fullUrl, requestOptions);
        break;
      default:
        response = await page.request.get(fullUrl, requestOptions);
    }

    // Check expected status
    if (expect?.status !== undefined && response.status() !== expect.status) {
      return {
        status: "fail",
        error: `api-call: expected status ${expect.status}, got ${response.status()}`,
      };
    }

    // Check response schema (basic field presence check)
    if (expect?.responseSchema) {
      try {
        const json = await response.json();
        const errors = validateSchema(json, expect.responseSchema);
        if (errors.length > 0) {
          return {
            status: "fail",
            error: `api-call: schema validation failed: ${errors.join("; ")}`,
          };
        }
      } catch {
        return {
          status: "fail",
          error: "api-call: response is not valid JSON",
        };
      }
    }

    // Check "has" in response body text
    if (expect?.has) {
      const text = await response.text();
      for (const entry of expect.has) {
        if (!text.includes(entry)) {
          return {
            status: "fail",
            error: `api-call: expected response to contain "${entry}"`,
          };
        }
      }
    }

    return { status: "pass" };
  } catch (err) {
    const screenshot = await captureFailure(page, "api-call");
    return {
      status: "fail",
      error: `api-call: ${(err as Error).message}`,
      screenshot,
    };
  }
}

/**
 * Basic JSON schema validation: checks that required fields exist and have the expected type.
 * Schema format: { "fieldName": "string" | "number" | "boolean" | "object" | "array" }
 */
function validateSchema(
  data: unknown,
  schema: Record<string, unknown>
): string[] {
  const errors: string[] = [];

  if (typeof data !== "object" || data === null) {
    errors.push("Response is not an object");
    return errors;
  }

  const obj = data as Record<string, unknown>;
  for (const [key, expectedType] of Object.entries(schema)) {
    if (!(key in obj)) {
      errors.push(`Missing field "${key}"`);
      continue;
    }

    if (typeof expectedType === "string") {
      const actual = Array.isArray(obj[key]) ? "array" : typeof obj[key];
      if (actual !== expectedType) {
        errors.push(`Field "${key}": expected ${expectedType}, got ${actual}`);
      }
    }
  }

  return errors;
}
