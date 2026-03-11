/**
 * API Route: /api/integrations/[connectorId]/callback
 *
 * OAuth2 callback handler for integration connectors.
 *
 * Flow:
 * 1. OAuth provider redirects here with ?code=AUTHORIZATION_CODE&state=STATE
 * 2. Validate state param against cookie (CSRF protection)
 * 3. Exchange the code for access + refresh tokens
 * 4. Authenticate user via Supabase session
 * 5. Store credentials via CredentialVault (encrypted, pgcrypto)
 * 6. Create integration_connections row
 * 7. Redirect back to /integrazione/[connectorId] with success/error status
 *
 * Security:
 * - State parameter validated against cookie (prevents CSRF)
 * - Credentials stored encrypted in vault (pgcrypto pgp_sym_encrypt)
 * - Rate limited to prevent abuse
 * - No secrets exposed in redirect URL
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { getVaultOrNull } from "@/lib/credential-vault";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ─── OAuth provider configs ───

interface OAuthProviderConfig {
  tokenUrl: string;
  clientIdEnvVar: string;
  clientSecretEnvVar: string;
  scopes: string[];
}

const OAUTH_CONFIGS: Record<string, OAuthProviderConfig> = {
  hubspot: {
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    clientIdEnvVar: "HUBSPOT_CLIENT_ID",
    clientSecretEnvVar: "HUBSPOT_CLIENT_SECRET",
    scopes: ["crm.objects.contacts.read", "crm.objects.deals.read"],
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
};

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
  if (error) {
    console.error(
      `[OAuth:${connectorId}] Provider error:`,
      error,
      errorDescription
    );
    const redirectUrl = new URL(baseRedirect, req.url);
    redirectUrl.searchParams.set("oauth_error", error);
    if (errorDescription) {
      redirectUrl.searchParams.set("oauth_error_desc", errorDescription);
    }
    return NextResponse.redirect(redirectUrl);
  }

  // ─── Validate required params ───
  if (!code) {
    console.error(`[OAuth:${connectorId}] Missing authorization code`);
    const redirectUrl = new URL(baseRedirect, req.url);
    redirectUrl.searchParams.set("oauth_error", "missing_code");
    return NextResponse.redirect(redirectUrl);
  }

  // ─── Validate state (CSRF protection) ───
  const cookieName = `oauth_state_${connectorId}`;
  const storedState = req.cookies.get(cookieName)?.value;

  if (!state || !storedState || state !== storedState) {
    console.error(
      `[OAuth:${connectorId}] State mismatch — expected="${storedState}", got="${state}"`
    );
    const redirectUrl = new URL(baseRedirect, req.url);
    redirectUrl.searchParams.set("oauth_error", "invalid_state");
    // Clear the cookie
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set(cookieName, "", { maxAge: 0, path: "/" });
    return response;
  }

  // ─── Validate connector exists ───
  const oauthConfig = OAUTH_CONFIGS[connectorId];
  if (!oauthConfig) {
    console.error(`[OAuth:${connectorId}] Unknown connector for OAuth callback`);
    const redirectUrl = new URL(baseRedirect, req.url);
    redirectUrl.searchParams.set("oauth_error", "unknown_connector");
    return NextResponse.redirect(redirectUrl);
  }

  // ─── Exchange authorization code for tokens ───
  try {
    const clientId = process.env[oauthConfig.clientIdEnvVar];
    const clientSecret = process.env[oauthConfig.clientSecretEnvVar];

    if (!clientId || !clientSecret) {
      console.error(
        `[OAuth:${connectorId}] Missing env vars: ${oauthConfig.clientIdEnvVar}, ${oauthConfig.clientSecretEnvVar}`
      );
      const redirectUrl = new URL(baseRedirect, req.url);
      redirectUrl.searchParams.set("oauth_error", "server_config");
      return NextResponse.redirect(redirectUrl);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const redirectUri = `${appUrl}/api/integrations/${connectorId}/callback`;

    // Token exchange request
    const tokenResponse = await fetch(oauthConfig.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      console.error(
        `[OAuth:${connectorId}] Token exchange failed:`,
        tokenResponse.status,
        errorBody
      );
      const redirectUrl = new URL(baseRedirect, req.url);
      redirectUrl.searchParams.set("oauth_error", "token_exchange_failed");
      return NextResponse.redirect(redirectUrl);
    }

    const tokenData = await tokenResponse.json();

    console.log(
      `[OAuth:${connectorId}] Token exchange successful. Access token length: ${tokenData.access_token?.length ?? 0}`
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
      const redirectUrl = new URL(baseRedirect, req.url);
      redirectUrl.searchParams.set("oauth_error", "not_authenticated");
      const response = NextResponse.redirect(redirectUrl);
      response.cookies.set(cookieName, "", { maxAge: 0, path: "/" });
      return response;
    }

    // ─── Store credentials via CredentialVault ───
    const vault = getVaultOrNull();

    if (vault) {
      await vault.storeCredential(user.id, connectorId, "oauth2_token", {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || "",
        token_type: tokenData.token_type || "Bearer",
        expires_in: String(tokenData.expires_in || 3600),
      });
      console.log(
        `[OAuth:${connectorId}] Credentials stored in vault for user=${user.id}`
      );
    } else {
      console.warn(
        `[OAuth:${connectorId}] Vault not available (VAULT_ENCRYPTION_KEY not configured). ` +
          "Credentials NOT persisted."
      );
    }

    // ─── Create integration_connections row ───
    const admin = createAdminClient();

    const connectionRow = {
      user_id: user.id,
      connector_type: connectorId,
      status: "active" as const,
      config: { scopes: oauthConfig.scopes },
      sync_frequency: "daily",
      last_sync_at: null,
      last_sync_items: 0,
    };

    const { error: insertError } = await admin
      .from("integration_connections")
      .insert(connectionRow);

    if (insertError) {
      // Unique index conflict — row already exists, update it
      if (
        insertError.code === "23505" ||
        insertError.message?.includes("duplicate") ||
        insertError.message?.includes("unique")
      ) {
        const { error: updateError } = await admin
          .from("integration_connections")
          .update({
            status: "active",
            config: { scopes: oauthConfig.scopes },
            sync_frequency: "daily",
          })
          .eq("user_id", user.id)
          .eq("connector_type", connectorId);

        if (updateError) {
          console.error(
            `[OAuth:${connectorId}] Failed to update integration_connections:`,
            updateError.message
          );
        } else {
          console.log(
            `[OAuth:${connectorId}] Updated existing integration_connections row for user=${user.id}`
          );
        }
      } else {
        console.error(
          `[OAuth:${connectorId}] Failed to insert integration_connections:`,
          insertError.message
        );
      }
    } else {
      console.log(
        `[OAuth:${connectorId}] Created integration_connections row for user=${user.id}`
      );
    }

    // ─── Redirect to success ───
    const redirectUrl = new URL(baseRedirect, req.url);
    redirectUrl.searchParams.set("setup", "complete");
    const response = NextResponse.redirect(redirectUrl);
    // Clear the state cookie
    response.cookies.set(cookieName, "", { maxAge: 0, path: "/" });
    return response;
  } catch (err) {
    console.error(
      `[OAuth:${connectorId}] Unexpected error:`,
      err instanceof Error ? err.message : String(err)
    );
    const redirectUrl = new URL(baseRedirect, req.url);
    redirectUrl.searchParams.set("oauth_error", "unexpected");
    const response = NextResponse.redirect(redirectUrl);
    // Clear state cookie on error too
    response.cookies.set(`oauth_state_${connectorId}`, "", {
      maxAge: 0,
      path: "/",
    });
    return response;
  }
}
