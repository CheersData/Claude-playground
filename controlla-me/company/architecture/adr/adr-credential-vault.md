# ADR: Credential Vault con Encryption at Rest

**Status:** Proposed
**Date:** 2026-03-10
**Author:** Architecture Department
**Deciders:** CME, Architecture, Security
**Task:** f9c369b8

---

## Context

Con l'introduzione dell'Ufficio Integrazione (vedi ADR integration-framework), il sistema dovra gestire credenziali di terze parti: OAuth2 access/refresh token, API key, Basic Auth credentials. Oggi le credenziali sono gestite come variabili d'ambiente (`.env.local`), un modello che non scala:

| Aspetto | Env vars (oggi) | Vault (proposto) |
|---------|-----------------|------------------|
| N credenziali | ~15 (API key provider AI) | N * utenti * integrazioni |
| Chi le gestisce | Sviluppatore (deploy-time) | Utente (runtime) |
| Rotazione | Manuale, richiede redeploy | Automatica (refresh token) |
| Per-utente | No (globali per l'app) | Si (isolate per utente) |
| Encryption | No (plaintext in env) | Si (AES-256-GCM at rest) |
| Audit | No | Si (chi ha accesso, quando) |

### Requisiti

1. **Encryption at rest** — Le credenziali devono essere cifrate nel database. Un dump del DB non espone token in chiaro.
2. **Isolamento per utente** — L'utente A non puo accedere ai token dell'utente B. RLS Supabase.
3. **Refresh automatico** — I token OAuth2 scadono (tipicamente 1h). Il vault deve gestire il refresh trasparente.
4. **Rotazione** — API key e token compromessi devono poter essere revocati e rigenerati.
5. **Audit log** — Chi ha accesso alle credenziali e quando (requisito EU AI Act + GDPR).
6. **Costo zero infrastruttura** — Nessun servizio esterno (no HashiCorp Vault, no AWS Secrets Manager). Supabase gia in uso.

### Vincoli

- **Stesso localhost** — Il vault gira sulla stessa infrastruttura dell'app Next.js + Supabase.
- **No servizi esterni** — Principio cost-aware: Supabase gia pagato, non aggiungere un secret manager a pagamento.
- **GDPR** — I token OAuth2 di utenti EU sono dati personali (consentono l'accesso ai loro sistemi). Serve base giuridica e cifratura.

---

## Decision

Implementare un credential vault su Supabase con encryption AES-256-GCM lato applicazione, RLS per isolamento, e refresh automatico.

### Architettura

```
┌─────────────────────────────────────────────────────────┐
│                      Next.js App                         │
│                                                          │
│  lib/staff/data-connector/auth/token-store.ts            │
│  ├── encrypt(plaintext, masterKey) → ciphertext          │
│  ├── decrypt(ciphertext, masterKey) → plaintext          │
│  ├── storeCredential(userId, integrationId, creds)       │
│  ├── getCredential(userId, integrationId) → decrypted    │
│  ├── rotateCredential(userId, integrationId, newCreds)   │
│  └── revokeCredential(userId, integrationId)             │
│                                                          │
│  VAULT_MASTER_KEY (env var, 256-bit)                     │
│  ├── Usata per AES-256-GCM encrypt/decrypt               │
│  └── Mai salvata nel DB, solo in memoria del processo     │
└──────────────┬──────────────────────────────────────────┘
               │ Supabase client (service_role per admin,
               │ anon per RLS-protected queries)
               ▼
┌─────────────────────────────────────────────────────────┐
│                    Supabase (PostgreSQL)                  │
│                                                          │
│  integration_credentials                                 │
│  ├── id              uuid PK                             │
│  ├── user_id         uuid FK → profiles.id NOT NULL      │
│  ├── integration_id  text NOT NULL                       │
│  ├── credential_type text NOT NULL (oauth2|apikey|basic) │
│  ├── encrypted_data  text NOT NULL (AES-256-GCM base64)  │
│  ├── iv              text NOT NULL (base64, 12 bytes)    │
│  ├── auth_tag        text NOT NULL (base64, 16 bytes)    │
│  ├── metadata        jsonb DEFAULT '{}'                  │
│  │   ├── provider       text (google|microsoft|hubspot)  │
│  │   ├── scopes         text[] (scope OAuth2 concessi)   │
│  │   ├── expires_at     timestamptz (scadenza token)     │
│  │   └── last_refreshed timestamptz                      │
│  ├── created_at      timestamptz DEFAULT now()           │
│  ├── updated_at      timestamptz DEFAULT now()           │
│  └── revoked_at      timestamptz NULL                    │
│                                                          │
│  RLS Policy:                                             │
│  ├── SELECT: user_id = auth.uid()                        │
│  ├── INSERT: user_id = auth.uid()                        │
│  ├── UPDATE: user_id = auth.uid()                        │
│  └── DELETE: user_id = auth.uid()                        │
│                                                          │
│  Unique constraint: (user_id, integration_id)            │
│  Index: btree on (user_id, credential_type)              │
│                                                          │
│  integration_credential_audit                            │
│  ├── id              uuid PK                             │
│  ├── credential_id   uuid FK → integration_credentials   │
│  ├── action          text (created|accessed|refreshed|   │
│  │                         rotated|revoked)              │
│  ├── actor_id        uuid (user o system)                │
│  ├── ip_address      inet                                │
│  ├── user_agent      text                                │
│  ├── metadata        jsonb                               │
│  └── created_at      timestamptz DEFAULT now()           │
│                                                          │
│  TTL: audit entries > 2 anni → delete (GDPR retention)   │
└─────────────────────────────────────────────────────────┘
```

### Encryption layer

```typescript
// lib/staff/data-connector/auth/token-store.ts

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;        // 96 bit, raccomandato per GCM
const AUTH_TAG_LENGTH = 16;  // 128 bit

/**
 * VAULT_MASTER_KEY: 256-bit key derivata da env var.
 * Generazione: openssl rand -base64 32
 * Storage: SOLO in variabile d'ambiente, MAI nel DB.
 *
 * Se la master key viene persa, tutte le credenziali cifrate sono irrecuperabili.
 * Backup della key in un password manager (1Password, Bitwarden).
 */
function getMasterKey(): Buffer {
  const keyB64 = process.env.VAULT_MASTER_KEY;
  if (!keyB64) {
    throw new Error(
      "VAULT_MASTER_KEY non configurata. " +
      "Generare con: openssl rand -base64 32"
    );
  }
  const key = Buffer.from(keyB64, "base64");
  if (key.length !== 32) {
    throw new Error(
      `VAULT_MASTER_KEY deve essere 256 bit (32 bytes), ricevuto: ${key.length} bytes`
    );
  }
  return key;
}

export interface EncryptedPayload {
  ciphertext: string;  // base64
  iv: string;          // base64
  authTag: string;     // base64
}

export function encrypt(plaintext: string): EncryptedPayload {
  const key = getMasterKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted,
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

export function decrypt(payload: EncryptedPayload): string {
  const key = getMasterKey();
  const iv = Buffer.from(payload.iv, "base64");
  const authTag = Buffer.from(payload.authTag, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(payload.ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
```

### Credential CRUD

```typescript
// lib/staff/data-connector/auth/token-store.ts (continua)

import { createAdminClient } from "@/lib/supabase/admin";

export interface StoredCredential {
  id: string;
  integrationId: string;
  credentialType: "oauth2" | "apikey" | "basic";
  metadata: {
    provider?: string;
    scopes?: string[];
    expiresAt?: string;
    lastRefreshed?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface OAuth2Tokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  scope: string;
}

export interface ApiKeyCredential {
  apiKey: string;
  headerName?: string;  // default "Authorization", oppure "X-API-Key", etc.
}

export interface BasicCredential {
  username: string;
  password: string;
}

type CredentialData = OAuth2Tokens | ApiKeyCredential | BasicCredential;

/**
 * Salva credenziali cifrate nel vault.
 * Usa service_role per bypassare RLS (server-side only).
 */
export async function storeCredential(
  userId: string,
  integrationId: string,
  credentialType: "oauth2" | "apikey" | "basic",
  data: CredentialData,
  metadata?: Record<string, unknown>
): Promise<string> {
  const admin = createAdminClient();
  const encrypted = encrypt(JSON.stringify(data));

  const { data: row, error } = await admin
    .from("integration_credentials")
    .upsert({
      user_id: userId,
      integration_id: integrationId,
      credential_type: credentialType,
      encrypted_data: encrypted.ciphertext,
      iv: encrypted.iv,
      auth_tag: encrypted.authTag,
      metadata: {
        ...metadata,
        ...(credentialType === "oauth2" ? {
          expires_at: new Date(
            Date.now() + (data as OAuth2Tokens).expiresIn * 1000
          ).toISOString(),
        } : {}),
      },
      updated_at: new Date().toISOString(),
    }, {
      onConflict: "user_id,integration_id",
    })
    .select("id")
    .single();

  if (error) throw new Error(`[VAULT] storeCredential failed: ${error.message}`);

  // Audit log
  await logAudit(row.id, "created", userId);

  return row.id;
}

/**
 * Recupera e decifra credenziali dal vault.
 */
export async function getCredential<T extends CredentialData>(
  userId: string,
  integrationId: string
): Promise<{ credential: T; metadata: StoredCredential["metadata"] } | null> {
  const admin = createAdminClient();

  const { data: row, error } = await admin
    .from("integration_credentials")
    .select("*")
    .eq("user_id", userId)
    .eq("integration_id", integrationId)
    .is("revoked_at", null)
    .maybeSingle();

  if (error || !row) return null;

  const decrypted = decrypt({
    ciphertext: row.encrypted_data,
    iv: row.iv,
    authTag: row.auth_tag,
  });

  // Audit log
  await logAudit(row.id, "accessed", userId);

  return {
    credential: JSON.parse(decrypted) as T,
    metadata: row.metadata,
  };
}

/**
 * Revoca una credenziale (soft delete).
 * Il record resta per audit, ma non e piu recuperabile.
 */
export async function revokeCredential(
  userId: string,
  integrationId: string
): Promise<void> {
  const admin = createAdminClient();

  const { data: row } = await admin
    .from("integration_credentials")
    .update({
      revoked_at: new Date().toISOString(),
      // Sovrascriviamo i dati cifrati con placeholder per sicurezza
      encrypted_data: "REVOKED",
      iv: "REVOKED",
      auth_tag: "REVOKED",
    })
    .eq("user_id", userId)
    .eq("integration_id", integrationId)
    .select("id")
    .maybeSingle();

  if (row) {
    await logAudit(row.id, "revoked", userId);
  }
}
```

### OAuth2 refresh automatico

```typescript
// lib/staff/data-connector/auth/oauth2-handler.ts

import {
  getCredential,
  storeCredential,
  type OAuth2Tokens,
} from "./token-store";

export class OAuth2Handler {
  constructor(
    private userId: string,
    private integrationId: string,
    private config: {
      tokenEndpoint: string;
      clientId: string;
      clientSecret: string;  // Riferimento vault, non plaintext
    }
  ) {}

  /**
   * Ottieni un access token valido. Se scaduto, esegui refresh automatico.
   */
  async getValidToken(): Promise<string> {
    const stored = await getCredential<OAuth2Tokens>(
      this.userId,
      this.integrationId
    );

    if (!stored) {
      throw new Error(
        `Nessuna credenziale OAuth2 per integrazione "${this.integrationId}". ` +
        `L'utente deve completare il flusso di autorizzazione.`
      );
    }

    const { credential, metadata } = stored;

    // Check scadenza (con margine di 5 minuti)
    const expiresAt = metadata.expiresAt
      ? new Date(metadata.expiresAt).getTime()
      : 0;
    const now = Date.now();
    const MARGIN_MS = 5 * 60 * 1000;

    if (expiresAt - now > MARGIN_MS) {
      // Token ancora valido
      return credential.accessToken;
    }

    // Token scaduto o in scadenza: refresh
    return this.refreshToken(credential.refreshToken);
  }

  /**
   * Esegue il refresh del token e aggiorna il vault.
   */
  private async refreshToken(refreshToken: string): Promise<string> {
    const response = await fetch(this.config.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `OAuth2 refresh failed (HTTP ${response.status}): ${text.slice(0, 200)}`
      );
    }

    const tokens = (await response.json()) as OAuth2Tokens;

    // Salva i nuovi token nel vault
    await storeCredential(
      this.userId,
      this.integrationId,
      "oauth2",
      {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? refreshToken, // Alcuni provider non restituiscono nuovo refresh token
        tokenType: tokens.tokenType,
        expiresIn: tokens.expiresIn,
        scope: tokens.scope,
      },
      { lastRefreshed: new Date().toISOString() }
    );

    return tokens.accessToken;
  }

  /**
   * Genera l'URL di autorizzazione per il flusso OAuth2+PKCE.
   */
  generateAuthUrl(params: {
    redirectUri: string;
    scopes: string[];
    state: string;
    codeVerifier: string;
  }): string {
    // PKCE: genera code_challenge da code_verifier
    const codeChallenge = this.generateCodeChallenge(params.codeVerifier);

    const url = new URL(this.config.tokenEndpoint.replace("/token", "/authorize"));
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", params.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", params.scopes.join(" "));
    url.searchParams.set("state", params.state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");

    return url.toString();
  }

  private generateCodeChallenge(verifier: string): string {
    const { createHash } = require("crypto");
    return createHash("sha256")
      .update(verifier)
      .digest("base64url");
  }
}
```

### Rotation strategy

```
┌───────────────────────────────────────────────────┐
│                 Rotation Policy                    │
│                                                    │
│  OAuth2 tokens:                                    │
│  ├── Access token: auto-refresh su scadenza        │
│  │   (tipicamente ogni 1h, gestito da              │
│  │    OAuth2Handler.getValidToken())               │
│  ├── Refresh token: rotazione automatica           │
│  │   (se il provider lo restituisce nel refresh)   │
│  └── Compromissione: revokeCredential() +          │
│      utente ri-autorizza manualmente               │
│                                                    │
│  API key:                                          │
│  ├── No scadenza automatica (dipende dal provider) │
│  ├── Rotazione manuale: l'utente genera nuova key  │
│  │   sul provider e la aggiorna nel vault           │
│  └── Reminder: notifica dopo 90 giorni senza       │
│      rotazione (metadata.created_at + 90gg)        │
│                                                    │
│  Basic Auth:                                       │
│  ├── Rotazione manuale su richiesta utente          │
│  └── Sconsigliata per nuove integrazioni           │
│      (preferire OAuth2 o API key)                   │
│                                                    │
│  Master key (VAULT_MASTER_KEY):                    │
│  ├── Rotazione MANUALE con re-encryption           │
│  │   1. Generare nuova key                          │
│  │   2. Script: decrypt con vecchia, encrypt con    │
│  │      nuova, update DB                            │
│  │   3. Aggiornare env var                          │
│  │   4. Redeploy                                    │
│  ├── Frequenza raccomandata: ogni 6 mesi           │
│  └── Script: scripts/rotate-vault-key.ts           │
└───────────────────────────────────────────────────┘
```

### Audit logging

```typescript
// lib/staff/data-connector/auth/token-store.ts (audit)

type AuditAction = "created" | "accessed" | "refreshed" | "rotated" | "revoked";

async function logAudit(
  credentialId: string,
  action: AuditAction,
  actorId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("integration_credential_audit").insert({
      credential_id: credentialId,
      action,
      actor_id: actorId,
      metadata: metadata ?? {},
    });
  } catch (err) {
    // Audit failure non deve bloccare l'operazione
    console.error(
      `[VAULT-AUDIT] Failed to log ${action}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
```

### Migration SQL

```sql
-- supabase/migrations/030_credential_vault.sql

-- Tabella credenziali cifrate
CREATE TABLE IF NOT EXISTS public.integration_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  integration_id text NOT NULL,
  credential_type text NOT NULL CHECK (credential_type IN ('oauth2', 'apikey', 'basic')),
  encrypted_data text NOT NULL,
  iv text NOT NULL,
  auth_tag text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  revoked_at timestamptz NULL,
  UNIQUE(user_id, integration_id)
);

-- RLS: ogni utente vede solo le proprie credenziali
ALTER TABLE integration_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own credentials"
  ON integration_credentials
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Index per lookup veloce
CREATE INDEX idx_credentials_user_type
  ON integration_credentials (user_id, credential_type)
  WHERE revoked_at IS NULL;

-- Audit log
CREATE TABLE IF NOT EXISTS public.integration_credential_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id uuid NOT NULL REFERENCES integration_credentials(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('created', 'accessed', 'refreshed', 'rotated', 'revoked')),
  actor_id uuid NOT NULL,
  ip_address inet,
  user_agent text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- RLS: audit leggibile solo dal proprietario della credenziale
ALTER TABLE integration_credential_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own credential audit"
  ON integration_credential_audit
  FOR SELECT
  USING (
    credential_id IN (
      SELECT id FROM integration_credentials WHERE user_id = auth.uid()
    )
  );

-- Insert audit: solo service_role (server-side)
CREATE POLICY "Service role can insert audit"
  ON integration_credential_audit
  FOR INSERT
  WITH CHECK (true);  -- service_role bypassa RLS, ma policy richiesta

-- TTL: pulizia audit > 2 anni (GDPR retention period)
-- Eseguire periodicamente via cron o Edge Function:
-- DELETE FROM integration_credential_audit
-- WHERE created_at < NOW() - INTERVAL '2 years';
```

### Nuova env var

```env
# Vault encryption key (256-bit, base64)
# Generare con: openssl rand -base64 32
# CRITICA: se persa, tutte le credenziali cifrate sono irrecuperabili.
# Backup in password manager (1Password, Bitwarden).
VAULT_MASTER_KEY=...
```

---

## Alternatives Considered

### 1. Supabase Vault (pg_sodium)

**Pro:** Encryption nativa PostgreSQL, zero codice applicativo. Supabase supporta `vault.create_secret()` e `vault.decrypted_secrets`.
**Contro:** Supabase Vault e in beta (2025). La master key e gestita da Supabase (non da noi). Limitato a chiavi, non supporta strutture complesse (OAuth2 tokens con refresh). Non disponibile su tutti i piani Supabase. Lock-in su Supabase.
**Decisione:** Scartato per ora. Rivalutare quando Vault sara GA e supportera strutture custom. Il nostro layer AES-256-GCM e portabile.

### 2. HashiCorp Vault / AWS Secrets Manager

**Pro:** Enterprise-grade, rotazione automatica, audit integrato, certificato SOC2.
**Contro:** Costo aggiuntivo (~$0.40/secret/mese su AWS, oppure server Vault self-hosted). Complessita operativa (altro servizio da gestire). Viola il principio "stesso localhost". Overkill per < 1000 credenziali.
**Decisione:** Scartato. Da riconsiderare se il numero di integrazioni supera 10.000 o se servono certificazioni enterprise.

### 3. Encryption solo nel DB (pgcrypto)

**Pro:** Zero codice applicativo, `pgp_sym_encrypt()` nativo.
**Contro:** La passphrase di cifratura deve essere passata in ogni query SQL, esponendola nei log di Supabase. Non supporta GCM (solo CBC). Non portabile fuori PostgreSQL. Key management piu complesso.
**Decisione:** Scartato. L'encryption applicativa (Node.js crypto) e piu sicura e portabile.

### 4. Nessuna encryption (plaintext nel DB con RLS)

**Pro:** Semplicissimo.
**Contro:** Un dump del DB (backup, leak, SQL injection) espone tutti i token in chiaro. Violazione GDPR art. 32 (misure tecniche di protezione). Inaccettabile per credenziali di terze parti.
**Decisione:** Scartato. L'encryption at rest e un requisito minimo.

---

## Consequences

### Positive

- **Encryption at rest** — AES-256-GCM, lo standard gold per cifratura simmetrica. Un dump del DB mostra solo ciphertext.
- **RLS isolamento** — Ogni utente accede solo alle proprie credenziali. `service_role` per operazioni server-side (refresh, pipeline).
- **Audit completo** — Ogni accesso, refresh, revoca e loggato con timestamp e attore.
- **Refresh trasparente** — `OAuth2Handler.getValidToken()` gestisce il refresh senza intervento utente.
- **Zero servizi aggiuntivi** — Supabase + Node.js crypto. Nessun costo incrementale.
- **Portabile** — L'encryption layer usa solo `crypto` standard di Node.js. Funziona su qualsiasi hosting.

### Negative

- **Single point of failure: VAULT_MASTER_KEY** — Se persa, tutte le credenziali sono irrecuperabili. Mitigazione: backup in password manager + documentazione.
- **Key rotation manuale** — La rotazione della master key richiede uno script di re-encryption + redeploy. Mitigazione: script `rotate-vault-key.ts` pronto.
- **Performance** — Ogni accesso alle credenziali richiede decrypt (AES-256-GCM su ~1KB: <1ms). Non significativo.
- **Complessita operativa** — Nuova env var (`VAULT_MASTER_KEY`) da gestire su Vercel + locale. Un env var in piu non e un problema reale.
- **GDPR DPA** — Le credenziali di utenti EU richiedono un Data Processing Agreement con il provider che ospita Supabase (AWS eu-central-1). Gia necessario per `profiles` e `analyses`, non un costo aggiuntivo.

### Security Considerations

| Vettore di attacco | Mitigazione |
|---------------------|------------|
| SQL injection → dump DB | Credenziali cifrate, inutili senza VAULT_MASTER_KEY |
| Accesso env vars Vercel | Vercel cifra env vars at rest + accesso limitato a team members |
| Compromissione service_role key | Serve anche VAULT_MASTER_KEY per decifrare. Due chiavi separate. |
| Brute force su AES-256-GCM | 2^256 combinazioni. Non fattibile. |
| Timing attack su decrypt | AES-256-GCM usa constant-time comparison per auth tag. Node.js crypto e safe. |
| Token OAuth2 leakato in log | Il vault non logga MAI il contenuto decifrato. Solo ID e azioni. |

### Effort Estimate

| Componente | Effort |
|-----------|--------|
| `token-store.ts` (encrypt/decrypt/CRUD) | 1 giorno |
| `oauth2-handler.ts` (refresh flow + PKCE) | 1 giorno |
| Migration SQL | 0.5 giorni |
| `rotate-vault-key.ts` script | 0.5 giorni |
| Test (encrypt/decrypt, CRUD, refresh mock) | 1 giorno |
| Documentazione + runbook operativo | 0.5 giorni |

**Totale: ~4.5 giorni**

---

## References

- `lib/supabase/admin.ts` — Admin client (service_role)
- `lib/middleware/console-token.ts` — Pattern HMAC-SHA256 gia usato nel progetto
- ADR integration-framework (companion) — AuthConfig e AuthenticatedBaseConnector
- NIST SP 800-38D — Recommendation for GCM Mode
- GDPR Art. 32 — Security of processing (encryption requirement)
- Supabase RLS documentation — Row Level Security policies
