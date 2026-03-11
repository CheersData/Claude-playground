# Integration Security Design: OAuth2+PKCE, Credential Vault, Webhook Signatures

> **Autore:** Security Department (security-auditor)
> **Data:** 2026-03-10
> **Stato:** DESIGN APPROVATO — pronto per implementazione
> **Task:** ca32ed01
> **Revisione:** v2.0 — aggiunto envelope encryption, security controls, idempotency, emergency revocation

---

## Indice

1. [Contesto e Obiettivi](#1-contesto-e-obiettivi)
2. [OAuth 2.0 + PKCE Flow](#2-oauth-20--pkce-flow)
3. [Credential Vault Design](#3-credential-vault-design)
4. [Webhook Signature Verification](#4-webhook-signature-verification)
5. [Security Controls](#5-security-controls)
6. [Threat Model](#6-threat-model)
7. [Implementazione Step-by-Step](#7-implementazione-step-by-step)
8. [Decision Log](#8-decision-log)

---

## 1. Contesto e Obiettivi

### Perche serve

Controlla.me si prepara all'espansione B2B e all'integrazione con servizi terzi (CRM, document management, ERP PMI). Servono tre pilastri di sicurezza per le integrazioni:

1. **OAuth 2.0 + PKCE** — Autenticazione sicura per integrazioni third-party senza esporre credenziali utente
2. **Credential Vault** — Storage crittografato per API key, token e secret di integrazione
3. **Webhook Signatures** — Verifica crittografica dell'autenticita dei webhook ricevuti da servizi esterni

### Vincoli architetturali

- Stack: Next.js App Router, Supabase (PostgreSQL + RLS), Vercel deployment
- Nessun servizio esterno aggiuntivo (no HashiCorp Vault, no AWS KMS) — usiamo Supabase column-level encryption con envelope encryption
- Compatibilita con l'infrastruttura middleware esistente (`lib/middleware/`)
- Zero-trust: ogni layer ha la propria difesa

### Stato attuale dell'infrastruttura security

| Componente | Stato | Riferimento |
|-----------|-------|-------------|
| Auth utenti | Supabase Auth (OAuth Google/GitHub) | `lib/supabase/server.ts`, `lib/middleware/auth.ts` |
| Auth console | HMAC-SHA256 token stateless | `lib/middleware/console-token.ts` |
| CSRF protection | Origin header check | `lib/middleware/csrf.ts` |
| Rate limiting | Upstash Redis + in-memory fallback | `lib/middleware/rate-limit.ts` |
| Audit log | EU AI Act compliant, Supabase `audit_logs` | `lib/middleware/audit-log.ts` |
| Sanitization | Input cleaning, session ID validation | `lib/middleware/sanitize.ts` |
| Webhook (Stripe) | `stripe.webhooks.constructEvent()` | `app/api/webhook/route.ts` |
| Credential storage | Plaintext env vars | `.env.local` |

### Dipendenze su altri ADR

- `company/architecture/adr/adr-integration-framework.md` — definisce `AuthConfig`, `AuthenticatedBaseConnector`, e la pipeline estesa per connettori autenticati
- Questo documento specifica la security layer su cui il framework di integrazione si appoggia

---

## 2. OAuth 2.0 + PKCE Flow

### 2.1 Perche PKCE e non Authorization Code semplice

OAuth 2.0 Authorization Code Grant con PKCE (Proof Key for Code Exchange, RFC 7636) e obbligatorio per:

- **Client pubblici** (SPA, app mobili) — nessun client_secret sul client
- **Prevenzione Code Interception Attack** — anche se un attaccante intercetta il codice, non puo scambiarlo senza il code_verifier
- **Best practice corrente** — IETF OAuth 2.0 Security Best Current Practice (RFC 9700) raccomanda PKCE per TUTTI i grant, inclusi i confidential client

### 2.2 Sequence Diagram

```
┌──────────────┐     ┌────────────────┐     ┌──────────────────┐
│   Client     │     │  Controlla.me  │     │  Provider Esterno│
│   (Browser)  │     │  (Next.js)     │     │  (CRM, ERP, etc) │
└──────┬───────┘     └───────┬────────┘     └────────┬─────────┘
       │                     │                        │
       │  1. Click "Connetti │                        │
       │     Integrazione X" │                        │
       │ ───────────────────>│                        │
       │                     │                        │
       │                     │  2. Server genera:     │
       │                     │  code_verifier (128B)  │
       │                     │  code_challenge=SHA256  │
       │                     │  state (32B random)    │
       │                     │  nonce (16B random)    │
       │                     │                        │
       │                     │  3. Salva in httpOnly   │
       │                     │  cookie (encrypted):   │
       │                     │  { state, verifier,    │
       │                     │    nonce, provider,    │
       │                     │    requested_scopes,   │
       │                     │    initiated_at }      │
       │                     │                        │
       │  4. Redirect 302 to │                        │
       │  provider /authorize│                        │
       │  ?response_type=code│                        │
       │  &client_id=...     │                        │
       │  &redirect_uri=...  │                        │
       │  &code_challenge=.. │                        │
       │  &code_challenge_   │                        │
       │   method=S256       │                        │
       │  &state=...         │                        │
       │  &scope=...         │                        │
       │ <───────────────────│                        │
       │                     │                        │
       │  5. User authorizes │                        │
       │  presso il provider │                        │
       │ ────────────────────────────────────────────>│
       │                     │                        │
       │  6. Provider redirect con authorization_code  │
       │  GET /callback?code=...&state=...            │
       │ <────────────────────────────────────────────│
       │                     │                        │
       │  7. Browser segue   │                        │
       │  redirect a callback│                        │
       │ ───────────────────>│                        │
       │                     │                        │
       │                     │  8. Verifica:           │
       │                     │  a. state corrisponde   │
       │                     │     al cookie           │
       │                     │  b. initiated_at < 10min│
       │                     │  c. redirect_uri in     │
       │                     │     whitelist            │
       │                     │                        │
       │                     │  9. Token Exchange:     │
       │                     │  POST /oauth/token      │
       │                     │  grant_type=            │
       │                     │   authorization_code    │
       │                     │  code=...               │
       │                     │  code_verifier=...      │
       │                     │  redirect_uri=...       │
       │                     │  client_id=...          │
       │                     │  client_secret=...      │
       │                     │   (server-side only)    │
       │                     │ ──────────────────────>│
       │                     │                        │
       │                     │ 10. Response:           │
       │                     │  { access_token,        │
       │                     │    refresh_token,       │
       │                     │    expires_in,          │
       │                     │    scope,               │
       │                     │    token_type }         │
       │                     │ <──────────────────────│
       │                     │                        │
       │                     │ 11. Encrypt tokens      │
       │                     │  via Credential Vault   │
       │                     │  (envelope encryption)  │
       │                     │                        │
       │                     │ 12. Salva in             │
       │                     │  integration_credentials│
       │                     │  con RLS user_id        │
       │                     │                        │
       │                     │ 13. Audit log:          │
       │                     │  credential.created     │
       │                     │                        │
       │                     │ 14. Cancella cookie     │
       │                     │  state/verifier         │
       │                     │                        │
       │  15. Redirect a     │                        │
       │  /settings/         │                        │
       │  integrations       │                        │
       │  ?status=connected  │                        │
       │ <───────────────────│                        │
```

### 2.3 Token Exchange Flow

Il token exchange avviene esclusivamente server-side (step 9-10). Il `client_secret` non viene mai esposto al browser. Il `code_verifier` viene recuperato dalla cookie httpOnly settata al passo 3.

```typescript
// Pseudocodice del token exchange (server-side)
const tokenResponse = await fetch(provider.tokenUrl, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    code: authorizationCode,
    code_verifier: savedCodeVerifier,       // dal cookie httpOnly
    redirect_uri: REDIRECT_URI,             // deve matchare quello dell'authorize
    client_id: provider.clientId,           // env var, server-side
    client_secret: provider.clientSecret,   // env var, server-side — MAI esposto al client
  }),
});
```

### 2.4 Redirect URI Validation

Le redirect URI sono una whitelist statica definita in configurazione. Non sono ammessi wildcard o redirect URI dinamiche.

```typescript
// lib/oauth/providers.ts — whitelist redirect URI
const ALLOWED_REDIRECT_URIS = new Set([
  `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/callback`,
]);

function validateRedirectUri(uri: string): boolean {
  return ALLOWED_REDIRECT_URIS.has(uri);
}
```

**Regole di validazione:**
- Confronto esatto (no substring, no regex)
- Solo HTTPS in produzione (http ammesso solo per localhost)
- Nessun frammento (`#`) ammesso nella redirect URI
- Nessun parametro aggiuntivo oltre a quelli specificati dal protocollo
- Redirect URI registrata presso il provider deve matchare esattamente

### 2.5 State Parameter e CSRF Protection

Il parametro `state` serve come difesa primaria contro CSRF nel flow OAuth. L'implementazione segue un pattern rigoroso:

1. **Generazione:** `crypto.randomBytes(32).toString('base64url')` — 256 bit di entropia
2. **Storage:** Cookie httpOnly, Secure, SameSite=Lax, Max-Age=600 (10 minuti)
3. **Verifica:** Confronto timing-safe al callback
4. **Consumo:** Il cookie viene cancellato dopo l'uso (one-time token)
5. **TTL:** Il flow OAuth deve completarsi entro 10 minuti dall'avvio

```typescript
// Verifica state al callback — timing-safe
function verifyOAuthState(receivedState: string, expectedState: string): boolean {
  if (receivedState.length !== expectedState.length) return false;
  const a = Buffer.from(receivedState);
  const b = Buffer.from(expectedState);
  return timingSafeEqual(a, b);
}
```

### 2.6 Scope Management per Connector Type

Ogni tipo di connettore ha scopi minimi predefiniti e scopi opzionali. Il principio di least privilege e enforced dalla configurazione.

```typescript
// lib/oauth/providers.ts — Scope registry per provider

export interface OAuthProviderConfig {
  id: string;
  name: string;
  authorizeUrl: string;
  tokenUrl: string;
  revokeUrl?: string;
  clientIdEnvVar: string;
  clientSecretEnvVar: string;
  /** Scopi richiesti per il funzionamento base del connettore */
  requiredScopes: string[];
  /** Scopi opzionali che l'utente puo abilitare */
  optionalScopes: string[];
  /** Scopi mai richiesti (safety: previene escalation) */
  blockedScopes: string[];
  /** Supporta PKCE? (default: true — rifiuta provider senza PKCE) */
  supportsPkce?: boolean;
  /** Supporta refresh token rotation? */
  supportsRefreshRotation?: boolean;
}

export const OAUTH_PROVIDERS: Record<string, OAuthProviderConfig> = {
  google_drive: {
    id: "google_drive",
    name: "Google Drive",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    revokeUrl: "https://oauth2.googleapis.com/revoke",
    clientIdEnvVar: "GOOGLE_OAUTH_CLIENT_ID",
    clientSecretEnvVar: "GOOGLE_OAUTH_CLIENT_SECRET",
    requiredScopes: [
      "https://www.googleapis.com/auth/drive.file",       // solo file creati dall'app
    ],
    optionalScopes: [
      "https://www.googleapis.com/auth/drive.readonly",    // lettura tutti i file
    ],
    blockedScopes: [
      "https://www.googleapis.com/auth/drive",             // full access — mai richiesto
      "https://mail.google.com/",                          // email — non pertinente
    ],
    supportsPkce: true,
    supportsRefreshRotation: false,
  },

  hubspot: {
    id: "hubspot",
    name: "HubSpot CRM",
    authorizeUrl: "https://app.hubspot.com/oauth/authorize",
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    clientIdEnvVar: "HUBSPOT_OAUTH_CLIENT_ID",
    clientSecretEnvVar: "HUBSPOT_OAUTH_CLIENT_SECRET",
    requiredScopes: [
      "crm.objects.contacts.read",
      "crm.objects.deals.read",
    ],
    optionalScopes: [
      "crm.objects.contacts.write",
      "crm.objects.deals.write",
    ],
    blockedScopes: [
      "oauth",                        // admin scope
      "account-info.security.write",  // security settings
    ],
    supportsPkce: true,
    supportsRefreshRotation: false,
  },

  microsoft: {
    id: "microsoft",
    name: "Microsoft 365",
    authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    clientIdEnvVar: "MICROSOFT_OAUTH_CLIENT_ID",
    clientSecretEnvVar: "MICROSOFT_OAUTH_CLIENT_SECRET",
    requiredScopes: [
      "Files.Read",
      "offline_access",
    ],
    optionalScopes: [
      "Files.ReadWrite",
    ],
    blockedScopes: [
      "Directory.ReadWrite.All",    // admin directory
      "Mail.ReadWrite",             // email — non pertinente
      "User.ReadWrite.All",         // modifica utenti
    ],
    supportsPkce: true,
    supportsRefreshRotation: true,
  },
};

/**
 * Valida che gli scope richiesti dall'utente siano permessi.
 * Rifiuta scope bloccati e scope non nel set (required + optional).
 */
function validateScopes(
  providerId: string,
  requestedScopes: string[]
): { valid: boolean; error?: string; sanitized: string[] } {
  const provider = OAUTH_PROVIDERS[providerId];
  if (!provider) return { valid: false, error: "Provider sconosciuto", sanitized: [] };

  const allowed = new Set([...provider.requiredScopes, ...provider.optionalScopes]);
  const blocked = new Set(provider.blockedScopes);

  for (const scope of requestedScopes) {
    if (blocked.has(scope)) {
      return { valid: false, error: `Scope bloccato: ${scope}`, sanitized: [] };
    }
    if (!allowed.has(scope)) {
      return { valid: false, error: `Scope non consentito: ${scope}`, sanitized: [] };
    }
  }

  // Assicura che gli scope obbligatori siano sempre presenti
  const sanitized = [...new Set([...provider.requiredScopes, ...requestedScopes])];
  return { valid: true, sanitized };
}
```

### 2.7 API Routes

```
app/api/integrations/
  authorize/route.ts    -- Step 1-4: genera PKCE, salva state, redirect
  callback/route.ts     -- Step 7-15: verifica state, scambia code, salva in vault
  token/route.ts        -- Token proxy: decripta da vault, refresh se scaduto
  revoke/route.ts       -- Revoca token presso provider + elimina da vault
  list/route.ts         -- Lista integrazioni attive per l'utente (no token esposti)
```

Tutte le route richiedono `requireAuth()` + `checkRateLimit()` + `checkCsrf()`.

---

## 3. Credential Vault Design

### 3.1 Storage: Tabella `integration_credentials`

```sql
-- Migration: 030_integration_credentials.sql

-- Tabella chiavi master per envelope encryption
CREATE TABLE credential_vault_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_version INT NOT NULL UNIQUE,           -- versione incrementale della master key
  -- La master key vera NON e nel DB. Solo la versione.
  -- La chiave e in CREDENTIAL_VAULT_KEY (env var) per la versione corrente
  -- e in CREDENTIAL_VAULT_KEY_PREV per quella precedente durante rotazione.
  is_active BOOLEAN DEFAULT true,            -- solo una attiva alla volta
  activated_at TIMESTAMPTZ DEFAULT now(),
  deactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert versione iniziale
INSERT INTO credential_vault_keys (key_version, is_active)
VALUES (1, true);

-- Tabella credenziali di integrazione (encrypted at rest)
CREATE TABLE integration_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,                    -- 'hubspot', 'google_drive', 'microsoft', etc.
  provider_user_id TEXT,                     -- ID utente nel provider esterno
  scopes TEXT[],                             -- Scopi autorizzati

  -- Envelope encryption: ogni riga ha una DEK unica
  -- DEK (Data Encryption Key) cripta i token
  -- DEK e a sua volta crittata dalla KEK (Key Encryption Key = CREDENTIAL_VAULT_KEY)
  encrypted_dek BYTEA NOT NULL,             -- AES-256-GCM(KEK, DEK)
  dek_iv BYTEA NOT NULL,                    -- IV per la crittazione della DEK
  key_version INT NOT NULL DEFAULT 1        -- versione della KEK usata per crittare la DEK
    REFERENCES credential_vault_keys(key_version),

  -- Token crittati con la DEK (non con la KEK direttamente)
  encrypted_access_token BYTEA NOT NULL,
  access_token_iv BYTEA NOT NULL,
  encrypted_refresh_token BYTEA,
  refresh_token_iv BYTEA,

  -- Lifecycle
  token_expires_at TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  last_refreshed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,                   -- Soft delete
  revoke_reason TEXT,                        -- 'user_initiated', 'admin_kill', 'provider_revoked', 'expired'
  broken_at TIMESTAMPTZ,                    -- Token non funzionante (refresh fallito 3x)

  -- GDPR TTL
  hard_delete_at TIMESTAMPTZ,               -- Calcolato: revoked_at + 30 giorni
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT unique_user_provider UNIQUE (user_id, provider)
);

-- RLS: utenti vedono solo le proprie integrazioni non revocate
ALTER TABLE integration_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own active credentials"
  ON integration_credentials FOR SELECT
  USING (auth.uid() = user_id AND revoked_at IS NULL);

CREATE POLICY "Users insert own credentials"
  ON integration_credentials FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own credentials"
  ON integration_credentials FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role puo tutto (per cron, admin kill switch, cleanup)
CREATE POLICY "Service role full access"
  ON integration_credentials FOR ALL
  USING (auth.role() = 'service_role');

-- Indici
CREATE INDEX idx_creds_user ON integration_credentials(user_id);
CREATE INDEX idx_creds_provider ON integration_credentials(provider);
CREATE INDEX idx_creds_expires ON integration_credentials(token_expires_at)
  WHERE revoked_at IS NULL;
CREATE INDEX idx_creds_hard_delete ON integration_credentials(hard_delete_at)
  WHERE hard_delete_at IS NOT NULL;
CREATE INDEX idx_creds_broken ON integration_credentials(broken_at)
  WHERE broken_at IS NOT NULL AND revoked_at IS NULL;

-- Webhook secrets per connector (per-user, per-provider)
CREATE TABLE integration_webhook_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES integration_credentials(id) ON DELETE CASCADE,
  webhook_secret_encrypted BYTEA NOT NULL,  -- HMAC secret crittato con DEK dell'integrazione
  webhook_secret_iv BYTEA NOT NULL,
  events TEXT[],                             -- es. ['contact.created', 'deal.updated']
  endpoint_path TEXT NOT NULL,               -- es. '/api/webhooks/hubspot/user123'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE integration_webhook_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own webhook secrets"
  ON integration_webhook_secrets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM integration_credentials
      WHERE id = integration_webhook_secrets.integration_id
      AND user_id = auth.uid()
    )
  );

-- Idempotency store per webhook dedup
CREATE TABLE webhook_idempotency (
  idempotency_key TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  received_at TIMESTAMPTZ DEFAULT now(),
  response_status INT,
  -- TTL: auto-cleanup dopo 24h
  expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '24 hours'
);

CREATE INDEX idx_webhook_idemp_expires ON webhook_idempotency(expires_at);

-- Cleanup function per hard delete GDPR
CREATE OR REPLACE FUNCTION cleanup_expired_credentials()
RETURNS void AS $$
BEGIN
  -- Hard delete credenziali revocate dopo TTL
  DELETE FROM integration_credentials
  WHERE hard_delete_at IS NOT NULL AND hard_delete_at < now();

  -- Cleanup idempotency keys scadute
  DELETE FROM webhook_idempotency
  WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 3.2 Encryption at Rest: Envelope Encryption con AES-256-GCM

Envelope encryption separa la chiave che cripta i dati (DEK) dalla chiave che cripta le chiavi (KEK). Questo consente la key rotation senza dover ri-crittare tutti i token.

```
┌─────────────────────────────────────────────────────────────────┐
│                    ENVELOPE ENCRYPTION                           │
│                                                                  │
│  KEK (Key Encryption Key)                                       │
│    = CREDENTIAL_VAULT_KEY (env var, 256 bit)                    │
│    Usata SOLO per crittare/decrittare le DEK                    │
│                                                                  │
│  DEK (Data Encryption Key)                                      │
│    = Chiave casuale AES-256, unica per ogni integrazione        │
│    Critta/decritta i token (access_token, refresh_token)        │
│    Salvata nel DB crittata con la KEK                           │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Per ogni riga in integration_credentials:               │   │
│  │                                                          │   │
│  │  1. Genera DEK casuale (32 byte)                         │   │
│  │  2. encrypted_dek = AES-GCM(KEK, DEK)                   │   │
│  │  3. encrypted_access_token = AES-GCM(DEK, access_token)  │   │
│  │  4. encrypted_refresh_token = AES-GCM(DEK, refresh_token)│   │
│  │                                                          │   │
│  │  Decrypt:                                                │   │
│  │  1. DEK = decrypt(KEK, encrypted_dek)                    │   │
│  │  2. access_token = decrypt(DEK, encrypted_access_token)  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  KEY ROTATION:                                                   │
│  Solo re-cripta encrypted_dek (32 byte ciascuna).               │
│  I token (potenzialmente grandi) NON vengono ri-crittati.       │
│  N righe nel DB = N re-encryption di 32 byte ciascuna.          │
│  Senza envelope: N righe = N re-encryption di token interi.     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 Perche AES-256-GCM

| Proprieta | AES-256-GCM | AES-256-CBC | ChaCha20-Poly1305 |
|-----------|-------------|-------------|-------------------|
| Authenticated encryption | Si (AEAD) | No (serve HMAC separato) | Si (AEAD) |
| Node.js native | Si (`crypto.createCipheriv`) | Si | Si (Node 16+) |
| Performance | Eccellente (AES-NI hardware) | Buona | Buona (senza AES-NI) |
| IV requirements | 12 byte, MUST be unique per key | 16 byte, MUST be unique | 12 byte, MUST be unique |
| Scelta | **SELEZIONATO** | Scartato (no AEAD nativo) | Alternativa valida |

### 3.4 Implementazione (`lib/credential-vault.ts`)

```typescript
// lib/credential-vault.ts — Credential Vault con Envelope Encryption (AES-256-GCM)

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;     // 96 bit per GCM (NIST raccomandato)
const TAG_LENGTH = 16;    // 128 bit auth tag
const DEK_LENGTH = 32;    // 256 bit per AES-256

// ─── KEK Management ───

function getKEK(version?: number): Buffer {
  // Se richiesta la versione precedente (durante key rotation)
  if (version !== undefined) {
    const prevKeyHex = process.env.CREDENTIAL_VAULT_KEY_PREV;
    if (prevKeyHex && prevKeyHex.length === 64) {
      return Buffer.from(prevKeyHex, "hex");
    }
  }

  const keyHex = process.env.CREDENTIAL_VAULT_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error(
      "[CREDENTIAL VAULT] CREDENTIAL_VAULT_KEY non configurato o " +
      "lunghezza errata. Deve essere 64 hex chars (256 bit). " +
      "Genera con: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return Buffer.from(keyHex, "hex");
}

// ─── Core Encrypt/Decrypt (usato per DEK e per token) ───

interface EncryptedData {
  /** Ciphertext + auth tag (concatenati) */
  ciphertext: Buffer;
  /** Initialization vector (12 byte, unico per operazione) */
  iv: Buffer;
}

function aesGcmEncrypt(key: Buffer, plaintext: Buffer): EncryptedData {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return { ciphertext: encrypted, iv };
}

function aesGcmDecrypt(key: Buffer, data: EncryptedData): Buffer {
  const authTag = data.ciphertext.subarray(data.ciphertext.length - TAG_LENGTH);
  const encrypted = data.ciphertext.subarray(0, data.ciphertext.length - TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, data.iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

// ─── Envelope Encryption Public API ───

export interface EnvelopeEncryptedCredential {
  /** DEK crittata con KEK */
  encryptedDek: Buffer;
  dekIv: Buffer;
  /** Token crittati con DEK */
  encryptedAccessToken: Buffer;
  accessTokenIv: Buffer;
  encryptedRefreshToken?: Buffer;
  refreshTokenIv?: Buffer;
  /** Versione della KEK usata */
  keyVersion: number;
}

/**
 * Cripta token con envelope encryption.
 *
 * 1. Genera DEK casuale (256 bit)
 * 2. Cripta DEK con KEK (master key da env var)
 * 3. Cripta access_token con DEK
 * 4. Cripta refresh_token con DEK (se presente)
 *
 * Ogni chiamata genera IV casuali — MAI riutilizzare IV con la stessa key.
 */
export function encryptCredentials(
  accessToken: string,
  refreshToken?: string,
  keyVersion: number = 1
): EnvelopeEncryptedCredential {
  const kek = getKEK();
  const dek = randomBytes(DEK_LENGTH);

  // Cripta DEK con KEK
  const encDek = aesGcmEncrypt(kek, dek);

  // Cripta access token con DEK
  const encAccess = aesGcmEncrypt(dek, Buffer.from(accessToken, "utf8"));

  // Cripta refresh token con DEK (se presente)
  let encRefresh: EncryptedData | undefined;
  if (refreshToken) {
    encRefresh = aesGcmEncrypt(dek, Buffer.from(refreshToken, "utf8"));
  }

  return {
    encryptedDek: encDek.ciphertext,
    dekIv: encDek.iv,
    encryptedAccessToken: encAccess.ciphertext,
    accessTokenIv: encAccess.iv,
    encryptedRefreshToken: encRefresh?.ciphertext,
    refreshTokenIv: encRefresh?.iv,
    keyVersion,
  };
}

/**
 * Decripta token da envelope encryption.
 *
 * 1. Decripta DEK con KEK
 * 2. Decripta access_token con DEK
 * 3. Decripta refresh_token con DEK (se presente)
 */
export function decryptCredentials(
  data: EnvelopeEncryptedCredential
): { accessToken: string; refreshToken?: string } {
  const kek = getKEK(data.keyVersion);

  // Decripta DEK
  const dek = aesGcmDecrypt(kek, {
    ciphertext: data.encryptedDek,
    iv: data.dekIv,
  });

  // Decripta access token
  const accessToken = aesGcmDecrypt(dek, {
    ciphertext: data.encryptedAccessToken,
    iv: data.accessTokenIv,
  }).toString("utf8");

  // Decripta refresh token (se presente)
  let refreshToken: string | undefined;
  if (data.encryptedRefreshToken && data.refreshTokenIv) {
    refreshToken = aesGcmDecrypt(dek, {
      ciphertext: data.encryptedRefreshToken,
      iv: data.refreshTokenIv,
    }).toString("utf8");
  }

  return { accessToken, refreshToken };
}

/**
 * Re-cripta la DEK di una riga con una nuova KEK.
 * I token NON vengono ri-crittati (sono crittati con la DEK che non cambia).
 *
 * Usato durante key rotation:
 *   1. Decripta DEK con vecchia KEK (CREDENTIAL_VAULT_KEY_PREV)
 *   2. Ri-cripta DEK con nuova KEK (CREDENTIAL_VAULT_KEY)
 *   3. Aggiorna encrypted_dek, dek_iv, key_version nel DB
 */
export function reEncryptDek(
  encryptedDek: Buffer,
  dekIv: Buffer,
  oldKeyVersion: number,
  newKeyVersion: number
): { encryptedDek: Buffer; dekIv: Buffer; keyVersion: number } {
  // Decripta DEK con vecchia KEK
  const oldKek = getKEK(oldKeyVersion);
  const dek = aesGcmDecrypt(oldKek, { ciphertext: encryptedDek, iv: dekIv });

  // Ri-cripta DEK con nuova KEK
  const newKek = getKEK();
  const reEncrypted = aesGcmEncrypt(newKek, dek);

  return {
    encryptedDek: reEncrypted.ciphertext,
    dekIv: reEncrypted.iv,
    keyVersion: newKeyVersion,
  };
}
```

### 3.5 Key Rotation (Envelope Encryption)

La key rotation con envelope encryption richiede di ri-crittare solo le DEK, non i token. Per 1000 integrazioni, si ri-crittano 1000 x 32 byte = 32KB di dati anziche 1000 x (access_token + refresh_token) = potenzialmente megabyte.

**Procedura key rotation:**

```
1. Genera nuova KEK:
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

2. Configura su Vercel:
   CREDENTIAL_VAULT_KEY_PREV = <vecchia chiave>
   CREDENTIAL_VAULT_KEY      = <nuova chiave>

3. Aggiorna credential_vault_keys nel DB:
   INSERT INTO credential_vault_keys (key_version, is_active)
   VALUES (2, true);
   UPDATE credential_vault_keys SET is_active = false, deactivated_at = now()
   WHERE key_version = 1;

4. Esegui script di re-encryption:
   npx tsx scripts/rotate-vault-key.ts --from-version=1 --to-version=2

   Lo script:
   a. Legge tutte le righe con key_version = 1 (via service_role)
   b. Per ogni riga: reEncryptDek(old) -> update row con new key_version
   c. Logga progresso: "Re-encrypted 142/1000 credentials"
   d. Su errore: la riga resta con la versione vecchia (idempotente, rieseguibile)

5. Verifica: tutte le righe hanno key_version = 2
   SELECT count(*) FROM integration_credentials WHERE key_version = 1;
   -- Deve essere 0

6. Rimuovi CREDENTIAL_VAULT_KEY_PREV da Vercel

7. Distruggi vecchia chiave dal password manager
```

**Vantaggio envelope vs direct encryption:**

| Scenario | Direct Encryption | Envelope Encryption |
|----------|------------------|---------------------|
| 1000 integrazioni, key rotation | Ri-cripta 1000 token (~500KB) | Ri-cripta 1000 DEK (32KB) |
| Downtime necessario | Token inutilizzabili durante rotation | Zero downtime: vecchia e nuova KEK attive in parallelo |
| Failure mode | Se rotation fallisce a meta, meta token inaccessibili | Se rotation fallisce, le righe non migrate usano la vecchia KEK (CREDENTIAL_VAULT_KEY_PREV) |
| Performance | O(n * token_size) | O(n * 32 byte) |

### 3.6 Env vars richieste

```env
# Credential Vault — Envelope Encryption
CREDENTIAL_VAULT_KEY=...          # 64 hex chars (256 bit) — KEK corrente
CREDENTIAL_VAULT_KEY_PREV=...     # 64 hex chars — KEK precedente (solo durante key rotation)
```

### 3.7 RLS e Isolamento per Utente

La tabella `integration_credentials` ha RLS attivo con policy `auth.uid() = user_id`. Questo garantisce:

1. **Isolamento**: utente A non puo leggere/scrivere le credenziali di utente B, nemmeno con SQL injection
2. **Defense in depth**: anche se un attaccante ottiene accesso al DB, i token sono crittografati con una DEK che e crittata con la KEK — servono sia l'accesso DB che la KEK per leggere i token
3. **Soft delete**: `revoked_at IS NULL` nella policy SELECT esclude integrazioni revocate
4. **Admin access**: solo `service_role` puo accedere a tutte le righe (per cron, cleanup, emergency revocation)

---

## 4. Webhook Signature Verification

### 4.1 Pattern Attuale (Stripe)

`app/api/webhook/route.ts` usa gia `stripe.webhooks.constructEvent()` che internamente verifica HMAC-SHA256 con il `STRIPE_WEBHOOK_SECRET`. Questo design generalizza il pattern a tutti i webhook in ingresso.

### 4.2 HMAC-SHA256 Signature Verification

```
┌──────────────────┐     ┌───────────────────────────────┐
│  Provider Esterno │     │  Controlla.me                  │
│  (CRM, ERP, etc) │     │  /api/webhooks/[provider]       │
└────────┬─────────┘     └──────────────┬────────────────┘
         │                               │
         │  POST /api/webhooks/hubspot    │
         │  Headers:                      │
         │    X-Signature: sha256=abc...  │
         │    X-Timestamp: 1741564800    │
         │    X-Idempotency-Key: uuid    │
         │  Body: { "event": "..." }     │
         │ ─────────────────────────────>│
         │                               │
         │                    1. Check idempotency_key
         │                       in webhook_idempotency table
         │                       -> Se gia presente: 200 OK (dedup)
         │                    2. Estrai timestamp
         │                    3. Controlla replay: |now - ts| < 5min
         │                    4. Computa HMAC-SHA256:
         │                       hmac(secret, timestamp + "." + body)
         │                    5. Timing-safe compare con header
         │                    6. Se valido:
         │                       a. Inserisci idempotency_key
         │                       b. Processa evento
         │                       c. Audit log
         │                    7. Se invalido: 403 + audit log
         │                               │
         │  200 OK / 403 Forbidden        │
         │ <─────────────────────────────│
```

### 4.3 Timestamp Validation (Replay Attack Prevention)

I webhook con timestamp piu vecchi di 5 minuti vengono rifiutati. Questo previene replay attack dove un attaccante intercetta un webhook e lo re-invia successivamente.

```
Finestra di accettazione: |now - webhook_timestamp| < 300 secondi

Esempio:
  now          = 2026-03-10T14:05:00Z
  webhook_ts   = 2026-03-10T14:02:30Z
  drift        = 150 secondi
  -> ACCETTATO (150 < 300)

  webhook_ts   = 2026-03-10T13:58:00Z
  drift        = 420 secondi
  -> RIFIUTATO (420 > 300)
```

### 4.4 Per-Connector Webhook Secret Management

I webhook secret sono gestiti a due livelli:

**Livello 1: Provider globali (env var)**
Per provider dove Controlla.me ha un unico account globale (es. Stripe, GitHub):

```env
STRIPE_WEBHOOK_SECRET=whsec_...
GITHUB_WEBHOOK_SECRET=ghsec_...
```

**Livello 2: Per-utente, per-provider (DB)**
Per integrazioni dove ogni utente ha il proprio webhook endpoint (es. HubSpot per-user):

```typescript
// Ogni integrazione utente puo avere il proprio webhook secret
// Salvato in integration_webhook_secrets, crittato con la DEK dell'integrazione

async function getWebhookSecret(
  integrationId: string,
  eventType: string
): Promise<string | null> {
  // 1. Cerca il secret specifico per questa integrazione
  const { data } = await admin
    .from("integration_webhook_secrets")
    .select("webhook_secret_encrypted, webhook_secret_iv, integration_id")
    .eq("integration_id", integrationId)
    .eq("is_active", true)
    .contains("events", [eventType])
    .single();

  if (!data) return null;

  // 2. Recupera la DEK dell'integrazione per decrittare il webhook secret
  const creds = await admin
    .from("integration_credentials")
    .select("encrypted_dek, dek_iv, key_version")
    .eq("id", integrationId)
    .single();

  if (!creds.data) return null;

  // 3. Decripta DEK con KEK, poi decripta webhook secret con DEK
  const kek = getKEK(creds.data.key_version);
  const dek = aesGcmDecrypt(kek, {
    ciphertext: creds.data.encrypted_dek,
    iv: creds.data.dek_iv,
  });
  return aesGcmDecrypt(dek, {
    ciphertext: data.webhook_secret_encrypted,
    iv: data.webhook_secret_iv,
  }).toString("utf8");
}
```

### 4.5 Retry Handling (Idempotency Keys)

I provider SaaS fanno retry dei webhook quando non ricevono un 2xx. Senza deduplicazione, un evento viene processato piu volte.

```typescript
// lib/middleware/webhook-idempotency.ts

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Controlla se un webhook e stato gia processato.
 *
 * Se l'idempotency key esiste nel DB: ritorna true (gia processato).
 * Se non esiste: inserisce e ritorna false (da processare).
 *
 * L'idempotency key puo provenire da:
 * - Header del provider (es. X-Request-Id, X-Delivery-Id)
 * - Hash del body (se il provider non invia un ID)
 */
export async function checkIdempotency(
  idempotencyKey: string,
  provider: string
): Promise<{ alreadyProcessed: boolean }> {
  const admin = createAdminClient();

  // Prova a inserire — se esiste gia, UNIQUE constraint fallisce
  const { error } = await admin
    .from("webhook_idempotency")
    .insert({
      idempotency_key: idempotencyKey,
      provider,
    });

  if (error?.code === "23505") {
    // Unique violation — gia processato
    return { alreadyProcessed: true };
  }

  if (error) {
    // Errore DB — fail-open (processa, rischio duplicato)
    console.warn(`[WEBHOOK] Idempotency check failed: ${error.message}`);
    return { alreadyProcessed: false };
  }

  return { alreadyProcessed: false };
}

/**
 * Estrai idempotency key dal webhook.
 *
 * Ordine di preferenza:
 * 1. Header specifico del provider (es. X-GitHub-Delivery)
 * 2. Header generico X-Request-Id o X-Idempotency-Key
 * 3. SHA-256 del body (fallback — non ideale, body identici = same key)
 */
export function extractIdempotencyKey(
  req: NextRequest,
  body: string,
  provider: string
): string {
  // Provider-specific headers
  const providerHeaders: Record<string, string> = {
    github: "x-github-delivery",
    hubspot: "x-hubspot-request-id",
    stripe: "stripe-event-id",
  };

  const providerHeader = providerHeaders[provider];
  if (providerHeader) {
    const value = req.headers.get(providerHeader);
    if (value) return `${provider}:${value}`;
  }

  // Generic headers
  const genericId =
    req.headers.get("x-request-id") ||
    req.headers.get("x-idempotency-key");
  if (genericId) return `${provider}:${genericId}`;

  // Fallback: hash del body
  const { createHash } = require("crypto");
  const hash = createHash("sha256").update(body).digest("hex").slice(0, 32);
  return `${provider}:hash:${hash}`;
}
```

### 4.6 Implementazione (`lib/middleware/webhook-verify.ts`)

```typescript
// lib/middleware/webhook-verify.ts — Webhook signature verification

import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

const MAX_TIMESTAMP_DRIFT_MS = 5 * 60 * 1000; // 5 minuti

export interface WebhookProviderConfig {
  /** Nome del provider per logging */
  name: string;
  /** Env var contenente il webhook secret (per webhook globali) */
  secretEnvVar?: string;
  /** Header contenente la signature */
  signatureHeader: string;
  /** Header contenente il timestamp (opzionale, per replay protection) */
  timestampHeader?: string;
  /** Formato signature: "hex" (default) o "base64" */
  signatureEncoding?: "hex" | "base64";
  /** Prefisso nella signature da rimuovere (es. "sha256=" per GitHub) */
  signaturePrefix?: string;
  /** Come costruire il payload da firmare. Default: timestamp + "." + body */
  buildSignedPayload?: (timestamp: string | null, body: string) => string;
}

/**
 * Verifica la signature HMAC-SHA256 di un webhook.
 *
 * Restituisce null se la verifica ha successo.
 * Restituisce NextResponse 400/403/500 se fallisce.
 *
 * Implementa:
 * - Timing-safe comparison (previene timing attack)
 * - Replay attack protection (timestamp drift check)
 * - Fail-closed: se il secret non e configurato, rifiuta
 */
export function verifyWebhookSignature(
  req: NextRequest,
  body: string,
  config: WebhookProviderConfig,
  secret?: string  // Override per secret da DB (per-user webhooks)
): NextResponse | null {
  // 1. Determina il secret (override > env var)
  const webhookSecret = secret || (config.secretEnvVar ? process.env[config.secretEnvVar] : undefined);
  if (!webhookSecret) {
    console.error(
      `[WEBHOOK] ${config.name}: secret non disponibile. ` +
      `Rifiuto webhook per sicurezza (fail-closed).`
    );
    return NextResponse.json(
      { error: "Webhook non configurato" },
      { status: 500 }
    );
  }

  // 2. Signature header obbligatorio
  const signatureRaw = req.headers.get(config.signatureHeader);
  if (!signatureRaw) {
    return NextResponse.json(
      { error: "Signature mancante" },
      { status: 400 }
    );
  }

  // 3. Replay protection (se il provider supporta timestamp)
  let timestamp: string | null = null;
  if (config.timestampHeader) {
    timestamp = req.headers.get(config.timestampHeader);
    if (timestamp) {
      const tsMs = Number(timestamp) * 1000; // Assumi Unix epoch seconds
      const drift = Math.abs(Date.now() - tsMs);
      if (drift > MAX_TIMESTAMP_DRIFT_MS) {
        console.warn(
          `[WEBHOOK] ${config.name}: timestamp troppo vecchio ` +
          `(drift: ${Math.round(drift / 1000)}s, max: ${MAX_TIMESTAMP_DRIFT_MS / 1000}s)`
        );
        return NextResponse.json(
          { error: "Timestamp scaduto" },
          { status: 403 }
        );
      }
    }
  }

  // 4. Computa HMAC-SHA256 atteso
  const signedPayload = config.buildSignedPayload
    ? config.buildSignedPayload(timestamp, body)
    : timestamp
      ? `${timestamp}.${body}`
      : body;

  const encoding = config.signatureEncoding ?? "hex";
  const expectedSig = createHmac("sha256", webhookSecret)
    .update(signedPayload)
    .digest(encoding);

  // 5. Rimuovi prefisso dalla signature ricevuta
  let receivedSig = signatureRaw;
  if (config.signaturePrefix && receivedSig.startsWith(config.signaturePrefix)) {
    receivedSig = receivedSig.slice(config.signaturePrefix.length);
  }

  // 6. Timing-safe comparison
  const expectedBuf = Buffer.from(expectedSig, encoding);
  const receivedBuf = Buffer.from(receivedSig, encoding);

  if (expectedBuf.length !== receivedBuf.length ||
      !timingSafeEqual(expectedBuf, receivedBuf)) {
    console.warn(`[WEBHOOK] ${config.name}: signature non valida`);
    return NextResponse.json(
      { error: "Signature non valida" },
      { status: 403 }
    );
  }

  return null;
}

// ─── Provider Presets ───

export const WEBHOOK_PROVIDERS: Record<string, WebhookProviderConfig> = {
  github: {
    name: "GitHub",
    secretEnvVar: "GITHUB_WEBHOOK_SECRET",
    signatureHeader: "x-hub-signature-256",
    signaturePrefix: "sha256=",
    signatureEncoding: "hex",
  },
  hubspot: {
    name: "HubSpot",
    secretEnvVar: "HUBSPOT_WEBHOOK_SECRET",
    signatureHeader: "x-hubspot-signature-v3",
    timestampHeader: "x-hubspot-request-timestamp",
    signatureEncoding: "base64",
    buildSignedPayload: (ts, body) =>
      `POST\nhttps://controlla.me/api/webhooks/hubspot\n${body}\n${ts}`,
  },
  generic: {
    name: "Generic",
    signatureHeader: "x-webhook-signature",
    timestampHeader: "x-webhook-timestamp",
    signatureEncoding: "hex",
  },
};
```

### 4.7 Usage in Route Handler

```typescript
// app/api/webhooks/[provider]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature, WEBHOOK_PROVIDERS } from "@/lib/middleware/webhook-verify";
import { checkIdempotency, extractIdempotencyKey } from "@/lib/middleware/webhook-idempotency";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { auditLog } from "@/lib/middleware/audit-log";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;

  // 1. Rate limit
  const rl = await checkRateLimit(req);
  if (rl) return rl;

  // 2. Provider lookup
  const config = WEBHOOK_PROVIDERS[provider];
  if (!config) {
    return NextResponse.json({ error: "Provider sconosciuto" }, { status: 404 });
  }

  // 3. Read body once
  const body = await req.text();

  // 4. Idempotency check (before signature — cheap operation)
  const idempotencyKey = extractIdempotencyKey(req, body, provider);
  const { alreadyProcessed } = await checkIdempotency(idempotencyKey, provider);
  if (alreadyProcessed) {
    return NextResponse.json({ received: true, deduplicated: true });
  }

  // 5. Verify signature
  const sigError = verifyWebhookSignature(req, body, config);
  if (sigError) {
    await auditLog({
      eventType: "auth.failed",
      payload: { webhook_provider: provider, reason: "invalid_signature" },
    });
    return sigError;
  }

  // 6. Process webhook event
  try {
    const payload = JSON.parse(body);
    // ... provider-specific processing ...

    await auditLog({
      eventType: "stripe.webhook",  // o nuovo event type per integrazioni
      payload: { webhook_provider: provider, event_type: payload.type ?? "unknown" },
      result: "success",
    });
  } catch (err) {
    await auditLog({
      eventType: "stripe.webhook",
      payload: { webhook_provider: provider },
      result: "error",
      errorMessage: err instanceof Error ? err.message.slice(0, 500) : String(err),
    });
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
```

---

## 5. Security Controls

### 5.1 Rate Limiting for OAuth Flows

I flow OAuth sono bersagli per brute force (indovinare codici) e per denial-of-service (saturare le connessioni). Rate limit specifici per endpoint OAuth:

```typescript
// Aggiunte a RATE_LIMITS in lib/middleware/rate-limit.ts

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  // ... esistenti ...

  // OAuth flow — stretto: previene brute force su code exchange
  "api/integrations/authorize": { windowSec: 60, max: 5 },    // 5 authorize/min
  "api/integrations/callback":  { windowSec: 60, max: 5 },    // 5 callback/min
  "api/integrations/token":     { windowSec: 60, max: 20 },   // 20 token proxy/min (include refresh)
  "api/integrations/revoke":    { windowSec: 60, max: 5 },    // 5 revoke/min
  "api/integrations/list":      { windowSec: 60, max: 30 },   // 30 list/min (UI polling)

  // Webhooks — piu largo per gestire burst da provider
  "api/webhooks":               { windowSec: 60, max: 60 },   // 60/min per provider
};
```

**Motivazione dei limiti:**

| Endpoint | Limite | Motivazione |
|----------|--------|-------------|
| `/authorize` | 5/min | Un utente non connette piu di 5 integrazioni al minuto. Limita brute force. |
| `/callback` | 5/min | Deve matchare authorize. Un attaccante non puo tentare code injection velocemente. |
| `/token` | 20/min | Include i refresh automatici. Un'app attiva puo fare diversi refresh. |
| `/revoke` | 5/min | Operazione rara. Rate limit basso previene revocation flooding. |
| `/webhooks` | 60/min | I provider fanno burst (es. HubSpot manda 50 eventi in un batch). |

### 5.2 Audit Logging for Credential Operations

Ogni operazione sulle credenziali viene loggata nell'audit log esistente (`lib/middleware/audit-log.ts`). Nuovi event types:

```typescript
// Estensione di AuditEventType in lib/middleware/audit-log.ts

export type AuditEventType =
  // ... esistenti ...
  | "credential.created"      // Nuova integrazione connessa
  | "credential.refreshed"    // Token refreshato automaticamente
  | "credential.refresh_failed"  // Refresh fallito (con motivo)
  | "credential.used"         // Token usato per API call (solo count, non il token)
  | "credential.revoked"      // Integrazione revocata (con motivo)
  | "credential.kill_switch"  // Emergency revocation by admin
  | "credential.expired"      // Token scaduto senza refresh possibile
  | "credential.hard_deleted" // Hard delete GDPR dopo TTL
  | "credential.key_rotated"  // KEK rotation completata per una riga
  | "webhook.received"        // Webhook ricevuto e verificato
  | "webhook.rejected"        // Webhook rifiutato (signature invalida)
  | "webhook.replayed"        // Webhook rifiutato per replay (timestamp)
  | "webhook.deduplicated";   // Webhook duplicato (idempotency key)
```

**Regole di logging:**

| Cosa loggare | Cosa NON loggare |
|-------------|-----------------|
| user_id, provider, operation type | access_token, refresh_token |
| Timestamp dell'operazione | client_secret, code_verifier |
| Scopes richiesti/autorizzati | CREDENTIAL_VAULT_KEY |
| IP address, User-Agent | Contenuto del body dei webhook |
| Error messages (troncati a 500 char) | Credenziali in chiaro |
| Primi 8 char del token (per correlazione) | Token completi |

```typescript
// Esempio: log creazione credential
await auditLog({
  eventType: "credential.created",
  userId: user.id,
  payload: {
    provider: "hubspot",
    scopes: ["crm.objects.contacts.read"],
    token_preview: accessToken.slice(0, 8) + "...",
  },
  result: "success",
});
```

### 5.3 Token Expiry and Cleanup (GDPR TTL)

Le credenziali seguono un lifecycle TTL rigoroso per compliance GDPR Art. 17 (diritto alla cancellazione) e Art. 5(1)(e) (limitazione della conservazione).

```
┌─────────────────────────────────────────────────────────────────┐
│                    CREDENTIAL LIFECYCLE TTL                       │
│                                                                  │
│  STATO          │  AZIONE                │  TTL                  │
│─────────────────│────────────────────────│───────────────────────│
│  active         │  Token funzionante     │  Indefinito (refresh) │
│                 │                        │                        │
│  broken         │  Refresh fallito 3x    │  7 giorni per repair   │
│                 │  broken_at = now()     │  poi auto-revoke       │
│                 │                        │                        │
│  revoked        │  Soft delete           │  30 giorni per audit   │
│  (soft delete)  │  revoked_at = now()    │  poi hard delete       │
│                 │  hard_delete_at =      │                        │
│                 │    now() + 30 days     │                        │
│                 │                        │                        │
│  hard deleted   │  DELETE da DB          │  Permanente            │
│                 │  Tutti i byte crittati │                        │
│                 │  rimossi               │                        │
└─────────────────────────────────────────────────────────────────┘
```

**Cron job per cleanup (Vercel Cron o Edge Function):**

```typescript
// POST /api/platform/cron/credential-cleanup
// Header: Authorization: Bearer <CRON_SECRET>

export async function POST(req: NextRequest) {
  // Verifica CRON_SECRET (fail-closed)
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET non configurato" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const admin = createAdminClient();

  // 1. Auto-revoke credenziali broken da piu di 7 giorni
  const brokenCutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data: brokenCreds } = await admin
    .from("integration_credentials")
    .update({
      revoked_at: new Date().toISOString(),
      revoke_reason: "auto_revoke_broken",
      hard_delete_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    })
    .lt("broken_at", brokenCutoff)
    .is("revoked_at", null)
    .select("id, user_id, provider");

  // 2. Hard delete credenziali revocate oltre TTL
  await admin.rpc("cleanup_expired_credentials");

  // 3. Audit log
  await auditLog({
    eventType: "credential.hard_deleted",
    payload: { auto_revoked: brokenCreds?.length ?? 0 },
  });

  return NextResponse.json({
    auto_revoked: brokenCreds?.length ?? 0,
    cleanup: "completed",
  });
}
```

### 5.4 Emergency Revocation (Kill Switch)

In caso di credenziali compromesse, un admin deve poter revocare immediatamente tutte le credenziali di un utente, di un provider, o globalmente.

```typescript
// POST /api/integrations/emergency-revoke
// Auth: requireConsoleAuth (solo operatori console autorizzati)

export interface EmergencyRevokeRequest {
  /** Scope della revoca */
  scope: "user" | "provider" | "global";
  /** user_id (richiesto se scope=user) */
  userId?: string;
  /** provider name (richiesto se scope=provider) */
  provider?: string;
  /** Motivo della revoca (obbligatorio per audit) */
  reason: string;
  /** Conferma esplicita per scope=global (previene uso accidentale) */
  confirm?: boolean;
}

async function emergencyRevoke(request: EmergencyRevokeRequest): Promise<{
  revokedCount: number;
}> {
  // Scope global richiede conferma esplicita
  if (request.scope === "global" && !request.confirm) {
    throw new Error("Global revocation richiede confirm: true");
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const hardDeleteAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

  let query = admin
    .from("integration_credentials")
    .update({
      revoked_at: now,
      revoke_reason: `emergency:${request.reason}`,
      hard_delete_at: hardDeleteAt,
    })
    .is("revoked_at", null);  // Solo credenziali attive

  switch (request.scope) {
    case "user":
      if (!request.userId) throw new Error("userId obbligatorio per scope=user");
      query = query.eq("user_id", request.userId);
      break;
    case "provider":
      if (!request.provider) throw new Error("provider obbligatorio per scope=provider");
      query = query.eq("provider", request.provider);
      break;
    case "global":
      // Nessun filtro aggiuntivo — revoca tutto
      break;
  }

  const { data, error } = await query.select("id");
  if (error) throw new Error(`Emergency revoke failed: ${error.message}`);

  const revokedCount = data?.length ?? 0;

  // Audit log critico
  await auditLog({
    eventType: "credential.kill_switch",
    payload: {
      scope: request.scope,
      userId: request.userId,
      provider: request.provider,
      reason: request.reason,
      revokedCount,
    },
    result: "success",
  });

  return { revokedCount };
}
```

**Scenari di attivazione del kill switch:**

| Scenario | Scope | Azione |
|----------|-------|--------|
| Account utente compromesso | `user` | Revoca tutte le integrazioni dell'utente |
| Provider breach (es. HubSpot hacked) | `provider` | Revoca tutte le integrazioni HubSpot |
| KEK compromessa (leak env vars) | `global` | Revoca tutto + key rotation immediata |
| Token leaked nei log | `user` + specifico provider | Revoca e riconnetti |

**Accesso al kill switch:**

- Richiede `requireConsoleAuth()` (operatori console autorizzati)
- Rate limited: 5 richieste/minuto (previene uso accidentale)
- Ogni attivazione genera un audit log con evento `credential.kill_switch`
- Scope `global` richiede conferma via parametro `confirm: true` nel body

### 5.5 Token Refresh Lifecycle

```
┌───────────────────────────────────────────────────────┐
│                TOKEN REFRESH LIFECYCLE                  │
│                                                        │
│  1. CONNECT                                            │
│     OAuth callback -> encryptCredentials()             │
│     -> salva in integration_credentials                │
│     -> audit: credential.created                       │
│                                                        │
│  2. USE (ogni API call al provider)                    │
│     a. Read encrypted credential dal DB (RLS: user_id) │
│     b. decryptCredentials()                            │
│     c. Check token_expires_at                          │
│        - Se scade in < 5min: refresh prima dell'uso    │
│        - Altrimenti: usa direttamente                  │
│     d. Call provider API con access_token              │
│     e. Update last_used_at                             │
│     f. audit: credential.used (solo count)             │
│                                                        │
│  3. REFRESH (automatico, trasparente)                  │
│     a. Decripta refresh_token                          │
│     b. POST /oauth/token grant_type=refresh_token      │
│     c. Ricevi nuovo access_token (+refresh_token)      │
│     d. encryptCredentials(new_access, new_refresh)     │
│     e. Update token_expires_at, last_refreshed_at      │
│     f. audit: credential.refreshed                     │
│     g. Se refresh fallisce:                            │
│        - 401 -> set revoked_at, audit credential.revoked│
│        - 429 -> retry backoff (1s, 5s, 15s)           │
│        - 5xx -> retry 3x, poi set broken_at           │
│        - Network -> retry 3x, poi set broken_at       │
│        - audit: credential.refresh_failed (con motivo) │
│                                                        │
│  4. REVOKE (utente o admin)                            │
│     a. POST /revoke al provider (best-effort)          │
│     b. Set revoked_at, revoke_reason, hard_delete_at   │
│     c. audit: credential.revoked                       │
│     d. Dopo 30gg: cron hard delete + audit             │
│                                                        │
└───────────────────────────────────────────────────────┘
```

**Proactive Refresh:**

```typescript
const REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minuti

function shouldRefresh(expiresAt: Date): boolean {
  return expiresAt.getTime() - Date.now() < REFRESH_BUFFER_MS;
}
```

**Error Handling per refresh:**

| Errore | Azione | Notifica |
|--------|--------|----------|
| 401 Unauthorized | Token revocato dal provider -> set `revoked_at` | Email utente: "Riconnetti integrazione X" |
| 400 Bad Request | Refresh token invalido -> set `revoked_at` | Email utente |
| 429 Rate Limited | Retry con backoff (1s, 5s, 15s) | Log interno |
| 5xx Server Error | Retry 3x con backoff. Se persiste: set `broken_at` | Alert ops |
| Network Error | Retry 3x. Se persiste: set `broken_at` | Alert ops |

---

## 6. Threat Model

### 6.1 Threat Matrix

| # | Threat | Vettore | Impatto | Mitigazione | Rischio Residuo |
|---|--------|---------|---------|-------------|-----------------|
| T1 | **Stolen Access Token** | DB dump, log leak, memory dump | Accesso al provider esterno come l'utente | Envelope encryption (DEK+KEK), RLS isolamento, token TTL breve (1h), zero token logging | Basso: serve KEK + DEK + DB access |
| T2 | **Stolen Refresh Token** | DB dump + KEK compromise | Accesso persistente al provider | Stesse mitigazioni di T1 + refresh token rotation (se provider lo supporta) | Basso |
| T3 | **Replay Attack (webhook)** | Intercettazione e re-invio webhook | Azione duplicata (es. doppio import) | Timestamp check (5min drift), idempotency key con dedup DB, HTTPS-only | Molto basso |
| T4 | **Code Interception (OAuth)** | Man-in-the-middle sul redirect | Ottenere access token | PKCE S256: code_verifier mai trasmesso, code inutile senza verifier | Molto basso |
| T5 | **CSRF su OAuth authorize** | Attaccante fa partire un flow OAuth con il proprio account | Collegare account attaccante all'utente | `state` parameter random (256 bit), verificato server-side con timingSafeEqual | Molto basso |
| T6 | **Open Redirect** | Redirect URI manipolato | Redirect a sito malevolo con code | Whitelist statica di redirect URI, confronto esatto, no wildcard | Molto basso |
| T7 | **KEK Compromise** | Accesso a Vercel env vars, insider threat | Decrittare tutte le DEK -> tutti i token | Accesso env vars limitato a admin, key rotation procedure con envelope (zero downtime), audit log | Medio (rischio insider) |
| T8 | **Webhook Forgery** | Attaccante invia webhook falsi | Trigger azioni non autorizzate | HMAC-SHA256 verification, secret per provider, timestamp validation | Molto basso |
| T9 | **Token Logging** | Token in log applicativi | Esposizione credenziali | Mai loggare token (solo primi 8 char), PII redaction enforced | Basso |
| T10 | **DB SQL Injection** | Input non sanitizzato | Accesso a integration_credentials | RLS (limita a user_id), parameterized queries (Supabase SDK), sanitization middleware | Molto basso |
| T11 | **Scope Escalation** | Utente richiede scope non autorizzati | Accesso eccessivo al provider | Scope whitelist per provider, blocked scopes enforced server-side, scope validation prima dell'authorize | Molto basso |
| T12 | **Credential Exfiltration via Provider** | Provider compromesso, invia dati a terzi | Esposizione dati utente tramite il provider | Scope minimo (least privilege), monitoring last_used_at, revoca rapida | Basso |
| T13 | **Nonce Reuse (IV)** | Bug che riutilizza IV con stessa key | Compromissione della confidenzialita GCM | IV generato con crypto.randomBytes() (CSPRNG) per ogni operazione. Con 12 byte IV e DEK unica per riga, la probabilita di collisione e trascurabile | Molto basso |

### 6.2 Risk Matrix

```
IMPATTO
  ^
  |     [T7]
  |
  |     [T1,T2]     [T12]
  |
  |     [T9]  [T3]  [T11]
  |
  |     [T13] [T4,T5,T6] [T8,T10]
  |
  +──────────────────────────> PROBABILITA
      Molto     Bassa    Media
      bassa
```

### 6.3 Defense in Depth (4 Layer)

```
Layer 1: NETWORK
  - HTTPS/TLS 1.3 obbligatorio (gia attivo)
  - HSTS header con max-age (gia attivo in next.config.ts)
  - CSP header restrittivo (gia attivo)
  - Certificate pinning per provider critici (futuro)

Layer 2: APPLICATION
  - PKCE S256 (previene code interception)
  - State parameter 256 bit (previene CSRF)
  - Redirect URI whitelist esatta (previene open redirect)
  - Scope whitelist + blocked scopes (previene escalation)
  - HMAC-SHA256 webhook signatures (previene forgery)
  - Timestamp replay protection (finestra 5 min)
  - Idempotency keys (previene duplicazione)
  - Rate limiting dedicato per OAuth (previene brute force)
  - timingSafeEqual per tutti i confronti di secret

Layer 3: DATA
  - Envelope encryption: DEK + KEK (AES-256-GCM)
  - IV casuale per ogni operazione (CSPRNG)
  - RLS per-user isolation (Supabase policy)
  - Token TTL brevi + proactive refresh (riduce finestra compromissione)
  - Zero token logging (solo primi 8 char per correlazione)
  - Soft delete + hard delete con GDPR TTL

Layer 4: OPERATIONS
  - Envelope key rotation (zero downtime)
  - Emergency kill switch (per user/provider/global)
  - Audit log completo di tutte le operazioni credential
  - GDPR cleanup cron (broken 7gg -> revoke, revoked 30gg -> hard delete)
  - Alerting via Telegram per kill switch
  - Monitoring: credenziali broken, refresh failure rate, revocation spike
```

---

## 7. Implementazione Step-by-Step

### Fase 1: Credential Vault con Envelope Encryption (4 giorni)

| # | Task | File | Effort |
|---|------|------|--------|
| 1.1 | Implementare `lib/credential-vault.ts` con envelope encryption | Nuovo | 1 giorno |
| 1.2 | Migration DB: `integration_credentials`, `credential_vault_keys`, `integration_webhook_secrets`, `webhook_idempotency` + RLS | `supabase/migrations/030_integration_credentials.sql` | 0.5 giorni |
| 1.3 | Unit test: encrypt/decrypt, envelope, reEncryptDek, edge cases | `tests/unit/credential-vault.test.ts` | 0.5 giorni |
| 1.4 | Key rotation script | `scripts/rotate-vault-key.ts` | 1 giorno |
| 1.5 | Env var `CREDENTIAL_VAULT_KEY` su Vercel + docs | Config + CLAUDE.md | 0.5 giorni |
| 1.6 | Cron endpoint credential cleanup | `app/api/platform/cron/credential-cleanup/route.ts` | 0.5 giorni |

### Fase 2: OAuth 2.0 + PKCE (5 giorni)

| # | Task | File | Effort |
|---|------|------|--------|
| 2.1 | `lib/oauth/pkce.ts` — generazione code_verifier/challenge/state | Nuovo | 0.5 giorni |
| 2.2 | `lib/oauth/providers.ts` — registry provider + scope validation | Nuovo | 0.5 giorni |
| 2.3 | `app/api/integrations/authorize/route.ts` | Nuovo | 1 giorno |
| 2.4 | `app/api/integrations/callback/route.ts` | Nuovo | 1 giorno |
| 2.5 | `app/api/integrations/token/route.ts` (token proxy + refresh) | Nuovo | 1 giorno |
| 2.6 | `app/api/integrations/revoke/route.ts` | Nuovo | 0.5 giorni |
| 2.7 | Integration test E2E (mock OAuth provider) | `tests/integration/oauth-flow.test.ts` | 0.5 giorni |

### Fase 3: Webhook Verification + Idempotency (2.5 giorni)

| # | Task | File | Effort |
|---|------|------|--------|
| 3.1 | `lib/middleware/webhook-verify.ts` | Nuovo | 0.5 giorni |
| 3.2 | `lib/middleware/webhook-idempotency.ts` | Nuovo | 0.5 giorni |
| 3.3 | `app/api/webhooks/[provider]/route.ts` | Nuovo | 0.5 giorni |
| 3.4 | Unit test webhook verify + idempotency | `tests/unit/webhook-verify.test.ts` | 0.5 giorni |
| 3.5 | Aggiungere rate limits OAuth + webhooks a `RATE_LIMITS` | `lib/middleware/rate-limit.ts` | 0.5 giorni |

### Fase 4: Security Controls (2.5 giorni)

| # | Task | File | Effort |
|---|------|------|--------|
| 4.1 | Emergency revoke endpoint + kill switch | `app/api/integrations/emergency-revoke/route.ts` | 1 giorno |
| 4.2 | Estendere `AuditEventType` con credential events | `lib/middleware/audit-log.ts` | 0.5 giorni |
| 4.3 | Aggiornare audit-log.ts con nuovi event types + credential logging rules | `lib/middleware/audit-log.ts` | 0.5 giorni |
| 4.4 | Monitoring: broken credentials alert, revocation spike | `scripts/credential-health-check.ts` | 0.5 giorni |

### Fase 5: UI Integrazioni (3 giorni)

| # | Task | File | Effort |
|---|------|------|--------|
| 5.1 | Pagina `/settings/integrations` | Nuovo | 1.5 giorni |
| 5.2 | Componente `IntegrationCard.tsx` (connect/disconnect/status) | Nuovo | 0.5 giorni |
| 5.3 | Stato connessione + disconnect flow + error states | Vari | 1 giorno |

**Totale stimato: ~17 giorni di sviluppo**

### Dipendenze tra fasi

```
Fase 1 (Vault)  ─────> Fase 2 (OAuth)  ─────> Fase 5 (UI)
                  │
                  └───> Fase 3 (Webhook)
                  │
                  └───> Fase 4 (Controls)
```

Fase 1 e prerequisito per tutte le altre. Fasi 2, 3, 4 possono procedere in parallelo dopo Fase 1. Fase 5 richiede Fase 2.

---

## 8. Decision Log

| # | Decisione | Alternative considerate | Motivazione scelta |
|---|-----------|-------------------------|-------------------|
| D1 | **Envelope encryption** (DEK + KEK) per credential vault | Direct encryption (singola key), pgcrypto, HashiCorp Vault, AWS KMS | Envelope consente key rotation senza ri-crittare tutti i token. Zero downtime durante rotation. pgcrypto richiede key nel DB (meno sicuro). HashiCorp/KMS aggiungono complessita infrastrutturale non giustificata per la scala attuale. |
| D2 | **Column-level encryption** (non full-disk) | Supabase TDE (Transparent Data Encryption) | Column-level protegge anche da dump DB e query SELECT non autorizzate. TDE protegge solo da accesso ai dischi fisici. |
| D3 | **PKCE S256** (non plain) | PKCE plain, no PKCE | S256 e obbligatorio per security (RFC 7636). `plain` e deprecato. Senza PKCE, code interception attack e possibile su client pubblici. |
| D4 | **Server-side PKCE generation** (non client-side) | Client genera code_verifier | Il code_verifier nel cookie httpOnly non e mai esposto al JavaScript del browser. Riduce la superficie di attacco XSS. |
| D5 | **Webhook timestamp check 5 minuti** | 30 secondi (Stripe default), 10 minuti | 5 minuti bilancia tra sicurezza (finestra replay stretta) e operativita (clock skew, network delay, retry queue). Stripe e Svix usano 5 min come default. |
| D6 | **`timingSafeEqual`** per tutti i confronti di secret | Confronto diretto con `===` | `===` e vulnerabile a timing attack: l'attaccante puo scoprire la firma byte per byte misurando i tempi di risposta. `timingSafeEqual` ha tempo costante. |
| D7 | **Token refresh proattivo** (5 min buffer) | Refresh solo su 401 | Proattivo evita errori visibili all'utente. Refresh su 401 causa un fallimento prima del retry che l'utente percepisce come errore. |
| D8 | **Idempotency con DB** (non Redis) | Redis SETNX, in-memory Map | DB e piu affidabile per dedup su webhook (persistente, condiviso tra istanze Vercel). Redis sarebbe piu veloce ma aggiunge una dipendenza. In-memory non funziona su serverless (istanze multiple). |
| D9 | **Scope whitelist + blocklist** | Solo whitelist, nessuna validazione | La blocklist aggiunge protezione contro scope pericolosi che non dovrebbero mai essere richiesti (es. admin directory). La whitelist previene scope sconosciuti. Entrambe insieme = defense in depth. |
| D10 | **GDPR TTL 30 giorni post-revoca** | 7 giorni, 90 giorni, nessun TTL | 30 giorni e un compromesso: abbastanza lungo per investigazione in caso di breach, abbastanza corto per compliance GDPR Art. 5(1)(e). Allineato con il TTL di Anthropic per API logs. |

---

## Appendice A: Env Vars Richieste

```env
# Credential Vault — Envelope Encryption
CREDENTIAL_VAULT_KEY=...          # 64 hex chars (256 bit), generare con:
                                  # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
CREDENTIAL_VAULT_KEY_PREV=...     # Solo durante key rotation — vecchia chiave

# OAuth Provider Credentials (per ogni provider supportato)
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
HUBSPOT_OAUTH_CLIENT_ID=...
HUBSPOT_OAUTH_CLIENT_SECRET=...
MICROSOFT_OAUTH_CLIENT_ID=...
MICROSOFT_OAUTH_CLIENT_SECRET=...

# Webhook Secrets (per webhook globali)
GITHUB_WEBHOOK_SECRET=...
HUBSPOT_WEBHOOK_SECRET=...
```

## Appendice B: Checklist Pre-Implementazione

```
Credential Vault:
  [ ] CREDENTIAL_VAULT_KEY generata e salvata in password manager
  [ ] CREDENTIAL_VAULT_KEY configurata su Vercel (production + preview)
  [ ] Migration 030 eseguita su Supabase
  [ ] Unit test credential-vault passano
  [ ] Key rotation script testato in staging

OAuth 2.0 + PKCE:
  [ ] Client ID/Secret registrati presso ogni provider
  [ ] Redirect URI registrate presso ogni provider (esatta)
  [ ] Scope richiesti documentati e approvati
  [ ] Rate limits OAuth aggiunti a RATE_LIMITS
  [ ] CSRF/state verificato in callback

Webhook:
  [ ] Webhook secret configurato per ogni provider
  [ ] Idempotency table creata (migration)
  [ ] Cron cleanup idempotency keys attivo
  [ ] Test con webhook reali di ogni provider

Security Controls:
  [ ] Audit log event types estesi
  [ ] Cron credential cleanup configurato (Vercel Cron)
  [ ] Emergency revoke endpoint testato
  [ ] Kill switch documentato in runbook ops
  [ ] Monitoring: broken credentials, refresh failures
```

## Appendice C: References

- [RFC 7636 — PKCE](https://tools.ietf.org/html/rfc7636)
- [RFC 9700 — OAuth 2.0 Security Best Current Practice](https://tools.ietf.org/html/rfc9700)
- [RFC 6749 — OAuth 2.0 Authorization Framework](https://tools.ietf.org/html/rfc6749)
- [NIST SP 800-38D — GCM Mode](https://csrc.nist.gov/publications/detail/sp/800-38d/final)
- [OWASP — OAuth 2.0 Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html)
- GDPR Art. 5(1)(e), Art. 17, Art. 25, Art. 32

---

> **Prossimi passi:** Implementazione Fase 1 (Credential Vault con envelope encryption) come primo deliverable. Fasi 2 (OAuth+PKCE) e 3 (Webhook) possono procedere in parallelo dopo Fase 1. Fase 4 (Security Controls) complementa le tre fasi principali.

---

### Change Log

| Data | Autore | Modifica |
|------|--------|----------|
| 2026-03-10 | security-auditor | v1.0 -- design iniziale |
| 2026-03-10 | security-auditor | v2.0 -- aggiunto: envelope encryption con DEK/KEK per key rotation senza re-encryption dei token; scope management per connector type con whitelist+blocklist; security controls completi (rate limiting OAuth, audit logging credential operations, GDPR TTL cleanup cron, emergency revocation kill switch); idempotency keys per webhook retry handling con dedup DB; per-connector webhook secret management (env var + DB per-user); threat model esteso (T11 scope escalation, T12 credential exfiltration, T13 nonce reuse); defense in depth 4-layer; appendici env vars, checklist, references |
