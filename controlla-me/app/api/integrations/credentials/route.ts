/**
 * API Route: /api/integrations/credentials
 *
 * CRUD for user integration credentials via the credential vault.
 *
 * GET  — List active credentials for the authenticated user (metadata only, no secrets)
 * POST — Store a new credential (or update existing)
 * DELETE — Revoke a credential (soft delete)
 *
 * Security:
 * - requireAuth: all operations require authenticated user
 * - requireVault: VAULT_ENCRYPTION_KEY must be configured (fail-closed 503)
 * - checkRateLimit: prevent abuse
 * - checkCsrf: POST/DELETE protected against cross-site requests
 * - Audit log: all operations are logged
 * - No secrets in GET responses — only metadata
 */

import { NextRequest, NextResponse } from "next/server";
import { withVaultAuth, isVaultError } from "@/lib/middleware/vault-middleware";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkCsrf } from "@/lib/middleware/csrf";
import { auditLog, extractRequestMeta } from "@/lib/middleware/audit-log";
import type { CredentialType } from "@/lib/staff/data-connector/auth/types";

// ─── Validation ───

const VALID_CREDENTIAL_TYPES: CredentialType[] = [
  "api_key",
  "oauth2_token",
  "basic_auth",
];

function isValidCredentialType(type: string): type is CredentialType {
  return VALID_CREDENTIAL_TYPES.includes(type as CredentialType);
}

/**
 * Validates that connector_source is a safe string (alphanumeric + hyphens + underscores).
 * Prevents injection in Supabase queries.
 */
function isValidConnectorSource(source: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(source);
}

// ─── GET: List credentials (metadata only) ───

export async function GET(req: NextRequest) {
  // Rate limit
  const rateLimited = await checkRateLimit(req);
  if (rateLimited) return rateLimited;

  // Auth + vault
  const ctx = await withVaultAuth(req);
  if (isVaultError(ctx)) return ctx;

  const { user, vault } = ctx;

  try {
    const credentials = await vault.listForUser(user.id);

    return NextResponse.json({
      credentials,
      count: credentials.length,
    });
  } catch (err) {
    console.error(
      "[API:integrations/credentials] GET error:",
      err instanceof Error ? err.message : String(err)
    );
    return NextResponse.json(
      { error: "Errore nel recupero delle credenziali" },
      { status: 500 }
    );
  }
}

// ─── POST: Store credential ───

export async function POST(req: NextRequest) {
  // CSRF
  const csrfBlocked = checkCsrf(req);
  if (csrfBlocked) return csrfBlocked;

  // Rate limit
  const rateLimited = await checkRateLimit(req);
  if (rateLimited) return rateLimited;

  // Auth + vault
  const ctx = await withVaultAuth(req);
  if (isVaultError(ctx)) return ctx;

  const { user, vault } = ctx;

  // Parse body
  let body: {
    connectorSource?: string;
    credentialType?: string;
    data?: Record<string, string>;
    metadata?: Record<string, unknown>;
    expiresAt?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body JSON non valido" },
      { status: 400 }
    );
  }

  // Validate required fields
  const { connectorSource, credentialType, data, metadata, expiresAt } = body;

  if (!connectorSource || !credentialType || !data) {
    return NextResponse.json(
      {
        error: "Campi obbligatori mancanti: connectorSource, credentialType, data",
      },
      { status: 400 }
    );
  }

  if (!isValidConnectorSource(connectorSource)) {
    return NextResponse.json(
      {
        error:
          "connectorSource non valido. Usa solo caratteri alfanumerici, trattini e underscore (max 64 caratteri).",
      },
      { status: 400 }
    );
  }

  if (!isValidCredentialType(credentialType)) {
    return NextResponse.json(
      {
        error: `credentialType non valido. Valori ammessi: ${VALID_CREDENTIAL_TYPES.join(", ")}`,
      },
      { status: 400 }
    );
  }

  if (typeof data !== "object" || Array.isArray(data)) {
    return NextResponse.json(
      { error: "data deve essere un oggetto JSON con valori stringa" },
      { status: 400 }
    );
  }

  // Validate expiresAt if provided
  if (expiresAt) {
    const parsed = new Date(expiresAt);
    if (isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: "expiresAt non e una data valida (formato ISO 8601)" },
        { status: 400 }
      );
    }
  }

  try {
    const vaultId = await vault.storeCredential(
      user.id,
      connectorSource,
      credentialType,
      data,
      {
        metadata: metadata ?? {},
        expiresAt: expiresAt ?? undefined,
      }
    );

    // Audit log (fire-and-forget) — never log the actual credential data
    const reqMeta = extractRequestMeta(req);
    auditLog({
      eventType: "auth.login", // closest audit event type for credential creation
      userId: user.id,
      payload: {
        action: "credential.stored",
        connectorSource,
        credentialType,
        vaultId,
      },
      result: "success",
      ...reqMeta,
    }).catch(() => {});

    return NextResponse.json(
      {
        id: vaultId,
        connectorSource,
        credentialType,
        message: "Credenziale salvata con successo",
      },
      { status: 201 }
    );
  } catch (err) {
    console.error(
      "[API:integrations/credentials] POST error:",
      err instanceof Error ? err.message : String(err)
    );
    return NextResponse.json(
      { error: "Errore nel salvataggio della credenziale" },
      { status: 500 }
    );
  }
}

// ─── DELETE: Revoke credential ───

export async function DELETE(req: NextRequest) {
  // CSRF
  const csrfBlocked = checkCsrf(req);
  if (csrfBlocked) return csrfBlocked;

  // Rate limit
  const rateLimited = await checkRateLimit(req);
  if (rateLimited) return rateLimited;

  // Auth + vault
  const ctx = await withVaultAuth(req);
  if (isVaultError(ctx)) return ctx;

  const { user, vault } = ctx;

  // Parse query params
  const { searchParams } = new URL(req.url);
  const connectorSource = searchParams.get("connectorSource");
  const credentialType = searchParams.get("credentialType");

  if (!connectorSource || !credentialType) {
    return NextResponse.json(
      {
        error:
          "Parametri obbligatori mancanti: connectorSource, credentialType (query params)",
      },
      { status: 400 }
    );
  }

  if (!isValidConnectorSource(connectorSource)) {
    return NextResponse.json(
      { error: "connectorSource non valido" },
      { status: 400 }
    );
  }

  if (!isValidCredentialType(credentialType)) {
    return NextResponse.json(
      {
        error: `credentialType non valido. Valori ammessi: ${VALID_CREDENTIAL_TYPES.join(", ")}`,
      },
      { status: 400 }
    );
  }

  try {
    const revoked = await vault.revokeCredential(
      user.id,
      connectorSource,
      credentialType
    );

    if (!revoked) {
      return NextResponse.json(
        { error: "Credenziale non trovata o gia revocata" },
        { status: 404 }
      );
    }

    // Audit log (fire-and-forget)
    const reqMeta = extractRequestMeta(req);
    auditLog({
      eventType: "auth.logout", // closest audit event type for credential revocation
      userId: user.id,
      payload: {
        action: "credential.revoked",
        connectorSource,
        credentialType,
      },
      result: "success",
      ...reqMeta,
    }).catch(() => {});

    return NextResponse.json({
      connectorSource,
      credentialType,
      message: "Credenziale revocata con successo",
    });
  } catch (err) {
    console.error(
      "[API:integrations/credentials] DELETE error:",
      err instanceof Error ? err.message : String(err)
    );
    return NextResponse.json(
      { error: "Errore nella revoca della credenziale" },
      { status: 500 }
    );
  }
}
