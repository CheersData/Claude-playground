# ADR: Integration Framework

**Data**: 2026-03-10
**Stato**: proposed
**Autore**: Architecture Department
**Deciders**: CME, Architecture, Data Engineering, Security
**Task**: f9c369b8

Questo documento contiene 3 ADR complementari che definiscono il framework di integrazione per connettori business.

---

## ADR-1: Refactor Data-Connector as Generic Connector Framework

### Contesto

Il data-connector attuale (`lib/staff/data-connector/`) implementa una pipeline CONNECT-MODEL-LOAD per fonti legislative e mediche pubbliche (Normattiva, EUR-Lex, StatPearls, Europe PMC). L'architettura e' gia semi-generica:

- **Plugin Registry** (`plugin-registry.ts`): registrazione dinamica di connector/model/store per ID, senza switch hardcoded. Pattern open/closed gia applicato.
- **BaseConnector** (`connectors/base.ts`): classe astratta con retry esponenziale (3 tentativi), rate limit (1s pause), User-Agent browser, text cleaning. 113 righe.
- **Interfacce generiche** (`types.ts`): `ConnectorInterface<T>`, `ModelInterface`, `StoreInterface<T>`, `PipelineOptions`, `PipelineResult` -- parametriche sul tipo di dato. Gia supporta 6 `DataType`.
- **Vertical Registry** (`scripts/corpus-sources.ts`): supporto multi-verticale via `registerVertical()`, usato per legal, hr, medical.
- **Sync Log** (`sync-log.ts`): tracciamento persistente di ogni run su `connector_sync_log`.
- **Connettori concreti**: NormattivaConnector (3 strategie fetch), EurLexConnector (SPARQL + Cellar), StatPearlsConnector, EuropePMCConnector, OpenStaxConnector -- tutti registrati come plugin.

**Gap per connettori business:**

1. Autenticazione -- oggi solo HTTP pubblico (nessuna auth, o API key in env var)
2. Connessioni bidirezionali -- oggi solo pull (CONNECT->LOAD), manca push/export
3. Rate limiting configurabile per provider -- oggi solo pause 1s generico
4. Webhook/event-driven -- oggi solo polling

### Decisione

**Refactoring incrementale del data-connector, non rewrite.** Le fondamenta sono solide. Estendere `BaseConnector` con autenticazione multi-strategia, aggiungere connettori business come plugin.

#### 1.1 Estensione di BaseConnector con AuthStrategy

```typescript
// lib/staff/data-connector/auth/types.ts

export type AuthStrategy =
  | { type: "none" }                                          // Attuale (fonti pubbliche)
  | { type: "api-key"; header: string; envVar: string }       // X-API-Key, Authorization: Bearer
  | { type: "basic"; envVarUser: string; envVarPass: string } // HTTP Basic Auth
  | { type: "oauth2-pkce"; config: OAuth2PKCEConfig }         // OAuth 2.0 + PKCE (user-facing)
  | { type: "oauth2-client"; config: OAuth2ClientConfig };    // OAuth 2.0 client_credentials (server-to-server)

export interface OAuth2PKCEConfig {
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;           // da env var o credential vault
  scopes: string[];
  redirectUri: string;        // callback URL dell'app
  credentialVaultKey: string; // chiave per token storage nel vault (vedi ADR-3)
}

export interface OAuth2ClientConfig {
  tokenUrl: string;
  clientIdEnvVar: string;
  clientSecretEnvVar: string;
  scopes: string[];
}
```

#### 1.2 AuthenticatedBaseConnector

```typescript
// connectors/base.ts -- nuova sottoclasse

export abstract class AuthenticatedBaseConnector<T = unknown>
  extends BaseConnector<T>
{
  protected authHandler: AuthHandler;

  constructor(source: DataSource, log: (msg: string) => void) {
    super(source, log);
    this.authHandler = createAuthHandler(source.auth ?? { type: "none" });
  }

  async authenticate(): Promise<void> {
    await this.authHandler.authenticate();
  }

  isAuthenticated(): boolean {
    return this.authHandler.isValid();
  }

  // Override fetchWithRetry per iniettare auth headers automaticamente
  protected async fetchWithRetry(
    url: string,
    options?: RequestInit,
    maxRetries = 3
  ): Promise<Response> {
    // Refresh token se scaduto (vedi ADR-3 per vault integration)
    if (!this.authHandler.isValid()) {
      await this.authHandler.refresh();
    }
    const authHeaders = await this.authHandler.getHeaders();
    const mergedOptions = {
      ...options,
      headers: { ...authHeaders, ...(options?.headers ?? {}) },
    };

    const response = await super.fetchWithRetry(url, mergedOptions, maxRetries);

    // Se 401, tenta refresh una volta e riprova
    if (response.status === 401) {
      this.log("[AUTH] Token scaduto, tentativo refresh...");
      const refreshed = await this.authHandler.refresh();
      if (refreshed) {
        const newHeaders = await this.authHandler.getHeaders();
        return super.fetchWithRetry(url, {
          ...options,
          headers: { ...newHeaders, ...(options?.headers ?? {}) },
        }, maxRetries);
      }
      throw new Error("OAuth token expired and refresh failed. User must re-authorize.");
    }

    return response;
  }
}
```

Zero impatto sui connettori esistenti: `BaseConnector` resta invariato, `AuthenticatedBaseConnector` e' una sottoclasse opzionale.

#### 1.3 Nuovi connettori business (come plugin)

Ciascuno e' un file in `lib/staff/data-connector/connectors/` registrato via `registerConnector()`:

| Connettore | AuthStrategy | Priorita | Note |
|-----------|-------------|----------|------|
| `salesforce` | `oauth2-pkce` | P1 | REST API v62, SOQL query, Bulk API per >10K record |
| `sap-b1` | `basic` / `oauth2-client` | P2 | SAP Business One Service Layer (OData REST) |
| `netsuite` | `oauth2-pkce` (Token-Based Auth) | P3 | SuiteTalk REST / RESTlet custom |
| `hubspot` | `oauth2-pkce` | P3 | CRM contacts, deals, companies |
| `quickbooks` | `oauth2-pkce` | P4 | Accounting API, Intuit OAuth2 |

Pattern identico ai connettori esistenti: estende `AuthenticatedBaseConnector`, implementa `connect()`, `fetchAll()`, `fetchDelta()`.

#### 1.4 Estensione DataSource

```typescript
// types.ts -- estensione (backward compatible, tutti i nuovi campi opzionali)

export type DataType =
  | "legal-articles"
  | "medical-articles"
  | "hr-articles"
  | "market-data"
  | "model-benchmark"
  | "feed-items"
  | "crm-records"        // NUOVO: Salesforce, HubSpot
  | "erp-records"        // NUOVO: SAP, NetSuite
  | "accounting-records"; // NUOVO: QuickBooks

export interface DataSource {
  // ... campi esistenti invariati ...
  auth?: AuthStrategy;               // NUOVO: default { type: "none" }
  direction?: "pull" | "push" | "bidirectional"; // NUOVO: default "pull"
  rateLimit?: {                      // NUOVO: override rate limit per provider
    requestsPerSecond?: number;
    requestsPerMinute?: number;
    concurrency?: number;
  };
  webhookConfig?: {                  // NUOVO: per fonti event-driven
    secretRef: string;               // Riferimento al vault per HMAC secret
    events: string[];                // Eventi sottoscritti
  };
}
```

#### 1.5 Cosa NON cambia

- `runPipeline()` in `index.ts` -- nessuna modifica al flusso, gia generica
- `plugin-registry.ts` -- nessuna modifica, gia supporta registrazioni dinamiche
- `sync-log.ts` -- nessuna modifica, traccia gia qualsiasi pipeline
- `registry.ts` -- nessuna modifica strutturale, supporta gia multi-verticale
- Connettori esistenti (normattiva, eurlex, statpearls, europepmc, openstax) -- invariati
- `validators/article-validator.ts` -- invariato
- `LegalArticleModel`, `LegalCorpusStore` -- invariati

#### 1.6 Directory structure aggiuntiva

```
lib/staff/data-connector/
  auth/                       # NUOVO
    types.ts                  # AuthStrategy, OAuth2PKCEConfig, OAuth2ClientConfig
    auth-handler.ts           # AuthHandler interface + createAuthHandler factory
    oauth2-handler.ts         # OAuth2+PKCE flow (authorization_code + refresh)
    apikey-handler.ts         # API key injection (header/query)
    basic-handler.ts          # Basic Auth (username:password base64)
  webhook/                    # NUOVO (fase 2, non bloccante)
    webhook-handler.ts        # Ricezione + validazione HMAC signature
    webhook-registry.ts       # Registrazione endpoint per source
```

### Alternatives Considered

1. **Rewrite completo** -- Scartato. ~14 giorni vs ~6 giorni di refactoring. Il 70% del codice e' riutilizzabile. Rischio regressione su 13 fonti funzionanti.
2. **Libreria esterna (Airbyte, Meltano)** -- Scartato. Overhead operativo (container Docker, scheduling separato). Conflitto con principio "stesso localhost". Impossibile integrare il tier system LLM per AI mapping.
3. **Solo adapter layer** -- Scartato. Duplicazione logica (retry, rate limit, logging, sync). Pattern incoerente.

### Effort stimato

| Componente | Effort |
|-----------|--------|
| `auth/` handlers (api-key, basic, oauth2) | 2 giorni |
| `AuthenticatedBaseConnector` | 0.5 giorni |
| Estensione `types.ts` + `DataSource` | 0.5 giorni |
| Primo connettore business (salesforce) | 2-3 giorni |
| OAuth2 callback route (`/api/auth/connector-callback`) | 1 giorno |
| Test unitari + integration test | 1 giorno |
| Connettori successivi (SAP, NetSuite, ecc.) | 1-2 giorni ciascuno |

**Totale fase 1: ~7 giorni** (vs ~14 per rewrite).

### Conseguenze

(+) Riuso completo della pipeline esistente -- zero riscrittura del core
(+) I connettori legali/medici continuano a funzionare identicamente
(+) Ogni nuovo connettore business e' un singolo file + `registerConnector()`
(+) Il pattern CONNECT-MODEL-LOAD con sync log si applica identicamente ai dati business
(+) Open/closed: nessuna modifica a `plugin-registry.ts`

(-) `BaseConnector` + `AuthenticatedBaseConnector` = due classi da mantenere
(-) OAuth2+PKCE richiede stato (authorization code, code verifier) -- serve storage temporaneo
(-) Test richiedono mock dei provider OAuth2

### Rischi

- **Rate limit provider-specifici**: Salesforce (100 req/utente/h), SAP (varia per licenza), HubSpot (100 req/10s). Il campo `rateLimit` in `DataSource` permette configurazione, ma serve monitoraggio in produzione.
- **Token expiry**: i token OAuth2 scadono (1-2h). Il refresh in `fetchWithRetry()` copre il caso, ma se il refresh token e' scaduto (90gg Salesforce), serve re-autorizzazione utente.

---

## ADR-2: AI Mapping Hybrid (Rule-Based + LLM)

### Contesto

La fase MODEL della pipeline trasforma dati grezzi in schema DB. Oggi `LegalArticleModel` e' hardcoded per `legal_articles`: il mapping `sourceField -> targetColumn` e' fisso in `DataModelSpec.transformRules`.

Per i dati business (CRM, ERP), i campi sorgente variano drasticamente tra provider:
- **Salesforce**: `Account.Name`, `Account.BillingCity`, `Opportunity.StageName`
- **SAP B1**: `BusinessPartner.CardName`, `BusinessPartner.City`
- **HubSpot**: `company.name`, `company.city`
- **Custom fields**: `Account.CustomField__c`, `company.custom_property_xyz`

Anche per lo stesso concetto ("nome azienda"), ogni provider usa naming diverso. I custom fields sono imprevedibili.

### Decisione

**Approccio ibrido: rule-based per campi standard (80-90% dei casi), LLM per mappature ambigue. Cache dei risultati LLM per evitare costi ripetuti.**

#### 2.1 Rule-Based Mapping (priorita)

Per ogni connettore business, definire mapping statici in `transformRules` del model:

```typescript
// Esempio: Salesforce Account -> business_records
const SALESFORCE_ACCOUNT_RULES: TransformRule[] = [
  { sourceField: "Account.Name",           targetColumn: "company_name",   transform: "direct" },
  { sourceField: "Account.BillingStreet",  targetColumn: "address",        transform: "direct" },
  { sourceField: "Account.BillingCity",    targetColumn: "city",           transform: "direct" },
  { sourceField: "Account.Industry",       targetColumn: "sector",         transform: "direct" },
  { sourceField: "Account.CreatedDate",    targetColumn: "created_at",     transform: "iso_date" },
  { sourceField: "Account.AnnualRevenue",  targetColumn: "revenue",        transform: "number" },
];
```

Questi mapping coprono i campi standard delle API ben documentate. Definiti una volta per connettore, zero costo runtime.

#### 2.2 LLM Mapping per campi ambigui

Quando `ModelInterface.analyze()` trova campi sorgente senza mapping rule-based (tipicamente custom fields), delega a un agente LLM:

```typescript
// Estensione opzionale di ModelInterface
interface ModelInterface {
  analyze(sampleData: unknown[]): Promise<DataModelSpec>;
  checkSchema(spec: DataModelSpec): Promise<ModelResult>;
  describeTransform(spec: DataModelSpec): string;

  // NUOVO (opzionale -- default: noop per LegalArticleModel)
  resolveAmbiguousFields?(
    unmappedFields: string[],
    targetSchema: string[],
    sampleValues: Record<string, unknown[]>
  ): Promise<TransformRule[]>;
}
```

L'implementazione usa il tier system e il pattern `runAgent()` esistente:

```typescript
import { runAgent } from "@/lib/ai-sdk/agent-runner";

async resolveAmbiguousFields(
  unmappedFields: string[],
  targetSchema: string[],
  sampleValues: Record<string, unknown[]>
): Promise<TransformRule[]> {
  // 1. Check cache
  const cached = await getCachedMappings(this.sourceId, unmappedFields);
  if (cached.length === unmappedFields.length) return cached;

  // 2. LLM per campi non in cache
  const uncached = unmappedFields.filter(f => !cached.find(c => c.sourceField === f));
  const result = await runAgent("mapper", JSON.stringify({
    unmappedFields: uncached,
    targetSchema,
    sampleValues: Object.fromEntries(uncached.map(f => [f, sampleValues[f]])),
    instruction: "Per ogni campo sorgente, indica il campo target piu appropriato. Se nessun campo target e adatto, suggerisci 'skip'. Rispondi in JSON."
  }));

  // 3. Parse + salva in cache
  const llmMappings = JSON.parse(result);
  await saveMappingsToCache(this.sourceId, llmMappings);

  return [...cached, ...llmMappings];
}
```

#### 2.3 Controllo costi

| Strategia | Dettaglio |
|-----------|----------|
| **Tier Intern per mapper** | Catena: Groq Llama 4 Scout -> Cerebras Llama 3.3 70B. Costo: ~gratis |
| **Cache mapping in DB** | Tabella `connector_field_mappings`. Riusato per tutte le run successive della stessa fonte |
| **TTL cache: 30 giorni** | I campi custom cambiano raramente. Dopo 30gg, ri-verifica con LLM |
| **Batch max 20 campi** | Se > 20 campi ambigui, batch in gruppi per limitare token output |
| **Confidence threshold** | Se confidence LLM < 0.7, il campo va in `pending_review` (task board CME) |
| **Mai Partner tier** | Il mapping campo-a-campo non richiede ragionamento complesso |

#### 2.4 Catena agente "mapper" in tiers.ts

```typescript
// lib/tiers.ts -- aggiunta alla AGENT_CHAINS
mapper: {
  intern:    [{ key: "groq:llama-4-scout" }, { key: "cerebras:llama-3.3-70b" }],
  associate: [{ key: "gemini:flash" }, { key: "groq:llama-4-scout" }],
  partner:   [{ key: "gemini:pro" }, { key: "gemini:flash" }],
}
```

Il mapper NON usa Anthropic: non serve `web_search`, e i modelli gratuiti sono sufficienti per matching campo-a-campo con sample values.

#### 2.5 Schema DB per mapping cache

```sql
-- Migration: connector_field_mappings
CREATE TABLE connector_field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id TEXT NOT NULL,               -- es. "salesforce_accounts"
  source_field TEXT NOT NULL,             -- es. "Account.CustomField__c"
  target_column TEXT NOT NULL,            -- es. "custom_notes"
  transform TEXT NOT NULL DEFAULT 'direct', -- "direct" | "iso_date" | "number" | "json" | "skip"
  confidence REAL NOT NULL DEFAULT 1.0,  -- 1.0 = rule-based, <1.0 = LLM
  mapped_by TEXT NOT NULL DEFAULT 'rule', -- 'rule' | 'llm' | 'human'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,                -- TTL 30gg per LLM mappings, NULL per rule-based
  UNIQUE(source_id, source_field)
);

-- RLS: solo service_role (infrastruttura, non per-utente)
ALTER TABLE connector_field_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON connector_field_mappings
  FOR ALL USING (auth.role() = 'service_role');
```

### Effort stimato

| Componente | Effort |
|-----------|--------|
| Estensione `ModelInterface` con `resolveAmbiguousFields()` | 0.5 giorni |
| Agente "mapper" in tiers.ts + prompt | 0.5 giorni |
| Tabella `connector_field_mappings` + migration | 0.5 giorni |
| Integrazione cache lookup/save | 0.5 giorni |
| Integrazione in pipeline fase MODEL | 0.5 giorni |
| Test unitari (mapping rule-based + LLM mock) | 0.5 giorni |

**Totale: ~3 giorni.**

### Conseguenze

(+) 80-90% dei mapping sono zero-cost (rule-based, definiti staticamente nel connettore)
(+) LLM usato solo per casi ambigui, con il tier piu economico (~gratis)
(+) Cache evita ri-elaborazione: dopo la prima run, i mapping sono persistenti 30gg
(+) `LegalArticleModel` non viene toccato -- `resolveAmbiguousFields` e' opzionale nell'interfaccia
(+) Confidence threshold + review umana prevengono mapping errati in produzione

(-) Complessita aggiuntiva nella fase MODEL per i connettori business
(-) Il mapping LLM puo sbagliare su campi con nomi criptici (mitigato da confidence + review)
(-) Serve monitoraggio della cache (scadenze TTL, invalidazione su cambio schema sorgente)
(-) Custom fields con nomi identici ma semantica diversa tra organizzazioni (es. `Status__c` = stato ordine vs stato pagamento)

### Rischi

- **Schema drift**: se il provider cambia i nomi dei campi standard, i rule-based mapping si rompono. Mitigazione: il connettore puo validare i campi attesi in `connect()` e loggare warning.
- **Volume custom fields**: un'organizzazione Salesforce puo avere 500+ custom fields. Batch di 20 campi = 25 LLM calls. Con tier Intern (Groq: 1000 req/giorno) e' sostenibile, ma serve monitoraggio.

---

## ADR-3: Credential Vault

### Contesto

I connettori attuali non gestiscono credenziali: le fonti sono tutte pubbliche. Per i connettori business, ogni utente/organizzazione dovra fornire le proprie credenziali (OAuth token Salesforce, API key SAP, ecc.).

Requisiti:
1. **Isolamento per utente**: un utente non deve mai vedere le credenziali di un altro
2. **Encryption at rest**: le credenziali non devono essere leggibili nel DB nemmeno con accesso diretto
3. **Token refresh automatico**: i token OAuth scadono (1-2h), il framework deve refresharli senza intervento utente
4. **Revoca**: l'utente deve poter revocare l'accesso a qualsiasi connettore
5. **Audit**: ogni accesso alle credenziali deve essere tracciato (`last_used_at`)

### Decisione

**Supabase + RLS + pgcrypto encryption at rest.** Nessun vault esterno (HashiCorp Vault, AWS Secrets Manager, GCP Secret Manager) per ora -- il costo e la complessita operativa non giustificano l'introduzione fino a clienti enterprise.

#### 3.1 Schema DB

```sql
-- Migration: credential_vault
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE credential_vault (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connector_id TEXT NOT NULL,        -- es. "salesforce", "sap-b1", "hubspot"
  credential_type TEXT NOT NULL,     -- "api_key" | "oauth2_token" | "basic_auth"

  -- Credenziali cifrate (pgcrypto pgp_sym_encrypt)
  encrypted_data BYTEA NOT NULL,     -- JSON cifrato: { apiKey, accessToken, refreshToken, clientId, ... }

  -- Metadata non cifrate (per query senza decrypt)
  label TEXT,                        -- etichetta utente: "Salesforce Produzione"
  scopes TEXT[],                     -- scope OAuth2 concessi
  expires_at TIMESTAMPTZ,            -- scadenza access token (NULL = non scade, es. API key)
  last_used_at TIMESTAMPTZ,          -- ultimo utilizzo (audit)
  last_refreshed_at TIMESTAMPTZ,     -- ultimo refresh token

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,            -- soft delete: data revoca (NULL = attiva)

  UNIQUE(user_id, connector_id, label)
);

-- RLS: ogni utente vede solo le proprie credenziali
ALTER TABLE credential_vault ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_credentials_select" ON credential_vault
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_own_credentials_insert" ON credential_vault
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_own_credentials_update" ON credential_vault
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "users_own_credentials_delete" ON credential_vault
  FOR DELETE USING (auth.uid() = user_id);

-- service_role bypassa RLS per le operazioni della pipeline
CREATE POLICY "service_role_all" ON credential_vault
  FOR ALL USING (auth.role() = 'service_role');

-- Indici
CREATE INDEX idx_vault_user_connector ON credential_vault(user_id, connector_id)
  WHERE revoked_at IS NULL;

CREATE INDEX idx_vault_expires ON credential_vault(expires_at)
  WHERE revoked_at IS NULL AND expires_at IS NOT NULL;
```

#### 3.2 RPC Functions (encrypt/decrypt lato server)

```sql
-- vault_store: cifra e salva credenziale
CREATE OR REPLACE FUNCTION vault_store(
  p_user_id UUID,
  p_connector_id TEXT,
  p_credential_type TEXT,
  p_data TEXT,                    -- JSON in chiaro: { "accessToken": "...", "refreshToken": "..." }
  p_encryption_key TEXT,          -- AES-256 key da VAULT_ENCRYPTION_KEY env var
  p_label TEXT DEFAULT NULL,
  p_scopes TEXT[] DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO credential_vault (
    user_id, connector_id, credential_type, encrypted_data,
    label, scopes, expires_at
  ) VALUES (
    p_user_id,
    p_connector_id,
    p_credential_type,
    pgp_sym_encrypt(p_data, p_encryption_key),
    p_label,
    p_scopes,
    p_expires_at
  )
  ON CONFLICT (user_id, connector_id, label)
  DO UPDATE SET
    encrypted_data = pgp_sym_encrypt(p_data, p_encryption_key),
    credential_type = p_credential_type,
    scopes = p_scopes,
    expires_at = p_expires_at,
    updated_at = NOW(),
    revoked_at = NULL  -- riattiva se era revocata
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- vault_retrieve: decifra e restituisci credenziale
CREATE OR REPLACE FUNCTION vault_retrieve(
  p_user_id UUID,
  p_connector_id TEXT,
  p_encryption_key TEXT
) RETURNS TEXT AS $$
DECLARE
  v_data TEXT;
  v_id UUID;
BEGIN
  SELECT id, pgp_sym_decrypt(encrypted_data, p_encryption_key)
  INTO v_id, v_data
  FROM credential_vault
  WHERE user_id = p_user_id
    AND connector_id = p_connector_id
    AND revoked_at IS NULL
  ORDER BY updated_at DESC
  LIMIT 1;

  -- Aggiorna last_used_at (audit trail)
  IF v_id IS NOT NULL THEN
    UPDATE credential_vault SET last_used_at = NOW() WHERE id = v_id;
  END IF;

  RETURN v_data;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- vault_refresh: aggiorna token dopo OAuth2 refresh
CREATE OR REPLACE FUNCTION vault_refresh(
  p_user_id UUID,
  p_connector_id TEXT,
  p_new_data TEXT,
  p_encryption_key TEXT,
  p_new_expires_at TIMESTAMPTZ DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
  UPDATE credential_vault
  SET encrypted_data = pgp_sym_encrypt(p_new_data, p_encryption_key),
      expires_at = p_new_expires_at,
      last_refreshed_at = NOW(),
      updated_at = NOW()
  WHERE user_id = p_user_id
    AND connector_id = p_connector_id
    AND revoked_at IS NULL;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### 3.3 TypeScript client

```typescript
// lib/credential-vault.ts

import { createAdminClient } from "@/lib/supabase/admin";

const VAULT_KEY = process.env.VAULT_ENCRYPTION_KEY;

if (!VAULT_KEY || VAULT_KEY.length < 32) {
  console.warn("[VAULT] VAULT_ENCRYPTION_KEY non configurata o troppo corta. Credential vault disabilitato.");
}

export async function storeCredential(
  userId: string,
  connectorId: string,
  credentialType: "api_key" | "oauth2_token" | "basic_auth",
  data: Record<string, string>,
  options?: { label?: string; scopes?: string[]; expiresAt?: string }
): Promise<string> {
  if (!VAULT_KEY) throw new Error("VAULT_ENCRYPTION_KEY non configurata");
  const supabase = createAdminClient();
  const { data: id, error } = await supabase.rpc("vault_store", {
    p_user_id: userId,
    p_connector_id: connectorId,
    p_credential_type: credentialType,
    p_data: JSON.stringify(data),
    p_encryption_key: VAULT_KEY,
    p_label: options?.label ?? null,
    p_scopes: options?.scopes ?? null,
    p_expires_at: options?.expiresAt ?? null,
  });
  if (error) throw new Error(`Vault store failed: ${error.message}`);
  return id;
}

export async function getCredential(
  userId: string,
  connectorId: string
): Promise<Record<string, string> | null> {
  if (!VAULT_KEY) return null;
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("vault_retrieve", {
    p_user_id: userId,
    p_connector_id: connectorId,
    p_encryption_key: VAULT_KEY,
  });
  if (error || !data) return null;
  return JSON.parse(data);
}

export async function refreshCredential(
  userId: string,
  connectorId: string,
  newData: Record<string, string>,
  newExpiresAt?: string
): Promise<boolean> {
  if (!VAULT_KEY) return false;
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("vault_refresh", {
    p_user_id: userId,
    p_connector_id: connectorId,
    p_new_data: JSON.stringify(newData),
    p_encryption_key: VAULT_KEY,
    p_new_expires_at: newExpiresAt ?? null,
  });
  if (error) return false;
  return data === true;
}

export async function revokeCredential(
  userId: string,
  credentialId: string
): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("credential_vault")
    .update({ revoked_at: new Date().toISOString() })
    .match({ id: credentialId, user_id: userId });
}

export async function listCredentials(
  userId: string
): Promise<Array<{ id: string; connectorId: string; label: string; scopes: string[]; expiresAt: string | null; lastUsedAt: string | null }>> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("credential_vault")
    .select("id, connector_id, label, scopes, expires_at, last_used_at")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("updated_at", { ascending: false });
  if (error) return [];
  return (data ?? []).map(row => ({
    id: row.id,
    connectorId: row.connector_id,
    label: row.label ?? "",
    scopes: row.scopes ?? [],
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
  }));
}
```

#### 3.4 OAuth2 Token Refresh nel pipeline

Il refresh e' integrato in `AuthenticatedBaseConnector.fetchWithRetry()` (vedi ADR-1 sezione 1.2). Quando riceve 401:

1. Chiama `authHandler.refresh()` che legge il refresh token dal vault
2. Fa POST al `tokenUrl` del provider con `grant_type=refresh_token`
3. Salva il nuovo access token (e eventuale nuovo refresh token) nel vault via `refreshCredential()`
4. Riprova la richiesta originale con il nuovo token

Se il refresh fallisce (refresh token scaduto), il pipeline va in `failed` nel sync log con messaggio "User must re-authorize".

#### 3.5 Integrazione con la pipeline -- flusso completo

```
1. Utente collega connettore
   -> Redirect a provider OAuth2 authorize URL
   -> Utente approva scopes
   -> Redirect a /api/auth/connector-callback

2. Callback salva nel vault
   -> Exchange authorization_code per access_token + refresh_token
   -> storeCredential(userId, connectorId, "oauth2_token", { accessToken, refreshToken })

3. Pipeline CONNECT
   -> AuthenticatedBaseConnector legge credential dal vault
   -> Inietta Authorization: Bearer {accessToken} in ogni richiesta

4. Token scaduto (401)
   -> Refresh automatico: POST tokenUrl con refresh_token
   -> refreshCredential() aggiorna il vault
   -> Retry richiesta con nuovo token

5. Utente revoca
   -> revokeCredential() = soft delete (revoked_at = NOW())
   -> Pipeline successiva fallisce con errore chiaro "Credential revoked"
```

#### 3.6 Variabili d'ambiente

```env
# Credential Vault (obbligatorio per connettori business)
VAULT_ENCRYPTION_KEY=...   # 64 hex chars (32 bytes) -- generare con: openssl rand -hex 32
```

### Effort stimato

| Componente | Effort |
|-----------|--------|
| Migration DB (`credential_vault` + 3 RPC functions + pgcrypto) | 0.5 giorni |
| `lib/credential-vault.ts` (store, get, refresh, revoke, list) | 1 giorno |
| OAuth2 callback route (`/api/auth/connector-callback`) | 1 giorno |
| Integrazione in `AuthenticatedBaseConnector` (auto-refresh) | 0.5 giorni |
| UI gestione credenziali (lista connettori, collega, revoca) | 2 giorni |
| Test (encryption round-trip, RLS isolation, token refresh, revoke) | 1 giorno |

**Totale: ~6 giorni.**

### Conseguenze

(+) Credenziali isolate per utente via RLS -- zero rischio cross-tenant
(+) Encryption at rest via pgcrypto `pgp_sym_encrypt` -- credenziali non leggibili nel DB
(+) Token refresh automatico -- zero intervento utente per token scaduti
(+) Soft delete con `revoked_at` -- audit trail completo, nessun dato perso
(+) `last_used_at` aggiornato ad ogni accesso -- audit senza tabella separata
(+) Nessuna dipendenza esterna (HashiCorp Vault, AWS SM) -- complessita operativa minima
(+) `SECURITY DEFINER` sulle RPC -- la chiave di encryption non transita mai al client

(-) `pgcrypto` non e' HSM-grade -- per clienti enterprise (SOC2, ISO27001) potrebbe servire upgrade
(-) `VAULT_ENCRYPTION_KEY` in env var -- se il server e' compromesso, le credenziali sono decifrabili
(-) OAuth2 callback richiede HTTPS in produzione (gia attivo per Stripe)
(-) Upsert in `vault_store` sovrascrive senza conferma -- rischio sovrascrittura accidentale

### Rischi

- **Key rotation**: se si cambia `VAULT_ENCRYPTION_KEY`, tutte le credenziali esistenti diventano illeggibili. Serve procedura di re-encryption (batch job: decrypt con vecchia chiave, encrypt con nuova). Da implementare prima del go-live.
- **GDPR**: le credenziali OAuth contengono dati collegati all'utente. Serve base giuridica (contratto di servizio) e TTL GDPR allineato alla retention policy. Task CME gia aperto per DPA con provider.
- **Refresh token theft**: se un attaccante ottiene accesso al DB + `VAULT_ENCRYPTION_KEY`, puo impersonare l'utente sui sistemi collegati. Mitigazione: scope minimi, monitoraggio `last_used_at` anomalo, notifica Telegram su accesso da IP sconosciuto.

---

## Riepilogo

| ADR | Decisione chiave | Impatto su codice esistente |
|-----|-----------------|---------------------------|
| ADR-1 | Riusare CONNECT-MODEL-LOAD, aggiungere `AuthenticatedBaseConnector` | Nuova sottoclasse in `base.ts`, nuovi campi opzionali in `types.ts`. Zero impatto su connettori legali/medici |
| ADR-2 | Rule-based per default, LLM (tier Intern, ~gratis) per ambigui, cache 30gg in DB | Nuovo metodo opzionale in `ModelInterface`. `LegalArticleModel` invariato |
| ADR-3 | Supabase + RLS + pgcrypto. Nessun vault esterno fino a clienti enterprise | Nuova tabella + `lib/credential-vault.ts`, integrazione in `AuthenticatedBaseConnector` |

### Dipendenze tra ADR

```
ADR-1 (connector framework)
  |
  +-- ADR-3 (credential vault) -- necessario per qualsiasi connettore OAuth2
  |
  +-- ADR-2 (AI mapping) -- necessario per custom fields, indipendente da ADR-3
```

**Ordine di implementazione**: ADR-1 per primo (e' il fondamento). ADR-2 e ADR-3 possono procedere in parallelo, ma ADR-3 deve essere completato prima di rilasciare qualsiasi connettore business in produzione.

### Effort totale stimato

| Fase | Effort |
|------|--------|
| ADR-1: Connector framework | ~7 giorni |
| ADR-2: AI mapping hybrid | ~3 giorni |
| ADR-3: Credential vault | ~6 giorni |
| **Totale** | **~16 giorni** (molti task parallelizzabili, timeline reale ~10 giorni) |

### Prossimi passi

1. **Approvazione CME** di questo documento
2. **Architecture**: implementare `AuthenticatedBaseConnector` + `auth/` handlers (ADR-1)
3. **Architecture**: migration `credential_vault` + `connector_field_mappings` (ADR-2 + ADR-3)
4. **Data Engineering**: primo connettore business Salesforce (ADR-1, dipende da ADR-3)
5. **QA**: test suite per encryption, RLS isolation, token refresh, mapping cache
6. **Security**: review del vault prima del rilascio in produzione
