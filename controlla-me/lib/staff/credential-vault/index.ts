/**
 * Credential Vault — AES-256-GCM encrypted credential storage.
 *
 * Application-layer encryption using Node.js `crypto` module.
 * The master key (VAULT_MASTER_KEY env var) NEVER leaves the application process.
 * The database stores only ciphertext, IV, and auth tag — a DB dump reveals nothing.
 *
 * Features:
 * - AES-256-GCM encryption at rest (NIST SP 800-38D compliant)
 * - Per-user isolation via Supabase RLS
 * - Automatic OAuth2 token refresh with 5-minute margin
 * - Soft-delete revocation with audit trail
 * - Every access/refresh/revoke creates an audit log entry
 * - Fail-closed: missing VAULT_MASTER_KEY disables the vault entirely
 *
 * Architecture:
 * ```
 * App (encrypt/decrypt with VAULT_MASTER_KEY)
 *   |
 *   v
 * Supabase integration_credentials (ciphertext + IV + authTag)
 * Supabase integration_credential_audit (action log)
 * ```
 *
 * @see ADR-3: Credential Vault (company/architecture/adr/adr-credential-vault.md)
 * @see Standalone ADR (company/architecture/adr/ADR-integration-framework.md)
 * @see Security Design (company/security/designs/integration-security-design.md)
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { encryptAES256GCM, decryptAES256GCM, MASTER_KEY_LENGTH } from "./crypto";
import { refreshOAuth2Token, tokenNeedsRefresh } from "./oauth2-refresh";
import type {
  AuthCredentialData,
  AuditAction,
  EncryptedPayload,
} from "./types";

// ---- CredentialVault Class ----

export class CredentialVault {
  private masterKey: Buffer;

  /**
   * Create a new CredentialVault instance.
   *
   * @throws {Error} If VAULT_MASTER_KEY is not set or is not 256 bits (32 bytes)
   */
  constructor() {
    const key = process.env.VAULT_MASTER_KEY;
    if (!key) {
      throw new Error(
        "[CREDENTIAL-VAULT] VAULT_MASTER_KEY not configured. " +
          "Generate with: openssl rand -base64 32"
      );
    }

    this.masterKey = Buffer.from(key, "base64");

    if (this.masterKey.length !== MASTER_KEY_LENGTH) {
      throw new Error(
        `[CREDENTIAL-VAULT] VAULT_MASTER_KEY must be 256 bits (${MASTER_KEY_LENGTH} bytes), ` +
          `received ${this.masterKey.length} bytes. ` +
          "Generate with: openssl rand -base64 32"
      );
    }
  }

  // ---- Encrypt / Decrypt ----

  /**
   * Encrypt sensitive data using AES-256-GCM.
   *
   * @param plaintext - String to encrypt (typically JSON-serialized credential data)
   * @returns Encrypted payload with ciphertext, IV, and auth tag (all base64)
   */
  encrypt(plaintext: string): EncryptedPayload {
    return encryptAES256GCM(plaintext, this.masterKey);
  }

  /**
   * Decrypt data using AES-256-GCM.
   *
   * @param encrypted - Base64-encoded ciphertext
   * @param iv - Base64-encoded initialization vector
   * @param authTag - Base64-encoded authentication tag
   * @returns Decrypted plaintext string
   *
   * @throws {Error} If authentication tag verification fails (tampered or corrupted data)
   */
  decrypt(encrypted: string, iv: string, authTag: string): string {
    return decryptAES256GCM(encrypted, iv, authTag, this.masterKey);
  }

  // ---- Store ----

  /**
   * Store credentials for a user+provider in the vault.
   *
   * Encrypts the credential data with AES-256-GCM and stores the ciphertext,
   * IV, and auth tag in the `integration_credentials` table. Uses upsert
   * on (user_id, integration_id) so that updating credentials is idempotent.
   *
   * @param userId - UUID of the user who owns these credentials
   * @param provider - Integration/provider identifier (e.g., "salesforce", "hubspot")
   * @param authType - Authentication type: "oauth2", "apikey", or "basic"
   * @param data - The credential data to encrypt and store
   * @returns UUID of the inserted/updated credential row
   *
   * @throws {Error} If the database operation fails
   */
  async storeCredential(
    userId: string,
    provider: string,
    authType: string,
    data: AuthCredentialData
  ): Promise<string> {
    const admin = createAdminClient();
    const { encrypted, iv, authTag } = this.encrypt(JSON.stringify(data));

    // Build metadata from non-sensitive fields (queryable without decryption)
    const metadata: Record<string, unknown> = {};
    if (data.scopes) metadata.scopes = data.scopes;
    if (data.expiresAt) metadata.expires_at = data.expiresAt;

    const { data: row, error } = await admin
      .from("integration_credentials")
      .upsert(
        {
          user_id: userId,
          integration_id: provider,
          credential_type: authType,
          encrypted_data: encrypted,
          iv,
          auth_tag: authTag,
          metadata,
          updated_at: new Date().toISOString(),
          revoked_at: null, // Reactivate if previously revoked
        },
        { onConflict: "user_id,integration_id" }
      )
      .select("id")
      .single();

    if (error) {
      throw new Error(
        `[CREDENTIAL-VAULT] storeCredential failed for provider="${provider}": ${error.message}`
      );
    }

    // Audit log
    await this.logAudit(row.id, userId, "create", { provider, authType });

    return row.id as string;
  }

  // ---- Retrieve ----

  /**
   * Retrieve and decrypt credentials for a user+provider.
   *
   * Returns null if no active (non-revoked) credential exists.
   * Creates an "access" audit log entry on every successful retrieval.
   *
   * @param userId - UUID of the user
   * @param provider - Integration/provider identifier
   * @returns Decrypted credential data, or null if not found/revoked
   */
  async getCredential(
    userId: string,
    provider: string
  ): Promise<AuthCredentialData | null> {
    const admin = createAdminClient();

    const { data: row, error } = await admin
      .from("integration_credentials")
      .select("id, encrypted_data, iv, auth_tag")
      .eq("user_id", userId)
      .eq("integration_id", provider)
      .is("revoked_at", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(
        `[CREDENTIAL-VAULT] getCredential error for provider="${provider}":`,
        error.message
      );
      return null;
    }

    if (!row) return null;

    try {
      const plaintext = this.decrypt(
        row.encrypted_data,
        row.iv,
        row.auth_tag
      );
      const data = JSON.parse(plaintext) as AuthCredentialData;

      // Update last_used_at for audit trail
      await admin
        .from("integration_credentials")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", row.id);

      // Audit log
      await this.logAudit(row.id, userId, "access", { provider });

      return data;
    } catch (err) {
      console.error(
        `[CREDENTIAL-VAULT] Decryption failed for provider="${provider}":`,
        err instanceof Error ? err.message : String(err)
      );
      return null;
    }
  }

  // ---- Revoke ----

  /**
   * Revoke (soft-delete) credentials for a user+provider.
   *
   * Sets `revoked_at` to the current timestamp. The encrypted data is
   * overwritten with a "REVOKED" placeholder for defense-in-depth:
   * even if the row is accessed after revocation, no ciphertext remains.
   *
   * The row remains in the database for audit purposes and is cleaned up
   * by the GDPR TTL retention policy (30 days).
   *
   * @param userId - UUID of the user
   * @param provider - Integration/provider identifier
   */
  async revokeCredential(userId: string, provider: string): Promise<void> {
    const admin = createAdminClient();

    const { data: row, error } = await admin
      .from("integration_credentials")
      .update({
        revoked_at: new Date().toISOString(),
        encrypted_data: "REVOKED",
        iv: "REVOKED",
        auth_tag: "REVOKED",
      })
      .eq("user_id", userId)
      .eq("integration_id", provider)
      .is("revoked_at", null)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error(
        `[CREDENTIAL-VAULT] revokeCredential error for provider="${provider}":`,
        error.message
      );
      return;
    }

    if (row) {
      await this.logAudit(row.id, userId, "revoke", { provider });
    }
  }

  // ---- Check and Refresh OAuth2 Token ----

  /**
   * Check if an OAuth2 token needs refresh and refresh it automatically.
   *
   * This is the primary method used by connectors to get a valid access token.
   * It handles the complete flow:
   * 1. Retrieve credentials from vault
   * 2. Check token expiry (with 5-minute margin)
   * 3. If expired: refresh via provider's token endpoint
   * 4. Store updated tokens back in vault
   * 5. Return the valid credential data
   *
   * @param userId - UUID of the user
   * @param provider - Integration/provider identifier
   * @returns Updated credential data with valid access token, or null if:
   *   - No credential found
   *   - Credential is not OAuth2 (no tokenUrl/clientId/clientSecret)
   *   - Refresh failed (refresh token expired, provider error)
   */
  async checkAndRefreshToken(
    userId: string,
    provider: string
  ): Promise<AuthCredentialData | null> {
    const data = await this.getCredential(userId, provider);
    if (!data) return null;

    // If not an OAuth2 credential (API key, basic auth), return as-is
    if (!data.refreshToken) return data;

    // Check if token needs refresh (5-minute margin)
    if (!tokenNeedsRefresh(data.expiresAt)) {
      return data;
    }

    // Token needs refresh — verify we have all required fields
    if (!data.tokenUrl || !data.clientId || !data.clientSecret) {
      console.warn(
        `[CREDENTIAL-VAULT] Cannot refresh token for provider="${provider}": ` +
          "missing tokenUrl, clientId, or clientSecret in stored credentials"
      );
      // Return the potentially expired token — the caller will get a 401
      // and can handle re-authorization
      return data;
    }

    try {
      const refreshResult = await refreshOAuth2Token(
        data.tokenUrl,
        data.clientId,
        data.clientSecret,
        data.refreshToken
      );

      // Build updated credential data
      const updatedData: AuthCredentialData = {
        ...data,
        accessToken: refreshResult.accessToken,
        refreshToken: refreshResult.refreshToken ?? data.refreshToken,
        expiresAt: new Date(
          Date.now() + refreshResult.expiresIn * 1000
        ).toISOString(),
      };

      // Store refreshed credentials back in vault
      await this.storeCredential(
        userId,
        provider,
        "oauth2",
        updatedData
      );

      // Log the refresh action (storeCredential already logs "create",
      // but we also want an explicit "refresh" entry)
      const admin = createAdminClient();
      const { data: row } = await admin
        .from("integration_credentials")
        .select("id")
        .eq("user_id", userId)
        .eq("integration_id", provider)
        .is("revoked_at", null)
        .maybeSingle();

      if (row) {
        await this.logAudit(row.id, userId, "refresh", {
          provider,
          newExpiresAt: updatedData.expiresAt,
          refreshTokenRotated: !!refreshResult.refreshToken,
        });
      }

      return updatedData;
    } catch (err) {
      console.error(
        `[CREDENTIAL-VAULT] Token refresh failed for provider="${provider}":`,
        err instanceof Error ? err.message : String(err)
      );

      // Return the expired data — caller decides how to handle (re-auth prompt)
      return data;
    }
  }

  // ---- Audit Log ----

  /**
   * Write an audit log entry for a credential vault operation.
   *
   * Audit failures are logged but never block the main operation.
   * No decrypted credential data is ever written to the audit log.
   *
   * @param credentialId - UUID of the credential row
   * @param userId - UUID of the user (actor)
   * @param action - Action performed
   * @param metadata - Optional metadata (provider name, reason, etc.)
   */
  private async logAudit(
    credentialId: string,
    userId: string,
    action: AuditAction,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    try {
      const admin = createAdminClient();
      await admin.from("integration_credential_audit").insert({
        credential_id: credentialId,
        action,
        actor_id: userId,
        metadata: metadata ?? {},
      });
    } catch (err) {
      // Audit failure must NEVER block the vault operation
      console.error(
        `[CREDENTIAL-VAULT-AUDIT] Failed to log action="${action}" ` +
          `for credential="${credentialId}":`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }
}

// ---- No-Op Vault ----

const NOOP_WARN = "[CREDENTIAL-VAULT] No-op: VAULT_MASTER_KEY not configured.";

/**
 * Create a no-op vault that logs warnings instead of operating.
 * Used when VAULT_MASTER_KEY is not configured.
 *
 * All methods return safe default values (null, empty, void).
 * This allows the application to start and run without the vault,
 * with integration features gracefully degraded.
 *
 * Returns a duck-typed object with the same public API as CredentialVault.
 * Cannot extend CredentialVault because the parent constructor validates
 * the master key and throws if missing.
 */
function createNoOpVault(): CredentialVault {
  return {
    encrypt() {
      console.warn(`${NOOP_WARN} encrypt() skipped.`);
      return { encrypted: "", iv: "", authTag: "" };
    },
    decrypt() {
      console.warn(`${NOOP_WARN} decrypt() skipped.`);
      return "";
    },
    async storeCredential() {
      console.warn(`${NOOP_WARN} storeCredential() skipped. Credentials were NOT stored.`);
      return "";
    },
    async getCredential() {
      console.warn(`${NOOP_WARN} getCredential() skipped.`);
      return null;
    },
    async revokeCredential() {
      console.warn(`${NOOP_WARN} revokeCredential() skipped.`);
    },
    async checkAndRefreshToken() {
      console.warn(`${NOOP_WARN} checkAndRefreshToken() skipped.`);
      return null;
    },
  } as unknown as CredentialVault;
}

// ---- Singleton / Factory ----

let _instance: CredentialVault | null = null;

/**
 * Get the singleton CredentialVault instance.
 *
 * If VAULT_MASTER_KEY is configured: returns a fully functional vault.
 * If VAULT_MASTER_KEY is missing: returns a no-op vault that logs warnings.
 *
 * The vault is instantiated lazily on first call and cached for the
 * lifetime of the process.
 */
export function getCredentialVault(): CredentialVault {
  if (!_instance) {
    try {
      _instance = new CredentialVault();
    } catch {
      console.warn(
        "[CREDENTIAL-VAULT] VAULT_MASTER_KEY not configured or invalid. " +
          "Running in no-op mode: all vault operations will be skipped. " +
          "Configure VAULT_MASTER_KEY to enable credential storage."
      );
      _instance = createNoOpVault();
    }
  }
  return _instance;
}

// ---- Re-exports ----

export type { AuthCredentialData, CredentialAuditEntry, EncryptedPayload } from "./types";
export { encryptAES256GCM, decryptAES256GCM } from "./crypto";
export { refreshOAuth2Token, tokenNeedsRefresh } from "./oauth2-refresh";
