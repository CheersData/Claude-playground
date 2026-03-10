/**
 * OAuth2 Token Refresh — Handles automatic token refresh for OAuth2 credentials.
 *
 * Implements the OAuth 2.0 Refresh Token Grant (RFC 6749 Section 6).
 * Used by the CredentialVault when an OAuth2 access token is expired or
 * about to expire (5-minute margin).
 *
 * Provider compatibility:
 * - Google: returns new refresh_token on every refresh (rotation)
 * - Salesforce: returns new refresh_token only if configured
 * - HubSpot: always returns new refresh_token
 * - Microsoft: returns new refresh_token (configurable)
 *
 * @see ADR-3: Credential Vault
 * @see Integration Security Design Section 3.4
 */

import type { OAuth2RefreshResult } from "./types";

// ---- Constants ----

/** Timeout for token refresh HTTP requests (10 seconds) */
const REFRESH_TIMEOUT_MS = 10_000;

/** Margin before token expiry to trigger proactive refresh (5 minutes) */
export const REFRESH_MARGIN_MS = 5 * 60 * 1000;

// ---- Token Refresh ----

/**
 * Refresh an OAuth2 access token using a refresh token.
 *
 * Makes a POST request to the provider's token endpoint with
 * `grant_type=refresh_token`. The response contains a new access token
 * and optionally a rotated refresh token.
 *
 * @param tokenUrl - Provider's token endpoint (e.g., https://oauth2.googleapis.com/token)
 * @param clientId - OAuth2 client ID
 * @param clientSecret - OAuth2 client secret (server-side only, never exposed to client)
 * @param refreshToken - Current refresh token
 * @returns New tokens with access token, optional new refresh token, and expiry
 *
 * @throws {Error} If the refresh request fails (network error, invalid grant, etc.)
 *
 * Common failure scenarios:
 * - Refresh token expired (Salesforce: 90 days, Google: 6 months idle)
 *   -> User must re-authorize via OAuth2 flow
 * - Refresh token revoked by user on provider side
 *   -> User must re-authorize
 * - Client credentials changed on provider side
 *   -> Admin must update client_id/client_secret in env vars
 */
export async function refreshOAuth2Token(
  tokenUrl: string,
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<OAuth2RefreshResult> {
  // Validate required parameters
  if (!tokenUrl) {
    throw new Error("[VAULT-OAUTH2] tokenUrl is required for token refresh");
  }
  if (!clientId) {
    throw new Error("[VAULT-OAUTH2] clientId is required for token refresh");
  }
  if (!clientSecret) {
    throw new Error(
      "[VAULT-OAUTH2] clientSecret is required for token refresh"
    );
  }
  if (!refreshToken) {
    throw new Error(
      "[VAULT-OAUTH2] refreshToken is required for token refresh"
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);

  try {
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "(unreadable body)");
      throw new Error(
        `[VAULT-OAUTH2] Token refresh failed (HTTP ${response.status}): ` +
          errorBody.slice(0, 500)
      );
    }

    const body = await response.json();

    // Validate required fields in response
    if (!body.access_token) {
      throw new Error(
        "[VAULT-OAUTH2] Token refresh response missing access_token"
      );
    }

    const result: OAuth2RefreshResult = {
      accessToken: body.access_token,
      expiresIn: body.expires_in ?? 3600, // Default 1 hour if not specified
    };

    // Some providers rotate the refresh token on every refresh
    if (body.refresh_token) {
      result.refreshToken = body.refresh_token;
    }

    return result;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `[VAULT-OAUTH2] Token refresh timed out after ${REFRESH_TIMEOUT_MS}ms ` +
          `for tokenUrl=${tokenUrl}`
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---- Helpers ----

/**
 * Check whether an OAuth2 token needs refresh based on its expiry time.
 *
 * Returns true if:
 * - expiresAt is not set (unknown expiry, refresh proactively)
 * - expiresAt is within the 5-minute margin
 * - expiresAt is in the past
 *
 * @param expiresAt - ISO 8601 datetime string (or undefined if unknown)
 */
export function tokenNeedsRefresh(expiresAt?: string): boolean {
  if (!expiresAt) return true;

  const expiryMs = new Date(expiresAt).getTime();
  if (isNaN(expiryMs)) return true;

  return Date.now() + REFRESH_MARGIN_MS >= expiryMs;
}
