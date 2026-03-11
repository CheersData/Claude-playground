# Connector Framework Design — Business Connectors (Salesforce, SAP, NetSuite)

**Task ID**: 793c5350
**Data**: 2026-03-10
**Autore**: Data Engineering dept (builder)
**Stato**: DESIGN (non implementato)

---

## 1. Executive Summary

Il framework Data Connector attuale gestisce fonti legislative pubbliche (Normattiva, EUR-Lex) e mediche (StatPearls, EuropePMC) con un pattern CONNECT->MODEL->LOAD. Le fonti attuali sono tutte **non autenticate**, con dati pubblici, strutture fisse e rate limit generosi.

I connettori business (Salesforce, SAP, NetSuite) introducono requisiti fondamentalmente diversi:

| Requisito | Fonti attuali | Fonti business |
|-----------|--------------|----------------|
| Autenticazione | Nessuna (pubbliche) | OAuth2, API key, certificati |
| Paginazione | Manuale/ZIP bulk | Cursor-based, offset, SOQL |
| Rate limiting | 1s pausa generica | Per-provider, per-endpoint, burst + sustained |
| Schema dati | Fisso (articoli legali) | Dinamico (oggetti CRM/ERP custom) |
| Volume | ~5000 articoli (one-shot) | Milioni di record (incrementale) |
| Refresh | Settimanale/mensile | Real-time / near-real-time |
| Credenziali | Nessuna | Vault/env vars, refresh token rotation |

Questo documento descrive il refactor del framework per supportare entrambi i mondi senza rompere i connettori esistenti.

---

## 2. Architettura Attuale (As-Is)

### 2.1 Pipeline 3 fasi

```
CONNECT (fetch HTML/XML)  -->  MODEL (parse to articles)  -->  LOAD (ingest to Supabase)
        |                            |                              |
   BaseConnector              LegalArticleModel              LegalCorpusStore
   NormattivaConnector                                       ingestArticles()
   EurLexConnector
   StatPearlsConnector
```

### 2.2 Classe base: BaseConnector

```typescript
abstract class BaseConnector<T> implements ConnectorInterface<T> {
  abstract connect(): Promise<ConnectResult>;
  abstract fetchAll(options?: { limit?: number }): Promise<FetchResult<T>>;
  abstract fetchDelta(since: string, options?: { limit?: number }): Promise<FetchResult<T>>;

  protected fetchWithRetry(url, options, maxRetries=3): Promise<Response>;
  protected fetchJSON<R>(url, options): Promise<R>;
  protected rateLimitPause(): Promise<void>;  // sleep(1000) fisso
  protected cleanText(text): string;
}
```

### 2.3 Plugin Registry

Risoluzione connector/model/store via factory map (`plugin-registry.ts`):
- `registerConnector(connectorId, factory)` -- risolto per `source.connector`
- `registerModel(dataType, factory)` -- risolto per `source.dataType`
- `registerStore(dataType, factory)` -- risolto per `source.dataType`

### 2.4 Punti di forza da preservare

1. **Pipeline orchestrata** (`index.ts`): `runPipeline()` con stop-after, sync log, validazione -- riusabile al 100%
2. **Plugin registry**: open/closed principle, nessun switch -- riusabile al 100%
3. **Sync log**: tracciamento su Supabase -- riusabile al 100%
4. **Vertical registry**: `registerVertical()` per domini separati -- riusabile al 100%

### 2.5 Limiti da superare

1. **`BaseConnector.rateLimitPause()`**: sleep(1000) fisso, non configurabile per provider
2. **Nessun auth**: `fetchWithRetry()` non gestisce token, refresh, header Authorization
3. **Nessuna paginazione**: ogni connector implementa la propria logica ad-hoc
4. **`ConnectorInterface<T>`**: generico ma `T` e sempre `ParsedArticle` nella pratica
5. **`StoreInterface<T>`**: tipizzato su `LegalArticle`, non su record business generici
6. **`DataModelSpec`**: rigido su `legal_articles` schema, non supporta tabelle dinamiche

---

## 3. Architettura Target (To-Be)

### 3.1 Pipeline estesa

```
CONNECT (auth + paginated fetch)  -->  MODEL (schema mapping)  -->  LOAD (upsert to tables)
         |                                    |                             |
    BusinessConnector                  BusinessModel                  BusinessStore
    [auth(), paginate()]              [mapSchema()]                  [upsert()]
         |                                    |                             |
    SalesforceConnector               DynamicTableModel              GenericTableStore
    SAPConnector                                                     (o store specifici)
    NetSuiteConnector
```

### 3.2 Principio guida: estensione, non sostituzione

```
BaseConnector (invariato)
    |
    +-- NormattivaConnector (invariato)
    +-- EurLexConnector (invariato)
    +-- StatPearlsConnector (invariato)
    |
    +-- BusinessConnector (NUOVO, estende BaseConnector)
            |
            +-- SalesforceConnector
            +-- SAPConnector
            +-- NetSuiteConnector
```

I connettori legali/medici non vengono toccati. `BusinessConnector` aggiunge capacita sopra `BaseConnector`.

---

## 4. Nuove Interfacce e Classi

### 4.1 Auth System

```typescript
// lib/staff/data-connector/auth/types.ts

export type AuthType = "oauth2" | "oauth2-pkce" | "api-key" | "basic" | "custom-header" | "certificate";

export interface AuthConfig {
  type: AuthType;

  // OAuth2
  clientId?: string;
  clientSecret?: string;
  tokenUrl?: string;
  authorizeUrl?: string;
  scopes?: string[];
  redirectUri?: string;

  // API Key
  apiKey?: string;
  apiKeyHeader?: string;        // default: "Authorization"
  apiKeyPrefix?: string;        // default: "Bearer"

  // Basic Auth
  username?: string;
  password?: string;

  // Custom Header
  customHeaders?: Record<string, string>;

  // Certificate (mTLS per SAP)
  certPath?: string;
  keyPath?: string;
}

export interface TokenState {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;             // Unix timestamp ms
  tokenType?: string;
  instanceUrl?: string;          // Salesforce-specific
}

export interface AuthProvider {
  /** Ottieni headers autenticati per la richiesta */
  getAuthHeaders(): Promise<Record<string, string>>;
  /** Forza il refresh del token (utile dopo 401) */
  refresh(): Promise<void>;
  /** True se il token corrente e scaduto o assente */
  isExpired(): boolean;
}
```

### 4.2 Pagination System

```typescript
// lib/staff/data-connector/pagination/types.ts

export type PaginationType = "cursor" | "offset" | "page" | "link-header" | "custom";

export interface PaginationConfig {
  type: PaginationType;
  pageSize: number;              // default: 200

  // Cursor-based (Salesforce, NetSuite SuiteQL)
  cursorField?: string;          // es. "nextRecordsUrl" (Salesforce), "links.next" (NetSuite)

  // Offset-based (SAP OData)
  offsetParam?: string;          // default: "$skip"
  limitParam?: string;           // default: "$top"

  // Page-based
  pageParam?: string;            // default: "page"

  // Max pages (safety net)
  maxPages?: number;             // default: 1000
}

export interface PageResult<T> {
  items: T[];
  hasMore: boolean;
  cursor?: string;               // per cursor-based
  nextOffset?: number;           // per offset-based
  totalEstimate?: number;        // se disponibile dall'API
}

export interface Paginator<T> {
  /** Fetch una pagina. Ritorna items + info per la pagina successiva. */
  fetchPage(cursor?: string | number): Promise<PageResult<T>>;
  /** Iteratore asincrono su tutte le pagine */
  [Symbol.asyncIterator](): AsyncIterableIterator<T[]>;
}
```

### 4.3 Rate Limiter

```typescript
// lib/staff/data-connector/rate-limit/types.ts

export interface RateLimitConfig {
  /** Richieste massime per finestra */
  requestsPerWindow: number;
  /** Durata finestra in ms (default: 60_000 = 1 minuto) */
  windowMs: number;
  /** Pausa minima tra richieste in ms (default: 0) */
  minIntervalMs?: number;
  /** Retry automatico su 429 (default: true) */
  retryOn429?: boolean;
  /** Max tentativi su 429 (default: 5) */
  max429Retries?: number;
  /** Rispetta header Retry-After (default: true) */
  honorRetryAfter?: boolean;
}

export interface RateLimiter {
  /** Attendi se necessario prima di procedere */
  acquire(): Promise<void>;
  /** Registra una richiesta completata */
  release(): void;
  /** Resetta il contatore (utile per test) */
  reset(): void;
}
```

### 4.4 BusinessConnector Base Class

```typescript
// lib/staff/data-connector/connectors/business/base.ts

import { BaseConnector } from "../base";
import type { AuthConfig, AuthProvider } from "../../auth/types";
import type { PaginationConfig, Paginator } from "../../pagination/types";
import type { RateLimitConfig, RateLimiter } from "../../rate-limit/types";
import type { DataSource, ConnectResult, FetchResult } from "../../types";

export interface BusinessConnectorConfig {
  auth: AuthConfig;
  pagination: PaginationConfig;
  rateLimit: RateLimitConfig;
  /** Base URL API (es. https://login.salesforce.com, https://xxx.suitetalk.api.netsuite.com) */
  apiBaseUrl: string;
  /** API version (es. "v62.0" per Salesforce, "v1" per NetSuite) */
  apiVersion?: string;
}

export interface BusinessEntity {
  /** Nome dell'oggetto nel sistema sorgente (es. "Account", "Opportunity", "BusinessPartner") */
  objectName: string;
  /** Campi da estrarre (se vuoto = tutti) */
  fields?: string[];
  /** Filtro query (SOQL WHERE per Salesforce, OData $filter per SAP, etc.) */
  filter?: string;
  /** Ordine (per paginazione stabile) */
  orderBy?: string;
}

/** Record business generico: chiave-valore dinamico */
export type BusinessRecord = Record<string, unknown>;

export abstract class BusinessConnector extends BaseConnector<BusinessRecord> {
  protected auth: AuthProvider;
  protected rateLimiter: RateLimiter;
  protected config: BusinessConnectorConfig;

  constructor(
    source: DataSource,
    log: (msg: string) => void = console.log
  ) {
    super(source, log);
    this.config = this.buildConfig();
    this.auth = this.createAuthProvider(this.config.auth);
    this.rateLimiter = this.createRateLimiter(this.config.rateLimit);
  }

  /** Costruisce la config specifica del connettore dalle env vars e source.config */
  protected abstract buildConfig(): BusinessConnectorConfig;

  /** Crea un AuthProvider appropriato per il tipo di auth */
  protected createAuthProvider(authConfig: AuthConfig): AuthProvider {
    // Factory per tipo: OAuth2Provider, ApiKeyProvider, BasicAuthProvider, etc.
    // Implementazione in lib/staff/data-connector/auth/providers.ts
    throw new Error("Da implementare: createAuthProvider factory");
  }

  /** Crea un RateLimiter con la config specificata */
  protected createRateLimiter(config: RateLimitConfig): RateLimiter {
    // Implementazione sliding window in lib/staff/data-connector/rate-limit/sliding-window.ts
    throw new Error("Da implementare: createRateLimiter factory");
  }

  /** Override: aggiunge auth headers e rate limiting */
  protected override async fetchWithRetry(
    url: string,
    options?: RequestInit,
    maxRetries = 3
  ): Promise<Response> {
    await this.rateLimiter.acquire();

    const authHeaders = await this.auth.getAuthHeaders();
    const mergedOptions = {
      ...options,
      headers: {
        ...Object.fromEntries(new Headers(options?.headers ?? {}).entries()),
        ...authHeaders,
      },
    };

    try {
      const response = await super.fetchWithRetry(url, mergedOptions, maxRetries);

      // Handle 401: refresh token e retry
      if (response.status === 401 && !this.auth.isExpired()) {
        this.log("[AUTH] 401 ricevuto, refresh token...");
        await this.auth.refresh();
        const newHeaders = await this.auth.getAuthHeaders();
        mergedOptions.headers = { ...mergedOptions.headers, ...newHeaders };
        return super.fetchWithRetry(url, mergedOptions, maxRetries);
      }

      return response;
    } finally {
      this.rateLimiter.release();
    }
  }

  /** Fetch paginato: ritorna tutti i record di un'entity attraverso tutte le pagine */
  protected async fetchAllPages<T = BusinessRecord>(
    entity: BusinessEntity,
    paginationConfig?: Partial<PaginationConfig>
  ): Promise<T[]> {
    const paginator = this.createPaginator<T>(entity, paginationConfig);
    const allItems: T[] = [];
    let pageCount = 0;

    for await (const page of paginator) {
      allItems.push(...page);
      pageCount++;
      this.log(`[PAGINATE] Pagina ${pageCount} | ${page.length} items | totale: ${allItems.length}`);
    }

    return allItems;
  }

  /** Crea un Paginator per l'entity specificata. Implementato dal connettore specifico. */
  protected abstract createPaginator<T = BusinessRecord>(
    entity: BusinessEntity,
    config?: Partial<PaginationConfig>
  ): Paginator<T>;

  /** Lista delle entity disponibili (per connect/census) */
  abstract listEntities(): Promise<string[]>;

  /** Descrivi i campi di un'entity (per MODEL phase) */
  abstract describeEntity(entityName: string): Promise<Array<{
    name: string;
    type: string;
    label: string;
    required: boolean;
  }>>;
}
```

### 4.5 BusinessModel e BusinessStore

```typescript
// lib/staff/data-connector/models/business-model.ts

import type { ModelInterface, DataModelSpec, ModelResult } from "../types";

/**
 * Business Model -- Crea/verifica tabelle dinamiche basate sullo schema dell'entity sorgente.
 *
 * A differenza di LegalArticleModel (schema fisso "legal_articles"),
 * BusinessModel crea tabelle per entity: "sf_accounts", "sf_opportunities", "sap_business_partners".
 *
 * Naming convention tabelle: {prefix}_{entity_snake_case}
 *   - sf_* per Salesforce
 *   - sap_* per SAP
 *   - ns_* per NetSuite
 */
export class BusinessModel implements ModelInterface {
  constructor(
    private tablePrefix: string,      // "sf" | "sap" | "ns"
    private entityName: string,       // "Account" | "Opportunity"
  ) {}

  async analyze(sampleData: unknown[]): Promise<DataModelSpec> {
    // Analizza i sample per inferire colonne e tipi Postgres
    // Mappa: string->text, number->numeric, boolean->boolean, date->timestamptz, object->jsonb
    // Aggiunge sempre: id (uuid PK), source_id (text, ID nel sistema sorgente),
    //                  synced_at (timestamptz), raw_data (jsonb, record originale)
    throw new Error("Da implementare");
  }

  async checkSchema(spec: DataModelSpec): Promise<ModelResult> {
    // Come LegalArticleModel.checkSchema ma per tabelle dinamiche
    throw new Error("Da implementare");
  }

  describeTransform(spec: DataModelSpec): string {
    return spec.transformRules.map(r =>
      `${r.sourceField} -> ${r.targetColumn} (${r.transform})`
    ).join(" | ");
  }
}
```

```typescript
// lib/staff/data-connector/stores/business-store.ts

import type { StoreInterface, StoreResult } from "../types";
import type { BusinessRecord } from "../connectors/business/base";

/**
 * Business Store -- Upsert generico su tabelle dinamiche.
 *
 * A differenza di LegalCorpusStore (chiama ingestArticles),
 * BusinessStore fa upsert diretto su Supabase con conflict resolution su source_id.
 */
export class BusinessStore implements StoreInterface<BusinessRecord> {
  constructor(
    private tableName: string,
    private sourceIdField: string,    // campo nel record che contiene l'ID sorgente (es. "Id" per SF)
    private log: (msg: string) => void = console.log,
  ) {}

  async save(
    items: BusinessRecord[],
    options?: { dryRun?: boolean; skipEmbeddings?: boolean }
  ): Promise<StoreResult> {
    // Batch upsert con ON CONFLICT (source_id) DO UPDATE
    // Aggiunge synced_at e raw_data a ogni record
    throw new Error("Da implementare");
  }
}
```

---

## 5. MVP Connector Specs

### 5.1 Salesforce Connector

**API**: Salesforce REST API (SOQL + sObject)
**Documentazione**: https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/

#### Auth Flow

```
OAuth2 (Web Server Flow) oppure OAuth2 (Client Credentials per server-to-server)
  1. POST https://login.salesforce.com/services/oauth2/token
     grant_type=client_credentials (o authorization_code)
     client_id=SALESFORCE_CLIENT_ID
     client_secret=SALESFORCE_CLIENT_SECRET
  2. Risposta: { access_token, instance_url, token_type }
  3. Tutte le API usano instance_url + access_token
  4. Refresh: POST /services/oauth2/token con grant_type=refresh_token
```

#### Key Entities

| Entity | API Endpoint | Uso tipico |
|--------|-------------|------------|
| Account | `/services/data/vXX.0/sobjects/Account` | Aziende clienti |
| Contact | `/services/data/vXX.0/sobjects/Contact` | Persone di contatto |
| Opportunity | `/services/data/vXX.0/sobjects/Opportunity` | Pipeline commerciale |
| Lead | `/services/data/vXX.0/sobjects/Lead` | Prospect |
| Case | `/services/data/vXX.0/sobjects/Case` | Ticket supporto |
| Contract | `/services/data/vXX.0/sobjects/Contract` | Contratti (rilevante per analisi legale) |
| Custom Objects | `/services/data/vXX.0/sobjects/{CustomObject__c}` | Oggetti personalizzati |

#### Paginazione

```
Tipo: cursor-based (nextRecordsUrl)
Query: GET /services/data/vXX.0/query?q=SELECT+Id,Name+FROM+Account
Risposta: { records: [...], done: false, nextRecordsUrl: "/services/data/vXX.0/query/01gxx000000M..." }
Pagina successiva: GET {instance_url}{nextRecordsUrl}
Page size: 2000 (max), configurabile con LIMIT in SOQL
```

#### Rate Limits

| Piano Salesforce | Limite API | Finestra |
|-----------------|-----------|----------|
| Enterprise | 100,000 req/24h | Rolling 24h |
| Unlimited | 100,000 req/24h (+ 5M purchased) | Rolling 24h |
| Per-utente | 1,000 req/utente concorrente/ora | Rolling 1h |
| Burst | 25 req simultanee | Instantaneo |

```typescript
// Config consigliata
const salesforceRateLimit: RateLimitConfig = {
  requestsPerWindow: 900,      // conservativo: 900/h (vs 1000/h limit)
  windowMs: 3_600_000,         // 1 ora
  minIntervalMs: 100,          // 100ms tra richieste (evita burst)
  retryOn429: true,
  max429Retries: 3,
  honorRetryAfter: true,
};
```

#### Env vars

```env
SALESFORCE_CLIENT_ID=...
SALESFORCE_CLIENT_SECRET=...
SALESFORCE_LOGIN_URL=https://login.salesforce.com    # o https://test.salesforce.com per sandbox
SALESFORCE_API_VERSION=v62.0
```

#### Effort stimato

| Componente | Effort |
|-----------|--------|
| OAuth2 provider (client_credentials + refresh) | 4h |
| SalesforceConnector (SOQL query + cursor pagination) | 6h |
| Entity discovery (describe sObject) | 2h |
| Test unitari + integration | 4h |
| **Totale** | **16h (~2 giorni)** |

---

### 5.2 SAP Connector

**API**: SAP Business Technology Platform OData V4
**Documentazione**: https://help.sap.com/docs/SAP_S4HANA_CLOUD/

#### Auth Flow

```
Opzione 1: OAuth2 (SAP BTP con XSUAA)
  1. POST https://{subdomain}.authentication.{region}.hana.ondemand.com/oauth/token
     grant_type=client_credentials
     client_id=SAP_CLIENT_ID
     client_secret=SAP_CLIENT_SECRET
  2. Risposta: { access_token, token_type, expires_in }

Opzione 2: Basic Auth (SAP on-premise)
  Authorization: Basic base64(user:pass)

Opzione 3: API Key (SAP API Hub sandbox)
  APIKey: {api_key}
```

#### Key Entities (OData services)

| Entity Set | Service | Uso tipico |
|-----------|---------|------------|
| A_BusinessPartner | API_BUSINESS_PARTNER | Clienti, fornitori, partner |
| A_SalesOrder | API_SALES_ORDER_SRV | Ordini di vendita |
| A_PurchaseOrder | API_PURCHASEORDER_PROCESS_SRV | Ordini di acquisto |
| A_ProductMasterPlant | API_PRODUCT_SRV | Anagrafica prodotti |
| A_BillingDocument | API_BILLING_DOCUMENT_SRV | Fatture |
| A_MaintenanceOrder | API_MAINTENANCEORDER | Ordini di manutenzione |

#### Paginazione

```
Tipo: offset-based (OData $skip/$top)
Query: GET /sap/opu/odata4/sap/API_BUSINESS_PARTNER/A_BusinessPartner?$top=100&$skip=0
Response: { value: [...], @odata.count: 12500, @odata.nextLink: "...?$skip=100" }
Max page size: $top=5000 (varia per service)
```

#### Rate Limits

| Tipo | Limite | Note |
|------|--------|------|
| SAP BTP Cloud | 1,000 req/min per subaccount | Configurabile |
| SAP S/4HANA Cloud | 300 req/min per utente | Dipende dal contratto |
| SAP API Hub (sandbox) | 120 req/min | Free tier per testing |

```typescript
const sapRateLimit: RateLimitConfig = {
  requestsPerWindow: 250,       // conservativo: 250/min (vs 300/min limit)
  windowMs: 60_000,             // 1 minuto
  minIntervalMs: 250,           // 250ms tra richieste
  retryOn429: true,
  max429Retries: 5,
  honorRetryAfter: true,
};
```

#### Env vars

```env
SAP_BASE_URL=https://myXXXXXX.s4hana.cloud.sap
SAP_AUTH_TYPE=oauth2              # oauth2 | basic | api-key
SAP_CLIENT_ID=...
SAP_CLIENT_SECRET=...
SAP_TOKEN_URL=https://...authentication...hana.ondemand.com/oauth/token
# oppure per basic auth:
SAP_USERNAME=...
SAP_PASSWORD=...
```

#### Effort stimato

| Componente | Effort |
|-----------|--------|
| Auth provider (OAuth2 XSUAA + Basic fallback) | 4h |
| SAPConnector (OData V4 query + $skip/$top) | 8h |
| OData response parser ($metadata, $expand, nested entities) | 6h |
| Entity discovery ($metadata introspection) | 4h |
| Test unitari + integration | 4h |
| **Totale** | **26h (~3.5 giorni)** |

SAP e il connettore piu complesso per la varieta di servizi OData, la necessita di interpretare $metadata per lo schema, e i nested entities ($expand).

---

### 5.3 NetSuite Connector

**API**: NetSuite REST Web Services + SuiteQL
**Documentazione**: https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/

#### Auth Flow

```
OAuth 1.0a (Token-Based Authentication — TBA)
  1. Netsuite NON supporta OAuth2 per REST API (solo per SOAP, deprecata).
  2. TBA richiede: consumer key/secret + token key/secret (4 valori).
  3. Ogni richiesta firmata con firma OAuth 1.0a (HMAC-SHA256).
  4. Nessun refresh token: i token sono permanenti finche non revocati.
  5. Headers: Authorization: OAuth realm="ACCOUNT_ID",
       oauth_consumer_key="...", oauth_token="...",
       oauth_signature_method="HMAC-SHA256", oauth_timestamp="...",
       oauth_nonce="...", oauth_version="1.0", oauth_signature="..."
```

NOTA: OAuth 1.0a e significativamente piu complesso di OAuth2 per la firma delle richieste. Servira una libreria dedicata o implementazione custom della firma HMAC-SHA256.

#### Key Entities (SuiteQL)

| Tabella | Endpoint | Uso tipico |
|---------|---------|------------|
| customer | SuiteQL / Record API | Clienti |
| vendor | SuiteQL / Record API | Fornitori |
| salesOrder | SuiteQL / Record API | Ordini di vendita |
| invoice | SuiteQL / Record API | Fatture |
| item | SuiteQL / Record API | Prodotti/servizi |
| transaction | SuiteQL | Tutte le transazioni (vista unificata) |

#### Paginazione

```
SuiteQL: offset-based
  POST /services/rest/query/v1/suiteql
  Body: { q: "SELECT id, entityid FROM customer OFFSET 0 FETCH NEXT 1000 ROWS ONLY" }
  Risposta: { items: [...], hasMore: true, count: 1000, offset: 0, totalResults: 5432 }

Record API: link-based
  GET /services/rest/record/v1/customer?limit=1000
  Risposta: { items: [...], links: [{ rel: "next", href: "...?offset=1000" }] }
```

#### Rate Limits

| Tipo | Limite | Finestra |
|------|--------|----------|
| Integration governance | 10 req/s concorrenti | Istantaneo |
| Totale giornaliero | Basato su licenza (tipicamente 200K-500K/giorno) | 24h |
| SuiteQL | 10 query/s | Istantaneo |

```typescript
const netsuiteRateLimit: RateLimitConfig = {
  requestsPerWindow: 8,          // conservativo: 8/s (vs 10/s limit)
  windowMs: 1_000,               // 1 secondo
  minIntervalMs: 125,            // 125ms tra richieste
  retryOn429: true,
  max429Retries: 5,
  honorRetryAfter: true,
};
```

#### Env vars

```env
NETSUITE_ACCOUNT_ID=...          # es. "1234567" o "1234567_SB1" per sandbox
NETSUITE_CONSUMER_KEY=...
NETSUITE_CONSUMER_SECRET=...
NETSUITE_TOKEN_KEY=...
NETSUITE_TOKEN_SECRET=...
NETSUITE_BASE_URL=https://{ACCOUNT_ID}.suitetalk.api.netsuite.com
```

#### Effort stimato

| Componente | Effort |
|-----------|--------|
| OAuth 1.0a provider (HMAC-SHA256 signature) | 6h |
| NetSuiteConnector (SuiteQL + Record API) | 6h |
| SuiteQL query builder | 3h |
| Entity discovery (Record metadata API) | 3h |
| Test unitari + integration | 4h |
| **Totale** | **22h (~3 giorni)** |

---

## 6. Migration Path

### 6.1 Principio: zero impatto sui connettori esistenti

```
lib/staff/data-connector/
    connectors/
        base.ts                    # INVARIATO
        normattiva.ts              # INVARIATO
        eurlex.ts                  # INVARIATO
        statpearls.ts              # INVARIATO
        europepmc.ts               # INVARIATO
        openstax.ts                # INVARIATO
        business/                  # NUOVO -- directory dedicata
            base.ts                # BusinessConnector (estende BaseConnector)
            salesforce.ts          # SalesforceConnector
            sap.ts                 # SAPConnector
            netsuite.ts            # NetSuiteConnector
    auth/                          # NUOVO -- sistema autenticazione
        types.ts                   # Interfacce AuthConfig, TokenState, AuthProvider
        providers.ts               # OAuth2Provider, ApiKeyProvider, BasicAuthProvider
        oauth1.ts                  # OAuth1Provider (per NetSuite)
        token-store.ts             # Persistenza token (env var o Supabase)
    pagination/                    # NUOVO -- sistema paginazione
        types.ts                   # Interfacce PaginationConfig, Paginator
        cursor-paginator.ts        # Per Salesforce (nextRecordsUrl)
        offset-paginator.ts        # Per SAP OData ($skip/$top)
        link-paginator.ts          # Per NetSuite (links.next)
    rate-limit/                    # NUOVO -- rate limiter configurabile
        types.ts                   # Interfacce RateLimitConfig, RateLimiter
        sliding-window.ts          # Implementazione sliding window in-memory
    models/
        legal-article-model.ts     # INVARIATO
        business-model.ts          # NUOVO -- schema mapping dinamico
    stores/
        legal-corpus-store.ts      # INVARIATO
        business-store.ts          # NUOVO -- upsert generico su tabelle dinamiche
    validators/
        article-validator.ts       # INVARIATO
        business-validator.ts      # NUOVO -- validazione record business
    types.ts                       # ESTESO con nuovi DataType ("business-crm", "business-erp")
    index.ts                       # INVARIATO (pipeline gia generica)
    plugin-registry.ts             # ESTESO con registrazioni business connectors
    registry.ts                    # ESTESO con getSourcesByConnector per business
    sync-log.ts                    # INVARIATO
```

### 6.2 Modifiche a file esistenti (minime)

#### `types.ts` -- aggiungere DataType

```typescript
// Aggiungere:
export type DataType =
  | "legal-articles"
  | "medical-articles"
  | "hr-articles"
  | "market-data"
  | "model-benchmark"
  | "feed-items"
  | "business-crm"     // NUOVO: Salesforce, HubSpot, etc.
  | "business-erp";    // NUOVO: SAP, NetSuite, etc.
```

#### `types.ts` -- aggiungere BusinessRecord

```typescript
// Aggiungere:
export type BusinessRecord = Record<string, unknown>;
```

#### `plugin-registry.ts` -- registrare business connectors

```typescript
// Aggiungere in registerDefaults():

// Salesforce connector
registerConnector("salesforce", (source, log) => {
  const { SalesforceConnector } = require("./connectors/business/salesforce");
  return new SalesforceConnector(source, log);
});

// SAP connector
registerConnector("sap", (source, log) => {
  const { SAPConnector } = require("./connectors/business/sap");
  return new SAPConnector(source, log);
});

// NetSuite connector
registerConnector("netsuite", (source, log) => {
  const { NetSuiteConnector } = require("./connectors/business/netsuite");
  return new NetSuiteConnector(source, log);
});

// Business model + store
registerModel("business-crm", (source) => {
  const { BusinessModel } = require("./models/business-model");
  return new BusinessModel("sf", source.config.entityName as string);
});

registerStore("business-crm", (_source, log) => {
  const { BusinessStore } = require("./stores/business-store");
  return new BusinessStore(/* tableName da source.config */, "source_id", log);
});
```

#### `corpus-sources.ts` / nuovi file

I business source NON vanno in `corpus-sources.ts` (che e per fonti legislative).
Creare un nuovo file: `scripts/business-sources.ts`.

```typescript
// scripts/business-sources.ts
export interface BusinessSource {
  id: string;
  name: string;
  connector: "salesforce" | "sap" | "netsuite";
  dataType: "business-crm" | "business-erp";
  entities: string[];           // ["Account", "Contact", "Opportunity"]
  config: Record<string, unknown>;
  lifecycle: SourceLifecycle;
}
```

### 6.3 Database: nuove tabelle

Le tabelle business sono dinamiche (create dal BusinessModel in fase MODEL).
Pattern naming: `{prefix}_{entity}` con prefisso per provider.

Migration base (framework support):

```sql
-- Migration 029: Business connector support

-- Tabella configurazione connettori business (persistenza credenziali + stato)
CREATE TABLE IF NOT EXISTS business_connector_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_type text NOT NULL,          -- "salesforce" | "sap" | "netsuite"
  instance_name text NOT NULL,           -- nome univoco istanza (es. "acme-salesforce")
  auth_config jsonb NOT NULL DEFAULT '{}',  -- config auth (SENZA secret, solo metadata)
  entities jsonb NOT NULL DEFAULT '[]',     -- lista entity configurate
  sync_schedule text,                       -- cron expression
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(connector_type, instance_name)
);

-- Tabella token (criptati a riposo)
CREATE TABLE IF NOT EXISTS business_connector_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_config_id uuid REFERENCES business_connector_config(id) ON DELETE CASCADE,
  encrypted_token jsonb NOT NULL,        -- { access_token, refresh_token, expires_at } criptato
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(connector_config_id)
);

-- RLS: solo service_role (come trading)
ALTER TABLE business_connector_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_connector_tokens ENABLE ROW LEVEL SECURITY;
```

Le tabelle dati (es. `sf_accounts`, `sap_business_partners`) vengono create dinamicamente dalla fase MODEL quando lo schema viene analizzato per la prima volta.

---

## 7. Sequenza di Implementazione

### Fase 1: Infrastruttura condivisa (prerequisito)

| # | Componente | File | Effort |
|---|-----------|------|--------|
| 1 | Auth types + OAuth2 provider | `auth/types.ts`, `auth/providers.ts` | 4h |
| 2 | Pagination types + cursor paginator | `pagination/types.ts`, `pagination/cursor-paginator.ts` | 3h |
| 3 | Rate limiter (sliding window) | `rate-limit/types.ts`, `rate-limit/sliding-window.ts` | 2h |
| 4 | BusinessConnector base class | `connectors/business/base.ts` | 4h |
| 5 | BusinessModel + BusinessStore | `models/business-model.ts`, `stores/business-store.ts` | 4h |
| 6 | BusinessValidator | `validators/business-validator.ts` | 2h |
| 7 | types.ts + plugin-registry.ts update | Estensioni minime | 1h |
| 8 | Migration 029 | `supabase/migrations/029_business_connectors.sql` | 1h |
| 9 | Test unitari infrastruttura | `tests/unit/business-connector.test.ts` | 4h |
| | **Subtotale Fase 1** | | **25h (~3 giorni)** |

### Fase 2: Connettori MVP

| # | Connettore | Effort | Dipendenze |
|---|-----------|--------|------------|
| 1 | Salesforce | 16h (~2gg) | Fase 1 completa |
| 2 | SAP (OData V4) | 26h (~3.5gg) | Fase 1 completa |
| 3 | NetSuite (OAuth 1.0a + SuiteQL) | 22h (~3gg) | Fase 1 + OAuth1 provider |
| | **Subtotale Fase 2** | **64h (~8.5 giorni)** | |

### Fase 3: Integration e CLI

| # | Componente | Effort |
|---|-----------|--------|
| 1 | CLI esteso (`scripts/data-connector.ts`) per business sources | 3h |
| 2 | API route `/api/platform/business-connectors` | 4h |
| 3 | Integration test end-to-end (sandbox/mock) | 6h |
| 4 | Documentazione runbook | 2h |
| | **Subtotale Fase 3** | **15h (~2 giorni)** |

### Totale stimato

| Fase | Effort | Giorni |
|------|--------|--------|
| 1. Infrastruttura | 25h | 3 |
| 2. Connettori MVP (3) | 64h | 8.5 |
| 3. Integration | 15h | 2 |
| **TOTALE** | **104h** | **~13.5 giorni** |

Raccomandazione: implementare in ordine Salesforce -> NetSuite -> SAP (dal piu semplice al piu complesso), con la Fase 1 completata come prerequisito.

---

## 8. Rischi e Mitigazioni

| Rischio | Probabilita | Impatto | Mitigazione |
|---------|-------------|---------|-------------|
| OAuth 1.0a NetSuite complesso | Alta | Medio | Usare libreria `oauth-1.0a` da npm (MIT, 1.2M download/settimana) |
| SAP OData $metadata parsing pesante | Media | Alto | Limitare le entity supportate nel MVP; schema discovery lazy |
| Rate limit diversi per ogni istanza SF | Media | Medio | Config rate limit overridable per source, non solo per connector |
| Token refresh race condition (multi-worker) | Bassa | Alto | Lock atomico su token refresh (mutex o DB advisory lock) |
| Schema drift (entity cambia nel CRM) | Media | Medio | Fase MODEL con check schema prima di ogni sync; alert su drift |
| Credenziali in chiaro in env vars | Bassa | Critico | Fase 2+: integrare con secret manager (Vault, AWS SSM) |

---

## 9. Decisioni Architetturali (ADR)

### ADR-1: BusinessConnector estende BaseConnector (non interfaccia separata)

**Contesto**: Potevamo creare una gerarchia separata o un pattern adapter.
**Decisione**: Estensione diretta di `BaseConnector` per riusare `fetchWithRetry`, `cleanText`, logging.
**Conseguenza**: I business connector partecipano allo stesso pipeline `runPipeline()` senza modifiche all'orchestratore.

### ADR-2: Auth provider come composizione, non ereditarieta

**Contesto**: L'auth potrebbe essere un mixin o un layer del connector.
**Decisione**: `AuthProvider` e un oggetto iniettato nel `BusinessConnector`, creato da factory.
**Conseguenza**: Stesso connector puo cambiare auth type senza subclassing. Testabile in isolamento.

### ADR-3: Tabelle dinamiche con prefisso provider

**Contesto**: Una tabella unica `business_records` con colonna `source_type` vs tabelle separate.
**Decisione**: Tabelle separate (`sf_accounts`, `sap_orders`) per performance query e indici specifici.
**Conseguenza**: Piu tabelle da gestire, ma query veloci e schema chiaro per ogni entity.

### ADR-4: OAuth 1.0a per NetSuite via libreria npm

**Contesto**: Implementare la firma HMAC-SHA256 manualmente vs usare libreria.
**Decisione**: Usare `oauth-1.0a` (MIT, 1.2M download/settimana, zero dependency).
**Conseguenza**: Dipendenza aggiuntiva ma firma corretta garantita. NetSuite e l'unico che richiede OAuth 1.0a.

### ADR-5: Rate limiter in-memory (non distribuito)

**Contesto**: Rate limiter in-memory vs Redis/Upstash.
**Decisione**: In-memory sliding window per il MVP. Sufficiente per single-process (Next.js dev, script CLI).
**Conseguenza**: Non funziona in deployment multi-worker. Upgrade a Upstash quando necessario (infrastruttura gia presente per il rate limiting delle API route).

---

## 10. Non-Goals (fuori scope MVP)

1. **UI di configurazione connettori**: nel MVP la config e via env vars + `business-sources.ts`
2. **Webhook/real-time sync**: solo polling schedulato (come i connettori legali)
3. **Multi-tenant**: un'istanza per provider, non N istanze Salesforce diverse
4. **Encryption at rest dei token**: nel MVP i token stanno in env vars, non in DB
5. **Connettori aggiuntivi**: HubSpot, Dynamics 365, QuickBooks sono fuori scope MVP
6. **Trasformazioni complesse**: nel MVP il mapping e 1:1 field-to-column, nessuna logica di business
