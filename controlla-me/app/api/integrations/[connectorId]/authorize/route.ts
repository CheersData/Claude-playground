import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { randomBytes, createHash } from "crypto";

interface OAuthAuthorizeConfig {
  authorizeUrl: string;
  clientIdEnvVar: string;
  scopes: string[];
  extraParams?: Record<string, string>;
}

// ─── PKCE (RFC 7636) ───
// PKCE prevents authorization code interception attacks.
// The code_verifier is a high-entropy random string stored in an httpOnly cookie.
// The code_challenge (SHA-256 hash of verifier, base64url-encoded) is sent to the
// authorization server. At token exchange, the server verifies the original verifier
// matches the challenge, proving the party exchanging the code is the same one that
// initiated the flow.

/**
 * Generate a PKCE code_verifier (32 random bytes, base64url-encoded).
 * RFC 7636 requires 43-128 characters — 32 bytes base64url = 43 chars.
 */
function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Compute code_challenge = BASE64URL(SHA256(code_verifier)) using S256 method.
 */
function generateCodeChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

const OAUTH_AUTHORIZE_CONFIGS: Record<string, OAuthAuthorizeConfig> = {
  "google-drive": {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    clientIdEnvVar: "GOOGLE_CLIENT_ID",
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    extraParams: { access_type: "offline", prompt: "consent" },
  },
  hubspot: {
    authorizeUrl: "https://app.hubspot.com/oauth/authorize",
    clientIdEnvVar: "HUBSPOT_CLIENT_ID",
    scopes: [
      "oauth",
      "crm.objects.contacts.read",
      "crm.objects.companies.read",
      "crm.objects.deals.read",
      "crm.objects.tickets.read",
    ],
  },
  salesforce: {
    authorizeUrl: "https://login.salesforce.com/services/oauth2/authorize",
    clientIdEnvVar: "SALESFORCE_CLIENT_ID",
    scopes: ["api", "refresh_token"],
    // prompt=consent ensures we always get a refresh_token
    extraParams: { prompt: "consent" },
  },
  "fatture-in-cloud": {
    authorizeUrl: "https://api-v2.fattureincloud.it/oauth/authorize",
    clientIdEnvVar: "FATTURE_CLIENT_ID",
    scopes: [
      "entity.clients:r",
      "entity.suppliers:r",
      "issued_documents:r",
      "received_documents:r",
    ],
  },
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ connectorId: string }> }
) {
  // Rate limit
  const rateLimited = await checkRateLimit(req);
  if (rateLimited) return rateLimited;

  // Resolve params before auth so we can redirect back on failure
  const { connectorId } = await params;

  // Auth — redirect to integration page on failure (this is a browser GET, not an API call)
  const authResult = await requireAuth();
  if (isAuthError(authResult)) {
    const returnUrl = new URL(`/integrazione/${connectorId}?oauth_error=not_authenticated`, req.url);
    return NextResponse.redirect(returnUrl);
  }

  const config = OAUTH_AUTHORIZE_CONFIGS[connectorId];
  if (!config) {
    return NextResponse.json(
      { error: `Connettore '${connectorId}' non supporta OAuth` },
      { status: 400 }
    );
  }

  const clientId = process.env[config.clientIdEnvVar];
  if (!clientId) {
    return NextResponse.json(
      { error: `OAuth non configurato: ${config.clientIdEnvVar} mancante` },
      { status: 500 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirectUri = `${appUrl}/api/integrations/${connectorId}/callback`;

  // Generate CSRF state
  const state = randomBytes(32).toString("hex");

  // Generate PKCE code_verifier and code_challenge (RFC 7636)
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  // Build authorize URL
  const authorizeUrl = new URL(config.authorizeUrl);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", config.scopes.join(" "));
  authorizeUrl.searchParams.set("state", state);

  // PKCE: send code_challenge with S256 method to the authorization server.
  // Providers that don't support PKCE will simply ignore these parameters,
  // so backwards compatibility is preserved.
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  // Add provider-specific params
  if (config.extraParams) {
    for (const [key, value] of Object.entries(config.extraParams)) {
      authorizeUrl.searchParams.set(key, value);
    }
  }

  // Create response with redirect
  const response = NextResponse.redirect(authorizeUrl.toString());

  // Set state cookie for CSRF validation in callback
  response.cookies.set(`oauth_state_${connectorId}`, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  // PKCE: store code_verifier in httpOnly cookie for retrieval in callback.
  // Same security properties as the state cookie: httpOnly, secure, sameSite=lax, 10 min TTL.
  response.cookies.set(`pkce_verifier_${connectorId}`, codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  return response;
}
