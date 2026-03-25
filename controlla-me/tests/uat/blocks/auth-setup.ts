/**
 * UAT Block: auth-setup
 *
 * Mock authentication state by setting cookies/localStorage for an authenticated user.
 *
 * Params:
 *   role: "authenticated" | "anonymous" | "admin" | "console"
 *   userId?: string — override user ID (default: mock-user-id)
 *   email?: string — override email
 *   consoleToken?: string — for console role, set token in localStorage
 */

import type { Page } from "@playwright/test";
import type { BlockExpectation, BlockResult } from "../types";

const MOCK_USER = {
  id: "mock-user-uat-001",
  email: "uat@controlla.me",
  full_name: "UAT Test User",
};

const MOCK_SESSION = {
  access_token: "mock-access-token-uat",
  refresh_token: "mock-refresh-token-uat",
  expires_in: 3600,
  token_type: "bearer",
  user: MOCK_USER,
};

export async function executeAuthSetup(
  page: Page,
  params: Record<string, unknown>,
  _expect?: BlockExpectation
): Promise<BlockResult> {
  const role = (params.role as string) ?? "authenticated";
  const userId = (params.userId as string) ?? MOCK_USER.id;
  const email = (params.email as string) ?? MOCK_USER.email;

  try {
    // Ensure page has a URL before setting storage
    const currentUrl = page.url();
    if (!currentUrl || currentUrl === "about:blank") {
      await page.goto("/", { waitUntil: "domcontentloaded" });
    }

    switch (role) {
      case "authenticated": {
        // Mock Supabase auth by intercepting auth-related API calls
        await page.route("**/auth/v1/token*", async (route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(MOCK_SESSION),
          });
        });

        // Set Supabase session in localStorage
        const supabaseUrl = "https://mock.supabase.co";
        const storageKey = `sb-mock-auth-token`;

        await page.evaluate(
          ({ key, session, user, uid, em }) => {
            localStorage.setItem(
              key,
              JSON.stringify({
                currentSession: { ...session, user: { ...user, id: uid, email: em } },
                expiresAt: Math.floor(Date.now() / 1000) + 3600,
              })
            );
          },
          { key: storageKey, session: MOCK_SESSION, user: MOCK_USER, uid: userId, em: email }
        );

        // Mock user usage endpoint
        await page.route("**/api/user/usage", async (route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              plan: "pro",
              analysesUsed: 1,
              analysesLimit: Infinity,
              deepSearchUsed: 0,
              deepSearchLimit: Infinity,
              canAnalyze: true,
              canDeepSearch: true,
            }),
          });
        });
        break;
      }

      case "console": {
        const consoleToken = (params.consoleToken as string) ?? "mock-console-token-uat";
        await page.evaluate(
          (token) => {
            localStorage.setItem("console-token", token);
          },
          consoleToken
        );

        // Mock console auth endpoint
        await page.route("**/api/console/auth", async (route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ token: consoleToken }),
          });
        });
        break;
      }

      case "admin":
      case "anonymous":
      default:
        // Anonymous: clear any existing auth state
        await page.evaluate(() => {
          const keys = Object.keys(localStorage);
          for (const key of keys) {
            if (key.includes("auth") || key.includes("supabase") || key.includes("console")) {
              localStorage.removeItem(key);
            }
          }
        });
        break;
    }

    return { status: "pass" };
  } catch (err) {
    return {
      status: "fail",
      error: `auth-setup: ${(err as Error).message}`,
    };
  }
}
