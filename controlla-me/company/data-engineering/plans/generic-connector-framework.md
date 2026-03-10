# Piano: Framework Connettori Generico + 3 Connettori MVP

**Task ID:** 793c5350
**Autore:** data-connector (Data Engineering)
**Data:** 2026-03-10
**Priorita:** HIGH
**Stato:** PIANO
**ADR di riferimento:** ADR-001 — Reuse data-connector as generic framework

---

## 1. Analisi Architettura Corrente

### 1.1 Mappa Componenti e Dipendenze

```
scripts/corpus-sources.ts          scripts/data-connector.ts (CLI)
        |                                      |
        v                                      v
lib/staff/data-connector/
  |
  +-- registry.ts  <------- corpus-sources.ts (CorpusSource -> DataSource)
  |     |                    Dipende da: types.ts (DataSource, DataType, SourceLifecycle)
  |     |
  +-- plugin-registry.ts  <-- registra factory per connector/model/store
  |     |                      Dipende da: types.ts, LegalArticle (lib/legal-corpus.ts)
  |     |                      Importa lazy: normattiva, eurlex, statpearls, europepmc, openstax
  |     |                                   LegalArticleModel, LegalCorpusStore
  |     |
  +-- index.ts (ORCHESTRATORE)
  |     |  Dipende da: registry.ts (getSourceById)
  |     |              plugin-registry.ts (resolveConnector, resolveModel, resolveStore)
  |     |              sync-log.ts (startSync, completeSync, getLastSuccessfulSync)
  |     |              validators/article-validator.ts (validateBatch)
  |     |              types.ts (tutte le interfacce)
  |     |              lib/legal-corpus.ts (LegalArticle type)
  |     |
  |     |  NOTA CRITICA: righe 222-232 hanno trasformazione inline ParsedArticle -> LegalArticle
  |     |                Questa logica e' hardcoded nell'orchestratore
  |     |
  +-- sync-log.ts
  |     Dipende da: lib/supabase/admin.ts (createAdminClient)
  |                 types.ts (SyncLogEntry)
  |     Tabella DB: connector_sync_log
  |
  +-- types.ts
  |     Espone: DataType, SourceLifecycle, DataSource, ConnectResult, ConnectorInterface,
  |             FetchResult, DataModelSpec, ModelResult, ModelInterface, StoreResult,
  |             StoreInterface, PipelineOptions, PipelineResult, ParsedArticle, SyncLogEntry
  |
  +-- connectors/
  |     +-- base.ts            BaseConnector<T> (abstract)
  |     |     Dipende da: types.ts (ConnectorInterface, ConnectResult, FetchResult, DataSource)
  |     |     Espone: fetchWithRetry(), fetchJSON(), rateLimitPause(), cleanText(), sleep()
  |     |
  |     +-- normattiva.ts      NormattivaConnector extends BaseConnector<ParsedArticle>
  |     |     Dipende da: base.ts, parsers/akn-parser.ts, types.ts, adm-zip
  |     |
  |     +-- eurlex.ts          EurLexConnector extends BaseConnector<ParsedArticle>
  |     |     Dipende da: base.ts, parsers/html-parser.ts, types.ts
  |     |
  |     +-- statpearls.ts      StatPearlsConnector extends BaseConnector<ParsedArticle>
  |     |     Dipende da: base.ts, types.ts
  |     |
  |     +-- europepmc.ts       EuropePMCConnector extends BaseConnector<ParsedArticle>
  |     |     Dipende da: base.ts, types.ts
  |     |
  |     +-- openstax.ts        OpenStaxConnector extends BaseConnector<ParsedArticle>
  |           Dipende da: base.ts, types.ts
  |
  +-- parsers/
  |     +-- akn-parser.ts      parseAkn(xml, lawSource) -> ParsedArticle[]
  |     |     Dipende da: fast-xml-parser, types.ts (ParsedArticle)
  |     |
  |     +-- html-parser.ts     parseEurLexHtml(html, lawSource) -> ParsedArticle[]
  |           Dipende da: types.ts (ParsedArticle)
  |
  +-- models/
  |     +-- legal-article-model.ts  LegalArticleModel implements ModelInterface
  |           Dipende da: lib/supabase/admin.ts, types.ts
  |
  +-- stores/
  |     +-- legal-corpus-store.ts   LegalCorpusStore implements StoreInterface<LegalArticle>
  |           Dipende da: lib/legal-corpus.ts (ingestArticles, LegalArticle), types.ts
  |
  +-- validators/
        +-- article-validator.ts    validateArticle(), validateBatch()
              Dipende da: types.ts (ParsedArticle)
```

### 1.2 Analisi Riusabilita vs Necessita di Astrazione

| Componente | Riusabile as-is | Necessita astrazione | Motivazione |
|-----------|:-----------:|:------------:|-------------|
| `types.ts` — DataSource | Parziale | Si | Manca `auth` field, `config` non tipizzata |
| `types.ts` — DataType | No | Si | Enum hardcoded a tipi content-oriented |
| `types.ts` — ConnectorInterface | **Si** | No | Gia generico con `<T>` |
| `types.ts` — ModelInterface | **Si** | No | Gia generico, DataModelSpec flessibile |
| `types.ts` — StoreInterface | **Si** | No | Gia generico con `<T>` |
| `types.ts` — PipelineOptions/Result | **Si** | No | Generici |
| `types.ts` — ParsedArticle | No | Si | Tipo specifico per articoli legali, usato come default in plugin-registry |
| `index.ts` — runPipeline() | Parziale | Si | Righe 222-232 hardcoded per LegalArticle transform |
| `plugin-registry.ts` — ConnectorFactory | No | Si | Return type hardcoded a `ConnectorInterface<ParsedArticle>` |
| `plugin-registry.ts` — StoreFactory | No | Si | Return type hardcoded a `StoreInterface<LegalArticle>` |
| `plugin-registry.ts` — resolveStore | No | Si | Return type hardcoded a `StoreInterface<LegalArticle>` |
| `registry.ts` | Parziale | Si | `toDataSource()` assume CorpusSource come input |
| `sync-log.ts` | **Si** | No | Completamente generico, basato su stringhe |
| `BaseConnector` | Parziale | Si | Nessun auth, rate limit fisso a 1000ms |
| `LegalArticleModel` | No | No | Specifico per legal_articles, resta com'e |
| `LegalCorpusStore` | No | No | Specifico per ingestArticles, resta com'e |
| `article-validator.ts` | No | No | Specifico per ParsedArticle, resta com'e |
| Parsers (akn, html) | No | No | Domain-specific, restano com'e |

### 1.3 Punti di Estensione Correnti

1. **Plugin Registry** (`registerConnector`, `registerModel`, `registerStore`): permette aggiunta di nuovi handler senza modificare il core. Gia usato da 7 connector registrations.
2. **Vertical Registry** (`registerVertical` in `corpus-sources.ts`): permette aggiunta di nuovi domini. Gia usato da legal, hr, medical.
3. **DataSource.config**: `Record<string, unknown>` — flessibile ma non tipizzato.
4. **DataType union**: estensibile aggiungendo stringhe, ma richiede modifica di `types.ts`.

### 1.4 Limiti Bloccanti per Connettori Generici

| # | Limite | File | Impatto |
|---|--------|------|---------|
| L1 | Nessun auth support | `connectors/base.ts` | Impossibile connettere API autenticate |
| L2 | `ConnectorFactory` return type hardcoded a `ParsedArticle` | `plugin-registry.ts:21` | Connettori non-legali forzati a conformarsi |
| L3 | `StoreFactory` hardcoded a `LegalArticle` | `plugin-registry.ts:25-28` | Store non-legali impossibili |
| L4 | `resolveStore` return type `StoreInterface<LegalArticle>` | `plugin-registry.ts:77-80` | Idem L3 |
| L5 | Transform inline in orchestratore | `index.ts:222-232` | Ogni nuovo tipo dati richiede modifica del core |
| L6 | `validateBatch` specifico per `ParsedArticle` | `index.ts:198` | Validazione non generalizzabile |
| L7 | Rate limit fisso (1000ms) | `base.ts:90-92` | API con rate limit diversi non gestibili |
| L8 | Nessun supporto paginazione generica | `base.ts` | Ogni connettore reimplementa la paginazione |

---

## 2. Piano di Refactoring (allineato con ADR-001)

### 2.1 Principi Guida

1. **Additive-only**: nessun file esistente viene eliminato o rinominato
2. **Backward compatible**: i 7 connettori registrati continuano a funzionare senza modifiche
3. **Open/closed**: nuovi connettori si registrano senza modificare il core
4. **Gradual adoption**: i connettori V1 possono coesistere con V2 indefinitamente

### Fase 1: Abstract Base Types

**Obiettivo:** Estendere `types.ts` con `AuthConfig`, generalizzare `DataType`, aggiungere `DataSource.auth`.

#### File: `lib/staff/data-connector/types.ts`

**BEFORE (riga 13-19):**
```typescript
export type DataType =
  | "legal-articles"
  | "medical-articles"
  | "hr-articles"
  | "market-data"
  | "model-benchmark"
  | "feed-items";
```

**AFTER:**
```typescript
export type DataType =
  | "legal-articles"
  | "medical-articles"
  | "hr-articles"
  | "market-data"
  | "model-benchmark"
  | "feed-items"
  // Entity-oriented types (connettori generici)
  | "contacts"
  | "invoices"
  | "documents"
  | "deals"
  | "custom";
```

**AGGIUNTA a types.ts (in fondo):**
```typescript
// ─── Authentication ───

export type AuthType = "none" | "api-key" | "basic" | "oauth2" | "custom";

export interface OAuth2Config {
  tokenUrl: string;
  authorizeUrl?: string;
  scopes: string[];
  grantType: "client_credentials" | "authorization_code" | "refresh_token";
}

export interface AuthConfig {
  type: AuthType;
  /** Reference to credential — env var prefix (e.g., "FATTUREINCLOUD" reads CONNECTOR_FATTUREINCLOUD_*) */
  credentialPrefix?: string;
  /** For api-key: header name (default: "Authorization") */
  headerName?: string;
  /** For api-key: prefix before the key value (e.g., "Bearer", "Token") */
  headerPrefix?: string;
  /** For oauth2 flows */
  oauth2?: OAuth2Config;
}

// ─── Rate Limit Config ───

export interface RateLimitConfig {
  requestsPerMinute?: number;
  requestsPerDay?: number;
  retryAfterMs?: number;
  maxRetries?: number;
}

// ─── Pagination Config ───

export type PaginationType = "offset" | "cursor" | "page" | "link";

export interface PaginationConfig {
  type: PaginationType;
  pageSize?: number;
  maxPages?: number;
}

export interface PaginationParams {
  cursor?: string | number;
  page?: number;
  offset?: number;
  pageSize: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  hasMore: boolean;
  nextCursor?: string | number;
  totalCount?: number;
}

// ─── Generic Record (entity-oriented connectors) ───

export interface GenericRecord {
  externalId: string;
  objectType: string;
  data: Record<string, unknown>;
  mappedFields?: Record<string, unknown>;
  lastModifiedAt?: string;
}

// ─── Transformer Interface ───

export interface TransformerInterface<TInput = unknown, TOutput = unknown> {
  transform(input: TInput): TOutput;
  transformBatch(inputs: TInput[]): TOutput[];
  describeMapping(): string;
}

// ─── Validator Interface (generic) ───

export interface ValidatorInterface<T = unknown> {
  validate(item: T): { valid: boolean; warnings: string[]; errors: string[] };
  validateBatch(items: T[]): {
    validCount: number;
    warningCount: number;
    errorCount: number;
    details: Array<{ id: string; result: { valid: boolean; warnings: string[]; errors: string[] } }>;
  };
}
```

**MODIFICA a DataSource (riga 28-43):**

**BEFORE:**
```typescript
export interface DataSource {
  id: string;
  name: string;
  shortName: string;
  dataType: DataType;
  vertical: string;
  connector: string;
  config: Record<string, unknown>;
  lifecycle: SourceLifecycle;
  estimatedItems: number;
  schedule?: {
    deltaInterval: "daily" | "weekly" | "monthly";
    cronExpression?: string;
  };
}
```

**AFTER:**
```typescript
export interface DataSource {
  id: string;
  name: string;
  shortName: string;
  dataType: DataType;
  vertical: string;
  connector: string;
  config: Record<string, unknown>;
  lifecycle: SourceLifecycle;
  estimatedItems: number;
  schedule?: {
    deltaInterval: "daily" | "weekly" | "monthly";
    cronExpression?: string;
  };
  // --- NEW (additive) ---
  auth?: AuthConfig;                    // defaults to { type: "none" }
  rateLimit?: RateLimitConfig;
  pagination?: PaginationConfig;
}
```

**Rischio:** ZERO. Campi opzionali, nessun breaking change. Tutti i DataSource esistenti funzionano con `auth` undefined (= no auth).

---

### Fase 2: Generalize BaseConnector per Auth

**Nuovo file:** `lib/staff/data-connector/auth/credential-resolver.ts`

```typescript
/**
 * Credential Resolver — Risolve credenziali da env vars.
 *
 * Pattern: CONNECTOR_{PREFIX}_{FIELD}
 * Es: CONNECTOR_FATTUREINCLOUD_API_KEY
 *     CONNECTOR_HUBSPOT_ACCESS_TOKEN
 *     CONNECTOR_GDRIVE_CLIENT_ID
 *     CONNECTOR_GDRIVE_CLIENT_SECRET
 *
 * Non gestisce vault (ADR-003 futuro). Per ora: env vars.
 */

export interface ResolvedCredential {
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  username?: string;
  password?: string;
}

export function resolveCredential(prefix: string): ResolvedCredential {
  const p = `CONNECTOR_${prefix.toUpperCase()}`;
  return {
    apiKey: process.env[`${p}_API_KEY`],
    accessToken: process.env[`${p}_ACCESS_TOKEN`],
    refreshToken: process.env[`${p}_REFRESH_TOKEN`],
    clientId: process.env[`${p}_CLIENT_ID`],
    clientSecret: process.env[`${p}_CLIENT_SECRET`],
    username: process.env[`${p}_USERNAME`],
    password: process.env[`${p}_PASSWORD`],
  };
}
```

**Nuovo file:** `lib/staff/data-connector/auth/auth-provider.ts`

```typescript
import type { AuthConfig } from "../types";
import { resolveCredential } from "./credential-resolver";

export interface AuthProvider {
  getAuthHeaders(): Promise<Record<string, string>>;
  refresh?(): Promise<void>;
}

class NoneAuth implements AuthProvider {
  async getAuthHeaders() { return {}; }
}

class ApiKeyAuth implements AuthProvider {
  constructor(
    private headerName: string,
    private headerPrefix: string,
    private apiKey: string
  ) {}

  async getAuthHeaders() {
    const value = this.headerPrefix
      ? `${this.headerPrefix} ${this.apiKey}`
      : this.apiKey;
    return { [this.headerName]: value };
  }
}

class BasicAuth implements AuthProvider {
  constructor(private username: string, private password: string) {}

  async getAuthHeaders() {
    const encoded = Buffer.from(`${this.username}:${this.password}`).toString("base64");
    return { Authorization: `Basic ${encoded}` };
  }
}

class OAuth2Auth implements AuthProvider {
  private accessToken: string | undefined;
  private expiresAt: number = 0;

  constructor(
    private config: NonNullable<AuthConfig["oauth2"]>,
    private clientId: string,
    private clientSecret: string,
    private refreshToken?: string
  ) {}

  async getAuthHeaders() {
    if (!this.accessToken || Date.now() >= this.expiresAt) {
      await this.refresh();
    }
    return { Authorization: `Bearer ${this.accessToken}` };
  }

  async refresh() {
    const body = new URLSearchParams();
    if (this.refreshToken) {
      body.set("grant_type", "refresh_token");
      body.set("refresh_token", this.refreshToken);
    } else {
      body.set("grant_type", "client_credentials");
    }
    body.set("client_id", this.clientId);
    body.set("client_secret", this.clientSecret);
    if (this.config.scopes.length > 0) {
      body.set("scope", this.config.scopes.join(" "));
    }

    const resp = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!resp.ok) {
      throw new Error(`OAuth2 token refresh failed: HTTP ${resp.status}`);
    }

    const data = await resp.json() as {
      access_token: string;
      expires_in?: number;
      refresh_token?: string;
    };

    this.accessToken = data.access_token;
    this.expiresAt = Date.now() + ((data.expires_in ?? 3600) - 60) * 1000;
    if (data.refresh_token) this.refreshToken = data.refresh_token;
  }
}

export function createAuthProvider(auth?: AuthConfig): AuthProvider {
  if (!auth || auth.type === "none") return new NoneAuth();

  const cred = auth.credentialPrefix
    ? resolveCredential(auth.credentialPrefix)
    : {};

  switch (auth.type) {
    case "api-key":
      return new ApiKeyAuth(
        auth.headerName ?? "Authorization",
        auth.headerPrefix ?? "Bearer",
        cred.apiKey ?? cred.accessToken ?? ""
      );
    case "basic":
      return new BasicAuth(cred.username ?? "", cred.password ?? "");
    case "oauth2":
      if (!auth.oauth2) throw new Error("OAuth2 config missing");
      return new OAuth2Auth(
        auth.oauth2,
        cred.clientId ?? "",
        cred.clientSecret ?? "",
        cred.refreshToken
      );
    default:
      return new NoneAuth();
  }
}
```

**Modifica:** `lib/staff/data-connector/connectors/base.ts`

Aggiunta metodo `fetchAuthenticated()` alla classe `BaseConnector`. Non modifica nessun metodo esistente.

```typescript
// AGGIUNTA dopo rateLimitPause() (riga 92):

/**
 * Fetch con auth headers iniettati dal source.auth config.
 * Usato dai connettori V2 che richiedono autenticazione.
 * I connettori V1 continuano a usare fetchWithRetry() direttamente.
 */
protected async fetchAuthenticated(
  url: string,
  options?: RequestInit,
  maxRetries?: number
): Promise<Response> {
  // Lazy import per non rompere V1 che non hanno auth
  const { createAuthProvider } = await import("../auth/auth-provider");
  const authProvider = createAuthProvider(this.source.auth);
  const authHeaders = await authProvider.getAuthHeaders();

  return this.fetchWithRetry(url, {
    ...options,
    headers: {
      ...authHeaders,
      ...Object.fromEntries(new Headers(options?.headers ?? {}).entries()),
    },
  }, maxRetries);
}

/**
 * Rate limit pause configurabile.
 * Se source.rateLimit e' definito, calcola la pausa in base a requestsPerMinute.
 * Altrimenti usa il default di 1000ms.
 */
protected async configuredRateLimitPause(): Promise<void> {
  const rl = this.source.rateLimit;
  if (rl?.requestsPerMinute) {
    const ms = Math.max(Math.ceil(60000 / rl.requestsPerMinute), 100);
    await this.sleep(ms);
  } else {
    await this.rateLimitPause(); // default 1000ms
  }
}

/**
 * Paginazione generica: itera pagina per pagina.
 * Gestisce offset, cursor, e link-based pagination.
 */
protected async fetchPaginated<R>(
  fetcher: (params: PaginationParams) => Promise<PaginatedResponse<R>>,
  config?: PaginationConfig
): Promise<R[]> {
  const pc = config ?? this.source.pagination ?? { type: "offset" as const, pageSize: 100 };
  const results: R[] = [];
  let cursor: string | number | undefined;
  let page = 0;
  let offset = 0;

  while (page < (pc.maxPages ?? 1000)) {
    const pageSize = pc.pageSize ?? 100;
    const response = await fetcher({ cursor, page, offset, pageSize });
    results.push(...response.items);

    if (!response.hasMore || response.items.length === 0) break;

    cursor = response.nextCursor;
    page++;
    offset += pageSize;

    await this.configuredRateLimitPause();
  }

  return results;
}
```

**Rischio:** ZERO. Metodi additive. `rateLimitPause()` originale resta invariato. Import lazy per evitare side-effect su V1.

---

### Fase 3: Generalize Pipeline Orchestrator

**Modifica:** `lib/staff/data-connector/plugin-registry.ts`

**BEFORE (riga 18-28):**
```typescript
export type ConnectorFactory = (
  source: DataSource,
  log: (msg: string) => void
) => ConnectorInterface<ParsedArticle>;

export type StoreFactory = (
  source: DataSource,
  log: (msg: string) => void
) => StoreInterface<LegalArticle>;
```

**AFTER:**
```typescript
// Tipo generico per connettori — default ParsedArticle per backward compat
export type ConnectorFactory<T = unknown> = (
  source: DataSource,
  log: (msg: string) => void
) => ConnectorInterface<T>;

export type ModelFactory = (source: DataSource) => ModelInterface;

// Tipo generico per store — default unknown per massima flessibilita
export type StoreFactory<T = unknown> = (
  source: DataSource,
  log: (msg: string) => void
) => StoreInterface<T>;

// NUOVI: Transformer e Validator factories
export type TransformerFactory<TIn = unknown, TOut = unknown> = (
  source: DataSource
) => TransformerInterface<TIn, TOut>;

export type ValidatorFactory<T = unknown> = (
  source: DataSource
) => ValidatorInterface<T>;
```

**AGGIUNTA registri e lookup per transformer/validator:**

```typescript
const transformerRegistry = new Map<string, TransformerFactory>();
const validatorRegistry = new Map<string, ValidatorFactory>();

export function registerTransformer(connectorId: string, factory: TransformerFactory): void {
  transformerRegistry.set(connectorId, factory);
}

export function registerValidator(dataType: string, factory: ValidatorFactory): void {
  validatorRegistry.set(dataType, factory);
}

export function resolveTransformer(source: DataSource): TransformerInterface | null {
  const factory = transformerRegistry.get(source.connector);
  return factory ? factory(source) : null;
}

export function resolveValidator(source: DataSource): ValidatorInterface | null {
  const factory = validatorRegistry.get(source.dataType);
  return factory ? factory(source) : null;
}
```

**Modifica `resolveConnector` e `resolveStore` return types:**

```typescript
// BEFORE:
export function resolveConnector(source, log): ConnectorInterface<ParsedArticle>
export function resolveStore(source, log): StoreInterface<LegalArticle>

// AFTER:
export function resolveConnector(source, log): ConnectorInterface<unknown>
export function resolveStore(source, log): StoreInterface<unknown>
```

**Rischio:** BASSO. I registri esistenti continuano a registrare `ConnectorInterface<ParsedArticle>` e `StoreInterface<LegalArticle>` che sono sottotipi di `unknown`. TypeScript covariance.

---

**Modifica:** `lib/staff/data-connector/index.ts`

La trasformazione inline (righe 222-232) diventa condizionale: se un transformer e' registrato per il connector, usalo. Altrimenti usa la logica legacy per legal articles.

```typescript
// BEFORE (righe 220-232):
const lawSource = source.shortName;
const itemsForStore: LegalArticle[] = validArticles.map((a) => ({
  lawSource,
  articleReference: `Art. ${a.articleNumber}`,
  // ... hardcoded mapping
}));

// AFTER:
const transformer = resolveTransformer(source);
let itemsForStore: unknown[];

if (transformer) {
  // V2 path: transformer registrato
  itemsForStore = transformer.transformBatch(validArticles);
} else {
  // V1 path: legacy legal article mapping (backward compat)
  const lawSource = source.shortName;
  itemsForStore = validArticles.map((a: ParsedArticle) => ({
    lawSource,
    articleReference: `Art. ${a.articleNumber}`,
    articleTitle: a.articleTitle ?? "",
    articleText: a.articleText,
    hierarchy: a.hierarchy ?? {},
    keywords: [] as string[],
    relatedInstitutes: [] as string[],
    sourceUrl: a.sourceUrl ?? (source.config.baseUrl as string) ?? "",
    isInForce: a.isInForce ?? true,
  }));
}
```

Analogamente per validation: se un validator e' registrato per il dataType, usalo. Altrimenti usa `article-validator`.

---

### Fase 4: Backward Compatibility Verification

| Aspetto | Verifica | Risultato atteso |
|---------|----------|-----------------|
| `runPipeline("codice_civile")` | Eseguire pipeline completa | Identico a pre-refactoring |
| `runPipeline("gdpr")` | Eseguire pipeline completa | Identico a pre-refactoring |
| `npx tsx scripts/data-connector.ts status` | CLI status | Output identico |
| `npx tsx scripts/data-connector.ts connect codice_civile` | CLI connect | Output identico |
| `import { registerConnector } from "./plugin-registry"` | Import di re-export | Funzionante |
| Plugin-registry `registerDefaults()` | Registrazione al primo import | Tutti i 7 connettori registrati |
| `resolveConnector(source, log)` con source.connector="normattiva" | Lookup | Ritorna `NormattivaConnector` |
| `resolveStore(source, log)` con source.dataType="legal-articles" | Lookup | Ritorna `LegalCorpusStore` |
| Unit test `tiers.test.ts`, `generate.test.ts`, `openai-compat.test.ts` | Suite test | Nessun failure |

**Test di regressione specifici da aggiungere:**

```typescript
// tests/unit/data-connector/backward-compat.test.ts
describe("Backward compatibility", () => {
  it("resolveConnector returns ConnectorInterface for normattiva", ...);
  it("resolveStore returns StoreInterface for legal-articles", ...);
  it("runPipeline with existing source works unchanged", ...);
  it("DataSource without auth field works (defaults to none)", ...);
  it("plugin-registry registerDefaults registers all 7 connectors", ...);
});
```

### File-by-File Change List

| File | Tipo modifica | Rischio |
|------|--------------|---------|
| `types.ts` | Aggiunta tipi (AuthConfig, RateLimitConfig, PaginationConfig, GenericRecord, TransformerInterface, ValidatorInterface). Estensione DataSource e DataType | Zero |
| `connectors/base.ts` | Aggiunta 3 metodi protected (fetchAuthenticated, configuredRateLimitPause, fetchPaginated). Import PaginationConfig/PaginatedResponse | Zero |
| `plugin-registry.ts` | Generalizzazione ConnectorFactory/StoreFactory type params. Aggiunta transformer/validator registri. Modifica return type di resolveConnector/resolveStore da specifico a `unknown` | Basso |
| `index.ts` | Condizionale transformer/validator. Fallback a logica legacy | Basso |
| `auth/credential-resolver.ts` | Nuovo file | Zero |
| `auth/auth-provider.ts` | Nuovo file | Zero |
| `registry.ts` | Nessuna modifica | Zero |
| `sync-log.ts` | Nessuna modifica | Zero |
| Tutti i connettori V1 | Nessuna modifica | Zero |
| Tutti i parser | Nessuna modifica | Zero |
| `legal-article-model.ts` | Nessuna modifica | Zero |
| `legal-corpus-store.ts` | Nessuna modifica | Zero |
| `article-validator.ts` | Nessuna modifica | Zero |

---

## 3. Design 3 Connettori MVP

### 3.1 Fatture in Cloud

#### API Reference

| Aspetto | Dettaglio |
|---------|----------|
| **API** | Fatture in Cloud REST API v2 |
| **Base URL** | `https://api-v2.fattureincloud.it` |
| **Auth** | OAuth 2.0 Authorization Code Flow |
| **Docs** | https://developers.fattureincloud.it/api-reference |
| **Free tier** | Account gratuito con limiti (ideale per test) |

#### Auth: OAuth 2.0

```
Authorization URL: https://api-v2.fattureincloud.it/oauth/authorize
Token URL:         https://api-v2.fattureincloud.it/oauth/token
Scopes:            entity.clients:r, entity.suppliers:r, issued_documents.invoices:r,
                   received_documents:r, settings:r, situation:r
Grant type:        authorization_code (per app web) / client_credentials (per script)
Refresh:           refresh_token con durata lunga (necessario storage)

Env vars:
  CONNECTOR_FATTUREINCLOUD_CLIENT_ID=...
  CONNECTOR_FATTUREINCLOUD_CLIENT_SECRET=...
  CONNECTOR_FATTUREINCLOUD_ACCESS_TOKEN=...       # shortcut per test
  CONNECTOR_FATTUREINCLOUD_REFRESH_TOKEN=...
  CONNECTOR_FATTUREINCLOUD_COMPANY_ID=...         # ID azienda (multi-company)
```

#### Data Objects

| Endpoint | Oggetto | Campi chiave | Uso |
|----------|---------|-------------|-----|
| `GET /c/{company_id}/entities/clients` | Clienti | id, name, vat_number, tax_code, address, email, phone | Anagrafica clienti |
| `GET /c/{company_id}/entities/suppliers` | Fornitori | id, name, vat_number, tax_code, address | Anagrafica fornitori |
| `GET /c/{company_id}/issued_documents` | Fatture emesse | id, type, number, date, amount_net, amount_vat, amount_gross, entity, status, payment_method | Fatturazione attiva |
| `GET /c/{company_id}/received_documents` | Fatture ricevute | id, type, number, date, amount_net, amount_gross, entity | Fatturazione passiva |
| `GET /c/{company_id}/issued_documents/totals` | Totali fatturato | aggregati per periodo | Dashboard P&L |

#### Field Mapping: Source -> Internal Schema

```typescript
// Fatture in Cloud Client -> GenericRecord
{
  externalId: String(client.id),
  objectType: "client",
  data: client,                    // full JSON
  mappedFields: {
    name: client.name,
    vatNumber: client.vat_number,
    taxCode: client.tax_code,
    email: client.email,
    phone: client.phone,
    address: formatAddress(client.address_street, client.address_city, client.address_province),
    country: client.country,
  },
  lastModifiedAt: client.updated ?? client.created,
}

// Fatture in Cloud Invoice -> GenericRecord
{
  externalId: String(invoice.id),
  objectType: "issued_invoice",
  data: invoice,
  mappedFields: {
    number: invoice.number,
    date: invoice.date,
    dueDate: invoice.due_date,
    amountNet: invoice.amount_net,
    amountVat: invoice.amount_vat,
    amountGross: invoice.amount_gross,
    currency: invoice.currency?.id ?? "EUR",
    status: invoice.status,         // "paid" | "not_paid" | "reversed"
    entityName: invoice.entity?.name,
    entityVat: invoice.entity?.vat_number,
    paymentMethod: invoice.payment_method?.name,
    items: invoice.items_list?.map(i => ({
      description: i.description,
      quantity: i.qty,
      unitPrice: i.net_price,
      vatRate: i.vat?.value,
    })),
  },
  lastModifiedAt: invoice.updated ?? invoice.date,
}
```

#### Rate Limits e Pagination

| Parametro | Valore |
|-----------|--------|
| Rate limit | 200 req/min (standard), 600 req/min (premium) |
| Pagination | Offset-based: `page` + `per_page` (default 50, max 100) |
| Max records per lista | Illimitati (via paginazione) |
| Filtri disponibili | `sort`, `fields`, `fieldset` (basic/detailed) |

**Strategia paginazione:**
```typescript
// GET /c/{company_id}/entities/clients?per_page=100&page=1
// Response: { data: [...], current_page: 1, last_page: 5, total: 432 }
// Tipo: "page" — incrementa page fino a page >= last_page
```

#### Error Handling

| HTTP Status | Significato | Azione |
|-------------|-------------|--------|
| 401 | Token scaduto | Refresh automatico + retry |
| 403 | Scope insufficiente | Log errore, skip oggetto |
| 429 | Rate limit | Wait `Retry-After` header, fallback 60s |
| 404 | Risorsa non trovata | Skip, log warning |
| 500+ | Server error | Retry con backoff (3 tentativi) |

#### Effort Stimato

| Fase | Giorni |
|------|--------|
| Auth OAuth2 (riuso auth-provider generico) | 0.5 |
| Connector (5 endpoint, paginazione) | 2 |
| Transformer (mapping campi) | 1 |
| Validator | 0.5 |
| Test (mock API) | 1.5 |
| **Totale** | **5.5** |

---

### 3.2 Google Drive

#### API Reference

| Aspetto | Dettaglio |
|---------|----------|
| **API** | Google Drive API v3 |
| **Base URL** | `https://www.googleapis.com/drive/v3` |
| **Auth** | OAuth 2.0 (Google Cloud Console) |
| **Docs** | https://developers.google.com/drive/api/reference/rest/v3 |
| **Free tier** | Gratuito con quota (default 20,000 req/100s per progetto) |

#### Auth: OAuth 2.0

```
Authorization URL: https://accounts.google.com/o/oauth2/v2/auth
Token URL:         https://oauth2.googleapis.com/token
Scopes:            https://www.googleapis.com/auth/drive.readonly
                   https://www.googleapis.com/auth/drive.metadata.readonly
Grant type:        authorization_code (utente) / service_account (server)
Refresh:           refresh_token (durata illimitata con test-mode)

Per Server-to-Server (raccomandato per sync batch):
  - Service Account con chiave JSON
  - Accesso a Drive condiviso (Shared Drive) o cartella specifica
  - Env vars:
    CONNECTOR_GDRIVE_SERVICE_ACCOUNT_KEY=<base64 della chiave JSON>
    CONNECTOR_GDRIVE_FOLDER_ID=<ID cartella da sincronizzare>
    oppure:
    CONNECTOR_GDRIVE_CLIENT_ID=...
    CONNECTOR_GDRIVE_CLIENT_SECRET=...
    CONNECTOR_GDRIVE_REFRESH_TOKEN=...
```

#### Data Objects

| Endpoint | Oggetto | Campi chiave | Uso |
|----------|---------|-------------|-----|
| `GET /files` | File/cartelle | id, name, mimeType, createdTime, modifiedTime, size, parents, owners | Indice documenti |
| `GET /files/{id}?fields=*` | Metadati file | + description, webViewLink, webContentLink, permissions | Dettaglio |
| `GET /files/{id}/export` | Esportazione | Content per Google Docs/Sheets/Slides (via mimeType export) | Contenuto |
| `GET /files/{id}?alt=media` | Download | Contenuto binario per file non-Google | Contenuto |
| `GET /changes` | Changelog | changeId, fileId, file, removed, time | Delta update |

#### Field Mapping: Source -> Internal Schema

```typescript
// Google Drive File -> GenericRecord
{
  externalId: file.id,
  objectType: mapMimeType(file.mimeType),  // "document" | "spreadsheet" | "pdf" | "folder" | "image" | "other"
  data: file,                              // full metadata JSON
  mappedFields: {
    name: file.name,
    mimeType: file.mimeType,
    size: file.size,
    createdAt: file.createdTime,
    modifiedAt: file.modifiedTime,
    webViewLink: file.webViewLink,
    parentFolder: file.parents?.[0],
    owner: file.owners?.[0]?.emailAddress,
    shared: file.shared,
    // Contenuto estratto (per documenti < 5MB):
    textContent: extractedText,            // PDF -> pdf-parse, DOCX -> mammoth, Google Docs -> export text/plain
  },
  lastModifiedAt: file.modifiedTime,
}

function mapMimeType(mimeType: string): string {
  if (mimeType === "application/vnd.google-apps.document") return "document";
  if (mimeType === "application/vnd.google-apps.spreadsheet") return "spreadsheet";
  if (mimeType === "application/vnd.google-apps.presentation") return "presentation";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType?.startsWith("image/")) return "image";
  if (mimeType === "application/vnd.google-apps.folder") return "folder";
  return "other";
}
```

#### Rate Limits e Pagination

| Parametro | Valore |
|-----------|--------|
| Rate limit (progetto) | 20,000 req/100s (default, richiedibile aumento) |
| Rate limit (utente) | 2,500 req/100s |
| files.list max results | 1000 per pagina (`pageSize` + `pageToken`) |
| Pagination | Cursor-based: `nextPageToken` nella response |
| Export file size limit | 10 MB per Google Docs export |
| Download limit | Dipende da piano storage |

**Strategia paginazione:**
```typescript
// GET /files?pageSize=100&pageToken=xxx&q='folderId' in parents
// Response: { files: [...], nextPageToken: "abc123" }
// Tipo: "cursor" — usa nextPageToken fino a assente
```

**Strategia delta:**
```typescript
// GET /changes?pageToken=startPageToken
// Ottenere startPageToken: GET /changes/startPageToken
// Salvare pageToken in sync_log metadata per il prossimo delta
```

#### Error Handling

| HTTP Status | Significato | Azione |
|-------------|-------------|--------|
| 401 | Token scaduto | Refresh automatico |
| 403 | Permessi insufficienti o quota | Check `reason` in error body. Rate limit: backoff |
| 404 | File non trovato (cancellato) | Skip, mark as deleted |
| 429 | Rate limit | Wait `Retry-After`, default exponential backoff |
| 500+ | Server error | Retry 3x con backoff |

**Peculiarita Google Drive:**
- `userRateLimitExceeded` (403): rate limit per utente, backoff piu aggressivo
- `rateLimitExceeded` (403): rate limit per progetto
- `dailyLimitExceeded` (403): quota giornaliera esaurita, stop fino a mezzanotte PT

#### Effort Stimato

| Fase | Giorni |
|------|--------|
| Auth OAuth2 + Service Account (riuso + SA handler) | 1 |
| Connector (files list, export, download, changes) | 2.5 |
| Text extraction (riuso pdf-parse/mammoth da lib/extract-text.ts) | 1 |
| Transformer (mapping campi) | 1 |
| Validator | 0.5 |
| Test (mock API, fixture files) | 1.5 |
| **Totale** | **7.5** |

---

### 3.3 HubSpot

#### API Reference

| Aspetto | Dettaglio |
|---------|----------|
| **API** | HubSpot API v3 (CRM, Marketing, Sales) |
| **Base URL** | `https://api.hubapi.com` |
| **Auth** | OAuth 2.0 oppure Private App Token (API key) |
| **Docs** | https://developers.hubspot.com/docs/reference/api |
| **Free tier** | CRM gratuito (illimitato), API rate limit: 100 req/10s |

#### Auth: Private App Token (raccomandato per sync)

```
Metodo principale: Private App Token (Bearer token statico)
  - Creato da HubSpot Settings > Integrations > Private Apps
  - Scopes granulari selezionabili
  - Nessun refresh necessario (validita illimitata)
  - Semplicissimo: un solo header

Alternativa: OAuth 2.0
  Authorization URL: https://app.hubspot.com/oauth/authorize
  Token URL:         https://api.hubapi.com/oauth/v1/token
  Scopes:            crm.objects.contacts.read, crm.objects.deals.read,
                     crm.objects.companies.read, crm.schemas.contacts.read
  Grant type:        authorization_code

Env vars:
  CONNECTOR_HUBSPOT_ACCESS_TOKEN=pat-...          # Private App Token (raccomandato)
  -- oppure per OAuth2:
  CONNECTOR_HUBSPOT_CLIENT_ID=...
  CONNECTOR_HUBSPOT_CLIENT_SECRET=...
  CONNECTOR_HUBSPOT_REFRESH_TOKEN=...
```

#### Data Objects

| Endpoint | Oggetto | Campi chiave | Uso |
|----------|---------|-------------|-----|
| `GET /crm/v3/objects/contacts` | Contatti | id, firstname, lastname, email, phone, company, hs_lead_status, lifecyclestage | CRM contatti |
| `GET /crm/v3/objects/companies` | Aziende | id, name, domain, industry, city, country, numberofemployees, annualrevenue | CRM aziende |
| `GET /crm/v3/objects/deals` | Trattative | id, dealname, amount, dealstage, pipeline, closedate, hs_lastmodifieddate | Pipeline vendite |
| `GET /crm/v3/objects/tickets` | Ticket | id, subject, content, hs_pipeline_stage, hs_ticket_priority, createdate | Supporto |
| `GET /crm/v3/objects/{objectType}/{id}/associations/{toObjectType}` | Associazioni | contactId, companyId, dealId | Relazioni tra entita |

**Proprieties custom:**
HubSpot ha properties custom definite dall'utente. Il connector deve:
1. `GET /crm/v3/properties/{objectType}` per scoprire tutte le properties
2. Includere quelle custom in `data` e mappare quelle standard in `mappedFields`

#### Field Mapping: Source -> Internal Schema

```typescript
// HubSpot Contact -> GenericRecord
{
  externalId: contact.id,
  objectType: "contact",
  data: contact.properties,          // tutte le properties (standard + custom)
  mappedFields: {
    firstName: contact.properties.firstname,
    lastName: contact.properties.lastname,
    email: contact.properties.email,
    phone: contact.properties.phone,
    company: contact.properties.company,
    jobTitle: contact.properties.jobtitle,
    lifecycleStage: contact.properties.lifecyclestage,
    leadStatus: contact.properties.hs_lead_status,
    source: contact.properties.hs_analytics_source,
    createdAt: contact.properties.createdate,
  },
  lastModifiedAt: contact.properties.hs_lastmodifieddate,
}

// HubSpot Deal -> GenericRecord
{
  externalId: deal.id,
  objectType: "deal",
  data: deal.properties,
  mappedFields: {
    name: deal.properties.dealname,
    amount: parseFloat(deal.properties.amount ?? "0"),
    stage: deal.properties.dealstage,
    pipeline: deal.properties.pipeline,
    closeDate: deal.properties.closedate,
    owner: deal.properties.hubspot_owner_id,
    createdAt: deal.properties.createdate,
  },
  lastModifiedAt: deal.properties.hs_lastmodifieddate,
}

// HubSpot Company -> GenericRecord
{
  externalId: company.id,
  objectType: "company",
  data: company.properties,
  mappedFields: {
    name: company.properties.name,
    domain: company.properties.domain,
    industry: company.properties.industry,
    city: company.properties.city,
    country: company.properties.country,
    employees: parseInt(company.properties.numberofemployees ?? "0"),
    revenue: parseFloat(company.properties.annualrevenue ?? "0"),
    createdAt: company.properties.createdate,
  },
  lastModifiedAt: company.properties.hs_lastmodifieddate,
}
```

#### Rate Limits e Pagination

| Parametro | Valore |
|-----------|--------|
| Private App | 100 req/10s (burst), 200k req/day |
| OAuth App | 100 req/10s (burst), 200k req/day |
| Batch endpoint | 100 records per batch |
| Pagination | Cursor-based: `after` param + `paging.next.after` in response |
| Max per page | 100 (default e max) |
| Search API | 10,000 results max, 4 req/s |

**Strategia paginazione:**
```typescript
// GET /crm/v3/objects/contacts?limit=100&after=abc123&properties=firstname,lastname,email
// Response: { results: [...], paging: { next: { after: "xyz789" } } }
// Tipo: "cursor" — usa paging.next.after fino a assente
```

**Strategia delta:**
```typescript
// HubSpot Search API con filtro su hs_lastmodifieddate:
// POST /crm/v3/objects/contacts/search
// { filterGroups: [{ filters: [{ propertyName: "hs_lastmodifieddate", operator: "GTE", value: since }] }] }
// Limitato a 10,000 risultati. Per dataset grandi: usare il v3 changelog endpoint.
```

#### Error Handling

| HTTP Status | Significato | Azione |
|-------------|-------------|--------|
| 401 | Token invalido/scaduto | Refresh (OAuth2) o errore fatale (Private App) |
| 403 | Scope mancante | Log, skip operazione |
| 429 | Rate limit (secondly) | `Retry-After` header, exponential backoff |
| 429 + `DAILY_RATE_LIMIT` | Quota giornaliera | Stop sync, riprendi domani |
| 502/503 | HubSpot down | Retry 3x con backoff |

#### Effort Stimato

| Fase | Giorni |
|------|--------|
| Auth (Private App Token = api-key, riuso diretto) | 0.5 |
| Connector (4 oggetti + associations + properties discovery) | 2 |
| Transformer (mapping con properties custom) | 1 |
| Validator | 0.5 |
| Test (mock API, fixture responses) | 1.5 |
| **Totale** | **5.5** |

---

## 4. Database Changes

### 4.1 Nuove Tabelle

#### Migration 030: `integration_credentials`

```sql
-- ============================================================
-- Migration 030: Generic connector framework tables
-- ============================================================

-- 1. Credential storage per connettori autenticati
-- Nota: secrets in chiaro per MVP. Fase 2: encrypt via pgcrypto.
CREATE TABLE IF NOT EXISTS public.integration_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id text NOT NULL,                -- "fattureincloud", "hubspot", "gdrive"
  auth_type text NOT NULL DEFAULT 'none',    -- "none" | "api-key" | "oauth2" | "basic"

  -- API Key / Bearer Token
  access_token text,

  -- OAuth2
  refresh_token text,
  token_type text DEFAULT 'Bearer',
  expires_at timestamptz,
  scopes text[] DEFAULT '{}',

  -- Basic Auth
  username text,
  password_hash text,                        -- bcrypt o argon2 per password

  -- Metadata
  metadata jsonb DEFAULT '{}',               -- extra info (instance_url, company_id, etc.)
  is_active boolean DEFAULT true,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(connector_id)
);

-- RLS: solo service_role (credenziali non accessibili da client)
ALTER TABLE integration_credentials ENABLE ROW LEVEL SECURITY;

-- Nessuna policy = solo service_role puo' accedere (secured by default)

-- 2. Configurazione connettori (runtime, modificabile da UI /ops)
CREATE TABLE IF NOT EXISTS public.integration_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id text NOT NULL,                -- "fattureincloud", "hubspot", "gdrive"
  source_name text NOT NULL,                 -- nome human-readable
  data_type text NOT NULL,                   -- "invoices", "contacts", "documents"

  -- Config specifica connettore
  config jsonb NOT NULL DEFAULT '{}',        -- es: { companyId: "123", folderId: "abc" }

  -- Scheduling
  sync_enabled boolean DEFAULT false,
  sync_interval text DEFAULT 'daily',        -- "hourly" | "daily" | "weekly"
  cron_expression text,
  last_sync_at timestamptz,
  next_sync_at timestamptz,

  -- Status
  status text DEFAULT 'configured',          -- "configured" | "active" | "paused" | "error"
  last_error text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(connector_id, data_type)
);

ALTER TABLE integration_configs ENABLE ROW LEVEL SECURITY;

-- 3. Sync jobs (estende connector_sync_log per connettori generici)
-- Riusiamo connector_sync_log con un campo connector_type aggiuntivo.
-- Per non rompere backward compat, aggiungiamo una colonna.
ALTER TABLE connector_sync_log
  ADD COLUMN IF NOT EXISTS connector_type text DEFAULT 'corpus';
  -- "corpus" = connettori legali V1
  -- "integration" = connettori generici V2

COMMENT ON COLUMN connector_sync_log.connector_type IS
  'Tipo connettore: corpus (V1 legal/medical) o integration (V2 generic)';

-- 4. Record generici (entita da sistemi esterni)
CREATE TABLE IF NOT EXISTS public.integration_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id text NOT NULL,                -- "fattureincloud", "hubspot", "gdrive"
  object_type text NOT NULL,                 -- "contact", "invoice", "document", "deal"
  external_id text NOT NULL,                 -- ID nel sistema sorgente

  -- Dati
  data jsonb NOT NULL,                       -- record completo dal sistema sorgente
  mapped_fields jsonb DEFAULT '{}',          -- campi normalizzati per query cross-connector

  -- Tracking
  source_modified_at timestamptz,            -- lastModifiedDate nel sistema sorgente
  synced_at timestamptz DEFAULT now(),       -- quando sincronizzato
  sync_hash text,                            -- SHA256 di data per detect cambiamenti
  is_deleted boolean DEFAULT false,          -- soft delete (record rimosso alla sorgente)

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(connector_id, object_type, external_id)
);

-- Indexes per performance
CREATE INDEX IF NOT EXISTS integration_records_connector_type_idx
  ON integration_records(connector_id, object_type);

CREATE INDEX IF NOT EXISTS integration_records_external_id_idx
  ON integration_records(external_id);

CREATE INDEX IF NOT EXISTS integration_records_synced_at_idx
  ON integration_records(synced_at);

CREATE INDEX IF NOT EXISTS integration_records_source_modified_idx
  ON integration_records(source_modified_at);

-- GIN index per query su data JSONB (es: WHERE data->>'email' = '...')
CREATE INDEX IF NOT EXISTS integration_records_data_gin_idx
  ON integration_records USING gin(data);

-- GIN index per query su mapped_fields JSONB
CREATE INDEX IF NOT EXISTS integration_records_mapped_gin_idx
  ON integration_records USING gin(mapped_fields);

-- RLS: solo service_role
ALTER TABLE integration_records ENABLE ROW LEVEL SECURITY;

-- 5. Trigger updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_integration_credentials_updated_at
  BEFORE UPDATE ON integration_credentials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_integration_configs_updated_at
  BEFORE UPDATE ON integration_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_integration_records_updated_at
  BEFORE UPDATE ON integration_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 4.2 Indici per Performance

| Indice | Tabella | Tipo | Motivo |
|--------|---------|------|--------|
| `integration_records_connector_type_idx` | integration_records | btree | Filtro per connector + tipo |
| `integration_records_external_id_idx` | integration_records | btree | Lookup per external_id |
| `integration_records_synced_at_idx` | integration_records | btree | Query "ultimi record sincronizzati" |
| `integration_records_source_modified_idx` | integration_records | btree | Delta query per records modificati |
| `integration_records_data_gin_idx` | integration_records | gin | Query su campi JSON arbitrari |
| `integration_records_mapped_gin_idx` | integration_records | gin | Query cross-connector su campi normalizzati |

**Nota sulle performance GIN:** su tabelle < 100K righe, GIN e' molto veloce. Se la tabella cresce oltre 1M, valutare indici btree specifici sui campi piu' queried in `mapped_fields` (es: `email`, `vatNumber`).

### 4.3 RLS Policies

Tutte e tre le nuove tabelle usano RLS **senza policy**. In Supabase, tabelle con RLS abilitato e nessuna policy = **accesso solo via service_role key**. Questo e' il livello di sicurezza corretto per credenziali e dati di integrazione.

Se in futuro si vuole dare accesso a utenti specifici (es: admin panel /ops):

```sql
-- Policy futura (solo se necessario):
CREATE POLICY "ops_admin_read" ON integration_records
  FOR SELECT
  USING (auth.uid() IN (SELECT user_id FROM ops_admins));
```

---

## 5. Testing Strategy

### 5.1 Mock API Patterns per Connector

Ogni connettore ha un mock server basato su Vitest:

```typescript
// tests/fixtures/mock-servers/fattureincloud-mock.ts
import { http, HttpResponse } from 'msw';

export const fattureincloudHandlers = [
  // Auth: token endpoint
  http.post('https://api-v2.fattureincloud.it/oauth/token', () => {
    return HttpResponse.json({
      access_token: 'test-token',
      refresh_token: 'test-refresh',
      expires_in: 3600,
      token_type: 'Bearer',
    });
  }),

  // Clients list (paginated)
  http.get('https://api-v2.fattureincloud.it/c/:companyId/entities/clients', ({ request }) => {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') ?? '1');
    return HttpResponse.json({
      data: MOCK_CLIENTS.slice((page - 1) * 50, page * 50),
      current_page: page,
      last_page: Math.ceil(MOCK_CLIENTS.length / 50),
      total: MOCK_CLIENTS.length,
    });
  }),

  // Invoices list
  http.get('https://api-v2.fattureincloud.it/c/:companyId/issued_documents', ({ request }) => {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') ?? '1');
    return HttpResponse.json({
      data: MOCK_INVOICES.slice((page - 1) * 50, page * 50),
      current_page: page,
      last_page: Math.ceil(MOCK_INVOICES.length / 50),
      total: MOCK_INVOICES.length,
    });
  }),
];
```

Pattern analogo per HubSpot e Google Drive, con fixture JSON specifiche per ogni API.

### 5.2 Test Structure

```
tests/
├── unit/
│   ├── data-connector/
│   │   ├── auth/
│   │   │   ├── credential-resolver.test.ts    # Env var resolution
│   │   │   ├── auth-provider.test.ts          # Factory + tutti i provider
│   │   │   └── oauth2-refresh.test.ts         # Token refresh flow
│   │   ├── connectors/
│   │   │   ├── fattureincloud.test.ts         # Connect, fetchAll, fetchDelta
│   │   │   ├── gdrive.test.ts                 # Files list, export, changes
│   │   │   └── hubspot.test.ts                # Objects, properties, associations
│   │   ├── transformers/
│   │   │   ├── fattureincloud-transformer.test.ts
│   │   │   ├── gdrive-transformer.test.ts
│   │   │   └── hubspot-transformer.test.ts
│   │   ├── validators/
│   │   │   └── generic-validator.test.ts      # Required fields, type checks
│   │   ├── stores/
│   │   │   └── integration-store.test.ts      # Upsert, soft delete, hash check
│   │   ├── backward-compat.test.ts            # V1 connettori non rotti
│   │   └── pipeline-v2.test.ts                # Pipeline con transformer/validator
│   │
├── integration/
│   ├── data-connector/
│   │   ├── fattureincloud-live.test.ts         # Test con account reale (skip in CI)
│   │   ├── hubspot-live.test.ts               # Test con sandbox
│   │   └── gdrive-live.test.ts                # Test con service account
│
├── fixtures/
│   ├── mock-servers/
│   │   ├── fattureincloud-mock.ts
│   │   ├── gdrive-mock.ts
│   │   └── hubspot-mock.ts
│   ├── data/
│   │   ├── fattureincloud-clients.json        # 10 sample clients
│   │   ├── fattureincloud-invoices.json       # 10 sample invoices
│   │   ├── hubspot-contacts.json              # 10 sample contacts
│   │   ├── hubspot-deals.json                 # 5 sample deals
│   │   ├── hubspot-companies.json             # 5 sample companies
│   │   ├── gdrive-files.json                  # 10 sample file metadata
│   │   └── gdrive-changes.json               # 5 sample changes
```

### 5.3 Integration Test Approach

```typescript
// tests/integration/data-connector/fattureincloud-live.test.ts
import { describe, it, expect } from 'vitest';
import { runPipeline } from '@/lib/staff/data-connector';

describe.skipIf(!process.env.CONNECTOR_FATTUREINCLOUD_ACCESS_TOKEN)(
  'Fatture in Cloud Live Integration',
  () => {
    it('should connect and return census', async () => {
      const result = await runPipeline('fattureincloud_invoices', {
        stopAfter: 'connect',
      });
      expect(result.connectResult?.ok).toBe(true);
      expect(result.connectResult?.census.estimatedItems).toBeGreaterThan(0);
    });

    it('should fetch and transform invoices (limit 5)', async () => {
      const result = await runPipeline('fattureincloud_invoices', {
        stopAfter: 'load',
        limit: 5,
        dryRun: true,
      });
      expect(result.loadResult?.skipped).toBe(5); // dryRun = no write
    });
  }
);
```

### 5.4 Sync Verification

| Check | Metrica | Threshold |
|-------|---------|-----------|
| Record count match | `integration_records COUNT WHERE connector_id = X` vs API total | Differenza < 1% |
| Data integrity | SHA256 di `data` vs `sync_hash` | 100% match |
| Mapped fields populated | `mapped_fields != '{}'` ratio | > 95% |
| External ID uniqueness | `UNIQUE(connector_id, object_type, external_id)` | 0 violations |
| Delta accuracy | Records con `synced_at > last_sync` = records effettivamente modificati | Verifica manuale su 10 record |

---

## 6. Timeline

### Sprint Breakdown (2-week sprints)

#### Sprint 1 (settimane 1-2): Infrastruttura

| Giorno | Task | Output |
|--------|------|--------|
| 1-2 | Estensione `types.ts` (AuthConfig, GenericRecord, TransformerInterface, ValidatorInterface) | types.ts aggiornato |
| 2-3 | `auth/credential-resolver.ts` + `auth/auth-provider.ts` con unit test | Auth layer funzionante |
| 3-4 | Modifica `BaseConnector`: `fetchAuthenticated()`, `configuredRateLimitPause()`, `fetchPaginated()` | BaseConnector esteso |
| 4-5 | Modifica `plugin-registry.ts`: generalizzazione factory types, transformer/validator registri | Plugin registry V2 |
| 5-6 | Modifica `index.ts`: transformer/validator condizionale con fallback legacy | Pipeline V2 |
| 6-7 | `stores/integration-store.ts` (generico per integration_records) | Store generico |
| 7-8 | `validators/generic-validator.ts` (required fields, type check) | Validator generico |
| 8-9 | Migration SQL 030 (integration_credentials, integration_configs, integration_records) | DB schema |
| 9-10 | Test backward compatibility + test infrastruttura | Suite test green |

**Deliverable Sprint 1:** Framework generico funzionante. Tutti i connettori V1 continuano a funzionare. Nessun connettore V2 ancora.

**Dipendenza:** Architecture dept per review ADR-001 (completata).

---

#### Sprint 2 (settimane 3-4): Fatture in Cloud + HubSpot

| Giorno | Task | Output |
|--------|------|--------|
| 1-2 | `connectors/fattureincloud.ts` (connect, fetchAll, fetchDelta) | Connector FIC |
| 3 | `transformers/fattureincloud-transformer.ts` | Transformer FIC |
| 3.5 | FIC validator + mock fixtures | Test FIC |
| 4 | FIC integration test con account gratuito | FIC end-to-end |
| 5-6 | `connectors/hubspot.ts` (connect, fetchAll with properties discovery) | Connector HubSpot |
| 7 | `transformers/hubspot-transformer.ts` | Transformer HubSpot |
| 7.5 | HubSpot validator + mock fixtures | Test HubSpot |
| 8 | HubSpot integration test con CRM gratuito | HubSpot end-to-end |
| 9 | Source registration in corpus-sources.ts o file dedicato | Registry |
| 10 | CLI commands aggiornati, documentazione | CLI + docs |

**Deliverable Sprint 2:** Fatture in Cloud e HubSpot sincronizzano dati su Supabase.

**Dipendenza:** Nessuna (account gratuiti disponibili per entrambi).

---

#### Sprint 3 (settimane 5-6): Google Drive + Polish

| Giorno | Task | Output |
|--------|------|--------|
| 1-2 | Service Account auth handler per Google | SA auth |
| 3-4 | `connectors/gdrive.ts` (files list, export, download, changes) | Connector GDrive |
| 5 | Text extraction integration (riuso lib/extract-text.ts) | Estrazione contenuto |
| 6 | `transformers/gdrive-transformer.ts` | Transformer GDrive |
| 6.5 | GDrive validator + mock fixtures | Test GDrive |
| 7 | GDrive integration test con Service Account | GDrive end-to-end |
| 8 | UI panel in /ops per stato connettori (integration_configs dashboard) | UI monitoring |
| 9 | Documentazione completa + aggiornamento CLAUDE.md | Docs |
| 10 | Buffer: bug fix, edge cases, performance tuning | Quality |

**Deliverable Sprint 3:** Tutti e 3 i connettori MVP funzionanti. Dashboard monitoring in /ops.

**Dipendenza Security:** Review credenziali in DB (integration_credentials) prima di go-live.

---

### Dipendenze Inter-Dipartimento

| Dipartimento | Dipendenza | Quando | Bloccante? |
|-------------|-----------|--------|------------|
| Architecture | Review ADR-001 (completata) | Pre-Sprint 1 | No (gia approvata) |
| Security | Audit integration_credentials (secrets in DB) | Pre-Sprint 3 go-live | Si per produzione |
| Security | Review RLS policies su nuove tabelle | Sprint 2 | No (service_role only e' sicuro) |
| Operations | Dashboard /ops per monitoraggio sync | Sprint 3 | No (nice-to-have) |
| QA | Test suite review e coverage check | Fine Sprint 2 | No |

### MVP Milestone Criteria

Il framework generico e' considerato MVP-complete quando:

- [ ] Almeno 2 connettori V2 sincronizzano dati con successo
- [ ] Connettori V1 (Normattiva, EUR-Lex, etc.) continuano a funzionare senza modifiche
- [ ] Auth layer gestisce API key e OAuth2 client_credentials
- [ ] Pipeline V2 (connect -> transform -> validate -> load) funziona end-to-end
- [ ] `connector_sync_log` traccia sia V1 che V2
- [ ] Test coverage > 80% per auth, transformer, validator
- [ ] Migration SQL eseguita senza errori
- [ ] CLI `npx tsx scripts/data-connector.ts` gestisce i nuovi connettori
- [ ] Nessun secret hardcoded nel codice (solo env vars)

---

## 7. File Structure Finale

```
lib/staff/data-connector/
├── index.ts                              # Orchestratore (esteso: fase Transform condizionale)
├── types.ts                              # Tipi (esteso: AuthConfig, GenericRecord, etc.)
├── plugin-registry.ts                    # Registry (esteso: transformer, validator, types generici)
├── registry.ts                           # Source registry (invariato)
├── sync-log.ts                           # Sync log (invariato)
│
├── auth/                                 # NUOVO: Authentication layer
│   ├── credential-resolver.ts            # Env var -> ResolvedCredential
│   └── auth-provider.ts                  # Factory: createAuthProvider(config) -> AuthProvider
│
├── connectors/
│   ├── base.ts                           # BaseConnector V1 (esteso: +3 metodi protected)
│   ├── normattiva.ts                     # Invariato
│   ├── eurlex.ts                         # Invariato
│   ├── statpearls.ts                     # Invariato
│   ├── europepmc.ts                      # Invariato
│   ├── openstax.ts                       # Invariato
│   ├── fattureincloud.ts                 # NUOVO: Fatture in Cloud REST API v2
│   ├── hubspot.ts                        # NUOVO: HubSpot CRM API v3
│   └── gdrive.ts                        # NUOVO: Google Drive API v3
│
├── transformers/                         # NUOVO: Transform layer
│   ├── fattureincloud-transformer.ts     # FIC entities -> GenericRecord
│   ├── hubspot-transformer.ts           # HubSpot objects -> GenericRecord
│   └── gdrive-transformer.ts           # GDrive files -> GenericRecord
│
├── parsers/
│   ├── akn-parser.ts                     # Invariato
│   └── html-parser.ts                   # Invariato
│
├── models/
│   └── legal-article-model.ts            # Invariato
│
├── stores/
│   ├── legal-corpus-store.ts             # Invariato
│   └── integration-store.ts              # NUOVO: upsert su integration_records
│
├── validators/
│   ├── article-validator.ts              # Invariato
│   └── generic-validator.ts              # NUOVO: validazione record generici
```

---

## 8. Rischi e Mitigazioni

| Rischio | Probabilita | Impatto | Mitigazione |
|---------|------------|---------|-------------|
| Fatture in Cloud API non stabile (startup italiana) | Media | Medio | Versionamento API, response validation, test frequenti |
| Google Drive quota esaurita durante sync grandi | Bassa | Medio | Paginazione con backoff, limit configurabile |
| HubSpot rate limit aggressivo (100 req/10s) | Media | Basso | configuredRateLimitPause(), batch endpoint dove disponibile |
| Secrets in DB non cifrati (MVP) | Alta | Alto | RLS service_role + flag per Fase 2 (pgcrypto encrypt) |
| Breaking change plugin-registry types | Bassa | Alto | Test backward compat, covariance TypeScript |
| OAuth2 refresh token scade (Fatture in Cloud) | Media | Medio | Auto-refresh prima di ogni richiesta, alert su failure |
| Google Service Account permessi insufficienti | Bassa | Basso | Documentazione setup chiara, test CONNECT verifica permessi |

---

## 9. Prerequisiti per Approvazione

- [ ] Approvazione boss (L3) -- task cross-dipartimento con nuove tabelle DB
- [ ] Account Fatture in Cloud gratuito per test
- [ ] Account HubSpot CRM gratuito per test
- [ ] Google Cloud Project con Drive API abilitata + Service Account
- [ ] Review Security dept per integration_credentials (secrets in DB)
- [ ] ADR-001 approvato (status: Proposed -> Accepted)

---

*Piano creato da data-connector, Data Engineering. Pronto per review Architecture + Security e approvazione boss.*
