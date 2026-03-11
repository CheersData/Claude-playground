# Piano: Framework Connettori Generico + 3 Connettori MVP

**Task ID:** 793c5350
**Autore:** data-connector (Data Engineering)
**Data:** 2026-03-10
**Priorita:** HIGH
**Stato:** PIANO

---

## 1. Analisi Stato Attuale

### 1.1 Architettura corrente

Il data-connector segue una pipeline a 3 fasi: **CONNECT -> MODEL -> LOAD**.

```
CONNECT              MODEL                LOAD
  |                    |                    |
  | ConnectorInterface | ModelInterface     | StoreInterface
  | .connect()         | .analyze()         | .save()
  | .fetchAll()        | .checkSchema()     |
  | .fetchDelta()      | .describeTransform |
  |                    |                    |
  v                    v                    v
 ConnectResult       ModelResult          StoreResult
```

**Orchestratore:** `lib/staff/data-connector/index.ts`
- `runPipeline(sourceId, options, log)` esegue le 3 fasi in sequenza
- Comandi singoli: `connectSource()`, `modelSource()`, `loadSource()`, `updateSource()`
- Sync log: ogni fase viene tracciata in `connector_sync_log` (Supabase)

**Plugin Registry:** `lib/staff/data-connector/plugin-registry.ts`
- Pattern factory: `registerConnector(id, factory)`, `registerModel(dataType, factory)`, `registerStore(dataType, factory)`
- Lookup: `resolveConnector(source, log)`, `resolveModel(source)`, `resolveStore(source, log)`
- Registrazione defaults al primo import (normattiva, eurlex, ncbi-bookshelf, europe-pmc, openstax)
- Open/closed: verticali esterni possono registrare plugin senza modificare il file

**Source Registry:** `lib/staff/data-connector/registry.ts`
- Mappa `CorpusSource` (da `scripts/corpus-sources.ts`) in `DataSource` generiche
- Supporta N verticali via `registerVertical()`
- Mappa `vertical -> dataType` per risolvere model e store

### 1.2 Componenti esistenti

| Componente | File | Responsabilita |
|-----------|------|----------------|
| `BaseConnector` | `connectors/base.ts` | Classe astratta: `fetchWithRetry()`, `fetchJSON()`, `rateLimitPause()`, `cleanText()`, User-Agent browser |
| `NormattivaConnector` | `connectors/normattiva.ts` | 3 strategie fetch: collezione preconfezionata, ricerca asincrona, caricaAKN diretto |
| `EurLexConnector` | `connectors/eurlex.ts` | SPARQL + Cellar content negotiation (HTML/XHTML italiano) |
| `StatPearlsConnector` | `connectors/statpearls.ts` | NCBI E-utilities API per articoli medici |
| `EuropePMCConnector` | `connectors/europepmc.ts` | Europe PMC Open Access API |
| `OpenStaxConnector` | `connectors/openstax.ts` | OpenStax textbooks (API cambiata, da fixare) |
| `LegalArticleModel` | `models/legal-article-model.ts` | Schema check per `legal_articles`, genera migration SQL |
| `LegalCorpusStore` | `stores/legal-corpus-store.ts` | Adattatore a `ingestArticles()` con batching e pausa Voyage AI |
| `akn-parser` | `parsers/akn-parser.ts` | Parser XML Akoma Ntoso (standard + attachment) |
| `html-parser` | `parsers/html-parser.ts` | Parser HTML EUR-Lex (eli-subdivision, legacy, alternativo) |
| `article-validator` | `validators/article-validator.ts` | Validazione: testo minimo, HTML entities, UI garbage, numero articolo |
| `sync-log` | `sync-log.ts` | CRUD su `connector_sync_log`: startSync, completeSync, getHistory, getStatus |

### 1.3 Interfacce chiave (types.ts)

```typescript
// DataSource: definizione di una fonte dati
interface DataSource {
  id: string;
  name: string;
  shortName: string;
  dataType: DataType;    // "legal-articles" | "medical-articles" | "hr-articles" | ...
  vertical: string;      // "legal" | "hr" | "medical" | ...
  connector: string;     // "normattiva" | "eurlex" | ...
  config: Record<string, unknown>;  // <-- config generica, non tipizzata
  lifecycle: SourceLifecycle;
  estimatedItems: number;
  schedule?: { deltaInterval: "daily" | "weekly" | "monthly" };
}

// ConnectorInterface: contratto per tutti i connettori
interface ConnectorInterface<T = unknown> {
  connect(): Promise<ConnectResult>;
  fetchAll(options?: { limit?: number }): Promise<FetchResult<T>>;
  fetchDelta(since: string, options?: { limit?: number }): Promise<FetchResult<T>>;
}
```

### 1.4 Pattern CONNECT -> MODEL -> LOAD: come funziona

**CONNECT** (fase 1):
- Testa la connessione alla fonte
- Censisce: quanti dati, formati disponibili, campi di sample
- Ritorna `ConnectResult.census` con metadati per la fase MODEL

**MODEL** (fase 2):
- Analizza `sampleData` dal CONNECT per decidere la struttura DB ottimale
- Verifica se lo schema attuale e' compatibile (`checkSchema`)
- Se mancano colonne/tabelle, genera SQL di migrazione
- Ritorna `ModelResult.ready` + spec completa

**LOAD** (fase 3):
- Fetch completo o delta (dal CONNECT result o re-fetch)
- Validazione batch (`validateBatch`)
- Filtra articoli validi
- Trasforma `ParsedArticle` -> `LegalArticle` (mapping source-specific)
- Salva via store (upsert + embeddings)

### 1.5 Limiti dell'architettura attuale

| # | Limite | Impatto |
|---|--------|---------|
| L1 | **Nessun supporto auth** — `BaseConnector` assume fonti pubbliche (no auth, no token, no OAuth) | Impossibile connettere SaaS (Salesforce, SAP, NetSuite) |
| L2 | **Config non tipizzata** — `DataSource.config` e' `Record<string, unknown>`, nessuna validazione | Errori runtime invisibili, no autocomplete IDE |
| L3 | **Fase Transform assente** — la trasformazione e' inline in `index.ts` (riga 222-232), hardcoded per LegalArticle | Ogni nuovo tipo di dato richiede modifiche a index.ts |
| L4 | **ParsedArticle hardcoded** — il tipo di ritorno di `ConnectorInterface<T>` e' sempre `ParsedArticle` nel plugin-registry | Connettori non-legali devono conformarsi a un formato legale |
| L5 | **Validator specifico** — `article-validator.ts` valida solo articoli legali (HTML entities, UI garbage) | Dati CRM/ERP richiedono validatori diversi |
| L6 | **Store monomorfo** — solo `LegalCorpusStore` esiste, scrive su `legal_articles` via `ingestArticles()` | Dati CRM/ERP vanno su tabelle diverse con schemi diversi |
| L7 | **Nessun rate limiter configurabile** — `rateLimitPause()` e' fisso a 1000ms | API con rate limit diversi (Salesforce: 100k/day, SAP: custom) |
| L8 | **Nessun webhook/push** — solo pull (polling), nessun supporto per ingest push-based | Salesforce Streaming API, SAP Change Data Capture non supportati |
| L9 | **Nessun secret management** — le chiavi API sono in env vars non strutturate | N connettori = N gruppi di env vars, gestione manuale |

### 1.6 Punti di forza da preservare

| # | Forza | Perche' |
|---|-------|---------|
| F1 | **Plugin registry** | Pattern factory gia' in uso, estensibile senza modificare core |
| F2 | **Sync log** | Tracking completo di ogni operazione, utile per audit e debug |
| F3 | **BaseConnector** | Retry, rate limit pause, User-Agent gia' gestiti |
| F4 | **Pipeline orchestrata** | Separazione chiara tra fasi, stop-after per debug |
| F5 | **Vertical registry** | Multi-verticale gia' supportato a livello di source |
| F6 | **Batch processing** | Store gia' gestisce batching con pause inter-batch |

---

## 2. Piano Refactoring

### 2.1 Nuova architettura: Connect -> Transform -> Validate -> Load

La pipeline attuale CONNECT->MODEL->LOAD diventa **CONNECT -> TRANSFORM -> VALIDATE -> LOAD**, con MODEL che rimane come pre-check opzionale.

```
                    +-----------+
                    |  AuthLayer |  <-- NUOVO: OAuth2, API Key, Basic Auth, Custom
                    +-----+-----+
                          |
  CONNECT          TRANSFORM         VALIDATE         LOAD
    |                  |                 |               |
    | ConnectorV2      | Transformer     | Validator     | StoreV2
    | .connect()       | .transform()    | .validate()   | .save()
    | .fetchAll()      |                 | .validateBatch|
    | .fetchDelta()    |                 |               |
    | .fetchPage()     |                 |               |
    |                  |                 |               |
    v                  v                 v               v
  RawData[]         MappedRecord[]    ValidRecord[]    StoreResult
```

### 2.2 Auth Layer

Nuova directory: `lib/staff/data-connector/auth/`

```typescript
// auth/types.ts
type AuthMethod = "none" | "api-key" | "basic" | "oauth2" | "oauth2-pkce" | "custom";

interface AuthConfig {
  method: AuthMethod;
  // API Key
  apiKey?: string;
  apiKeyHeader?: string;  // default: "Authorization"
  apiKeyPrefix?: string;  // default: "Bearer"
  // Basic Auth
  username?: string;
  password?: string;
  // OAuth2
  oauth2?: {
    authorizationUrl: string;
    tokenUrl: string;
    clientId: string;
    clientSecret?: string;  // assente per PKCE
    scopes: string[];
    usePKCE?: boolean;
    redirectUri?: string;
  };
  // Custom (es. Salesforce session token, SAP X-CSRF-Token)
  customHeaders?: Record<string, string>;
}

interface AuthProvider {
  /** Ritorna headers da aggiungere a ogni richiesta */
  getAuthHeaders(): Promise<Record<string, string>>;
  /** Refresh token se scaduto */
  refresh(): Promise<void>;
  /** True se il token e' valido */
  isValid(): boolean;
}

// auth/providers/
// - api-key-auth.ts    -> header statico
// - basic-auth.ts      -> Base64 encode
// - oauth2-auth.ts     -> Authorization Code + refresh
// - oauth2-pkce-auth.ts -> PKCE flow (Salesforce, HubSpot)
// - none-auth.ts       -> noop (fonti pubbliche attuali)

// auth/index.ts
function createAuthProvider(config: AuthConfig): AuthProvider;
```

**Impatto sui connettori esistenti:** Normattiva e EUR-Lex usano `AuthMethod: "none"`. Zero breaking changes.

**Storage token OAuth2:**
- Token salvati in `connector_auth_tokens` (nuova tabella Supabase)
- Refresh automatico prima di ogni richiesta se `expiresAt < now()`
- Encrypt at rest via `pgcrypto` (Supabase extension)

### 2.3 ConnectorConfig V2 (tipizzata)

```typescript
// types-v2.ts (estensione di types.ts)

/** Config base per tutti i connettori */
interface BaseConnectorConfig {
  auth: AuthConfig;
  rateLimit?: {
    requestsPerMinute?: number;
    requestsPerDay?: number;
    retryAfterMs?: number;       // default: 60000
    maxRetries?: number;          // default: 3
  };
  pagination?: {
    type: "offset" | "cursor" | "page" | "link";
    pageSize?: number;            // default: 100
    maxPages?: number;            // default: Infinity
  };
  baseUrl: string;
  timeout?: number;               // default: 30000ms
}

/** Config Salesforce */
interface SalesforceConnectorConfig extends BaseConnectorConfig {
  auth: AuthConfig & { method: "oauth2-pkce" };
  instanceUrl: string;            // es. "https://mycompany.my.salesforce.com"
  apiVersion: string;             // es. "v60.0"
  objects: string[];              // es. ["Account", "Contact", "Opportunity"]
  fields?: Record<string, string[]>;  // override campi per oggetto
  soqlFilters?: Record<string, string>;  // filtri SOQL per oggetto
}

/** Config SAP */
interface SAPConnectorConfig extends BaseConnectorConfig {
  auth: AuthConfig & { method: "basic" | "oauth2" };
  sapSystem: string;
  sapClient: string;
  services: string[];             // es. ["API_BUSINESS_PARTNER", "API_SALES_ORDER"]
}

/** Config NetSuite */
interface NetSuiteConnectorConfig extends BaseConnectorConfig {
  auth: AuthConfig & { method: "oauth2" };  // Token-Based Auth (TBA)
  accountId: string;
  suiteQLEnabled?: boolean;
  recordTypes: string[];          // es. ["customer", "invoice", "salesorder"]
}
```

**Backward compatibility:** `DataSource.config` rimane `Record<string, unknown>` per runtime compatibility. I connettori tipizzati fanno cast+validation all'inizializzazione tramite Zod schema.

### 2.4 BaseConnector V2

Estensione non-breaking di `BaseConnector`:

```typescript
// connectors/base-v2.ts (estende base.ts)

abstract class BaseConnectorV2<T = unknown> extends BaseConnector<T> {
  protected auth: AuthProvider;
  protected rateLimitConfig: RateLimitConfig;
  protected paginationConfig: PaginationConfig;

  constructor(source: DataSource, log: (msg: string) => void) {
    super(source, log);
    const config = this.parseConfig();  // Zod validation
    this.auth = createAuthProvider(config.auth);
    this.rateLimitConfig = config.rateLimit ?? DEFAULT_RATE_LIMIT;
    this.paginationConfig = config.pagination ?? DEFAULT_PAGINATION;
  }

  /** Override di fetchWithRetry: aggiunge auth headers */
  protected async fetchWithRetry(url: string, options?: RequestInit, maxRetries?: number): Promise<Response> {
    const authHeaders = await this.auth.getAuthHeaders();
    const mergedOptions = {
      ...options,
      headers: { ...authHeaders, ...Object.fromEntries(new Headers(options?.headers ?? {}).entries()) },
    };
    return super.fetchWithRetry(url, mergedOptions, maxRetries ?? this.rateLimitConfig.maxRetries);
  }

  /** Paginazione generica: itera pagina per pagina */
  protected async fetchPaginated<R>(
    fetcher: (params: PaginationParams) => Promise<PaginatedResponse<R>>
  ): Promise<R[]> {
    const results: R[] = [];
    let cursor: string | number | undefined;
    let page = 0;

    while (page < (this.paginationConfig.maxPages ?? Infinity)) {
      const response = await fetcher({ cursor, page, pageSize: this.paginationConfig.pageSize ?? 100 });
      results.push(...response.items);

      if (!response.hasMore) break;
      cursor = response.nextCursor;
      page++;

      await this.rateLimitPause();
    }

    return results;
  }

  /** Rate limit pause configurabile */
  protected async rateLimitPause(): Promise<void> {
    const ms = this.rateLimitConfig.retryAfterMs
      ? Math.max(60000 / (this.rateLimitConfig.requestsPerMinute ?? 60), 200)
      : 1000;
    await this.sleep(ms);
  }

  /** Zod validation del config — override per config tipizzate */
  protected abstract parseConfig(): BaseConnectorConfig;
}
```

**I connettori esistenti (Normattiva, EUR-Lex) non cambiano.** Continuano a estendere `BaseConnector` (V1). I nuovi connettori (Salesforce, SAP, NetSuite) estendono `BaseConnectorV2`.

### 2.5 Transformer (nuova fase)

Nuova directory: `lib/staff/data-connector/transformers/`

```typescript
// transformers/types.ts
interface TransformRule {
  sourceField: string;       // campo nel record raw (dot notation: "attributes.name")
  targetField: string;       // campo nel record mappato
  transform: TransformFn;    // "direct" | "rename" | "format" | "compute" | custom function
  required?: boolean;
}

interface TransformerInterface<TInput, TOutput> {
  transform(input: TInput): TOutput;
  transformBatch(inputs: TInput[]): TOutput[];
  describeMapping(): string;
}

// transformers/
// - field-mapper.ts          -> mapping dichiarativo campo-campo
// - legal-article-transformer.ts  -> attuale logica riga 222-232 di index.ts
// - salesforce-transformer.ts     -> Salesforce SObject -> MappedRecord
// - sap-transformer.ts            -> SAP OData -> MappedRecord
// - netsuite-transformer.ts       -> NetSuite -> MappedRecord
```

**Migrazione:** la trasformazione inline in `index.ts` (righe 222-232) viene estratta in `legal-article-transformer.ts`. La pipeline chiama `transformer.transformBatch(articles)` tra fetch e validate.

### 2.6 Pipeline V2

```typescript
// Nuova firma di runPipeline
async function runPipeline(sourceId: string, options?: PipelineOptionsV2): Promise<PipelineResult> {
  // 1. CONNECT (invariato)
  const connector = createConnector(source, log);
  const connectResult = await connector.connect();

  // 2. MODEL (invariato, opzionale)
  if (options?.checkSchema !== false) {
    const model = createModel(source);
    const modelResult = await model.checkSchema(spec);
    if (!modelResult.ready) return early;
  }

  // 3. FETCH + TRANSFORM (nuova separazione)
  const fetchResult = await connector.fetchAll(options);
  const transformer = createTransformer(source);
  const mapped = transformer.transformBatch(fetchResult.items);

  // 4. VALIDATE (generalizzato)
  const validator = createValidator(source);
  const validation = validator.validateBatch(mapped);
  const valid = mapped.filter((_, i) => validation.details[i].valid);

  // 5. LOAD (invariato)
  const store = createStore(source, log);
  const storeResult = await store.save(valid, options);
}
```

### 2.7 Registry V2

Aggiornamento del plugin-registry per supportare transformer e validator factories:

```typescript
// plugin-registry.ts (aggiunta)
export function registerTransformer(connectorId: string, factory: TransformerFactory): void;
export function registerValidator(dataType: string, factory: ValidatorFactory): void;

// Resolve con fallback
export function resolveTransformer(source: DataSource): TransformerInterface;
export function resolveValidator(source: DataSource): ValidatorInterface;
```

### 2.8 Secret Management

```
Env vars attuali (fonti pubbliche):
  VOYAGE_API_KEY, GEMINI_API_KEY, etc.

Env vars nuovi (SaaS connettori):
  CONNECTOR_SALESFORCE_CLIENT_ID
  CONNECTOR_SALESFORCE_CLIENT_SECRET
  CONNECTOR_SAP_USERNAME
  CONNECTOR_SAP_PASSWORD
  CONNECTOR_NETSUITE_ACCOUNT_ID
  CONNECTOR_NETSUITE_CONSUMER_KEY
  CONNECTOR_NETSUITE_CONSUMER_SECRET
  CONNECTOR_NETSUITE_TOKEN_KEY
  CONNECTOR_NETSUITE_TOKEN_SECRET
```

Pattern: `CONNECTOR_{NOME}_{CAMPO}`. Ogni connettore legge i propri env vars nella propria `parseConfig()`.

---

## 3. Spec 3 Connettori MVP

### 3.1 Salesforce Connector

#### API Reference

| Aspetto | Dettaglio |
|---------|----------|
| **API** | Salesforce REST API (SOQL + SObject) |
| **Base URL** | `https://{instance}.my.salesforce.com/services/data/v60.0/` |
| **Auth** | OAuth 2.0 + PKCE (Web Server Flow o JWT Bearer per server-to-server) |
| **Docs** | https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/ |

#### Auth Method: OAuth2 + PKCE

```
1. Authorization URL: https://login.salesforce.com/services/oauth2/authorize
2. Token URL: https://login.salesforce.com/services/oauth2/token
3. Scopes: api, refresh_token, offline_access
4. Grant type: authorization_code (con PKCE code_verifier/code_challenge)
5. Refresh: automatico via refresh_token (no re-auth)

Alternativa server-to-server: JWT Bearer Flow
- Nessun browser redirect
- Certificate-based (X.509)
- Ideale per sync batch automatizzate
```

#### Entita principali da sincronizzare

| Oggetto Salesforce | Campi chiave | Uso |
|-------------------|-------------|-----|
| Account | Id, Name, Industry, Type, BillingAddress, Phone, Website | Aziende cliente |
| Contact | Id, FirstName, LastName, Email, Phone, AccountId, Title | Contatti |
| Opportunity | Id, Name, StageName, Amount, CloseDate, AccountId, Probability | Pipeline vendite |
| Lead | Id, FirstName, LastName, Company, Email, Status, Source | Lead marketing |
| Case | Id, Subject, Status, Priority, AccountId, ContactId, Description | Ticket supporto |

#### Rate Limits e Pagination

| Parametro | Valore |
|-----------|--------|
| API calls/24h (Enterprise) | 100,000 |
| API calls/24h (Developer) | 15,000 |
| Bulk API records/batch | 10,000 |
| SOQL query max records | 2,000 (paginazione cursor-based via `nextRecordsUrl`) |
| Concurrent API limit | 25 long-running requests |

#### Schema Mapping verso Supabase

```sql
-- Nuova tabella
CREATE TABLE IF NOT EXISTS crm_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_source text NOT NULL,      -- "salesforce"
  object_type text NOT NULL,           -- "Account", "Contact", "Opportunity"
  external_id text NOT NULL,           -- Salesforce ID (18 char)
  data jsonb NOT NULL,                 -- tutti i campi dell'oggetto
  mapped_fields jsonb DEFAULT '{}',    -- campi normalizzati (name, email, phone, etc.)
  last_modified_at timestamptz,        -- Salesforce LastModifiedDate
  synced_at timestamptz DEFAULT now(),
  UNIQUE(connector_source, object_type, external_id)
);

CREATE INDEX crm_records_source_type_idx ON crm_records(connector_source, object_type);
CREATE INDEX crm_records_external_id_idx ON crm_records(external_id);
CREATE INDEX crm_records_data_gin_idx ON crm_records USING gin(data);
```

#### Effort stimato

| Fase | Giorni | Note |
|------|--------|------|
| Auth OAuth2+PKCE | 3 | Flusso completo + refresh + storage token |
| Connector base | 2 | SOQL query, pagination, describe SObject |
| Transformer | 1 | SObject -> crm_records mapping |
| Validator | 0.5 | Required fields, type checking |
| Store + migration | 1 | crm_records table, upsert |
| Test | 2 | Unit + integration con sandbox |
| **Totale** | **9.5** | |

---

### 3.2 SAP Connector

#### API Reference

| Aspetto | Dettaglio |
|---------|----------|
| **API** | SAP OData V2/V4 (S/4HANA, Business Suite) |
| **Base URL** | `https://{host}:{port}/sap/opu/odata/sap/` (on-premise) oppure `https://{host}.s4hana.cloud.sap/sap/opu/odata4/sap/` (cloud) |
| **Auth** | Basic Auth (on-premise) oppure OAuth 2.0 (SAP BTP, cloud) |
| **Docs** | https://api.sap.com/ (SAP Business Accelerator Hub) |

#### Auth Method

```
On-premise:
- Basic Auth (username + password)
- X-CSRF-Token: fetch con GET (header X-CSRF-Token: Fetch), poi POST/PUT con token ricevuto
- Session cookie: set-cookie dalla risposta CSRF

Cloud (S/4HANA Cloud, BTP):
- OAuth 2.0 Client Credentials
- Token URL: https://{subdomain}.authentication.{region}.hana.ondemand.com/oauth/token
- Scopes: variabili per servizio

Nota SAP: ogni richiesta mutante (POST/PUT/PATCH/DELETE) richiede X-CSRF-Token.
Il connector deve implementare il pattern fetch-token -> cache -> retry-on-403.
```

#### Entita principali da sincronizzare

| Servizio SAP | Entita OData | Campi chiave | Uso |
|-------------|-------------|-------------|-----|
| API_BUSINESS_PARTNER | A_BusinessPartner | BusinessPartner, BusinessPartnerFullName, Industry, LegalForm | Anagrafica clienti/fornitori |
| API_SALES_ORDER_SRV | A_SalesOrder | SalesOrder, SalesOrganization, TotalNetAmount, OverallSDProcessStatus | Ordini vendita |
| API_PRODUCT_SRV | A_Product | Product, ProductType, BaseUnit, ProductGroup | Anagrafica prodotti |
| API_BILLING_DOCUMENT_SRV | A_BillingDocument | BillingDocument, BillingDocumentDate, TotalNetAmount | Fatture |
| API_PURCHASEORDER_PROCESS_SRV | A_PurchaseOrder | PurchaseOrder, Supplier, PurchaseOrderDate | Ordini acquisto |

#### Rate Limits e Pagination

| Parametro | Valore |
|-----------|--------|
| Max records per pagina OData | Default 100, configurabile fino a 5000 (`$top`) |
| Pagination | Server-driven: `__next` link (OData V2) o `@odata.nextLink` (V4) |
| Timeout richieste | 600s max (query complesse) |
| Rate limit | Non documentato ufficialmente; dipende da infrastruttura cliente |
| Batch request | OData `$batch`: fino a 100 operazioni per batch request |
| Delta | `$filter=LastChangeDateTime gt datetime'...'` oppure Change Data Capture (CDC) |

#### Schema Mapping verso Supabase

```sql
-- Stessa tabella crm_records (multi-tenant)
-- object_type = "BusinessPartner", "SalesOrder", "Product", etc.
-- connector_source = "sap"
-- data = JSON completo dell'entita OData
-- mapped_fields = campi normalizzati

-- Nota: gli ID SAP sono stringhe alfanumeriche (es. "0010000001" per BusinessPartner)
```

#### Effort stimato

| Fase | Giorni | Note |
|------|--------|------|
| Auth Basic + CSRF | 2 | Pattern fetch-token, cache, retry-on-403 |
| Auth OAuth2 (cloud) | 1.5 | Client Credentials flow |
| Connector OData | 3 | OData V2 parser, `$expand`, `$select`, `$filter`, pagination |
| Transformer | 1.5 | OData entity -> crm_records, gestione tipi SAP (Edm.DateTime, Edm.Decimal) |
| Validator | 0.5 | Field presence, type validation |
| Store + migration | 0.5 | Riuso `crm_records` |
| Test | 2 | Mockserver OData per unit test |
| **Totale** | **11** | |

---

### 3.3 NetSuite Connector

#### API Reference

| Aspetto | Dettaglio |
|---------|----------|
| **API** | NetSuite REST API (SuiteQL) + SuiteTalk REST Web Services |
| **Base URL** | `https://{accountId}.suitetalk.api.netsuite.com/services/rest/` |
| **Auth** | OAuth 1.0 TBA (Token-Based Authentication) oppure OAuth 2.0 |
| **Docs** | https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/ |

#### Auth Method

```
Token-Based Authentication (TBA) — raccomandato per server-to-server:
- OAuth 1.0a con 4 credenziali:
  1. Consumer Key (Application ID)
  2. Consumer Secret
  3. Token Key
  4. Token Secret
- Ogni richiesta firmata con HMAC-SHA256
- Nessun refresh necessario (token permanente)

OAuth 2.0 (Machine-to-Machine):
- Client Credentials flow
- Certificate-based
- Token URL: https://{accountId}.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token
```

#### Entita principali da sincronizzare

| Record Type NetSuite | Endpoint REST | Campi chiave | Uso |
|---------------------|---------------|-------------|-----|
| Customer | `/record/v1/customer` | id, companyName, email, phone, subsidiary | Anagrafica clienti |
| Invoice | `/record/v1/invoice` | id, entity (customer), tranDate, total, status | Fatture |
| SalesOrder | `/record/v1/salesOrder` | id, entity, tranDate, total, orderStatus | Ordini vendita |
| Vendor | `/record/v1/vendor` | id, companyName, email, phone | Fornitori |
| Item | `/record/v1/inventoryItem` | id, itemId, displayName, basePrice, quantityOnHand | Prodotti |

SuiteQL alternativa (query SQL-like):
```sql
SELECT id, companyName, email, phone
FROM customer
WHERE lastModifiedDate > '2026-01-01'
LIMIT 1000 OFFSET 0
```

#### Rate Limits e Pagination

| Parametro | Valore |
|-----------|--------|
| Concurrent requests | 10 per account |
| REST API rate limit | Variabile per account tier (tipicamente 10 req/s) |
| SuiteQL max results | 1000 per query (pagination via `OFFSET`) |
| REST record list max | 1000 per pagina (`limit` + `offset`) |
| Governance units | 5-10 units per REST call, 10,000 units budget per script |

#### Schema Mapping verso Supabase

```sql
-- Stessa tabella crm_records (multi-tenant)
-- connector_source = "netsuite"
-- object_type = "customer", "invoice", "salesOrder", etc.
-- external_id = NetSuite internal ID (numerico convertito a stringa)
-- data = JSON completo del record
-- mapped_fields = campi normalizzati
```

#### Effort stimato

| Fase | Giorni | Note |
|------|--------|------|
| Auth OAuth 1.0 TBA | 2.5 | HMAC-SHA256 signature, 4 credenziali, nonce |
| Auth OAuth 2.0 | 1 | Client Credentials (alternativa) |
| Connector REST | 2 | Record CRUD, SuiteQL query, pagination |
| Transformer | 1 | NetSuite record -> crm_records, custom fields |
| Validator | 0.5 | Required fields, reference integrity |
| Store + migration | 0.5 | Riuso `crm_records` |
| Test | 2 | NetSuite Sandbox per integration test |
| **Totale** | **9.5** | |

---

## 4. Migration Plan

### 4.1 Migrazione connettori esistenti

**Strategia: non-breaking, opt-in.** I connettori esistenti (Normattiva, EUR-Lex, StatPearls, EuropePMC, OpenStax) continuano a funzionare senza modifiche. La migrazione al framework V2 e' opzionale.

#### Fase 1: Infrastruttura (5 giorni)

1. Creare `auth/` directory con `AuthProvider` interface e implementazioni
2. Creare `BaseConnectorV2` che estende `BaseConnector` con auth + rate limit + pagination
3. Creare `transformers/` directory con `TransformerInterface`
4. Estrarre la trasformazione inline di `index.ts` (righe 222-232) in `legal-article-transformer.ts`
5. Aggiornare `plugin-registry.ts` per supportare transformer e validator factories
6. Creare migration SQL per `connector_auth_tokens` e `crm_records`

#### Fase 2: Primo connettore MVP - Salesforce (9.5 giorni)

1. Implementare `auth/providers/oauth2-pkce-auth.ts`
2. Creare `connectors/salesforce.ts` (estende `BaseConnectorV2`)
3. Creare `transformers/salesforce-transformer.ts`
4. Registrare nel plugin-registry
5. Test con Salesforce Developer Edition (gratuita)

#### Fase 3: SAP Connector (11 giorni)

1. Implementare `auth/providers/basic-csrf-auth.ts` (pattern X-CSRF-Token)
2. Implementare `auth/providers/oauth2-cc-auth.ts` (Client Credentials)
3. Creare `connectors/sap.ts`
4. Creare `transformers/sap-transformer.ts`
5. Test con SAP API Business Hub sandbox

#### Fase 4: NetSuite Connector (9.5 giorni)

1. Implementare `auth/providers/oauth1-tba-auth.ts` (HMAC-SHA256)
2. Creare `connectors/netsuite.ts`
3. Creare `transformers/netsuite-transformer.ts`
4. Test con NetSuite sandbox account

#### Fase 5: Migrazione opzionale connettori esistenti (3 giorni)

1. Se desiderato: migrare Normattiva/EUR-Lex a `BaseConnectorV2` con `AuthMethod: "none"`
2. Estrarre parsing inline in transformer dedicati
3. Vantaggio: rate limit configurabile, pagination unificata
4. **Non bloccante:** i connettori V1 continuano a funzionare indefinitamente

### 4.2 Backward Compatibility

| Aspetto | Strategia |
|---------|-----------|
| `BaseConnector` (V1) | Rimane invariato, non viene eliminato |
| `ConnectorInterface` | Non cambia, connettori V1 lo implementano ancora |
| `DataSource.config` | Rimane `Record<string, unknown>`, V2 fa Zod validation interna |
| `plugin-registry.ts` | Solo aggiunte, nessuna modifica alle API esistenti |
| `index.ts` (orchestratore) | Aggiunge fase Transform opzionale (se transformer registrato) |
| CLI (`scripts/data-connector.ts`) | Comandi identici, nuovi connettori accessibili con gli stessi comandi |
| Sync log | Stessa tabella, nuova colonna opzionale `connector_version` |

### 4.3 Testing Strategy

| Livello | Cosa | Come |
|---------|------|------|
| Unit | Auth providers | Mock delle API di token, verifica headers generati |
| Unit | Transformers | Input fisso -> output atteso, edge cases |
| Unit | Validators | Record validi/invalidi, boundary conditions |
| Unit | BaseConnectorV2 | Mock fetch, verifica retry/auth/pagination |
| Integration | Salesforce | Salesforce Developer Edition (free), oggetti di test |
| Integration | SAP | SAP API Business Hub sandbox (free trial) |
| Integration | NetSuite | NetSuite sandbox (richiede licenza) |
| E2E | Pipeline completa | Source registrata -> CONNECT -> TRANSFORM -> VALIDATE -> LOAD -> verifica DB |
| Regression | Connettori V1 | Suite test esistenti non devono rompersi |

**Coverage target:** 80%+ per auth, transformer, validator. Integration test per ogni connettore MVP.

### 4.4 File structure finale

```
lib/staff/data-connector/
├── index.ts                          # Orchestratore (aggiornato: fase Transform)
├── types.ts                          # Tipi base (invariati)
├── types-v2.ts                       # Tipi estesi: AuthConfig, BaseConnectorConfig, etc.
├── plugin-registry.ts                # Registry (esteso: transformer, validator)
├── registry.ts                       # Source registry (invariato)
├── sync-log.ts                       # Sync log (invariato)
├── auth/
│   ├── types.ts                      # AuthMethod, AuthConfig, AuthProvider
│   ├── index.ts                      # createAuthProvider() factory
│   └── providers/
│       ├── none-auth.ts              # Noop (fonti pubbliche)
│       ├── api-key-auth.ts           # Header statico
│       ├── basic-auth.ts             # Base64
│       ├── basic-csrf-auth.ts        # Basic + X-CSRF-Token (SAP)
│       ├── oauth2-auth.ts            # Authorization Code
│       ├── oauth2-pkce-auth.ts       # PKCE (Salesforce, HubSpot)
│       ├── oauth2-cc-auth.ts         # Client Credentials (SAP Cloud)
│       └── oauth1-tba-auth.ts        # OAuth 1.0 TBA (NetSuite)
├── connectors/
│   ├── base.ts                       # BaseConnector V1 (invariato)
│   ├── base-v2.ts                    # BaseConnectorV2 (auth, rate limit, pagination)
│   ├── normattiva.ts                 # Invariato (V1)
│   ├── eurlex.ts                     # Invariato (V1)
│   ├── statpearls.ts                 # Invariato (V1)
│   ├── europepmc.ts                  # Invariato (V1)
│   ├── openstax.ts                   # Invariato (V1)
│   ├── salesforce.ts                 # NUOVO (V2)
│   ├── sap.ts                        # NUOVO (V2)
│   └── netsuite.ts                   # NUOVO (V2)
├── transformers/
│   ├── types.ts                      # TransformerInterface, TransformRule
│   ├── field-mapper.ts               # Mapping dichiarativo generico
│   ├── legal-article-transformer.ts  # Estratto da index.ts righe 222-232
│   ├── salesforce-transformer.ts     # SObject -> crm_records
│   ├── sap-transformer.ts            # OData entity -> crm_records
│   └── netsuite-transformer.ts       # NS record -> crm_records
├── parsers/
│   ├── akn-parser.ts                 # Invariato
│   └── html-parser.ts                # Invariato
├── models/
│   └── legal-article-model.ts        # Invariato
├── stores/
│   ├── legal-corpus-store.ts         # Invariato
│   └── crm-store.ts                  # NUOVO: upsert su crm_records
├── validators/
│   ├── article-validator.ts          # Invariato
│   └── crm-validator.ts             # NUOVO: validazione record CRM
```

### 4.5 Migration SQL

```sql
-- Migration: connector_auth_tokens + crm_records
-- Eseguire su Supabase SQL Editor

-- 1. Token storage per OAuth
CREATE TABLE IF NOT EXISTS public.connector_auth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id text NOT NULL UNIQUE,          -- "salesforce", "sap", "netsuite"
  access_token text NOT NULL,                 -- encrypted via pgcrypto
  refresh_token text,
  token_type text DEFAULT 'Bearer',
  expires_at timestamptz,
  scopes text[],
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS: solo service_role
ALTER TABLE connector_auth_tokens ENABLE ROW LEVEL SECURITY;

-- 2. Record CRM generici
CREATE TABLE IF NOT EXISTS public.crm_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_source text NOT NULL,
  object_type text NOT NULL,
  external_id text NOT NULL,
  data jsonb NOT NULL,
  mapped_fields jsonb DEFAULT '{}',
  last_modified_at timestamptz,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(connector_source, object_type, external_id)
);

CREATE INDEX crm_records_source_type_idx ON crm_records(connector_source, object_type);
CREATE INDEX crm_records_external_id_idx ON crm_records(external_id);
CREATE INDEX crm_records_data_gin_idx ON crm_records USING gin(data);
CREATE INDEX crm_records_synced_at_idx ON crm_records(synced_at);

ALTER TABLE crm_records ENABLE ROW LEVEL SECURITY;
```

---

## 5. Riepilogo Effort

| Fase | Giorni | Dipendenze |
|------|--------|-----------|
| Infrastruttura (auth, base-v2, transformer, migration) | 5 | Nessuna |
| Salesforce MVP | 9.5 | Infrastruttura + Salesforce Dev Edition account |
| SAP MVP | 11 | Infrastruttura + SAP API Hub account |
| NetSuite MVP | 9.5 | Infrastruttura + NetSuite sandbox |
| Migrazione connettori V1 (opzionale) | 3 | Infrastruttura |
| **Totale** | **38** (senza migrazione V1: **35**) | |

**Parallelizzazione:** dopo l'infrastruttura, i 3 connettori MVP possono essere sviluppati in parallelo da agenti diversi. Effort minimo sequenziale: 5 (infra) + 11 (SAP, il piu' lungo) = **16 giorni**.

---

## 6. Rischi e Mitigazioni

| Rischio | Probabilita | Impatto | Mitigazione |
|---------|------------|---------|-------------|
| API Salesforce cambia versione | Bassa | Medio | `apiVersion` configurabile, versionamento minimo v58+ |
| SAP on-premise non raggiungibile | Media | Alto | Richiedere VPN/tunnel, fallback su SAP Cloud trial |
| NetSuite TBA deprecation | Bassa | Medio | Implementare anche OAuth 2.0 M2M come alternativa |
| `crm_records` troppo generica (performance) | Bassa | Medio | GIN index su data, partizionamento per connector_source se necessario |
| OAuth token leak | Media | Alto | Encrypt at rest (pgcrypto), RLS service_role only, no log di token |
| Breaking changes a V1 connettori | Bassissima | Alto | V1 non viene toccato, V2 e' additive-only |

---

## 7. Prerequisiti per approvazione

- [ ] Approvazione boss (L3) — task cross-dipartimento con impatto architetturale
- [ ] Account Salesforce Developer Edition (gratuito) per test
- [ ] Accesso SAP API Business Hub sandbox (gratuito con registrazione)
- [ ] Accesso NetSuite sandbox (richiede licenza o trial)
- [ ] Review Architecture dept per design V2

---

*Piano creato da data-connector, Data Engineering. Pronto per review e approvazione.*
