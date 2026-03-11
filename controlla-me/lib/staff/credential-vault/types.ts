/**
 * Credential Vault Types
 *
 * Type definitions for the AES-256-GCM credential vault service.
 * Used by the vault, connectors, and audit trail.
 *
 * @see ADR-3: Credential Vault (company/architecture/adr/adr-credential-vault.md)
 * @see Integration Security Design (company/security/designs/integration-security-design.md)
 */

// ---- Credential Data ----

/**
 * Decrypted credential data stored in the vault.
 * Supports OAuth2 tokens, API keys, basic auth, and provider-specific fields.
 *
 * IMPORTANT: This data is NEVER stored in plaintext in the database.
 * It is encrypted with AES-256-GCM before storage and decrypted on retrieval.
 */
export interface AuthCredentialData {
  /** OAuth2 access token */
  accessToken?: string;
  /** OAuth2 refresh token (needed for auto-refresh) */
  refreshToken?: string;
  /** Token expiry time as ISO 8601 datetime */
  expiresAt?: string;
  /** Static API key (for api-key auth strategy) */
  apiKey?: string;
  /** Username for basic auth */
  username?: string;
  /** Password for basic auth */
  password?: string;
  /** OAuth2 scopes granted by the provider */
  scopes?: string[];
  /** OAuth2 token endpoint URL (needed for refresh) */
  tokenUrl?: string;
  /** OAuth2 client ID (needed for refresh) */
  clientId?: string;
  /** OAuth2 client secret (needed for refresh) */
  clientSecret?: string;
  /** Extensible for provider-specific data */
  [key: string]: unknown;
}

// ---- Audit Trail ----

/**
 * Actions tracked in the credential audit log.
 * Every vault operation creates an audit entry.
 */
export type AuditAction = "create" | "access" | "refresh" | "revoke" | "rotate";

/**
 * Audit log entry for credential vault operations.
 * Stored in the `integration_credential_audit` table.
 *
 * GDPR: audit entries are retained for 2 years maximum.
 * No decrypted credential data is ever logged.
 */
export interface CredentialAuditEntry {
  /** UUID of the credential row */
  credentialId: string;
  /** UUID of the user who owns the credential */
  userId: string;
  /** Action performed */
  action: AuditAction;
  /** Who performed the action: user UUID or "system" for auto-refresh */
  actor: string;
  /** Optional metadata (provider, reason, etc.) */
  metadata?: Record<string, unknown>;
}

// ---- Encrypted Payload ----

/**
 * AES-256-GCM encrypted payload as stored in the database.
 * All values are base64-encoded strings.
 */
export interface EncryptedPayload {
  /** Ciphertext (base64) */
  encrypted: string;
  /** Initialization vector — 12 bytes, base64 */
  iv: string;
  /** Authentication tag — 16 bytes, base64 */
  authTag: string;
}

// ---- Vault DB Row (metadata only) ----

/**
 * Credential vault row as returned by list operations.
 * Does NOT contain decrypted data — only queryable metadata.
 */
export interface VaultEntryMetadata {
  id: string;
  userId: string;
  provider: string;
  authType: string;
  metadata: Record<string, unknown>;
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastRefreshedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---- OAuth2 Refresh Response ----

/**
 * Response from an OAuth2 token refresh request.
 */
export interface OAuth2RefreshResult {
  /** New access token */
  accessToken: string;
  /** New refresh token (may be rotated by the provider) */
  refreshToken?: string;
  /** Token lifetime in seconds */
  expiresIn: number;
}
