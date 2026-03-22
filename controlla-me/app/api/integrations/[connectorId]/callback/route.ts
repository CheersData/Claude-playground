/**
 * API Route: /api/integrations/[connectorId]/callback
 *
 * OAuth2 callback handler for integration connectors.
 *
 * Flow:
 * 1. OAuth provider redirects here with ?code=AUTHORIZATION_CODE&state=STATE
 * 2. Validate state param against cookie (CSRF protection)
 * 3. Validate PKCE code_verifier cookie is present (RFC 7636)
 * 4. Exchange the code for access + refresh tokens (with code_verifier)
 * 5. Authenticate user via Supabase session
 * 6. Store credentials in pgcrypto vault (lib/credential-vault.ts)
 * 7. Create/update integration_connections row
 * 8. Log the credential access in integration_credential_audit
 * 9. Redirect back to /integrazione/[connectorId] with success/error status
 *
 * Security:
 * - State parameter validated against httpOnly cookie (prevents CSRF)
 * - PKCE code_verifier sent in token exchange (prevents code interception — RFC 7636)
 * - Credentials stored encrypted in pgcrypto vault
 * - Rate limited to prevent abuse
 * - No secrets exposed in redirect URL
 * - State and PKCE cookies cleared on every exit path
 * - Token expiry computed and stored for automatic refresh scheduling
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { getVaultOrNull } from "@/lib/credential-vault";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { timingSafeEqual } from "crypto";

// ─── OAuth provider configs ───

interface OAuthProviderConfig {
  tokenUrl: string;
  clientIdEnvVar: string;
  clientSecretEnvVar: string;
  scopes: string[];
  /**
   * Some providers require additional params in the token exchange body.
   * E.g., Fatture in Cloud may need a different grant_type or extra fields.
   */
  extraTokenParams?: Record<string, string>;
  /**
   * Some providers (HubSpot) return JSON with Content-Type application/json,
   * but the token request must be x-www-form-urlencoded. This is the standard.
   * Override only if a provider needs application/json in the request body.
   */
  tokenContentType?: string;
}

const OAUTH_CONFIGS: Record<string, OAuthProviderConfig> = {
  hubspot: {
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    clientIdEnvVar: "HUBSPOT_CLIENT_ID",
    clientSecretEnvVar: "HUBSPOT_CLIENT_SECRET",
    scopes: [
      "oauth",
      "crm.objects.contacts.read",
      "crm.objects.companies.read",
      "crm.objects.deals.read",
      "crm.objects.tickets.read",
    ],
  },
  salesforce: {
    tokenUrl: "https://login.salesforce.com/services/oauth2/token",
    clientIdEnvVar: "SALESFORCE_CLIENT_ID",
    clientSecretEnvVar: "SALESFORCE_CLIENT_SECRET",
    scopes: ["api", "refresh_token"],
  },
  "google-drive": {
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdEnvVar: "GOOGLE_CLIENT_ID",
    clientSecretEnvVar: "GOOGLE_CLIENT_SECRET",
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  },
  "fatture-in-cloud": {
    tokenUrl: "https://api-v2.fattureincloud.it/oauth/token",
    clientIdEnvVar: "FATTURE_CLIENT_ID",
    clientSecretEnvVar: "FATTURE_CLIENT_SECRET",
    scopes: [
      "entity.clients:r",
      "entity.suppliers:r",
      "issued_documents:r",
      "received_documents:r",
    ],
  },
};

// ─── Helpers ───

/**
 * Build a redirect response clearing the OAuth state and PKCE cookies.
 * Used on every exit path (success and error) to prevent state/verifier reuse.
 */
function redirectWithCleanup(
  baseRedirect: string,
  reqUrl: string,
  connectorId: string,
  params: Record<string, string>
): NextResponse {
  const redirectUrl = new URL(baseRedirect, reqUrl);
  for (const [key, value] of Object.entries(params)) {
    redirectUrl.searchParams.set(key, value);
  }
  const response = NextResponse.redirect(redirectUrl);
  // Clear CSRF state cookie
  response.cookies.set(`oauth_state_${connectorId}`, "", {
    maxAge: 0,
    path: "/",
  });
  // Clear PKCE code_verifier cookie
  response.cookies.set(`pkce_verifier_${connectorId}`, "", {
    maxAge: 0,
    path: "/",
  });
  return response;
}

/**
 * Compute token expiry as ISO 8601 datetime string.
 * Uses the provider's expires_in (seconds) or defaults to 1 hour.
 */
function computeExpiresAt(expiresIn?: number): string {
  const seconds = expiresIn && expiresIn > 0 ? expiresIn : 3600;
  return new Date(Date.now() + seconds * 1000).toISOString();
}

/**
 * Log a credential access/create event in the integration_credential_audit table.
 * Non-blocking: failures are logged but never block the main flow.
 */
async function logCredentialAudit(
  credentialId: string | null,
  userId: string,
  action: "create" | "access" | "refresh" | "revoke" | "rotate",
  connectorId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("integration_credential_audit").insert({
      credential_id: credentialId ?? "00000000-0000-0000-0000-000000000000",
      user_id: userId,
      action,
      actor: "oauth_callback",
      metadata: {
        connector_id: connectorId,
        ...metadata,
      },
    });
  } catch (err) {
    // Audit failure must NEVER block the OAuth callback flow
    console.error(
      `[OAuth:${connectorId}] Audit log failed for action="${action}":`,
      err instanceof Error ? err.message : String(err)
    );
  }
}

// ─── GET: OAuth callback ───

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ connectorId: string }> }
) {
  // Rate limit
  const rateLimited = await checkRateLimit(req);
  if (rateLimited) return rateLimited;

  const { connectorId } = await params;
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const baseRedirect = `/integrazione/${connectorId}`;

  // ─── Error from OAuth provider ───
  // Providers like Google and HubSpot redirect with ?error=access_denied&error_description=...
  // when the user denies consent or an error occurs during authorization.
  if (error) {
    console.error(
      `[OAuth:${connectorId}] Provider error:`,
      error,
      errorDescription
    );
    return redirectWithCleanup(baseRedirect, req.url, connectorId, {
      oauth_error: error,
      ...(errorDescription ? { oauth_error_desc: errorDescription } : {}),
    });
  }

  // ─── Validate required params ───
  if (!code) {
    console.error(`[OAuth:${connectorId}] Missing authorization code`);
    return redirectWithCleanup(baseRedirect, req.url, connectorId, {
      oauth_error: "missing_code",
    });
  }

  // ─── Validate state (CSRF protection) ───
  // The authorize route sets a state cookie with maxAge=600 (10 min).
  // If the cookie is missing, the state has expired.
  const cookieName = `oauth_state_${connectorId}`;
  const storedState = req.cookies.get(cookieName)?.value;

  if (!state || !storedState) {
    console.error(
      `[OAuth:${connectorId}] State missing — cookie expired or not set. ` +
        `state=${state ? "present" : "missing"}, cookie=${storedState ? "present" : "missing"}`
    );
    return redirectWithCleanup(baseRedirect, req.url, connectorId, {
      oauth_error: "expired_state",
    });
  }

  // INT-SEC-001: Timing-safe comparison to prevent timing oracle attacks on state parameter
  const stateBuffer = Buffer.from(state, "utf-8");
  const storedBuffer = Buffer.from(storedState, "utf-8");
  const stateValid =
    stateBuffer.length === storedBuffer.length &&
    timingSafeEqual(stateBuffer, storedBuffer);

  if (!stateValid) {
    console.error(
      `[OAuth:${connectorId}] State mismatch — possible CSRF attack. ` +
        `expected="${storedState.slice(0, 8)}...", got="${state.slice(0, 8)}..."`
    );
    return redirectWithCleanup(baseRedirect, req.url, connectorId, {
      oauth_error: "invalid_state",
    });
  }

  // ─── Validate PKCE code_verifier (RFC 7636) ───
  // The authorize route stores the code_verifier in an httpOnly cookie.
  // It MUST be present here — if missing, the PKCE chain is broken (cookie expired
  // or was never set), and we cannot safely exchange the authorization code.
  const pkceCookieName = `pkce_verifier_${connectorId}`;
  const codeVerifier = req.cookies.get(pkceCookieName)?.value;

  if (!codeVerifier) {
    console.error(
      `[OAuth:${connectorId}] PKCE verification failed — code_verifier cookie missing or expired`
    );
    return redirectWithCleanup(baseRedirect, req.url, connectorId, {
      oauth_error: "pkce_failed",
    });
  }

  // ─── Validate connector exists in OAuth registry ───
  const oauthConfig = OAUTH_CONFIGS[connectorId];
  if (!oauthConfig) {
    console.error(
      `[OAuth:${connectorId}] Unknown connector — not in OAUTH_CONFIGS. ` +
        `Available: ${Object.keys(OAUTH_CONFIGS).join(", ")}`
    );
    return redirectWithCleanup(baseRedirect, req.url, connectorId, {
      oauth_error: "unknown_connector",
    });
  }

  // ─── Exchange authorization code for tokens ───
  try {
    const clientId = process.env[oauthConfig.clientIdEnvVar];
    const clientSecret = process.env[oauthConfig.clientSecretEnvVar];

    if (!clientId || !clientSecret) {
      const missing: string[] = [];
      if (!clientId) missing.push(oauthConfig.clientIdEnvVar);
      if (!clientSecret) missing.push(oauthConfig.clientSecretEnvVar);
      console.error(
        `[OAuth:${connectorId}] Missing env vars: ${missing.join(", ")}`
      );
      return redirectWithCleanup(baseRedirect, req.url, connectorId, {
        oauth_error: "server_config",
      });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const redirectUri = `${appUrl}/api/integrations/${connectorId}/callback`;

    // Build token exchange body
    // PKCE: include code_verifier so the authorization server can verify it
    // against the code_challenge sent during authorization (RFC 7636 Section 4.5).
    // Providers that don't support PKCE will ignore this parameter.
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: codeVerifier,
      ...(oauthConfig.extraTokenParams ?? {}),
    });

    const contentType =
      oauthConfig.tokenContentType ?? "application/x-www-form-urlencoded";

    // Token exchange request to the OAuth provider
    const tokenResponse = await fetch(oauthConfig.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: tokenBody.toString(),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      console.error(
        `[OAuth:${connectorId}] Token exchange failed: HTTP ${tokenResponse.status}`,
        errorBody.slice(0, 500)
      );

      // Differentiate common error cases for better UX
      const errorCode =
        tokenResponse.status === 400
          ? "invalid_code" // Expired or already-used authorization code
          : tokenResponse.status === 401
            ? "invalid_credentials" // Wrong client_id/client_secret
            : "token_exchange_failed";

      return redirectWithCleanup(baseRedirect, req.url, connectorId, {
        oauth_error: errorCode,
      });
    }

    const tokenData = await tokenResponse.json();

    // Validate that we received an access token
    if (!tokenData.access_token) {
      console.error(
        `[OAuth:${connectorId}] Token response missing access_token:`,
        JSON.stringify(tokenData).slice(0, 200)
      );
      return redirectWithCleanup(baseRedirect, req.url, connectorId, {
        oauth_error: "no_access_token",
      });
    }

    // INT-SEC-002: Never log token length or any derivative of token content.
    // Token length can narrow brute-force search space.
    console.log(
      `[OAuth:${connectorId}] Token exchange successful. ` +
        `refresh_token: ${tokenData.refresh_token ? "present" : "absent"}, ` +
        `expires_in: ${tokenData.expires_in ?? "unspecified"}s`
    );

    // ─── Get authenticated user from Supabase session ───
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error(
        `[OAuth:${connectorId}] User not authenticated:`,
        userError?.message ?? "no session"
      );
      return redirectWithCleanup(baseRedirect, req.url, connectorId, {
        oauth_error: "not_authenticated",
      });
    }

    // ─── Compute token expiry ───
    const expiresAt = computeExpiresAt(tokenData.expires_in);

    // ─── Store credentials in pgcrypto vault (lib/credential-vault.ts) ───
    // This vault is used by the sync route (/api/integrations/[connectorId]/sync)
    // and the OAuth2 PKCE handler (lib/staff/data-connector/auth/oauth2-handler.ts)
    let pgcryptoVaultId: string | null = null;
    const pgcryptoVault = getVaultOrNull();

    if (pgcryptoVault) {
      try {
        pgcryptoVaultId = await pgcryptoVault.storeCredential(
          user.id,
          connectorId,
          "oauth2_token",
          {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token || "",
            token_type: tokenData.token_type || "Bearer",
            expires_in: String(tokenData.expires_in || 3600),
          },
          {
            metadata: {
              provider: connectorId,
              scopes: oauthConfig.scopes,
              stored_by: "oauth_callback",
            },
            expiresAt,
          }
        );
        console.log(
          `[OAuth:${connectorId}] pgcrypto vault: credentials stored (id=${pgcryptoVaultId})`
        );
      } catch (err) {
        console.error(
          `[OAuth:${connectorId}] pgcrypto vault store failed:`,
          err instanceof Error ? err.message : String(err)
        );
      }
    } else {
      console.warn(
        `[OAuth:${connectorId}] pgcrypto vault not available (VAULT_ENCRYPTION_KEY not configured)`
      );
    }

    // If vault storage failed, we cannot proceed
    if (!pgcryptoVaultId) {
      console.error(
        `[OAuth:${connectorId}] CRITICAL: Vault storage failed. Credentials NOT stored.`
      );
      return redirectWithCleanup(baseRedirect, req.url, connectorId, {
        oauth_error: "vault_unavailable",
      });
    }

    // ─── Create/update integration_connections row ───
    const admin = createAdminClient();

    const connectionRow = {
      user_id: user.id,
      connector_type: connectorId,
      status: "active" as const,
      config: {
        scopes: oauthConfig.scopes,
        token_expires_at: expiresAt,
        has_refresh_token: !!tokenData.refresh_token,
      },
      sync_frequency: "daily",
      last_sync_at: null,
      last_sync_items: 0,
    };

    const { data: insertedConn, error: insertError } = await admin
      .from("integration_connections")
      .insert(connectionRow)
      .select("id")
      .maybeSingle();

    let connectionId: string | null = null;

    if (insertError) {
      // Unique index conflict — row already exists, update it
      if (
        insertError.code === "23505" ||
        insertError.message?.includes("duplicate") ||
        insertError.message?.includes("unique")
      ) {
        const { data: updatedConn, error: updateError } = await admin
          .from("integration_connections")
          .update({
            status: "active",
            config: connectionRow.config,
            sync_frequency: "daily",
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user.id)
          .eq("connector_type", connectorId)
          .select("id")
          .maybeSingle();

        if (updateError) {
          console.error(
            `[OAuth:${connectorId}] Failed to update integration_connections:`,
            updateError.message
          );
        } else {
          connectionId = updatedConn?.id ?? null;
          console.log(
            `[OAuth:${connectorId}] Updated existing connection (id=${connectionId})`
          );
        }
      } else {
        console.error(
          `[OAuth:${connectorId}] Failed to insert integration_connections:`,
          insertError.message
        );
      }
    } else {
      connectionId = insertedConn?.id ?? null;
      console.log(
        `[OAuth:${connectorId}] Created new connection (id=${connectionId})`
      );
    }

    // ─── Log credential access in audit trail ───
    // The audit log is for GDPR compliance — tracks who stored what and when.
    await logCredentialAudit(pgcryptoVaultId, user.id, "create", connectorId, {
      connection_id: connectionId,
      has_refresh_token: !!tokenData.refresh_token,
      token_expires_at: expiresAt,
      scopes: oauthConfig.scopes,
    });

    // ─── Redirect to success ───
    console.log(
      `[OAuth:${connectorId}] Callback complete for user=${user.id}. ` +
        `Connection: ${connectionId ?? "failed"}, ` +
        `Vault: pgcrypto=${pgcryptoVaultId ? "ok" : "skip"}`
    );

    return redirectWithCleanup(baseRedirect, req.url, connectorId, {
      setup: "complete",
    });
  } catch (err) {
    console.error(
      `[OAuth:${connectorId}] Unexpected error during callback:`,
      err instanceof Error ? err.stack ?? err.message : String(err)
    );
    return redirectWithCleanup(baseRedirect, req.url, connectorId, {
      oauth_error: "unexpected",
    });
  }
}
