/**
 * Credential Vault — Supabase implementation (ADR-3).
 *
 * Wraps the pgcrypto-based RPC functions defined in migration 030:
 *   - vault_store:    encrypts + upserts credentials
 *   - vault_retrieve: decrypts + returns credentials (updates last_used_at)
 *   - vault_refresh:  re-encrypts after OAuth2 token refresh
 *
 * Encryption happens entirely server-side inside PostgreSQL (pgp_sym_encrypt /
 * pgp_sym_decrypt). This client passes plaintext data to the RPCs — the
 * encryption key (VAULT_ENCRYPTION_KEY) is sent as a parameter but never
 * stored in the DB. The RPCs are SECURITY DEFINER, so the key is used only
 * within the function execution context.
 *
 * IMPORTANT:
 * - VAULT_ENCRYPTION_KEY is REQUIRED. The vault fails closed if missing.
 * - Never log or expose decrypted credential data.
 * - All operations use the admin (service_role) Supabase client so that
 *   RLS is bypassed — the RPCs handle user isolation internally.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  CredentialVault,
  CredentialType,
  VaultEntry,
} from "@/lib/staff/data-connector/auth/types";

// ─── Encryption Key ───

/**
 * Returns the VAULT_ENCRYPTION_KEY from env vars.
 * Fails closed: throws if missing or too short (min 32 chars).
 *
 * The key is passed to pgcrypto pgp_sym_encrypt/pgp_sym_decrypt
 * inside the vault_store / vault_retrieve / vault_refresh RPCs.
 */
function getEncryptionKey(): string {
  const key = process.env.VAULT_ENCRYPTION_KEY;

  if (!key || key.length < 32) {
    throw new Error(
      "[CREDENTIAL VAULT] VAULT_ENCRYPTION_KEY non configurato o troppo corto. " +
        "Deve essere almeno 32 caratteri. " +
        'Genera con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  return key;
}

// ─── Implementation ───

export class SupabaseCredentialVault implements CredentialVault {
  /**
   * Retrieve decrypted credentials from the vault.
   *
   * Calls the vault_retrieve RPC which:
   * 1. Finds the most recent non-revoked credential for (user_id, connector_source)
   * 2. Decrypts encrypted_data using pgp_sym_decrypt
   * 3. Updates last_used_at for audit
   * 4. Returns the decrypted JSON string
   *
   * @returns Parsed credential data, or null if not found / revoked.
   */
  async getCredential(
    userId: string,
    connectorSource: string
  ): Promise<Record<string, string> | null> {
    const encryptionKey = getEncryptionKey();
    const admin = createAdminClient();

    const { data, error } = await admin.rpc("vault_retrieve", {
      p_user_id: userId,
      p_connector_source: connectorSource,
      p_encryption_key: encryptionKey,
    });

    if (error) {
      // pgcrypto decrypt failure (wrong key, corrupted data) — log but don't expose
      console.error(
        `[CREDENTIAL VAULT] vault_retrieve error for source="${connectorSource}":`,
        error.message
      );
      return null;
    }

    if (!data) {
      return null;
    }

    // data is a JSON string returned by pgp_sym_decrypt
    try {
      return JSON.parse(data) as Record<string, string>;
    } catch {
      console.error(
        `[CREDENTIAL VAULT] Failed to parse decrypted data for source="${connectorSource}". ` +
          "Data may be corrupted."
      );
      return null;
    }
  }

  /**
   * Store (or update) credentials in the vault.
   *
   * Calls the vault_store RPC which:
   * 1. Serializes data as JSON
   * 2. Encrypts with pgp_sym_encrypt(data, key)
   * 3. Upserts on (user_id, connector_source, credential_type)
   * 4. Reactivates if previously revoked (sets revoked_at = NULL)
   *
   * @returns UUID of the inserted/updated row.
   */
  async storeCredential(
    userId: string,
    connectorSource: string,
    credentialType: CredentialType,
    data: Record<string, string>,
    options?: {
      metadata?: Record<string, unknown>;
      expiresAt?: string;
    }
  ): Promise<string> {
    const encryptionKey = getEncryptionKey();
    const admin = createAdminClient();

    const { data: vaultId, error } = await admin.rpc("vault_store", {
      p_user_id: userId,
      p_connector_source: connectorSource,
      p_credential_type: credentialType,
      p_data: JSON.stringify(data),
      p_encryption_key: encryptionKey,
      p_metadata: options?.metadata ?? {},
      p_expires_at: options?.expiresAt ?? null,
    });

    if (error) {
      throw new Error(
        `[CREDENTIAL VAULT] vault_store failed for source="${connectorSource}": ${error.message}`
      );
    }

    if (!vaultId) {
      throw new Error(
        `[CREDENTIAL VAULT] vault_store returned null for source="${connectorSource}"`
      );
    }

    return vaultId as string;
  }

  /**
   * Refresh credentials after an OAuth2 token refresh.
   *
   * Calls the vault_refresh RPC which:
   * 1. Re-encrypts the new data with pgp_sym_encrypt
   * 2. Updates expires_at and last_refreshed_at
   * 3. Returns true if a row was updated
   *
   * @returns true if updated, false if no matching active credential found.
   */
  async refreshCredential(
    userId: string,
    connectorSource: string,
    newData: Record<string, string>,
    newExpiresAt?: string
  ): Promise<boolean> {
    const encryptionKey = getEncryptionKey();
    const admin = createAdminClient();

    const { data: updated, error } = await admin.rpc("vault_refresh", {
      p_user_id: userId,
      p_connector_source: connectorSource,
      p_new_data: JSON.stringify(newData),
      p_encryption_key: encryptionKey,
      p_new_expires_at: newExpiresAt ?? null,
    });

    if (error) {
      console.error(
        `[CREDENTIAL VAULT] vault_refresh error for source="${connectorSource}":`,
        error.message
      );
      return false;
    }

    return updated === true;
  }

  /**
   * Soft-delete (revoke) a credential.
   *
   * Sets revoked_at = now(). The credential remains in the DB for 30 days
   * (GDPR TTL) then gets hard-deleted by cleanup_integration_data().
   *
   * Uses direct table update via admin client (no dedicated RPC for revoke).
   */
  async revokeCredential(
    userId: string,
    connectorSource: string,
    credentialType: CredentialType
  ): Promise<boolean> {
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("credential_vault")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("connector_source", connectorSource)
      .eq("credential_type", credentialType)
      .is("revoked_at", null)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error(
        `[CREDENTIAL VAULT] revoke error for source="${connectorSource}":`,
        error.message
      );
      return false;
    }

    return data !== null;
  }

  /**
   * List all active (non-revoked) credentials for a user.
   * Returns metadata only — no decrypted secrets.
   */
  async listForUser(userId: string): Promise<VaultEntry[]> {
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("credential_vault")
      .select(
        "id, connector_source, credential_type, metadata, expires_at, last_used_at, last_refreshed_at, created_at, updated_at"
      )
      .eq("user_id", userId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(
        "[CREDENTIAL VAULT] listForUser error:",
        error.message
      );
      return [];
    }

    return (data ?? []).map((row) => ({
      id: row.id as string,
      connectorSource: row.connector_source as string,
      credentialType: row.credential_type as CredentialType,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      expiresAt: (row.expires_at as string) ?? null,
      lastUsedAt: (row.last_used_at as string) ?? null,
      lastRefreshedAt: (row.last_refreshed_at as string) ?? null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }));
  }
}

// ─── Health Check ───

/**
 * Verifies that the vault_store RPC function exists in Supabase.
 * This detects whether migration 030 has been applied.
 *
 * Caches the result: only checks once per process lifetime.
 * On failure, logs the exact migration that needs to be run.
 */
let _healthChecked = false;
let _healthOk = false;

async function checkVaultHealth(): Promise<{ ok: boolean; error?: string }> {
  if (_healthChecked) {
    return _healthOk
      ? { ok: true }
      : { ok: false, error: "Migration 030 non applicata (cached)" };
  }

  try {
    const admin = createAdminClient();

    // Probe the vault_store function with a dummy call that will fail on FK
    // but succeed in finding the function. We use a UUID that won't exist.
    const { error } = await admin.rpc("vault_store", {
      p_user_id: "00000000-0000-0000-0000-000000000000",
      p_connector_source: "__health_check__",
      p_credential_type: "api_key",
      p_data: "{}",
      p_encryption_key: "health_check_key_that_is_at_least_32_chars",
      p_metadata: {},
      p_expires_at: null,
    });

    if (error?.code === "PGRST202") {
      // Function not found — migration 030 not applied
      _healthChecked = true;
      _healthOk = false;
      const msg =
        "[CREDENTIAL VAULT] La funzione vault_store non esiste in Supabase. " +
        "Eseguire migration 030_integration_tables.sql sul Supabase SQL Editor. " +
        "Senza questa migration, il salvataggio credenziali non funziona.";
      console.error(msg);
      return { ok: false, error: msg };
    }

    // Any other error (FK violation, etc.) means the function EXISTS — that's OK
    _healthChecked = true;
    _healthOk = true;
    return { ok: true };
  } catch (err) {
    // Network or other error — don't cache, might be transient
    const msg = `[CREDENTIAL VAULT] Health check fallito: ${err instanceof Error ? err.message : String(err)}`;
    console.error(msg);
    return { ok: false, error: msg };
  }
}

// ─── Singleton ───

let _instance: SupabaseCredentialVault | null = null;

/**
 * Returns the singleton SupabaseCredentialVault instance.
 *
 * Validates that VAULT_ENCRYPTION_KEY is configured on first call.
 * Throws immediately if missing (fail-closed).
 */
export function getVault(): SupabaseCredentialVault {
  if (!_instance) {
    // Validate key exists at instantiation time — fail fast
    getEncryptionKey();
    _instance = new SupabaseCredentialVault();
  }
  return _instance;
}

/**
 * Returns a vault instance if VAULT_ENCRYPTION_KEY is configured,
 * or null if not. Useful for optional vault integration where
 * the caller can degrade gracefully.
 */
export function getVaultOrNull(): SupabaseCredentialVault | null {
  try {
    return getVault();
  } catch {
    return null;
  }
}

/**
 * Checks if the vault infrastructure (DB tables + RPC functions) is available.
 * Returns { ok: true } if vault_store RPC exists, or { ok: false, error } if not.
 *
 * Call this before operations to provide actionable error messages
 * (e.g. "run migration 030") instead of cryptic RPC errors.
 */
export { checkVaultHealth };
