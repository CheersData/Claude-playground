/**
 * Vault Middleware — Helper for using the credential vault in API routes.
 *
 * Provides:
 * 1. requireVault() — returns vault instance or 503 if VAULT_ENCRYPTION_KEY is missing or migration 030 not applied
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
import { getVault, checkVaultHealth, type SupabaseCredentialVault } from "@/lib/credential-vault";

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
 * Returns the vault instance, or a 503 response if VAULT_ENCRYPTION_KEY is not configured
 * or if the vault_store RPC function doesn't exist (migration 030 not applied).
 * Fail-closed: if the vault is unavailable, the endpoint returns 503.
 */
export async function requireVault(): Promise<VaultContext | NextResponse> {
  try {
    const vault = getVault();

    // Verify that the DB infrastructure exists (cached after first check)
    const health = await checkVaultHealth();
    if (!health.ok) {
      console.error(
        "[VAULT-MIDDLEWARE] Vault DB non disponibile:",
        health.error
      );
      return NextResponse.json(
        {
          error:
            "Infrastruttura credential vault non configurata. " +
            "Eseguire migration 030_integration_tables.sql su Supabase.",
        },
        { status: 503 }
      );
    }

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

  // 2. Check vault availability (including DB health)
  const vaultResult = await requireVault();
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
