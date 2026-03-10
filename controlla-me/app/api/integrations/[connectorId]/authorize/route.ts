import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { randomBytes } from "crypto";

interface OAuthAuthorizeConfig {
  authorizeUrl: string;
  clientIdEnvVar: string;
  scopes: string[];
  extraParams?: Record<string, string>;
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
      "crm.objects.contacts.read",
      "crm.objects.companies.read",
      "crm.objects.deals.read",
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

  // Auth
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const { connectorId } = await params;

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

  // Build authorize URL
  const authorizeUrl = new URL(config.authorizeUrl);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", config.scopes.join(" "));
  authorizeUrl.searchParams.set("state", state);

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

  return response;
}
