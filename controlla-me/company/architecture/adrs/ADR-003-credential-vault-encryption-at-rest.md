# ADR-003: Credential vault with encryption at rest

## Status

Proposed

## Date

2026-03-10

## Context

The Integration Office (ADR-001) connects to external services that require authentication: OAuth2 tokens, API keys, basic auth credentials, and webhook secrets. These credentials must be stored securely, rotated periodically, and never exposed in logs or client-side code.

Today, Controlla.me stores all secrets as environment variables:
- `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, etc. in `.env.local`
- `ALPACA_API_KEY`, `ALPACA_SECRET_KEY` for the Trading Office
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` for payments

This approach works for a fixed set of provider keys but does not scale to per-source credentials for the Integration Office, where each connected data source may have its own OAuth2 client, API key, or user/password pair. The number of credentials grows linearly with the number of connected sources.

Requirements:
1. **Encryption at rest**: credentials must not be stored in plaintext in the database.
2. **Access control**: only the data-connector service (server-side) can read credentials. No client-side access.
3. **Token refresh**: OAuth2 tokens expire and must be refreshed automatically.
4. **Key rotation**: the master encryption key must be rotatable without re-encrypting all credentials at once.
5. **Audit trail**: every credential access must be logged for security compliance (EU AI Act, GDPR).
6. **Cost-aware**: no external secrets manager (AWS Secrets Manager, HashiCorp Vault) -- stay within the existing Supabase infrastructure.

## Decision

**Store credentials in a dedicated Supabase table with AES-256-GCM encryption at rest, RLS restricting access to `service_role` only, and a key envelope pattern for rotation.**

### 1. Database schema

```sql
-- Migration: XXX_credential_vault.sql

CREATE TABLE credential_vault (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id TEXT NOT NULL,                    -- References DataSource.id
  credential_type TEXT NOT NULL               -- 'api_key' | 'basic' | 'oauth2_client' | 'oauth2_token' | 'custom'
    CHECK (credential_type IN ('api_key', 'basic', 'oauth2_client', 'oauth2_token', 'custom')),
  label TEXT NOT NULL,                        -- Human-readable label (e.g., "Salesforce Production")

  -- Encrypted payload (AES-256-GCM)
  encrypted_data BYTEA NOT NULL,             -- Ciphertext
  iv BYTEA NOT NULL,                         -- Initialization vector (12 bytes)
  auth_tag BYTEA NOT NULL,                   -- GCM authentication tag (16 bytes)
  key_version INTEGER NOT NULL DEFAULT 1,     -- Which master key version encrypted this

  -- OAuth2 lifecycle
  expires_at TIMESTAMPTZ,                     -- Token expiration (null for non-expiring keys)
  refresh_token_encrypted BYTEA,              -- Encrypted refresh token (OAuth2 only)
  refresh_token_iv BYTEA,
  refresh_token_auth_tag BYTEA,
  last_refreshed_at TIMESTAMPTZ,
  refresh_error TEXT,                         -- Last refresh error (for debugging)

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_accessed_at TIMESTAMPTZ,              -- Updated on every read (audit)
  rotated_at TIMESTAMPTZ,                    -- When credential was last rotated
  created_by TEXT NOT NULL DEFAULT 'system',  -- 'system' | operator ID

  UNIQUE (source_id, credential_type)
);

-- RLS: ONLY service_role can access this table
ALTER TABLE credential_vault ENABLE ROW LEVEL SECURITY;

-- No policies = no access for anon/authenticated roles.
-- Only service_role (bypasses RLS) can read/write.

-- Index for token refresh job
CREATE INDEX idx_credential_vault_expires
  ON credential_vault (expires_at)
  WHERE expires_at IS NOT NULL AND credential_type = 'oauth2_token';

-- Audit log for credential access
CREATE TABLE credential_access_log (
  id BIGSERIAL PRIMARY KEY,
  credential_id UUID NOT NULL REFERENCES credential_vault(id),
  action TEXT NOT NULL CHECK (action IN ('read', 'write', 'refresh', 'rotate', 'delete')),
  actor TEXT NOT NULL,                        -- 'pipeline:<sourceId>' | 'cron:refresh' | 'operator:<id>'
  ip_address INET,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE credential_access_log ENABLE ROW LEVEL SECURITY;
-- Same RLS: service_role only

-- TTL cleanup for access logs (GDPR: 90 days)
-- Executed by existing cron infrastructure
```

### 2. Encryption implementation

```typescript
// lib/staff/data-connector/vault.ts

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;     // GCM standard
const TAG_LENGTH = 16;    // GCM standard

/**
 * Master key resolution.
 * Key versions enable rotation: new credentials use latest version,
 * old credentials decrypted with their version's key.
 *
 * Keys stored as env vars: VAULT_KEY_V1, VAULT_KEY_V2, etc.
 * Each key is 32 bytes, base64-encoded.
 */
function getMasterKey(version: number): Buffer {
  const envName = `VAULT_KEY_V${version}`;
  const key = process.env[envName];
  if (!key) {
    throw new Error(
      `Master key ${envName} not found. ` +
      `Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
    );
  }
  return Buffer.from(key, "base64");
}

function getCurrentKeyVersion(): number {
  return parseInt(process.env.VAULT_KEY_VERSION ?? "1", 10);
}

export function encrypt(plaintext: string): {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  keyVersion: number;
} {
  const version = getCurrentKeyVersion();
  const key = getMasterKey(version);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: encrypted,
    iv,
    authTag: cipher.getAuthTag(),
    keyVersion: version,
  };
}

export function decrypt(
  ciphertext: Buffer,
  iv: Buffer,
  authTag: Buffer,
  keyVersion: number
): string {
  const key = getMasterKey(keyVersion);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext).toString("utf8") + decipher.final("utf8");
}
```

### 3. Credential CRUD API

```typescript
// lib/staff/data-connector/vault.ts (continued)

export interface Credential {
  id: string;
  sourceId: string;
  type: string;
  label: string;
  /** Decrypted secret -- only available server-side */
  secret: string;
  /** For basic auth */
  username?: string;
  /** OAuth2 metadata */
  expiresAt?: string;
  scopes?: string[];
}

export async function getCredential(credentialId: string): Promise<Credential>;
export async function getCredentialForSource(sourceId: string, type: string): Promise<Credential | null>;
export async function saveCredential(credential: Omit<Credential, "id">, actor: string): Promise<string>;
export async function deleteCredential(credentialId: string, actor: string): Promise<void>;
export async function rotateCredential(credentialId: string, newSecret: string, actor: string): Promise<void>;
```

All functions:
- Use `supabaseAdmin` (service_role key) for database access.
- Log every access to `credential_access_log`.
- Never return encrypted data to the caller -- only decrypted `Credential` objects.
- Never log credential values (secret, username, tokens).

### 4. OAuth2 token refresh lifecycle

```
Token stored in vault
       |
       v
[CONNECT phase] -> getCredential(sourceId, "oauth2_token")
       |
       v
  Is token expired? (expires_at < now())
       |
   YES -> refreshOAuth2Token(credentialId)
       |     |
       |     v
       |   POST to token endpoint with refresh_token
       |     |
       |     v
       |   Save new access_token + refresh_token to vault
       |   Update expires_at, last_refreshed_at
       |   Log "refresh" to access_log
       |     |
       |     v
       |   Return fresh credential
       |
   NO -> Return existing credential
```

**Refresh job**: A cron endpoint (`/api/platform/cron/refresh-tokens`) runs every 15 minutes. It queries credentials expiring within 30 minutes and proactively refreshes them. This prevents pipeline failures due to expired tokens mid-execution.

```typescript
// Cron query
SELECT id, source_id FROM credential_vault
WHERE credential_type = 'oauth2_token'
  AND expires_at IS NOT NULL
  AND expires_at < now() + interval '30 minutes'
  AND (refresh_error IS NULL OR last_refreshed_at < now() - interval '15 minutes');
```

### 5. Key rotation policy

**Master key rotation** (every 90 days or on suspected compromise):

1. Generate new key: `VAULT_KEY_V{N+1}`.
2. Set `VAULT_KEY_VERSION={N+1}` in environment.
3. New credentials encrypted with V{N+1}. Old credentials still decryptable with V{N}.
4. Background job re-encrypts old credentials with V{N+1} (lazy rotation):
   ```sql
   SELECT id FROM credential_vault WHERE key_version < $current_version LIMIT 100;
   ```
5. Once all credentials re-encrypted, old key env var can be removed.

**Credential rotation** (per-source, manual or automated):
- Operator triggers via console: `rotateCredential(id, newSecret, operatorId)`.
- Old value overwritten (not versioned -- GDPR: minimize retention of sensitive data).
- Access log records the rotation event.

### 6. Environment variables

```env
# Credential Vault (required for Integration Office)
VAULT_KEY_V1=<base64-encoded 32-byte key>   # Generate: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
VAULT_KEY_VERSION=1                           # Current active key version
```

### 7. Integration with ADR-001

The `DataSource.auth.credentialId` field (defined in ADR-001) references `credential_vault.id`. The `BaseConnector.resolveAuthHeaders()` method calls `getCredential(credentialId)` to fetch the decrypted secret at pipeline execution time.

```
DataSource.auth.credentialId ──references──> credential_vault.id
         |
         v
BaseConnector.fetchAuthenticated()
         |
         v
vault.getCredential(credentialId) → decrypted Credential
         |
         v
Inject into HTTP headers
```

## Consequences

### Positive

- **Encryption at rest**: Credentials are AES-256-GCM encrypted in the database. Even a database dump does not expose secrets.
- **Zero external dependencies**: Uses Node.js built-in `crypto` module and existing Supabase. No AWS Secrets Manager, no HashiCorp Vault, no additional SaaS cost.
- **RLS isolation**: Only `service_role` can access the vault table. The anon and authenticated Supabase roles have zero access -- no RLS policy means implicit deny.
- **Audit trail**: Every credential read, write, refresh, and rotation is logged with actor and timestamp. Satisfies EU AI Act transparency requirements and GDPR accountability.
- **Key rotation without downtime**: Envelope encryption (key versioning) allows gradual re-encryption. Both old and new keys coexist during rotation.
- **Automatic token refresh**: OAuth2 tokens are refreshed proactively by cron, preventing pipeline failures from expired tokens.

### Negative

- **Master key in env var**: The encryption is only as strong as the protection of `VAULT_KEY_V{N}`. If the env var is compromised, all credentials are decryptable. Mitigation: Vercel encrypts env vars at rest; access is restricted to deploy-time and server-side only.
- **Single point of failure**: If `VAULT_KEY_V{N}` is lost (not backed up), all credentials become unrecoverable. Mitigation: document backup procedure in runbook.
- **Re-encryption job**: Lazy key rotation requires a background job that reads and re-writes credentials. Must be idempotent and handle partial failures.
- **No HSM**: For maximum security, the master key should be in a Hardware Security Module. This is overkill for the current scale but worth considering if handling highly sensitive client credentials in production.

### Neutral

- **Migration required**: New `credential_vault` and `credential_access_log` tables. Follows existing migration numbering convention.
- **No UI in Phase 1**: Credentials are managed via CLI and console API. A UI for credential management is a Phase 2 deliverable.
- **Existing env var secrets unaffected**: The current `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, etc. continue to be read from env vars. The vault is only for per-source Integration Office credentials.

## Alternatives Considered

### A1: Store credentials in plaintext with RLS only

Rely on Supabase RLS to restrict access, without encryption. Rejected because:
- A database backup or admin access exposes all credentials in plaintext.
- Does not meet GDPR "appropriate technical measures" requirement for sensitive data (Art. 32).
- RLS is a single layer of defense. Encryption at rest adds defense in depth.

### A2: Use AWS Secrets Manager or HashiCorp Vault

External secrets management service. Rejected because:
- **Cost**: AWS Secrets Manager charges $0.40/secret/month + $0.05/10K API calls. At 100 sources, that is $40/month + API costs -- significant for a demo/startup environment.
- **Complexity**: Requires AWS account, IAM configuration, network access from Vercel. HashiCorp Vault requires self-hosting (Docker, storage backend, unsealing).
- **Latency**: External API call for every credential read adds 50-200ms per pipeline run.
- **Vendor lock-in**: Ties credential management to a specific cloud provider.
- Can be revisited if the platform scales to 1000+ sources or handles financial/medical credentials requiring HSM-level protection.

### A3: Encrypt credentials with Supabase Vault (pgsodium)

Use Supabase's built-in Vault extension (based on pgsodium). Rejected because:
- Supabase Vault is still in beta with limited documentation.
- Key management is tied to the Supabase instance -- no portability.
- The Node.js `crypto` approach gives full control over the encryption lifecycle and is portable across hosting providers.
- Supabase Vault could be adopted later as an optimization (replace Node.js encryption with database-level encryption) without changing the table schema.

### A4: Store credentials in encrypted files on the filesystem

Use `.credentials/` directory with encrypted JSON files. Rejected because:
- Does not work on Vercel (ephemeral filesystem).
- No query capability (cannot find credentials by source_id efficiently).
- No audit trail without building custom file-level logging.
- Conflicts with the existing database-first architecture.

## References

- ADR-001 (this series) -- `DataSource.auth.credentialId` reference
- `lib/supabase/admin.ts` -- existing `service_role` client
- `lib/middleware/audit-log.ts` -- existing audit logging infrastructure
- GDPR Art. 32 -- "appropriate technical and organisational measures" for data security
- NIST SP 800-38D -- Recommendation for GCM Mode (AES-256-GCM specification)
