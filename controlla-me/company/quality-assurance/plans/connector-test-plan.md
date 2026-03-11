# Test Plan: Data Connector Suite + Mock OAuth + E2E Integration Flows

**Task ID:** 99e51f1a
**Autore:** test-runner (QA)
**Data:** 2026-03-10
**Stato:** PLAN

---

## 1. Analisi Coverage Attuale

### 1.1 Configurazione Test

| Tool | Config file | Dettagli |
|------|------------|---------|
| Vitest 4 | `vitest.config.ts` | env: node, globals: true, timeout: 10s, coverage: v8 |
| Playwright | `playwright.config.ts` | chromium, baseURL localhost:3000, testDir: tests/e2e + e2e/ |

**Vitest include:** `tests/**/*.test.ts`
**Coverage include:** `lib/**/*.ts`, `app/api/**/*.ts`
**Coverage exclude:** `lib/supabase/**`, `lib/prompts/**`, `lib/stripe.ts`

### 1.2 Test Esistenti (24 file)

**Unit tests (21 file in `tests/unit/`):**
- `classifier.test.ts` — Agente classificatore (mock Anthropic SDK)
- `analyzer.test.ts` — Agente analista
- `investigator.test.ts` — Agente investigatore
- `advisor.test.ts` — Agente consigliere
- `agent-runner.test.ts` — Catena fallback N-modelli (mock generate + tiers)
- `tiers.test.ts` — Tier system, catene, toggle agenti
- `generate.test.ts` — Router universale generate()
- `openai-compat.test.ts` — Provider OpenAI-compatibili
- `anthropic.test.ts` — Client Anthropic con retry
- `console-token.test.ts` — Token HMAC-SHA256
- `analysis-cache.test.ts` — Cache sessioni analisi
- `extract-text.test.ts` — Estrazione testo PDF/DOCX
- `orchestrator.test.ts` — Pipeline 4 agenti
- `llm.test.ts` — LLM utilities
- `cdp.test.ts` — Customer Data Platform
- `profile-builder.test.ts` — Profile builder
- `middleware/auth.test.ts` — Middleware autenticazione
- `middleware/csrf.test.ts` — Middleware CSRF
- `middleware/rate-limit.test.ts` — Middleware rate limiting
- `middleware/sanitize.test.ts` — Middleware sanitizzazione input

**Integration tests (4 file in `tests/integration/`):**
- `analyze-route.test.ts` — POST /api/analyze SSE
- `corpus-ask-route.test.ts` — POST /api/corpus/ask
- `vector-search-route.test.ts` — POST /api/vector-search
- `deep-search-route.test.ts` — POST /api/deep-search

**E2E tests (5 file in `e2e/`):**
- `auth.spec.ts` — Autenticazione console
- `upload.spec.ts` — Upload documenti
- `analysis.spec.ts` — Flusso analisi completo
- `console.spec.ts` — Console operatori
- `deep-search-paywall.spec.ts` — Paywall deep search

### 1.3 Fixture Esistenti (10 file in `tests/fixtures/`)

- `anthropic-response.ts` — Factory per risposte Anthropic mock
- `classification.ts` — Factory ClassificationResult
- `analysis.ts` — Factory AnalysisResult
- `investigation.ts` — Factory InvestigationResult
- `advisor.ts` — Factory AdvisorResult
- `documents.ts` — Documenti sample (contratto affitto)
- `normattiva.ts` — Fixture API Normattiva (search result, async polling, JSON act, HTML page)
- `hr-contracts.ts` — Contratti HR sample
- `agent-responses.json` — Risposte agente JSON raw
- `sample-contract.txt` — Contratto di esempio testuale

### 1.4 Pattern di Test Consolidati

Il codebase usa pattern ben definiti:

1. **vi.hoisted() per mock** — I mock sono dichiarati con `vi.hoisted()` e usati prima degli import
2. **Factory function per fixture** — `makeClassification()`, `makeAnthropicResponse()`, ecc. con `overrides` opzionali
3. **Mock SDK con importOriginal** — Il pattern `vi.mock("@/lib/anthropic", async (importOriginal) => { ... })` preserva le export originali
4. **beforeEach con clearAllMocks** — Reset dei mock tra i test
5. **Niente chiamate API reali** — Tutto mockato, test veloci e deterministici

### 1.5 Gap di Coverage: Data Connector

**Nessun test esistente per:**

| Componente | File | Righe | Complessita |
|-----------|------|-------|-------------|
| BaseConnector | `lib/staff/data-connector/connectors/base.ts` | 113 | Media — fetchWithRetry, rateLimitPause, cleanText |
| NormattivaConnector | `lib/staff/data-connector/connectors/normattiva.ts` | 718 | Alta — 3 strategie fetch, ZIP parsing, AKN, URN |
| EurLexConnector | `lib/staff/data-connector/connectors/eurlex.ts` | 291 | Media — SPARQL, Cellar download, content negotiation |
| EuropePMCConnector | `lib/staff/data-connector/connectors/europepmc.ts` | 224 | Media — cursor pagination, date filtering |
| StatPearlsConnector | `lib/staff/data-connector/connectors/statpearls.ts` | 231 | Media — NCBI E-utilities, batch fetch |
| OpenStaxConnector | `lib/staff/data-connector/connectors/openstax.ts` | 321 | Media — CMS API, TOC flattening, page fetch |
| AKN Parser | `lib/staff/data-connector/parsers/akn-parser.ts` | 394 | Alta — XML parsing, 2 formati (standard + attachment) |
| HTML Parser | `lib/staff/data-connector/parsers/html-parser.ts` | 403 | Alta — regex parsing, 3 strategie, gerarchia |
| Article Validator | `lib/staff/data-connector/validators/article-validator.ts` | 93 | Bassa — validazione campi |
| Plugin Registry | `lib/staff/data-connector/plugin-registry.ts` | 188 | Bassa — registry pattern |
| Pipeline Orchestrator | `lib/staff/data-connector/index.ts` | 333 | Alta — 3 fasi, sync log, validazione |
| Sync Log | `lib/staff/data-connector/sync-log.ts` | 144 | Bassa — CRUD Supabase |
| Registry | `lib/staff/data-connector/registry.ts` | 89 | Bassa — mapping fonti |

**Totale: ~3,342 righe senza alcun test.** Questo rappresenta il gap di coverage piu significativo nel codebase.

---

## 2. Piano Test Suite Connettori

### 2.1 Unit Test per Ogni Connettore (con Mock API)

#### 2.1.1 BaseConnector (`tests/unit/data-connector/base-connector.test.ts`)

**Cosa testare:**
- `fetchWithRetry()` — successo al primo tentativo, retry su network error, max retry raggiunto
- `fetchJSON()` — parsing JSON, errore HTTP con messaggio, response non-OK
- `rateLimitPause()` — verifica delay 1000ms (mock setTimeout)
- `cleanText()` — decodifica HTML entity, normalizzazione spazi, trim
- `sleep()` — risolve dopo il delay corretto

**Mock necessari:**
- `global.fetch` — mock responses HTTP

**Fixture necessarie:**
- Nessuna nuova (BaseConnector non ha fixture specifiche)

**Test cases (8):**
```
describe("BaseConnector")
  describe("fetchWithRetry")
    it("returns response on first successful attempt")
    it("retries on network error up to maxRetries")
    it("throws after maxRetries exhausted")
    it("includes browser User-Agent in all requests")
    it("waits exponential backoff between retries: 2s, 4s, 8s")
  describe("fetchJSON")
    it("parses JSON from successful response")
    it("throws with HTTP status and body preview on non-OK response")
  describe("cleanText")
    it("decodes all HTML entities and normalizes whitespace")
```

#### 2.1.2 NormattivaConnector (`tests/unit/data-connector/normattiva-connector.test.ts`)

**Cosa testare:**
- `connect()` — test API formati, ricerca atto, match per URN, sample da collezione
- `connect()` — fallback directAkn, connect failure
- `fetchAll()` — strategia 1 (collezione), strategia 2 (async), strategia 3 (directAkn)
- `fetchAll()` — limit, codiceRedazionale non trovato
- `fetchDelta()` — aggiornamenti trovati, nessun aggiornamento, fallback a fetchAll
- `findMatchingAtto()` — match esatto, match parziale, nessun match
- `parseUrn()` — URN valido, URN invalido, URN assente
- `extractAknFromZip()` — ZIP con XML, ZIP senza XML, ZIP con codice specifico

**Mock necessari:**
- `global.fetch` — mock per tutti gli endpoint Normattiva API
- `adm-zip` — mock ZIP buffer/entries (oppure fixture ZIP reali piccoli)
- `../parsers/akn-parser` → `parseAkn` — mock del parser per isolare il connettore

**Fixture necessarie (nuove in `tests/fixtures/normattiva-api.ts`):**
- `makeFormatResponse()` — risposta /tipologiche/estensioni
- `makeSearchSempliceResponse()` — risposta /ricerca/semplice
- `makeAsyncToken()` — token ricerca asincrona
- `makeAsyncStatusInProgress()` — stato polling in corso
- `makeAsyncStatusComplete()` — stato polling completato (303)
- `makeMinimalAknXml()` — XML AKN minimo per test parsing (2-3 articoli)
- `makeMinimalZipBuffer()` — ZIP con AKN XML dentro (per extractAknFromZip)

**Test cases (18):**
```
describe("NormattivaConnector")
  describe("connect")
    it("returns ok:true with census when API responds and atto found")
    it("returns ok:true when using directAkn strategy for sample")
    it("returns ok:false when API is unreachable")
    it("returns ok:false when atto not found in search results")
    it("tries all normattivaSearchTerms before giving up")
  describe("fetchAll")
    it("uses collection strategy when SOURCE_COLLECTION_MAP has entry")
    it("uses directAkn strategy when source.config.directAkn is true")
    it("uses async search strategy as fallback")
    it("respects limit option")
    it("throws when codiceRedazionale not found")
  describe("fetchDelta")
    it("returns empty items when no updates since date")
    it("calls fetchAll when matching updates found")
    it("returns empty items on API error (graceful degradation)")
  describe("findMatchingAtto (private, tested via connect)")
    it("matches exactly by anno + numero + denominazione")
    it("matches partially by anno + numero only")
    it("returns null when no URN match (no fallback to first result)")
  describe("parseUrn (private, tested via behavior)")
    it("parses 'urn:nir:stato:decreto.legislativo:2005-09-06;206' correctly")
    it("returns null for malformed URN")
```

#### 2.1.3 EurLexConnector (`tests/unit/data-connector/eurlex-connector.test.ts`)

**Cosa testare:**
- `connect()` — SPARQL trova Cellar URI, download HTML, parsing articoli
- `connect()` — celexId mancante, SPARQL fallisce, HTML non disponibile
- `fetchAll()` — download e parsing completo
- `fetchDelta()` — nessuna modifica (lastModified < since), re-fetch quando modificato
- `findCellarUri()` — SPARQL SELECT con FILTER
- `downloadFromCellar()` — content negotiation xhtml → html fallback
- `executeSparql()` — query encoding, HTTP error

**Mock necessari:**
- `global.fetch` — mock SPARQL endpoint + Cellar download

**Fixture necessarie (nuove in `tests/fixtures/eurlex-api.ts`):**
- `makeSparqlResponse()` — risposta SPARQL JSON con bindings
- `makeEmptySparqlResponse()` — nessun binding
- `makeEurLexHtml()` — HTML EUR-Lex minimo con 2-3 articoli (eli-subdivision)
- `makeLegacyEurLexHtml()` — HTML vecchio formato (pre-2010)

**Test cases (14):**
```
describe("EurLexConnector")
  describe("connect")
    it("returns ok:true when CELEX found via SPARQL and HTML parsed")
    it("returns ok:false when celexId is missing")
    it("returns ok:false when CELEX not found in SPARQL")
    it("returns ok:false on network error")
  describe("fetchAll")
    it("fetches HTML from Cellar and returns parsed articles")
    it("respects limit option")
    it("throws when celexId is missing")
  describe("fetchDelta")
    it("returns empty items when lastModified < since")
    it("calls fetchAll when document was modified")
  describe("downloadFromCellar (private, tested via connect/fetchAll)")
    it("tries xhtml first then falls back to html")
    it("throws when no format returns valid HTML")
  describe("findCellarUri (private, tested via connect)")
    it("returns URI from SPARQL bindings")
    it("returns null on SPARQL error")
    it("returns null when no bindings match")
```

#### 2.1.4 EuropePMCConnector (`tests/unit/data-connector/europepmc-connector.test.ts`)

**Mock necessari:**
- `global.fetch` — mock EuropePMC REST API

**Fixture necessarie (nuove in `tests/fixtures/europepmc-api.ts`):**
- `makeEPMCSearchResponse()` — risultato ricerca con hitCount + resultList
- `makeEPMCArticle()` — singolo articolo con campi opzionali

**Test cases (10):**
```
describe("EuropePMCConnector")
  describe("connect")
    it("returns ok:true with hit count and sample data")
    it("returns ok:false on network error")
  describe("fetchAll")
    it("paginates with cursorMark until limit reached")
    it("skips articles without abstract or title")
    it("respects limit option")
    it("stops when no more pages (nextCursorMark same as current)")
  describe("fetchDelta")
    it("filters by FIRST_PDATE since date")
    it("restores original config after delta query")
  describe("article mapping")
    it("maps pmcid to articleNumber when available, falls back to pmid")
    it("includes rawMeta with doi, authors, citations")
```

#### 2.1.5 StatPearlsConnector (`tests/unit/data-connector/statpearls-connector.test.ts`)

**Mock necessari:**
- `global.fetch` — mock NCBI E-utilities

**Fixture necessarie (nuove in `tests/fixtures/statpearls-api.ts`):**
- `makeESearchResult()` — risultato esearch con idlist
- `makeESummaryResult()` — risultato esummary con dettagli articoli

**Test cases (10):**
```
describe("StatPearlsConnector")
  describe("connect")
    it("returns ok:true with article count from esearch")
    it("includes sample data from esummary")
    it("returns ok:false on network error")
    it("handles esummary failure gracefully (non-blocking)")
  describe("fetchAll")
    it("batches esearch + esummary calls")
    it("respects limit option")
    it("handles batch failure gracefully (continues with next batch)")
  describe("fetchDelta")
    it("filters by mdat (modification date) parameter")
  describe("inferSpecialty")
    it("maps title keywords to correct specialty")
    it("returns medicina_generale for unmatched titles")
```

#### 2.1.6 OpenStaxConnector (`tests/unit/data-connector/openstax-connector.test.ts`)

**Mock necessari:**
- `global.fetch` — mock OpenStax CMS API + Archive API

**Fixture necessarie (nuove in `tests/fixtures/openstax-api.ts`):**
- `makeOpenStaxBookList()` — risposta CMS /pages con book info
- `makeOpenStaxTOC()` — TOC con struttura ad albero (unit > chapter > section)
- `makeOpenStaxPage()` — pagina singola con HTML content

**Test cases (10):**
```
describe("OpenStaxConnector")
  describe("connect")
    it("returns ok:true with section count from TOC")
    it("returns ok:false when book slug not found")
    it("handles TOC fetch failure gracefully")
  describe("fetchAll")
    it("fetches all pages from flattened TOC")
    it("skips pages with < 50 chars content")
    it("respects limit option")
  describe("fetchDelta")
    it("falls back to fetchAll (books are versioned, not incrementally updated)")
  describe("flattenTOC")
    it("correctly flattens unit > chapter > section hierarchy")
    it("assigns chapterSection numbers correctly")
  describe("inferSlugFromSource")
    it("maps source name keywords to correct book slug")
```

### 2.2 Unit Test per Parser e Validatori

#### 2.2.1 AKN Parser (`tests/unit/data-connector/akn-parser.test.ts`)

**Fixture necessarie (nuove in `tests/fixtures/akn-samples.ts`):**
- `makeStandardAknXml()` — XML formato standard (body > book > title > article)
- `makeAttachmentAknXml()` — XML formato attachment (Codice Penale)
- `makeAbrogatedArticleXml()` — Articolo con status="abrogated"
- `makeBisArticleXml()` — Articolo con suffisso "-bis" / "-ter"
- `makeNamespacedAknXml()` — XML con namespace `an:` prefix

**Test cases (15):**
```
describe("parseAkn")
  it("parses standard format: body > book > title > article")
  it("parses attachment format: attachments > attachment > doc > mainBody")
  it("prefers attachments when they produce more articles than body")
  it("handles namespaced elements (an:article, an:body)")
  it("extracts hierarchy from book/title/chapter/section elements")
  it("marks abrogated articles as isInForce=false")
  it("handles bis/ter suffixes in article numbers")
  it("returns empty array for invalid XML")
  it("cleans HTML entities from article text")
  it("strips (( )) insertion markers from text")

describe("parseInlineArticle (tested via attachment parsing)")
  it("parses 'Art. 1. (Titolo) Testo...' format")
  it("parses articles without title")
  it("handles fallbackNumber when no Art. pattern found")
  it("returns null for text shorter than 5 chars")

describe("parseArticleNumberFromDocName")
  it("extracts '1' from 'Codice Penale-art. 1'")
  it("extracts '3-bis' from 'Codice Penale-art. 3 bis'")
```

#### 2.2.2 HTML Parser (`tests/unit/data-connector/html-parser.test.ts`)

**Fixture necessarie (nuove in `tests/fixtures/eurlex-html-samples.ts`):**
- `makeModernEurLexHtml()` — HTML con eli-subdivision + oj-ti-art
- `makeAlternativePatternHtml()` — HTML con sti-art (senza eli-subdivision)
- `makeLegacyHtml()` — HTML pre-2010 (solo `<p>Articolo N</p>`)
- `makeHtmlWithHierarchy()` — HTML con ti-section-1 / ti-section-2

**Test cases (13):**
```
describe("parseEurLexHtml")
  it("parses modern format with eli-subdivision divs")
  it("falls back to alternative pattern (sti-art) when no eli-subdivision")
  it("falls back to legacy format when no patterns match")
  it("extracts article number from id='art_N'")
  it("extracts article title from stitle-article-norm")
  it("extracts text from p.normal elements")
  it("returns empty array for HTML without articles")
  it("cleans HTML tags and decodes entities")

describe("buildHierarchyMap + getHierarchyAtPosition")
  it("builds positional map from ti-section-1 and ti-section-2")
  it("resets section when chapter changes")
  it("associates descriptions from ti-section-2 with preceding ti-section-1")

describe("parseLegacyEurLexHtml")
  it("parses articles from plain <p>Articolo N</p> patterns")
  it("returns empty array when no article headers found")
```

#### 2.2.3 Article Validator (`tests/unit/data-connector/article-validator.test.ts`)

**Fixture necessarie:** Nessuna nuova (usa ParsedArticle inline).

**Test cases (10):**
```
describe("validateArticle")
  it("returns valid:true for well-formed article")
  it("returns error when text is empty or < 10 chars")
  it("warns on HTML entities in text (&egrave;, &amp;, etc.)")
  it("warns on UI garbage in text ('articolo successivo', 'cookie', etc.)")
  it("warns on anomalous article number (non-digit start)")
  it("warns when hierarchy is empty")
  it("accumulates multiple warnings")

describe("validateBatch")
  it("counts valid, warning, error articles correctly")
  it("returns details for each article")
  it("handles empty batch")
```

### 2.3 Unit Test per Infrastruttura Pipeline

#### 2.3.1 Plugin Registry (`tests/unit/data-connector/plugin-registry.test.ts`)

**Test cases (8):**
```
describe("plugin-registry")
  describe("registerConnector / resolveConnector")
    it("registers and resolves a connector factory")
    it("throws with descriptive error for unknown connector")
  describe("registerModel / resolveModel")
    it("registers and resolves a model factory by dataType")
    it("throws for unknown dataType")
  describe("registerStore / resolveStore")
    it("registers and resolves a store factory")
    it("throws for unknown dataType")
  describe("listRegistered")
    it("lists all registered connectors, models, stores")
  describe("default registrations")
    it("registers normattiva, eurlex, ncbi-bookshelf, europe-pmc, openstax connectors")
```

#### 2.3.2 Pipeline Orchestrator (`tests/unit/data-connector/pipeline.test.ts`)

**Mock necessari:**
- `./plugin-registry` — mock resolveConnector, resolveModel, resolveStore
- `./sync-log` — mock startSync, completeSync, getLastSuccessfulSync
- `./validators/article-validator` — mock validateBatch
- `./registry` — mock getSourceById

**Test cases (14):**
```
describe("runPipeline")
  it("runs all 3 phases: CONNECT -> MODEL -> LOAD")
  it("stops after CONNECT when stopAfter='connect'")
  it("stops after MODEL when stopAfter='model'")
  it("stops when CONNECT fails (ok:false)")
  it("stops when MODEL reports schema not ready")
  it("skips invalid articles during LOAD (validateBatch filtering)")
  it("supports dryRun option (no actual save)")
  it("supports limit option")
  it("runs delta mode when mode='delta'")
  it("logs sync status to connector_sync_log")
  it("records durationMs")
  it("handles CONNECT exception gracefully")
  it("handles LOAD exception gracefully")
  it("returns error when sourceId not found")
```

---

## 3. Mock OAuth Server

### 3.1 Contesto

Attualmente i connettori usano API pubbliche senza autenticazione (Normattiva CC BY 4.0, EUR-Lex gratuito, NCBI E-utilities, EuropePMC, OpenStax). Tuttavia, il piano strategico prevede connettori OAuth2 per:
- **Salesforce** (contratti aziendali)
- **SAP** (documenti legali interni)
- **Google Workspace** (Google Drive documents)
- **Microsoft Graph** (SharePoint, OneDrive)

### 3.2 Libreria Suggerita

**`oauth2-mock-server`** (npm) — Server mock OAuth2 completo, zero configurazione.

```bash
npm install -D oauth2-mock-server
```

Alternativa: **`@badgateway/oauth2-client`** + custom mock, ma `oauth2-mock-server` e piu maturo e documentato.

### 3.3 Architettura Mock OAuth

```
tests/
  helpers/
    mock-oauth-server.ts       # Setup/teardown mock server
  unit/
    data-connector/
      oauth-connector.test.ts  # Test OAuth flow con mock server
```

**`tests/helpers/mock-oauth-server.ts`:**

```typescript
import { OAuth2Server } from "oauth2-mock-server";

let server: OAuth2Server;

export async function startMockOAuthServer(port = 8180): Promise<OAuth2Server> {
  server = new OAuth2Server();

  // Genera JWK key
  await server.issuer.keys.generate("RS256");

  // Avvia il server
  await server.start(port, "localhost");

  return server;
}

export async function stopMockOAuthServer(): Promise<void> {
  if (server) await server.stop();
}

export function getMockOAuthConfig() {
  return {
    authorizationUrl: "http://localhost:8180/authorize",
    tokenUrl: "http://localhost:8180/token",
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
    redirectUri: "http://localhost:3000/api/auth/callback/connector",
    scope: "read write",
  };
}
```

### 3.4 Flow da Testare

| Flow | Descrizione | Priorita |
|------|------------|----------|
| Authorization Code + PKCE | Standard OAuth2 per app web: authorize -> token -> access | P2 |
| Client Credentials | Per connettori server-to-server (Salesforce, SAP) | P2 |
| Token Refresh | Access token scaduto -> refresh token -> nuovo access token | P2 |
| Token Revocation | Disconnessione connettore -> revoke token | P3 |
| Error: Invalid Grant | Codice autorizzazione scaduto o gia usato | P2 |
| Error: Invalid Scope | Scope richiesto non autorizzato | P3 |

### 3.5 Test Cases Mock OAuth (12 test)

```
describe("OAuth2ConnectorBase")
  describe("Authorization Code + PKCE flow")
    it("generates valid PKCE code_verifier and code_challenge")
    it("builds correct authorization URL with state and PKCE")
    it("exchanges authorization code for access + refresh token")
    it("stores tokens securely after exchange")
  describe("Client Credentials flow")
    it("obtains access token with client_id + client_secret")
    it("caches token until expiry")
  describe("Token refresh")
    it("refreshes token automatically when access_token expires")
    it("handles refresh token rotation (new refresh_token in response)")
    it("throws AuthError when refresh_token is also expired")
  describe("Token revocation")
    it("revokes both access and refresh tokens")
  describe("Error handling")
    it("throws AuthError on invalid_grant (code expired)")
    it("throws AuthError on invalid_scope")
```

---

## 4. E2E Integration Flows

### 4.1 E2E Flow Completo: Connettore Lifecycle

**File:** `tests/integration/data-connector-pipeline.test.ts`

Questi test verificano l'integrazione tra i componenti della pipeline senza chiamate API reali. Mockano `global.fetch` e il Supabase client.

**Mock necessari:**
- `global.fetch` — mock risposte API per il connettore in test
- `@/lib/supabase/admin` — mock createAdminClient per sync-log e legal-corpus-store
- `@/lib/embeddings` — mock embed() per skipEmbeddings=true in test

**Test cases (10):**
```
describe("Data Connector Pipeline E2E")
  describe("Full lifecycle: CONNECT -> MODEL -> LOAD")
    it("runs complete pipeline for normattiva source (mocked API)")
    it("runs complete pipeline for eurlex source (mocked API)")
    it("pipeline records sync log entries at each phase")
    it("pipeline validates articles before loading")
    it("pipeline handles partial failures (some articles invalid)")

  describe("Delta update flow")
    it("delta mode fetches only updates since last sync")
    it("delta mode falls back to full fetch when connector requires it")

  describe("Error recovery")
    it("CONNECT failure stops pipeline with descriptive error")
    it("MODEL failure (schema not ready) stops with migration SQL")
    it("LOAD failure (store error) records error in sync log")
```

### 4.2 E2E Flow: API Route Data Connector

**File:** `tests/integration/data-connector-route.test.ts`

Test delle API route che espongono il data connector al cron e alla console.

**Test cases (6):**
```
describe("POST /api/platform/cron/data-connector")
  it("rejects without CRON_SECRET header")
  it("runs pipeline for specified sourceId")
  it("returns pipeline result with timing")

describe("Console data connector commands")
  it("console 'status' returns connector status for all sources")
  it("console 'connect <sourceId>' tests connection")
  it("rate limits connector operations (max 5/min)")
```

### 4.3 E2E Flow: Dashboard Monitoring

**File:** `e2e/data-connector-dashboard.spec.ts` (Playwright)

Questi test richiedono il dev server e verificano la UI di monitoring.

**Test cases (4):**
```
describe("Data Connector Dashboard (/ops)")
  it("shows connector status cards with last sync info")
  it("shows sync history timeline for each source")
  it("highlights sources in error state")
  it("refresh button triggers status update")
```

---

## 5. Prioritizzazione e Effort

### P1: Unit Test Connettori Esistenti (PRIORITA MASSIMA)

| Test file | Test cases | Effort | Dipendenze |
|-----------|-----------|--------|------------|
| `base-connector.test.ts` | 8 | 2h | Mock global.fetch |
| `normattiva-connector.test.ts` | 18 | 5h | Fixture API + mock ZIP |
| `eurlex-connector.test.ts` | 14 | 4h | Fixture SPARQL + HTML |
| `europepmc-connector.test.ts` | 10 | 3h | Fixture EuropePMC |
| `statpearls-connector.test.ts` | 10 | 3h | Fixture NCBI |
| `openstax-connector.test.ts` | 10 | 3h | Fixture OpenStax |
| `akn-parser.test.ts` | 15 | 4h | Fixture XML reali |
| `html-parser.test.ts` | 13 | 3h | Fixture HTML reali |
| `article-validator.test.ts` | 10 | 1h | Nessuna |
| `plugin-registry.test.ts` | 8 | 2h | Nessuna |
| `pipeline.test.ts` | 14 | 4h | Mock tutte le dipendenze |
| **Totale P1** | **130** | **34h** | |

### P2: Mock OAuth Server

| Componente | Effort | Dipendenze |
|-----------|--------|------------|
| Setup mock-oauth-server | 3h | npm install oauth2-mock-server |
| OAuth2ConnectorBase (classe astratta) | 4h | Design interfaccia |
| Test OAuth flows (12 test) | 4h | Mock server funzionante |
| **Totale P2** | **11h** | |

**Nota:** P2 dipende dalla decisione architetturale su quali connettori OAuth implementare. Il mock server e la classe base possono essere preparati in anticipo, ma i test specifici per Salesforce/SAP richiedono prima le specifiche dell'integrazione.

### P3: E2E Integration Flows

| Componente | Test cases | Effort | Dipendenze |
|-----------|-----------|--------|------------|
| Pipeline E2E (integration) | 10 | 5h | P1 completato |
| API Route E2E (integration) | 6 | 3h | Mock Supabase |
| Dashboard E2E (Playwright) | 4 | 3h | Dev server + /ops UI |
| **Totale P3** | **20** | **11h** | |

### Riepilogo Effort

| Priorita | Test cases | Effort stimato | Dipendenze |
|----------|-----------|---------------|------------|
| **P1** | 130 | 34h (~4-5 giorni) | Nessuna bloccante |
| **P2** | 12 | 11h (~1.5 giorni) | Decisione architetturale OAuth |
| **P3** | 20 | 11h (~1.5 giorni) | P1 completato |
| **Totale** | **162** | **56h (~7-8 giorni)** | |

---

## 6. Struttura File Proposta

```
tests/
  fixtures/
    normattiva.ts            # [ESISTENTE] Fixture Normattiva (da estendere)
    eurlex-api.ts            # [NUOVO] Fixture SPARQL + Cellar response
    europepmc-api.ts         # [NUOVO] Fixture EuropePMC search
    statpearls-api.ts        # [NUOVO] Fixture NCBI E-utilities
    openstax-api.ts          # [NUOVO] Fixture OpenStax CMS + Archive
    akn-samples.ts           # [NUOVO] XML AKN minimo (standard + attachment)
    eurlex-html-samples.ts   # [NUOVO] HTML EUR-Lex (modern + legacy)
  helpers/
    mock-oauth-server.ts     # [NUOVO] Setup/teardown OAuth2 mock server
    mock-fetch.ts            # [NUOVO] Helper per mock global.fetch con pattern routing
  unit/
    data-connector/
      base-connector.test.ts       # [NUOVO]
      normattiva-connector.test.ts  # [NUOVO]
      eurlex-connector.test.ts      # [NUOVO]
      europepmc-connector.test.ts   # [NUOVO]
      statpearls-connector.test.ts  # [NUOVO]
      openstax-connector.test.ts    # [NUOVO]
      akn-parser.test.ts            # [NUOVO]
      html-parser.test.ts           # [NUOVO]
      article-validator.test.ts     # [NUOVO]
      plugin-registry.test.ts       # [NUOVO]
      pipeline.test.ts              # [NUOVO]
      oauth-connector.test.ts       # [NUOVO P2]
  integration/
    data-connector-pipeline.test.ts # [NUOVO P3]
    data-connector-route.test.ts    # [NUOVO P3]
e2e/
  data-connector-dashboard.spec.ts  # [NUOVO P3]
```

---

## 7. Helper: Mock Fetch Routing

Per evitare duplicazione di mock fetch in ogni test file, proponiamo un helper centralizzato.

**`tests/helpers/mock-fetch.ts`:**

```typescript
import { vi } from "vitest";

type Route = {
  pattern: string | RegExp;
  method?: string;
  response: () => Response | Promise<Response>;
};

/**
 * Crea un mock di global.fetch che ruota le risposte in base a URL pattern.
 * Uso:
 *   const mockFetch = createMockFetch([
 *     { pattern: /tipologiche\/estensioni/, response: () => jsonResponse(formats) },
 *     { pattern: /ricerca\/semplice/, method: "POST", response: () => jsonResponse(searchResult) },
 *   ]);
 *   vi.stubGlobal("fetch", mockFetch);
 */
export function createMockFetch(routes: Route[]): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    for (const route of routes) {
      const urlMatch =
        typeof route.pattern === "string"
          ? url.includes(route.pattern)
          : route.pattern.test(url);
      const methodMatch = !route.method || route.method === method;

      if (urlMatch && methodMatch) {
        return route.response();
      }
    }

    throw new Error(`[MOCK FETCH] No route matched: ${method} ${url}`);
  }) as unknown as typeof fetch;
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function textResponse(text: string, status = 200): Response {
  return new Response(text, {
    status,
    headers: { "Content-Type": "text/plain" },
  });
}

export function errorResponse(status: number, body = ""): Response {
  return new Response(body, { status });
}
```

---

## 8. Rischi e Mitigazioni

| Rischio | Impatto | Mitigazione |
|---------|---------|-------------|
| Fixture XML/HTML diventano obsolete se i formati cambiano | Medio | Fixture minimali + commento su formato sorgente |
| Mock fetch non copre tutti gli edge case di rete | Basso | Test separati per timeout, ECONNREFUSED, redirect chain |
| OAuth mock server non disponibile su CI (porta occupata) | Medio | Porto configurabile, fallback test senza server |
| Pipeline test lenti per troppe dipendenze mock | Basso | Mock lazy (solo le dipendenze usate dal test case) |
| Normattiva ZIP fixture troppo grandi per il repo | Medio | Generare ZIP minimali programmaticamente nei test |

---

## 9. Criteri di Successo

- [ ] 130+ test P1 tutti verdi (`npm test`)
- [ ] Coverage > 80% su `lib/staff/data-connector/**/*.ts`
- [ ] Zero dipendenze da API esterne nei test (tutto mockato)
- [ ] Tempo esecuzione suite completa < 30 secondi
- [ ] Fixture riusabili e documentate per futuri connettori
- [ ] Mock OAuth server pronto per quando i connettori OAuth vengono implementati
