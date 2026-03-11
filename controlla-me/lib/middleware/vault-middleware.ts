/**
 * Vault Middleware — Helper for using the credential vault in API routes.
 *
 * Provides:
 * 1. requireVault() — returns vault instance or 503 if VAULT_ENCRYPTION_KEY is missing
 * 2. withVaultAuth() — combines requireAuth + requireVault for routes that need both
 *
 * Usage in API route:
 *
 *   import { withVaultAuth } from "@/lib/middleware/vault-middleware";
 *
 *   export async function POST(req: NextRequest) {
 *     const ctx = await withVaultAuth(req);
 *     if (ctx instanceof NextResponse) return ctx;
 *     const { user, vault } = ctx;
 *     // ... use vault.storeCredential(user.id, ...)
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/middleware/auth";
import type { AuthenticatedUser } from "@/lib/middleware/auth";
import { getVault, type SupabaseCredentialVault } from "@/lib/credential-vault";

// ─── Types ───

export interface VaultContext {
  vault: SupabaseCredentialVault;
}

export interface VaultAuthContext {
  user: AuthenticatedUser;
  vault: SupabaseCredentialVault;
}

// ─── Public API ───

/**
 * Returns the vault instance, or a 503 response if VAULT_ENCRYPTION_KEY is not configured.
 * Fail-closed: if the encryption key is missing, the endpoint is unavailable.
 */
export function requireVault(): VaultContext | NextResponse {
  try {
    const vault = getVault();
    return { vault };
  } catch (err) {
    console.error(
      "[VAULT-MIDDLEWARE] Vault non disponibile:",
      err instanceof Error ? err.message : String(err)
    );
    return NextResponse.json(
      { error: "Servizio credential vault non disponibile. Contattare l'amministratore." },
      { status: 503 }
    );
  }
}

/**
 * Combines requireAuth() + requireVault().
 * Returns the authenticated user and vault instance,
 * or an error NextResponse (401 / 503).
 *
 * Usage:
 *   const ctx = await withVaultAuth(req);
 *   if (ctx instanceof NextResponse) return ctx;
 *   const { user, vault } = ctx;
 */
export async function withVaultAuth(
  _req: NextRequest
): Promise<VaultAuthContext | NextResponse> {
  // 1. Check authentication
  const authResult = await requireAuth();
  if (isAuthError(authResult)) {
    return authResult;
  }

  // 2. Check vault availability
  const vaultResult = requireVault();
  if (vaultResult instanceof NextResponse) {
    return vaultResult;
  }

  return {
    user: authResult.user,
    vault: vaultResult.vault,
  };
}

/**
 * Type guard: checks if the result is a NextResponse (error).
 */
export function isVaultError(
  result: VaultAuthContext | NextResponse
): result is NextResponse {
  return result instanceof NextResponse;
}
