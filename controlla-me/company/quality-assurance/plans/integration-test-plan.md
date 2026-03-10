# Test Plan: Data Connector Suite (Comprehensive)

**Task ID**: 99e51f1a
**Department**: Quality Assurance
**Author**: QA Builder
**Date**: 2026-03-10
**Status**: PLAN (non implementato)
**Supersedes**: previous integration-test-plan.md (2026-03-10)

---

## Sommario

Questo piano copre la test suite completa per il sistema Data Connector (`lib/staff/data-connector/`). Il sistema implementa una pipeline a 3 fasi (CONNECT, MODEL, LOAD) con 5 connettori concreti, 2 parser, 1 validatore, un plugin registry, un sync log su Supabase e un orchestratore pipeline.

### Moduli da testare

| Modulo | File | Complessita |
|--------|------|-------------|
| BaseConnector | `connectors/base.ts` | Media |
| NormattivaConnector | `connectors/normattiva.ts` | Alta |
| EurLexConnector | `connectors/eurlex.ts` | Alta |
| StatPearlsConnector | `connectors/statpearls.ts` | Media |
| EuropePMCConnector | `connectors/europepmc.ts` | Media |
| OpenStaxConnector | `connectors/openstax.ts` | Media |
| AKN Parser | `parsers/akn-parser.ts` | Alta |
| HTML Parser | `parsers/html-parser.ts` | Alta |
| Article Validator | `validators/article-validator.ts` | Bassa |
| Legal Article Model | `models/legal-article-model.ts` | Media |
| Legal Corpus Store | `stores/legal-corpus-store.ts` | Bassa |
| Plugin Registry | `plugin-registry.ts` | Media |
| Source Registry | `registry.ts` | Bassa |
| Sync Log | `sync-log.ts` | Media |
| Pipeline Orchestrator | `index.ts` | Alta |

### Stima totale test

| Livello | Test stimati |
|---------|-------------|
| Unit (Vitest) | ~195 |
| Integration (Vitest) | ~35 |
| E2E (Playwright) | ~15 |
| **Totale** | **~245** |

### Architettura Test Esistente

| Strumento | Config | Scope |
|-----------|--------|-------|
| Vitest 4 | `vitest.config.ts` | Unit + Integration (`tests/**/*.test.ts`) |
| Playwright 1.58 | `playwright.config.ts` | E2E (`tests/e2e/**/*.spec.ts`, `e2e/**/*.spec.ts`) |
| Coverage | v8 | `lib/**/*.ts`, `app/api/**/*.ts` |
| Fixtures | `tests/fixtures/` | `normattiva.ts`, `documents.ts`, `classification.ts`, ecc. |
| Mocks | `tests/mocks/` | `supabase.ts` |
| Setup | `vitest.setup.ts` | Env vars, console suppression |

---

## 1. Unit Tests (Vitest)

### 1.1 BaseConnector (~20 test)

**File**: `tests/unit/data-connector/base-connector.test.ts`

Il `BaseConnector` e una classe astratta. Creiamo una sottoclasse concreta minimale per esporre e testare i metodi protetti.

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BaseConnector } from "@/lib/staff/data-connector/connectors/base";
import type { ConnectResult, FetchResult, DataSource } from "@/lib/staff/data-connector/types";

// Sottoclasse concreta per testare i metodi protetti di BaseConnector
class TestConnector extends BaseConnector<string> {
  async connect(): Promise<ConnectResult> {
    return {
      sourceId: "test", ok: true, message: "ok",
      census: { estimatedItems: 0, availableFormats: [], sampleFields: [] },
    };
  }
  async fetchAll(): Promise<FetchResult<string>> {
    return { sourceId: "test", items: [], fetchedAt: new Date().toISOString(), metadata: {} };
  }
  async fetchDelta(): Promise<FetchResult<string>> {
    return this.fetchAll();
  }

  // Expose protected methods for testing
  public testFetchWithRetry(url: string, options?: RequestInit, maxRetries?: number) {
    return this.fetchWithRetry(url, options, maxRetries);
  }
  public testFetchJSON<R>(url: string, options?: RequestInit) {
    return this.fetchJSON<R>(url, options);
  }
  public testCleanText(text: string) {
    return this.cleanText(text);
  }
  public testRateLimitPause() {
    return this.rateLimitPause();
  }
}

const makeSource = (overrides?: Partial<DataSource>): DataSource => ({
  id: "test-source",
  name: "Test Source",
  shortName: "Test",
  dataType: "legal-articles",
  vertical: "legal",
  connector: "test",
  config: {},
  lifecycle: "planned",
  estimatedItems: 10,
  ...overrides,
});

describe("BaseConnector", () => {
  let connector: TestConnector;
  let logSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    logSpy = vi.fn();
    connector = new TestConnector(makeSource(), logSpy);
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("fetchWithRetry", () => {
    it("ritorna la risposta al primo tentativo se OK", async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
      vi.stubGlobal("fetch", mockFetch);

      const response = await connector.testFetchWithRetry("https://example.com");
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(await response.text()).toBe("ok");
    });

    it("fa retry su errore di rete fino a maxRetries", async () => {
      const mockFetch = vi.fn()
        .mockRejectedValueOnce(new Error("network error"))
        .mockRejectedValueOnce(new Error("network error"))
        .mockResolvedValue(new Response("ok"));
      vi.stubGlobal("fetch", mockFetch);

      const response = await connector.testFetchWithRetry("https://example.com", undefined, 3);
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(await response.text()).toBe("ok");
    });

    it("lancia l'ultimo errore dopo maxRetries esauriti", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("persistent failure"));
      vi.stubGlobal("fetch", mockFetch);

      await expect(
        connector.testFetchWithRetry("https://example.com", undefined, 2)
      ).rejects.toThrow("persistent failure");
      expect(mockFetch).toHaveBeenCalledTimes(3); // attempt 0, 1, 2
    });

    it("imposta User-Agent browser su ogni richiesta", async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
      vi.stubGlobal("fetch", mockFetch);

      await connector.testFetchWithRetry("https://example.com");

      const callOptions = mockFetch.mock.calls[0][1];
      expect(callOptions.headers["User-Agent"]).toContain("Mozilla/5.0");
    });

    // ... (remaining 16 test cases listed in table below)
  });
});
```

**Complete test case list**:

| # | Descrizione | Categoria |
|---|-------------|-----------|
| 1 | `fetchWithRetry` ritorna la risposta al primo tentativo se OK | Happy path |
| 2 | `fetchWithRetry` fa retry su errore di rete fino a `maxRetries` | Retry logic |
| 3 | `fetchWithRetry` attende con backoff esponenziale tra i retry (2s, 4s, 8s) | Retry timing |
| 4 | `fetchWithRetry` lancia l'ultimo errore dopo `maxRetries` tentativi | Error exhaustion |
| 5 | `fetchWithRetry` imposta User-Agent browser su ogni richiesta | Headers |
| 6 | `fetchWithRetry` preserva gli headers custom dell'utente | Headers merge |
| 7 | `fetchWithRetry` con `maxRetries=0` non fa retry | Edge case |
| 8 | `fetchJSON` ritorna JSON parsato da risposta OK | Happy path |
| 9 | `fetchJSON` lancia errore con status e primi 200 char della risposta se non OK | Error detail |
| 10 | `fetchJSON` propaga errori di rete da `fetchWithRetry` | Error propagation |
| 11 | `cleanText` decodifica tutte le HTML entities italiane (&egrave;, &agrave;, ecc.) | Text cleaning |
| 12 | `cleanText` normalizza spazi multipli e newline | Text cleaning |
| 13 | `cleanText` gestisce stringa vuota senza errore | Edge case |
| 14 | `cleanText` gestisce tutte le entities in un testo combinato | Combined |
| 15 | `rateLimitPause` attende 1000ms | Rate limit |
| 16 | `sleep` risolve dopo il tempo specificato | Utility |
| 17 | Il costruttore accetta un log function custom | Constructor |
| 18 | Il costruttore usa `console.log` come default | Constructor default |
| 19 | `fetchWithRetry` logga i retry con il messaggio corretto | Logging |
| 20 | `fetchWithRetry` non logga se il primo tentativo ha successo | Logging |

### 1.2 NormattivaConnector (~25 test)

**File**: `tests/unit/data-connector/normattiva-connector.test.ts`

**Mock strategy**: Mock `global.fetch` per simulare risposte API Normattiva. Mock `adm-zip` per decompressione ZIP. Mock `parseAkn` per isolare il connettore dal parser.

```typescript
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.mock("adm-zip", () => ({
  default: vi.fn().mockImplementation(() => ({
    getEntries: vi.fn().mockReturnValue([{
      entryName: "005G0232.xml",
      isDirectory: false,
      header: { size: 1024 },
      getData: vi.fn().mockReturnValue(Buffer.from("<akomaNtoso></akomaNtoso>")),
    }]),
  })),
}));

vi.mock("@/lib/staff/data-connector/parsers/akn-parser", () => ({
  parseAkn: vi.fn().mockReturnValue([
    { articleNumber: "1", articleTitle: "Test", articleText: "Testo di test sufficientemente lungo.", hierarchy: {}, isInForce: true },
  ]),
}));
```

| # | Descrizione | Categoria |
|---|-------------|-----------|
| 1 | `connect()` testa l'API con /tipologiche/estensioni | Connect |
| 2 | `connect()` cerca l'atto con ricerca/semplice per ogni searchTerm | Connect |
| 3 | `connect()` ritorna `ok: true` con codiceRedazionale trovato | Connect |
| 4 | `connect()` ritorna `ok: false` su errore di rete | Connect error |
| 5 | `connect()` ritorna sample data se collezione disponibile | Connect census |
| 6 | `connect()` usa directAkn quando configurato | Connect directAkn |
| 7 | `fetchAll()` identifica strategia corretta (collection vs async vs directAkn) | FetchAll routing |
| 8 | `fetchAll()` usa collezione preconfezionata per fonti in SOURCE_COLLECTION_MAP | FetchAll collection |
| 9 | `fetchAll()` usa ricerca asincrona (3 step) per fonti senza collezione | FetchAll async |
| 10 | `fetchAll()` usa directAkn quando `config.directAkn=true` | FetchAll directAkn |
| 11 | `fetchAll()` rispetta il parametro `limit` | FetchAll limit |
| 12 | `fetchAll()` lancia errore se codiceRedazionale non trovato | FetchAll error |
| 13 | `fetchDelta()` chiama searchAggiornati con data `since` | Delta |
| 14 | `fetchDelta()` ritorna items vuoti se nessun aggiornamento | Delta empty |
| 15 | `fetchDelta()` fa re-fetch completo se aggiornamento trovato per il nostro atto | Delta refetch |
| 16 | `fetchDelta()` gestisce errori senza crashare (ritorna items vuoti) | Delta error |
| 17 | `parseUrn()` estrae tipo, anno, numero da URN valido | URN parsing |
| 18 | `parseUrn()` ritorna null per URN invalido/mancante | URN edge case |
| 19 | `findMatchingAtto()` match esatto per anno+numero+tipo | Search matching |
| 20 | `findMatchingAtto()` match parziale per anno+numero se tipo non corrisponde | Search fallback |
| 21 | `findMatchingAtto()` ritorna null se nessun match (non atti[0]) | Search no match |
| 22 | Ricerca asincrona: poll ogni 3s fino a stato 3 (completata) | Async polling |
| 23 | Ricerca asincrona: gestisce redirect 303 con Location header | Async redirect |
| 24 | Ricerca asincrona: lancia errore su stato 4 (fallito) | Async error |
| 25 | `fetchViaWebCaricaAKN`: estrae session cookie e usa Referer | Web AKN |

### 1.3 EurLexConnector (~20 test)

**File**: `tests/unit/data-connector/eurlex-connector.test.ts`

| # | Descrizione | Categoria |
|---|-------------|-----------|
| 1 | `connect()` ritorna `ok: false` se celexId mancante | Validation |
| 2 | `connect()` cerca Cellar URI via SPARQL SELECT | Connect |
| 3 | `connect()` ritorna `ok: false` se CELEX non trovato su EUR-Lex | Connect error |
| 4 | `connect()` scarica HTML italiano dal Cellar e parsa sample | Connect census |
| 5 | `connect()` gestisce errore di rete nella SPARQL | Connect network |
| 6 | `fetchAll()` lancia errore se celexId mancante | FetchAll validation |
| 7 | `fetchAll()` scarica HTML dal Cellar e parsa articoli | FetchAll |
| 8 | `fetchAll()` rispetta il parametro `limit` | FetchAll limit |
| 9 | `fetchDelta()` verifica data ultima modifica via SPARQL | Delta check |
| 10 | `fetchDelta()` ritorna items vuoti se non modificato dal `since` | Delta unchanged |
| 11 | `fetchDelta()` fa re-fetch completo se modificato | Delta changed |
| 12 | `findCellarUri()` costruisce query SPARQL corretta con FILTER | SPARQL |
| 13 | `findCellarUri()` ritorna null se nessun binding | SPARQL empty |
| 14 | `downloadFromCellar()` prova prima application/xhtml+xml poi text/html | Content negotiation |
| 15 | `downloadFromCellar()` lancia errore se nessun formato disponibile | Download error |
| 16 | `executeSparql()` passa query e format come parametri URL | SPARQL execution |
| 17 | `executeSparql()` lancia errore su risposta non-OK | SPARQL error |
| 18 | `getLastModified()` ritorna data se disponibile | Metadata |
| 19 | `getLastModified()` ritorna null su errore (non critico) | Metadata fallback |
| 20 | `downloadFromCellar()` segue redirect con `redirect: "follow"` | Redirect |

### 1.4 StatPearlsConnector (~12 test)

**File**: `tests/unit/data-connector/statpearls-connector.test.ts`

| # | Descrizione | Categoria |
|---|-------------|-----------|
| 1 | `connect()` usa esearch con `statpearls[book]` | Connect |
| 2 | `connect()` ritorna count e sample data da esummary | Connect census |
| 3 | `connect()` gestisce esummary fallito come warning non bloccante | Connect partial |
| 4 | `connect()` ritorna `ok: false` su errore di rete | Connect error |
| 5 | `fetchAll()` pagina con retstart crescente | Pagination |
| 6 | `fetchAll()` rispetta il parametro `limit` | Limit |
| 7 | `fetchAll()` salta entry senza titolo | Filtering |
| 8 | `fetchAll()` converte ID NCBI in formato `SP-{uid}` | Mapping |
| 9 | `fetchDelta()` usa datetype=mdat e mindate per filtrare | Delta |
| 10 | `inferSpecialty()` mappa correttamente keyword mediche a specialita | Classification |
| 11 | `inferSpecialty()` ritorna `medicina_generale` se nessun match | Classification default |
| 12 | `fetchAll()` gestisce batch falliti come warning | Batch error |

### 1.5 EuropePMCConnector (~12 test)

**File**: `tests/unit/data-connector/europepmc-connector.test.ts`

| # | Descrizione | Categoria |
|---|-------------|-----------|
| 1 | `connect()` costruisce query open access + review | Connect |
| 2 | `connect()` ritorna `ok: true` con hitCount | Connect census |
| 3 | `connect()` gestisce errore connessione | Connect error |
| 4 | `fetchAll()` usa cursorMark per paginazione | Pagination |
| 5 | `fetchAll()` salta articoli senza abstract e senza titolo | Filtering |
| 6 | `fetchAll()` salta entry con testo < 50 chars | Text threshold |
| 7 | `fetchAll()` rispetta il parametro `limit` | Limit |
| 8 | `fetchAll()` usa config.query custom se fornito | Custom query |
| 9 | `fetchAll()` si ferma se nextCursorMark e uguale al precedente | Pagination stop |
| 10 | `fetchDelta()` aggiunge filtro FIRST_PDATE alla query | Delta |
| 11 | `fetchDelta()` ripristina config originale dopo fetchAll | State restore |
| 12 | `fetchAll()` mappa pmcid/pmid/id correttamente nell'articleNumber | ID resolution |

### 1.6 OpenStaxConnector (~12 test)

**File**: `tests/unit/data-connector/openstax-connector.test.ts`

| # | Descrizione | Categoria |
|---|-------------|-----------|
| 1 | `connect()` cerca libro per slug via CMS API | Connect |
| 2 | `connect()` ritorna `ok: false` se libro non trovato | Connect error |
| 3 | `connect()` conta sezioni dal TOC | Connect census |
| 4 | `connect()` gestisce TOC fetch fallito come warning | Connect partial |
| 5 | `fetchAll()` appiattisce TOC in sezioni foglia | TOC flatten |
| 6 | `fetchAll()` scarica contenuto di ogni sezione | Content fetch |
| 7 | `fetchAll()` salta pagine con testo < 50 chars | Text threshold |
| 8 | `fetchAll()` rispetta il parametro `limit` | Limit |
| 9 | `fetchDelta()` esegue full fetch (libri non hanno delta) | Delta=full |
| 10 | `getBookSlug()` usa config.bookSlug se disponibile | Config |
| 11 | `inferSlugFromSource()` mappa nomi a slug corretti | Slug inference |
| 12 | `stripHTML()` rimuove script, style e tag | HTML stripping |

### 1.7 AKN Parser (~25 test)

**File**: `tests/unit/data-connector/akn-parser.test.ts`

Questo e il parser piu complesso: gestisce 2 formati (standard + attachment) con gerarchia ricorsiva. Test di puro parsing, nessun mock necessario.

```typescript
import { describe, it, expect } from "vitest";
import { parseAkn } from "@/lib/staff/data-connector/parsers/akn-parser";

// Fixtures XML minimali inline (per test leggeri)
const STANDARD_AKN = `<akomaNtoso>
  <act>
    <body>
      <article eId="art_1">
        <num>Art. 1</num>
        <heading>Ambito di applicazione</heading>
        <paragraph>
          <content><p>Il presente decreto si applica a tutti i contratti di consumo.</p></content>
        </paragraph>
      </article>
      <article eId="art_2">
        <num>Art. 2</num>
        <heading>Definizioni</heading>
        <paragraph>
          <content><p>Ai fini del presente decreto si intende per consumatore la persona fisica.</p></content>
        </paragraph>
      </article>
    </body>
  </act>
</akomaNtoso>`;

const ATTACHMENT_AKN = `<akomaNtoso>
  <act>
    <body>
      <article eId="art_decreto_1"><num>1</num>
        <paragraph><content><p>Decreto intro breve testo.</p></content></paragraph>
      </article>
    </body>
    <attachments>
      <attachment>
        <doc name="Codice Penale-art. 575">
          <mainBody><p>Art. 575. (Omicidio) Chiunque cagiona la morte di un uomo e punito con la reclusione non inferiore ad anni ventuno.</p></mainBody>
        </doc>
      </attachment>
      <attachment>
        <doc name="Codice Penale-art. 575 bis">
          <mainBody><p>Art. 575-bis. (Omicidio stradale) Chiunque cagioni per colpa la morte di una persona con violazione delle norme sulla disciplina della circolazione stradale.</p></mainBody>
        </doc>
      </attachment>
    </attachments>
  </act>
</akomaNtoso>`;

describe("parseAkn", () => {
  it("parsa formato standard con body > article", () => {
    const articles = parseAkn(STANDARD_AKN, "Test");
    expect(articles).toHaveLength(2);
    expect(articles[0].articleNumber).toBe("1");
    expect(articles[0].articleTitle).toBe("Ambito di applicazione");
    expect(articles[0].articleText).toContain("contratti di consumo");
  });

  it("preferisce attachment se produce piu articoli del body", () => {
    const articles = parseAkn(ATTACHMENT_AKN, "Test");
    // Body ha 1 articolo, attachments ne hanno 2 -> usa attachment
    expect(articles).toHaveLength(2);
    expect(articles[0].articleNumber).toBe("575");
    expect(articles[0].articleTitle).toBe("Omicidio");
  });

  it("gestisce suffisso bis nel doc name", () => {
    const articles = parseAkn(ATTACHMENT_AKN, "Test");
    expect(articles[1].articleNumber).toBe("575-bis");
  });
});
```

**Complete test case list**:

| # | Descrizione | Categoria |
|---|-------------|-----------|
| 1 | Parsa formato standard con body > article | Standard |
| 2 | Estrae articleNumber, articleTitle, articleText correttamente | Standard fields |
| 3 | Traccia gerarchia (book > title > chapter > section > article) | Hierarchy |
| 4 | Gestisce namespace `an:` (prefisso alternativo) | Namespace |
| 5 | Parsa formato attachment (Regi Decreti) | Attachment |
| 6 | Preferisce attachment se produce piu articoli del body | Attachment priority |
| 7 | `parseArticleNumberFromDocName`: "art. 1" -> "1" | Doc name parsing |
| 8 | `parseArticleNumberFromDocName`: "art. 3 bis" -> "3-bis" | Bis/ter suffix |
| 9 | `parseArticleNumberFromDocName`: "art. 2645 ter" -> "2645-ter" | Complex number |
| 10 | `parseInlineArticle`: estrae numero, titolo tra parentesi, testo | Inline parsing |
| 11 | `parseInlineArticle`: gestisce articolo senza titolo | No title |
| 12 | `parseInlineArticle`: gestisce prefisso "CODICE PENALE Art. 1." | Prefix |
| 13 | `parseInlineArticle`: rimuove `(( ))` da inserimenti | Clean insertions |
| 14 | `extractText`: ricorsione su nodi annidati | Text extraction |
| 15 | `extractText`: concatena array di nodi | Array handling |
| 16 | `extractText`: ignora attributi XML (@_eId, @_status) | Attribute skip |
| 17 | `extractText`: gestisce null, undefined, number | Edge types |
| 18 | `cleanArticleNumber`: "Art. 1537" -> "1537" | Number cleaning |
| 19 | `cleanArticleNumber`: stringa vuota -> "" | Empty input |
| 20 | `isAbrogated`: true se status contiene "abrogat" | Abrogation status |
| 21 | `isAbrogated`: true se testo contiene "articolo abrogato" | Abrogation text |
| 22 | `isAbrogated`: false per articolo normale | Not abrogated |
| 23 | `cleanText`: rimuove `(( ))`, decodifica entities, normalizza spazi | Text cleaning |
| 24 | Articoli con testo < 5 chars vengono saltati | Min text threshold |
| 25 | XML vuoto o malformato non crasha (ritorna array vuoto) | Robustness |

### 1.8 HTML Parser (~20 test)

**File**: `tests/unit/data-connector/html-parser.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { parseEurLexHtml } from "@/lib/staff/data-connector/parsers/html-parser";

const MODERN_EURLEX_HTML = `<body>
  <div class="eli-subdivision" id="art_1">
    <p class="oj-ti-art">Articolo 1</p>
    <p class="stitle-article-norm">Oggetto</p>
    <p class="normal">La presente direttiva si applica alle clausole contrattuali non negoziate individualmente.</p>
  </div>
  <div class="eli-subdivision" id="art_2">
    <p class="oj-ti-art">Articolo 2</p>
    <p class="stitle-article-norm">Definizioni</p>
    <p class="normal">Ai fini della presente direttiva si intende per clausola abusiva.</p>
  </div>
</body>`;

const LEGACY_EURLEX_HTML = `<body>
  <p>Articolo 1</p>
  <p>La presente direttiva ha lo scopo di ravvicinare le disposizioni legislative regolamentari e amministrative.</p>
  <p>Articolo 2</p>
  <p>Ai sensi della presente direttiva si intende per professionista qualsiasi persona fisica o giuridica.</p>
</body>`;

describe("parseEurLexHtml", () => {
  it("parsa formato moderno con eli-subdivision", () => {
    const articles = parseEurLexHtml(MODERN_EURLEX_HTML, "Dir. 93/13");
    expect(articles).toHaveLength(2);
    expect(articles[0].articleNumber).toBe("1");
    expect(articles[0].articleTitle).toBe("Oggetto");
  });

  it("parsa formato legacy senza classi CSS", () => {
    const articles = parseEurLexHtml(LEGACY_EURLEX_HTML, "Dir. 93/13");
    expect(articles).toHaveLength(2);
    expect(articles[0].articleNumber).toBe("1");
  });
});
```

| # | Descrizione | Categoria |
|---|-------------|-----------|
| 1 | Parsa formato moderno con eli-subdivision e id="art_N" | Modern format |
| 2 | Estrae articleNumber da id="art_N" | Number from ID |
| 3 | Estrae articleNumber da `<p class="oj-ti-art">` se id non ha numero | Number fallback |
| 4 | Estrae articleTitle da `<p class="stitle-article-norm">` | Title |
| 5 | Estrae articleTitle da `<p class="sti-art">` se non e "Articolo N" | Title alt |
| 6 | Raccoglie testo da `<p class="normal">` | Text normal |
| 7 | Fallback: raccoglie da tutti i `<p>` se nessun "normal" trovato | Text fallback |
| 8 | Costruisce gerarchia da ti-section-1 e ti-section-2 | Hierarchy |
| 9 | Pattern alternativo: usa `<p class="sti-art">` come header | Alt pattern |
| 10 | Legacy format (pre-2010): parsa `<p>Articolo N</p>` senza classi | Legacy |
| 11 | Legacy: raccoglie paragrafi fino al prossimo articolo | Legacy text |
| 12 | `buildHierarchyMap`: identifica CAPO come chapter, resto come section | Hierarchy map |
| 13 | `buildHierarchyMap`: associa descrizioni ti-section-2 al precedente entry | Description |
| 14 | `getHierarchyAtPosition`: reset sezione quando cambia capitolo | Position tracking |
| 15 | `cleanHtml`: rimuove tag HTML e decodifica entities | HTML cleaning |
| 16 | Articoli con testo < 10 chars vengono saltati | Min text |
| 17 | HTML vuoto ritorna array vuoto | Empty input |
| 18 | Gestisce articoli senza titolo (articleTitle = null) | No title |
| 19 | sourceUrl formato corretto: `eurlex:{lawSource}#art_N` | Source URL |
| 20 | `isInForce` sempre true per articoli EUR-Lex | In force |

### 1.9 Article Validator (~10 test)

**File**: `tests/unit/data-connector/article-validator.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { validateArticle, validateBatch } from "@/lib/staff/data-connector/validators/article-validator";
import { VALID_ARTICLE, ARTICLE_SHORT_TEXT, ARTICLE_WITH_HTML_ENTITIES, BATCH_MIXED } from "../../fixtures/data-connector/parsed-articles";

describe("validateArticle", () => {
  it("articolo valido: valid=true, nessun error/warning", () => {
    const result = validateArticle(VALID_ARTICLE);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("testo troppo corto: errore", () => {
    const result = validateArticle(ARTICLE_SHORT_TEXT);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Testo troppo corto");
  });
});

describe("validateBatch", () => {
  it("conta correttamente valid/warning/error", () => {
    const result = validateBatch(BATCH_MIXED);
    expect(result.validCount + result.errorCount).toBe(BATCH_MIXED.length);
  });
});
```

| # | Descrizione | Categoria |
|---|-------------|-----------|
| 1 | Articolo valido: `valid=true`, nessun error/warning | Happy path |
| 2 | Testo troppo corto (< 10 chars): errore | Validation error |
| 3 | Testo assente/null: errore | Missing field |
| 4 | HTML entity non decodificata: warning | Data quality |
| 5 | UI garbage rilevata: warning | Data quality |
| 6 | Numero articolo non inizia con cifra: warning | Number format |
| 7 | Gerarchia assente: warning | Missing hierarchy |
| 8 | Combinazione di warning + nessun errore: `valid=true` | Warning vs error |
| 9 | `validateBatch`: conta correttamente valid/warning/error | Batch counting |
| 10 | `validateBatch`: ritorna details per ogni articolo | Batch details |

### 1.10 Plugin Registry (~15 test)

**File**: `tests/unit/data-connector/plugin-registry.test.ts`

**Nota**: il modulo esegue `registerDefaults()` al primo import. I test devono tener conto dello stato pre-registrato.

| # | Descrizione | Categoria |
|---|-------------|-----------|
| 1 | `registerConnector` registra un factory e `resolveConnector` lo trova | Register + resolve |
| 2 | `resolveConnector` lancia errore con messaggio chiaro se connettore non registrato | Error message |
| 3 | `resolveConnector` passa `source` e `log` al factory | Factory args |
| 4 | `registerModel` registra per dataType e `resolveModel` lo trova | Model register |
| 5 | `resolveModel` lancia errore se dataType non registrato | Model error |
| 6 | `registerStore` registra per dataType e `resolveStore` lo trova | Store register |
| 7 | `resolveStore` lancia errore se dataType non registrato | Store error |
| 8 | `listRegistered` ritorna connettori, models e stores registrati | List |
| 9 | Registrazioni di default includono "normattiva" e "eurlex" | Defaults connectors |
| 10 | Registrazioni di default includono "ncbi-bookshelf", "europe-pmc", "openstax" | Defaults medical |
| 11 | Registrazioni di default includono model per "legal-articles", "hr-articles", "medical-articles" | Defaults models |
| 12 | Registrazioni di default includono store per "legal-articles", "hr-articles", "medical-articles" | Defaults stores |
| 13 | Sovrascrivere un connettore registrato: l'ultimo registrato vince | Override |
| 14 | `resolveConnector` elenca i connettori disponibili nel messaggio di errore | Error detail |
| 15 | Factory connector ritorna un oggetto con `connect`, `fetchAll`, `fetchDelta` | Interface check |

### 1.11 Source Registry (~10 test)

**File**: `tests/unit/data-connector/source-registry.test.ts`

| # | Descrizione | Categoria |
|---|-------------|-----------|
| 1 | `getAllSources()` ritorna fonti del verticale legal | Default vertical |
| 2 | `getSourceById()` trova una fonte per ID | Lookup |
| 3 | `getSourceById()` ritorna undefined per ID inesistente | Not found |
| 4 | `getSourcesByVertical("legal")` ritorna solo fonti legal | Vertical filter |
| 5 | `getSourcesByLifecycle("loaded")` ritorna solo fonti caricate | Lifecycle filter |
| 6 | `getLoadedSources()` include sia "loaded" che "delta-active" | Loaded filter |
| 7 | `getSourcesByConnector("normattiva")` filtra per tipo connettore | Connector filter |
| 8 | `toDataSource()` mappa correttamente i campi CorpusSource -> DataSource | Mapping |
| 9 | `getAllSourcesAllVerticals()` include fonti di tutti i verticali registrati | Multi-vertical |
| 10 | `getVerticals()` ritorna la lista dei verticali registrati | Verticals list |

### 1.12 Sync Log (~12 test)

**File**: `tests/unit/data-connector/sync-log.test.ts`

**Mock strategy**: Mock `createAdminClient` per evitare chiamate reali a Supabase. Usare pattern `makeMockSupabaseClient()` dalla codebase esistente.

```typescript
const mockFrom = vi.fn().mockReturnThis();
const mockInsert = vi.fn().mockReturnThis();
const mockUpdate = vi.fn().mockReturnThis();
const mockSelect = vi.fn().mockReturnThis();
const mockEq = vi.fn().mockReturnThis();
const mockOrder = vi.fn().mockReturnThis();
const mockLimit = vi.fn().mockReturnThis();
const mockSingle = vi.fn();
const mockMaybeSingle = vi.fn();

const mockAdminClient = {
  from: mockFrom.mockReturnValue({
    insert: mockInsert.mockReturnValue({ select: vi.fn().mockReturnValue({ single: mockSingle }) }),
    update: mockUpdate.mockReturnValue({ eq: mockEq }),
    select: mockSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: mockOrder.mockReturnValue({
            limit: mockLimit.mockReturnValue({ maybeSingle: mockMaybeSingle }),
          }),
        }),
        order: mockOrder.mockReturnValue({ limit: mockLimit }),
      }),
    }),
  }),
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => mockAdminClient),
}));
```

| # | Descrizione | Categoria |
|---|-------------|-----------|
| 1 | `startSync` inserisce un record con status "running" | Insert |
| 2 | `startSync` ritorna l'ID del record creato | Return value |
| 3 | `startSync` lancia errore se insert fallisce | Error |
| 4 | `completeSync` aggiorna status, completed_at e contatori | Update |
| 5 | `completeSync` logga errore se update fallisce (non lancia) | Error logging |
| 6 | `getLastSuccessfulSync` filtra per sourceId e status "completed" | Query filter |
| 7 | `getLastSuccessfulSync` ordina per completed_at DESC | Query order |
| 8 | `getLastSuccessfulSync` ritorna null se nessun sync trovato | Not found |
| 9 | `getSyncHistory` ritorna ultimi N sync per sourceId | History |
| 10 | `getConnectorStatus` raggruppa per source_id | Aggregation |
| 11 | `mapRow` converte snake_case DB in camelCase TypeScript | Row mapping |
| 12 | `mapRow` gestisce campi null con default | Null handling |

### 1.13 Legal Article Model (~10 test)

**File**: `tests/unit/data-connector/legal-article-model.test.ts`

| # | Descrizione | Categoria |
|---|-------------|-----------|
| 1 | `analyze()` ritorna specifica con 11 colonne | Schema spec |
| 2 | `analyze()` calcola avgTextLength dai sample | Sample analysis |
| 3 | `analyze()` rileva gerarchia presente nei sample | Hierarchy detection |
| 4 | `analyze()` rileva sourceUrl presente nei sample | URL detection |
| 5 | `analyze()` con sample vuoto ritorna valori default | Empty sample |
| 6 | `checkSchema()` ritorna `ready: true` se tabella esiste con tutte le colonne | Schema ready |
| 7 | `checkSchema()` ritorna `ready: false` con migration SQL se colonne mancanti | Schema missing |
| 8 | `checkSchema()` gestisce fallback su query diretta se information_schema fallisce | Schema fallback |
| 9 | `describeTransform()` formatta le regole in stringa leggibile | Description |
| 10 | `generateMigrationSQL()` produce SQL CREATE TABLE valido | Migration SQL |

### 1.14 Legal Corpus Store (~8 test)

**File**: `tests/unit/data-connector/legal-corpus-store.test.ts`

```typescript
const mockIngestArticles = vi.hoisted(() => vi.fn());

vi.mock("@/lib/legal-corpus", () => ({
  ingestArticles: mockIngestArticles,
}));

beforeEach(() => {
  mockIngestArticles.mockResolvedValue({ inserted: 5, errors: 0 });
});
```

| # | Descrizione | Categoria |
|---|-------------|-----------|
| 1 | `save()` chiama `ingestArticles` con gli articoli | Save |
| 2 | `save()` processa in batch da 50 | Batching |
| 3 | `save()` accumula inserted e errors tra i batch | Accumulation |
| 4 | `save()` con `dryRun=true` non chiama ingestArticles | Dry run |
| 5 | `save()` con `dryRun=true` ritorna skipped = articles.length | Dry run count |
| 6 | `save()` gestisce errore in un batch senza bloccare i successivi | Batch error |
| 7 | `save()` logga progresso per ogni batch | Logging |
| 8 | `save()` include errorDetails per articoli falliti | Error detail |

### 1.15 Pipeline Orchestrator (~16 test)

**File**: `tests/unit/data-connector/pipeline.test.ts`

**Mock strategy**: Mock `plugin-registry` per connettore/model/store finti. Mock `sync-log` per evitare DB. Mock `registry` per fonte finta. Mock `validators/article-validator` per controllare la validazione.

```typescript
const mockConnector = {
  connect: vi.fn(),
  fetchAll: vi.fn(),
  fetchDelta: vi.fn(),
};
const mockModel = {
  analyze: vi.fn(),
  checkSchema: vi.fn(),
  describeTransform: vi.fn().mockReturnValue("articleNumber -> article_reference (format_as_Art_N)"),
};
const mockStore = { save: vi.fn() };

vi.mock("@/lib/staff/data-connector/plugin-registry", () => ({
  resolveConnector: vi.fn(() => mockConnector),
  resolveModel: vi.fn(() => mockModel),
  resolveStore: vi.fn(() => mockStore),
  registerConnector: vi.fn(),
  registerModel: vi.fn(),
  registerStore: vi.fn(),
  listRegistered: vi.fn(),
}));

vi.mock("@/lib/staff/data-connector/sync-log", () => ({
  startSync: vi.fn().mockResolvedValue("sync-id-1"),
  completeSync: vi.fn().mockResolvedValue(undefined),
  getLastSuccessfulSync: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/staff/data-connector/registry", () => ({
  getSourceById: vi.fn().mockReturnValue({
    id: "test_source", name: "Test Source", shortName: "Test",
    dataType: "legal-articles", vertical: "legal", connector: "normattiva",
    config: {}, lifecycle: "loaded", estimatedItems: 10,
  }),
  getAllSources: vi.fn().mockReturnValue([]),
  getAllSourcesAllVerticals: vi.fn().mockReturnValue([]),
}));

// Pipeline setup for happy path
beforeEach(() => {
  mockConnector.connect.mockResolvedValue({
    sourceId: "test_source", ok: true, message: "API OK",
    census: { estimatedItems: 3, availableFormats: ["AKN"], sampleFields: [], sampleData: [] },
  });
  mockModel.analyze.mockResolvedValue({ tableName: "legal_articles", columns: [], indexes: [], transformRules: [] });
  mockModel.checkSchema.mockResolvedValue({ ready: true, spec: {}, message: "OK" });
  mockConnector.fetchAll.mockResolvedValue({
    sourceId: "test_source",
    items: [
      { articleNumber: "1", articleTitle: "Test", articleText: "Testo sufficientemente lungo per la validazione.", hierarchy: {}, isInForce: true },
    ],
    fetchedAt: new Date().toISOString(),
    metadata: {},
  });
  mockStore.save.mockResolvedValue({ inserted: 1, updated: 0, skipped: 0, errors: 0, errorDetails: [] });
});
```

| # | Descrizione | Categoria |
|---|-------------|-----------|
| 1 | `runPipeline` esegue tutte e 3 le fasi in ordine | Full pipeline |
| 2 | `runPipeline` con `stopAfter: "connect"` esegue solo CONNECT | Stop early |
| 3 | `runPipeline` con `stopAfter: "model"` esegue CONNECT + MODEL | Stop model |
| 4 | `runPipeline` si ferma se CONNECT fallisce (ok: false) | Connect fail |
| 5 | `runPipeline` si ferma se CONNECT lancia eccezione | Connect exception |
| 6 | `runPipeline` si ferma se MODEL non e ready | Model not ready |
| 7 | `runPipeline` si ferma se nessun articolo valido dopo validazione | Validation fail |
| 8 | `runPipeline` in modalita delta usa `fetchDelta` con data ultimo sync | Delta mode |
| 9 | `runPipeline` in modalita full usa `fetchAll` | Full mode |
| 10 | `runPipeline` chiama `startSync` e `completeSync` per ogni fase | Sync logging |
| 11 | `runPipeline` trasforma ParsedArticle in LegalArticle per lo store | Transform |
| 12 | `runPipeline` calcola durationMs correttamente | Timing |
| 13 | `runPipeline` lancia errore se fonte non trovata | Source not found |
| 14 | `connectSource` e wrapper per `runPipeline` con `stopAfter: "connect"` | CLI wrapper |
| 15 | `loadSource` passa `dryRun` e `skipEmbeddings` a runPipeline | Options forwarding |
| 16 | `updateSource` usa mode "delta" | Delta wrapper |

---

## 2. Mock OAuth Server

### 2.1 Contesto

Il sistema Data Connector attuale **non usa OAuth** (Normattiva e EUR-Lex sono API pubbliche senza autenticazione). Per l'Integration Office che intende supportare connettori con autenticazione OAuth2 (es. Google Drive, Salesforce, Jira), prepariamo l'infrastruttura di test.

### 2.2 Implementazione proposta

**File**: `tests/mocks/oauth-server.ts`

Server OAuth2 minimale usando `http.createServer` di Node.js (zero dipendenze extra). Non serve `express`: le route sono poche e il server e usato solo nei test.

```typescript
import http from "node:http";
import crypto from "node:crypto";

interface OAuthServerConfig {
  port?: number;
  /** Simula latenza nella risposta token (ms) */
  tokenDelay?: number;
  /** Forza errore specifico nella risposta */
  forceError?: "invalid_grant" | "expired_token" | "server_error" | null;
  /** Token da restituire (default: generato random) */
  accessToken?: string;
  /** Durata token in secondi (default: 3600) */
  expiresIn?: number;
}

export class MockOAuthServer {
  private server: http.Server;
  private config: Required<OAuthServerConfig>;
  private issuedCodes = new Map<string, { clientId: string; codeChallenge?: string }>();
  private issuedTokens = new Set<string>();

  constructor(config: OAuthServerConfig = {}) {
    this.config = {
      port: config.port ?? 0, // OS-assigned port
      tokenDelay: config.tokenDelay ?? 0,
      forceError: config.forceError ?? null,
      accessToken: config.accessToken ?? crypto.randomUUID(),
      expiresIn: config.expiresIn ?? 3600,
    };
    this.server = http.createServer(this.handleRequest.bind(this));
  }

  async start(): Promise<number> {
    return new Promise((resolve) => {
      this.server.listen(this.config.port, () => {
        const addr = this.server.address() as { port: number };
        this.config.port = addr.port;
        resolve(addr.port);
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => this.server.close(() => resolve()));
  }

  get baseUrl(): string {
    return `http://localhost:${this.config.port}`;
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url ?? "/", this.baseUrl);

    if (url.pathname === "/authorize" && req.method === "GET") {
      return this.handleAuthorize(url, res);
    }
    if (url.pathname === "/token" && req.method === "POST") {
      return this.handleToken(req, res);
    }
    if (url.pathname === "/revoke" && req.method === "POST") {
      return this.handleRevoke(res);
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: "not_found" }));
  }

  private handleAuthorize(url: URL, res: http.ServerResponse) {
    const clientId = url.searchParams.get("client_id") ?? "";
    const redirectUri = url.searchParams.get("redirect_uri") ?? "";
    const codeChallenge = url.searchParams.get("code_challenge") ?? undefined;
    const state = url.searchParams.get("state") ?? "";

    const code = crypto.randomUUID();
    this.issuedCodes.set(code, { clientId, codeChallenge });

    const redirect = `${redirectUri}?code=${code}&state=${state}`;
    res.writeHead(302, { Location: redirect });
    res.end();
  }

  private async handleToken(req: http.IncomingMessage, res: http.ServerResponse) {
    // Read POST body
    const body = await new Promise<string>((resolve) => {
      let data = "";
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => resolve(data));
    });

    if (this.config.tokenDelay > 0) {
      await new Promise((r) => setTimeout(r, this.config.tokenDelay));
    }

    if (this.config.forceError) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: this.config.forceError, error_description: `Simulated error: ${this.config.forceError}` }));
      return;
    }

    // Validate code if provided (authorization_code flow)
    const params = new URLSearchParams(body);
    const grantType = params.get("grant_type");
    const code = params.get("code");

    if (grantType === "authorization_code" && code && !this.issuedCodes.has(code)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_grant", error_description: "Code not found" }));
      return;
    }

    // PKCE validation
    if (code) {
      const codeEntry = this.issuedCodes.get(code);
      if (codeEntry?.codeChallenge) {
        const codeVerifier = params.get("code_verifier");
        if (!codeVerifier) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "invalid_request", error_description: "PKCE code_verifier required" }));
          return;
        }
        // In production: verify SHA256(code_verifier) === code_challenge
        // In mock: accept any non-empty verifier
      }
      this.issuedCodes.delete(code); // One-time use
    }

    const token = this.config.accessToken;
    this.issuedTokens.add(token);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      access_token: token,
      token_type: "Bearer",
      expires_in: this.config.expiresIn,
      refresh_token: crypto.randomUUID(),
      scope: "read write",
    }));
  }

  private handleRevoke(res: http.ServerResponse) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true }));
  }

  // ─── Test helpers ───
  setForceError(error: OAuthServerConfig["forceError"]) {
    this.config.forceError = error ?? null;
  }
  setTokenDelay(ms: number) {
    this.config.tokenDelay = ms;
  }
  getIssuedTokens(): string[] {
    return [...this.issuedTokens];
  }
  getIssuedCodes(): string[] {
    return [...this.issuedCodes.keys()];
  }
  reset() {
    this.issuedCodes.clear();
    this.issuedTokens.clear();
    this.config.forceError = null;
    this.config.tokenDelay = 0;
  }
}
```

### 2.3 Integrazione con Vitest

```typescript
// tests/unit/data-connector/oauth-flow.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { MockOAuthServer } from "../../mocks/oauth-server";

describe("MockOAuthServer", () => {
  let server: MockOAuthServer;

  beforeAll(async () => {
    server = new MockOAuthServer();
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  beforeEach(() => {
    server.reset();
  });

  it("issues authorization code on /authorize", async () => {
    const res = await fetch(
      `${server.baseUrl}/authorize?client_id=test&redirect_uri=http://localhost:3000/callback&state=abc123`,
      { redirect: "manual" }
    );
    expect(res.status).toBe(302);
    const location = res.headers.get("location");
    expect(location).toContain("code=");
    expect(location).toContain("state=abc123");
  });

  it("exchanges code for token on /token", async () => {
    // First get a code
    const authRes = await fetch(
      `${server.baseUrl}/authorize?client_id=test&redirect_uri=http://localhost/cb&state=x`,
      { redirect: "manual" }
    );
    const code = new URL(authRes.headers.get("location")!).searchParams.get("code");

    // Exchange code for token
    const tokenRes = await fetch(`${server.baseUrl}/token`, {
      method: "POST",
      body: new URLSearchParams({ grant_type: "authorization_code", code: code!, redirect_uri: "http://localhost/cb" }),
    });
    expect(tokenRes.status).toBe(200);
    const data = await tokenRes.json();
    expect(data.access_token).toBeDefined();
    expect(data.token_type).toBe("Bearer");
    expect(data.expires_in).toBe(3600);
    expect(data.refresh_token).toBeDefined();
  });

  it("returns error when forceError is set", async () => {
    server.setForceError("expired_token");
    const res = await fetch(`${server.baseUrl}/token`, {
      method: "POST",
      body: new URLSearchParams({ grant_type: "client_credentials" }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("expired_token");
  });
});
```

### 2.4 Test cases per Mock OAuth (~8 test)

| # | Descrizione | Categoria |
|---|-------------|-----------|
| 1 | Server si avvia su porta random e fornisce baseUrl | Lifecycle |
| 2 | /authorize genera code e redirect con state | Auth code |
| 3 | /token scambia code per access_token e refresh_token | Token exchange |
| 4 | /token con forceError="invalid_grant" ritorna 400 | Error simulation |
| 5 | /token con forceError="expired_token" ritorna 400 | Expired token |
| 6 | /token con tokenDelay simula latenza | Latency |
| 7 | /revoke ritorna 200 | Revoke |
| 8 | Server si spegne correttamente con stop() | Cleanup |

---

## 3. Integration Tests

### 3.1 Pipeline Integration (~15 test)

**File**: `tests/integration/data-connector-pipeline.test.ts`

Test di integrazione dove piu moduli collaborano. Mock solo le dipendenze esterne (fetch, Supabase), lasciando che connector + parser + validator + pipeline interagiscano realmente.

```typescript
// Mock solo fetch e Supabase, lasciando i moduli interni non-mocked
vi.stubGlobal("fetch", mockFetch);

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockAdminClient,
}));

vi.mock("@/lib/legal-corpus", () => ({
  ingestArticles: vi.fn().mockResolvedValue({ inserted: 10, errors: 0 }),
}));
```

| # | Descrizione | Categoria |
|---|-------------|-----------|
| 1 | Pipeline CONNECT: connettore Normattiva risolve via registry + contatta API mockata | End-to-end connect |
| 2 | Pipeline CONNECT + MODEL: model verifica schema su Supabase mockato | Connect+Model |
| 3 | Pipeline CONNECT + MODEL + LOAD: articoli parsati, validati e salvati | Full pipeline |
| 4 | Pipeline con validation errors: articoli invalidi filtrati, validi salvati | Partial success |
| 5 | Pipeline delta: usa getLastSuccessfulSync per determinare data since | Delta flow |
| 6 | Pipeline con connettore EUR-Lex: SPARQL mockato + HTML download + parsing | EurLex pipeline |
| 7 | Pipeline LOAD con dryRun=true: nessun salvataggio, contatori corretti | Dry run |
| 8 | Pipeline con errore nel LOAD: sync log registra "failed" | Load error logging |
| 9 | Pipeline con fonte non registrata: errore chiaro | Unknown source |
| 10 | Pipeline con skipEmbeddings=true: passato allo store | Skip embeddings |
| 11 | Pipeline con limit: solo N articoli passati allo store | Limit |
| 12 | Sync log registra fasi corrette (connect, model, load) | Phase tracking |
| 13 | Pipeline calcola durationMs realistico (> 0) | Timing |
| 14 | Pipeline completa: stoppedAt="load" e loadResult popolato | Result shape |
| 15 | Pipeline con MODEL non ready: suggerisce migration SQL | Migration suggestion |

### 3.2 Sync Log + Database Integration (~8 test)

**File**: `tests/integration/data-connector-sync-log.test.ts`

| # | Descrizione | Categoria |
|---|-------------|-----------|
| 1 | startSync + completeSync: ciclo completo con status "completed" | Lifecycle |
| 2 | startSync + completeSync("failed"): errore loggato con dettagli | Error lifecycle |
| 3 | getSyncHistory ritorna sync in ordine cronologico inverso | History order |
| 4 | getConnectorStatus raggruppa correttamente per source_id | Status aggregation |
| 5 | getLastSuccessfulSync ignora sync fallite | Success filter |
| 6 | Sync multipli per stessa source: history li contiene tutti | Multiple syncs |
| 7 | completeSync con errorDetails: array di errori salvato correttamente | Error details |
| 8 | mapRow gestisce tutti i campi null senza errore | Null safety |

### 3.3 Parser + Validator Integration (~7 test)

**File**: `tests/integration/data-connector-parsers.test.ts`

Test che verificano la catena completa: XML/HTML in input -> parser -> validator -> output validato.

| # | Descrizione | Categoria |
|---|-------------|-----------|
| 1 | AKN XML reale (fixture) parsato e validato: tutti gli articoli validi | AKN+Validator |
| 2 | EUR-Lex HTML reale (fixture) parsato e validato | HTML+Validator |
| 3 | AKN con articoli abrogati: isInForce=false, validazione passa | Abrogated |
| 4 | AKN con HTML entities non decodificate: validazione emette warning | Quality check |
| 5 | EUR-Lex legacy HTML: parsato correttamente dal fallback parser | Legacy format |
| 6 | Articoli con testo troppo corto filtrati dalla validazione | Short text |
| 7 | Batch misto: articoli validi e invalidi contati correttamente | Mixed batch |

### 3.4 API Route Integration (~5 test)

**File**: `tests/integration/data-connector-api.test.ts`

Applicabile se/quando esiste un endpoint API (es. `/api/platform/cron/data-connector`).

| # | Descrizione | Categoria |
|---|-------------|-----------|
| 1 | GET ritorna status di tutti i connettori con ultimo sync | Health check |
| 2 | GET richiede CRON_SECRET (senza -> 500) | Auth |
| 3 | POST trigger pipeline per sourceId specificato | Trigger |
| 4 | POST con sourceId inesistente ritorna errore | Not found |
| 5 | Rate limiting applicato sull'endpoint | Rate limit |

---

## 4. E2E Tests (Playwright)

### 4.1 Premessa

I test E2E per il Data Connector coprono la UI di monitoring su `/ops`. I flussi di setup wizard sono futuri (non ancora implementati). I test usano `page.route()` per intercettare le API e fornire risposte mock.

**File**: `tests/e2e/data-connector.spec.ts`

### 4.2 Test cases (~15 test)

```typescript
import { test, expect } from "@playwright/test";

test.describe("Data Connector Dashboard — /ops", () => {
  test.beforeEach(async ({ page }) => {
    // Mock console auth
    await page.route("**/api/console/tier", (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ tier: "partner", agents: {} }) });
    });

    // Mock connector status API
    await page.route("**/api/company/integration-health", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          connectors: [
            {
              sourceId: "codice_civile",
              lifecycle: "loaded",
              totalArticles: 2969,
              lastSync: { status: "completed", completedAt: "2026-03-10T10:00:00Z", itemsInserted: 2969 },
            },
            {
              sourceId: "gdpr",
              lifecycle: "loaded",
              totalArticles: 99,
              lastSync: { status: "completed", completedAt: "2026-03-09T14:00:00Z", itemsInserted: 99 },
            },
            {
              sourceId: "statuto_lavoratori",
              lifecycle: "loaded",
              totalArticles: 41,
              lastSync: { status: "failed", completedAt: "2026-03-10T08:00:00Z", errors: 1 },
            },
          ],
        }),
      });
    });
  });

  test("pagina /ops mostra pannello connettori con lista fonti", async ({ page }) => {
    await page.goto("/ops");
    await expect(page.getByText("codice_civile")).toBeVisible();
    await expect(page.getByText("gdpr")).toBeVisible();
  });

  test("fonte con errore mostra indicatore di errore", async ({ page }) => {
    await page.goto("/ops");
    const statutoRow = page.locator("text=statuto_lavoratori").locator("..");
    await expect(statutoRow.getByText("failed")).toBeVisible();
  });
});
```

| # | Descrizione | Categoria |
|---|-------------|-----------|
| 1 | Pagina /ops carica e mostra pannello connettori | Navigation |
| 2 | Ogni fonte mostra stato lifecycle (planned/loaded/delta-active) | Status display |
| 3 | Ultimo sync mostra data e status (completed/failed) | Sync history |
| 4 | Click su fonte espande dettagli: articoli caricati, errori, timing | Detail view |
| 5 | Fonte con errore mostra badge/indicatore rosso | Error display |
| 6 | Fonte in sync mostra indicatore "in corso" | Running state |
| 7 | Dashboard summary: totale fonti, totale articoli, errori | Summary panel |
| 8 | Filtro per verticale (legal/hr/medical) funziona | Vertical filter |
| 9 | Filtro per lifecycle (loaded/planned) funziona | Lifecycle filter |
| 10 | Refresh dati aggiorna la lista senza page reload | Data refresh |
| 11 | Pagina accessibile — contrasto, focus order, ARIA labels | Accessibility |
| 12 | Pagina responsiva su viewport mobile (375px) | Responsive |
| 13 | Loading state visibile durante fetch dati (skeleton/spinner) | Loading UX |
| 14 | Errore di rete mostra messaggio user-friendly | Network error |
| 15 | Console auth richiesta — redirect se non autenticato | Auth guard |

---

## 5. Test Data Fixtures

### 5.1 Struttura directory

```
tests/fixtures/data-connector/
├── akn-sample.xml              # AKN XML standard con 3 articoli + gerarchia
├── akn-attachment.xml          # AKN XML formato attachment (Codice Penale style)
├── eurlex-modern.html          # EUR-Lex HTML moderno con eli-subdivision
├── eurlex-legacy.html          # EUR-Lex HTML pre-2010 senza classi CSS
├── normattiva-api.ts           # Factory functions per risposte API Normattiva
├── eurlex-api.ts               # Factory functions per risposte SPARQL/Cellar
├── ncbi-api.ts                 # Factory functions per risposte NCBI E-utilities
├── europepmc-api.ts            # Factory functions per risposte EuropePMC
├── openstax-api.ts             # Factory functions per risposte OpenStax API
├── parsed-articles.ts          # Articoli ParsedArticle validi e invalidi
├── sync-log-entries.ts         # Entry SyncLogEntry in vari stati
└── oauth-tokens.ts             # Token OAuth: valido, scaduto, malformato
```

### 5.2 normattiva-api.ts

Estende i fixture esistenti in `tests/fixtures/normattiva.ts`:

```typescript
// Re-export fixture esistenti
export {
  makeSearchResult, makeEmptySearchResult,
  makeAsyncConfirmState, makeAsyncPollingState,
} from "../normattiva";

/** Risposta GET /tipologiche/estensioni */
export function makeTipologicheResponse() {
  return [
    { label: "AKN", value: "akn" },
    { label: "PDF", value: "pdf" },
    { label: "HTML", value: "html" },
  ];
}

/** Crea un buffer ZIP minimale contenente un file XML AKN */
export function makeMinimalZipBuffer(xmlContent: string): Buffer {
  const AdmZip = require("adm-zip");
  const zip = new AdmZip();
  zip.addFile("005G0232.xml", Buffer.from(xmlContent, "utf-8"));
  return zip.toBuffer();
}

/** Risposta async polling stato=3 (completata) */
export function makeAsyncCompletedState() {
  return { stato: 3, descrizioneStato: "Completata", percentuale: 100 };
}

/** Risposta async polling stato=4 (fallita) */
export function makeAsyncFailedState() {
  return { stato: 4, descrizioneStato: "Errore elaborazione", percentuale: 0 };
}
```

### 5.3 parsed-articles.ts

```typescript
import type { ParsedArticle } from "@/lib/staff/data-connector/types";

export const VALID_ARTICLE: ParsedArticle = {
  articleNumber: "1",
  articleTitle: "Ambito di applicazione",
  articleText: "Il presente decreto legislativo disciplina i diritti dei consumatori e degli utenti nel quadro normativo europeo.",
  hierarchy: { title: "TITOLO I — Disposizioni generali", chapter: "CAPO I — Finalita" },
  sourceUrl: "normattiva:Cod. consumo#art_1",
  isInForce: true,
};

export const ARTICLE_SHORT_TEXT: ParsedArticle = {
  articleNumber: "99",
  articleTitle: null,
  articleText: "Breve.",
  hierarchy: {},
};

export const ARTICLE_WITH_HTML_ENTITIES: ParsedArticle = {
  articleNumber: "2",
  articleTitle: "Definizioni",
  articleText: "L&rsquo;acquirente &egrave; tenuto al pagamento secondo le modalit&agrave; previste.",
  hierarchy: { title: "TITOLO I" },
  isInForce: true,
};

export const ARTICLE_WITH_UI_GARBAGE: ParsedArticle = {
  articleNumber: "3",
  articleTitle: "Norme",
  articleText: "Il consumatore ha diritto alla tutela prevista dalla normativa vigente. articolo successivo nascondi esporta",
  hierarchy: {},
  isInForce: true,
};

export const ARTICLE_ABROGATED: ParsedArticle = {
  articleNumber: "50",
  articleTitle: "Articolo abrogato",
  articleText: "Articolo abrogato dal D.Lgs. 23 del 2015 in materia di contratti a tempo determinato.",
  hierarchy: {},
  isInForce: false,
};

export const ARTICLE_NO_NUMBER: ParsedArticle = {
  articleNumber: "",
  articleTitle: "Senza numero",
  articleText: "Questo articolo non ha un numero valido secondo le convenzioni legislative standard.",
  hierarchy: {},
  isInForce: true,
};

export const BATCH_MIXED: ParsedArticle[] = [
  VALID_ARTICLE,
  ARTICLE_SHORT_TEXT,
  ARTICLE_WITH_HTML_ENTITIES,
  ARTICLE_WITH_UI_GARBAGE,
];
```

### 5.4 sync-log-entries.ts

```typescript
import type { SyncLogEntry } from "@/lib/staff/data-connector/types";

export const SYNC_RUNNING: SyncLogEntry = {
  id: "sync-001",
  sourceId: "codice_civile",
  syncType: "full",
  phase: "connect",
  status: "running",
  startedAt: "2026-03-10T10:00:00Z",
  completedAt: null,
  itemsFetched: 0,
  itemsInserted: 0,
  itemsUpdated: 0,
  itemsSkipped: 0,
  errors: 0,
  errorDetails: [],
  metadata: {},
};

export const SYNC_COMPLETED: SyncLogEntry = {
  ...SYNC_RUNNING,
  id: "sync-002",
  status: "completed",
  completedAt: "2026-03-10T10:05:00Z",
  itemsFetched: 2969,
  itemsInserted: 2969,
};

export const SYNC_FAILED: SyncLogEntry = {
  ...SYNC_RUNNING,
  id: "sync-003",
  status: "failed",
  completedAt: "2026-03-10T10:01:00Z",
  errors: 1,
  errorDetails: [{ item: "connect", error: "HTTP 503 Service Unavailable" }],
};

export const SYNC_LOAD_PARTIAL: SyncLogEntry = {
  ...SYNC_RUNNING,
  id: "sync-004",
  phase: "load",
  status: "completed",
  completedAt: "2026-03-10T10:10:00Z",
  itemsFetched: 100,
  itemsInserted: 95,
  itemsSkipped: 3,
  errors: 2,
  errorDetails: [
    { item: "Art. 42", error: "Testo troppo corto" },
    { item: "Art. 99", error: "Embedding generation failed" },
  ],
};
```

### 5.5 oauth-tokens.ts

```typescript
/** Token OAuth valido (scade tra 1 ora) */
export const VALID_TOKEN = {
  access_token: "mock_valid_token_abc123",
  token_type: "Bearer",
  expires_in: 3600,
  refresh_token: "mock_refresh_token_xyz789",
  scope: "read write",
};

/** Token OAuth scaduto */
export const EXPIRED_TOKEN = {
  access_token: "mock_expired_token_000",
  token_type: "Bearer",
  expires_in: 0,
  refresh_token: "mock_refresh_expired_111",
  scope: "read",
};

/** Token malformato (campi mancanti) */
export const MALFORMED_TOKEN = {
  access_token: "",
  // token_type mancante
  expires_in: -1,
};

/** Error response OAuth */
export const OAUTH_ERROR_INVALID_GRANT = {
  error: "invalid_grant",
  error_description: "The authorization code has expired or has been used.",
};

export const OAUTH_ERROR_EXPIRED = {
  error: "expired_token",
  error_description: "The access token has expired.",
};
```

---

## 6. CI Integration

### 6.1 Posizionamento nella pipeline CI

I test si inseriscono nella pipeline CI esistente (`.github/workflows/ci.yml`) **senza modifiche strutturali**. I nuovi test sono posizionati nelle directory gia incluse dai pattern glob del CI:

- Unit + Integration: `tests/**/*.test.ts` (eseguiti da `npx vitest run`)
- E2E: `tests/e2e/**/*.spec.ts` (eseguiti da `npx playwright test`)

### 6.2 Ordine di esecuzione (invariato)

```
1. Lint        (npx eslint app/ lib/ components/ scripts/)
2. Type check  (npx tsc --noEmit)
3. Tests       (npx vitest run)     <-- include i nuovi unit + integration
4. Build       (npm run build)
5. E2E tests   (npx playwright test) <-- include i nuovi spec
```

Non serve una fase separata: il CI esegue tutti i file matching automaticamente.

### 6.3 Struttura directory test completa

```
tests/
├── unit/
│   ├── data-connector/                         # NUOVO — ~195 test
│   │   ├── base-connector.test.ts              (~20 test)
│   │   ├── normattiva-connector.test.ts        (~25 test)
│   │   ├── eurlex-connector.test.ts            (~20 test)
│   │   ├── statpearls-connector.test.ts        (~12 test)
│   │   ├── europepmc-connector.test.ts         (~12 test)
│   │   ├── openstax-connector.test.ts          (~12 test)
│   │   ├── akn-parser.test.ts                  (~25 test)
│   │   ├── html-parser.test.ts                 (~20 test)
│   │   ├── article-validator.test.ts           (~10 test)
│   │   ├── plugin-registry.test.ts             (~15 test)
│   │   ├── source-registry.test.ts             (~10 test)
│   │   ├── sync-log.test.ts                    (~12 test)
│   │   ├── legal-article-model.test.ts         (~10 test)
│   │   ├── legal-corpus-store.test.ts          (~8 test)
│   │   └── pipeline.test.ts                    (~16 test)
│   ├── advisor.test.ts                          # Esistente
│   ├── agent-runner.test.ts                     # Esistente
│   ├── ... (16 file test esistenti)
│
├── integration/
│   ├── data-connector-pipeline.test.ts          # NUOVO (~15 test)
│   ├── data-connector-sync-log.test.ts          # NUOVO (~8 test)
│   ├── data-connector-parsers.test.ts           # NUOVO (~7 test)
│   ├── data-connector-api.test.ts               # NUOVO (~5 test)
│   ├── analyze-route.test.ts                    # Esistente
│   ├── ... (3 file test esistenti)
│
├── e2e/
│   ├── data-connector.spec.ts                   # NUOVO (~15 test)
│   ├── analysis-flow.spec.ts                    # Esistente
│   ├── ... (6 file spec esistenti)
│
├── fixtures/
│   ├── data-connector/                          # NUOVO — fixture dedicate
│   │   ├── akn-sample.xml
│   │   ├── akn-attachment.xml
│   │   ├── eurlex-modern.html
│   │   ├── eurlex-legacy.html
│   │   ├── normattiva-api.ts
│   │   ├── eurlex-api.ts
│   │   ├── ncbi-api.ts
│   │   ├── europepmc-api.ts
│   │   ├── openstax-api.ts
│   │   ├── parsed-articles.ts
│   │   ├── sync-log-entries.ts
│   │   └── oauth-tokens.ts
│   ├── normattiva.ts                            # Esistente
│   └── ... (9 file fixture esistenti)
│
└── mocks/
    ├── oauth-server.ts                          # NUOVO
    ├── supabase.ts                              # Esistente
    └── ... (mock esistenti)
```

### 6.4 Coverage thresholds

Obiettivi di copertura per `lib/staff/data-connector/`:

| Modulo | Linee | Branch | Funzioni |
|--------|-------|--------|----------|
| `connectors/base.ts` | 90% | 85% | 100% |
| `connectors/normattiva.ts` | 80% | 75% | 90% |
| `connectors/eurlex.ts` | 80% | 75% | 90% |
| `connectors/statpearls.ts` | 80% | 75% | 90% |
| `connectors/europepmc.ts` | 80% | 75% | 90% |
| `connectors/openstax.ts` | 80% | 75% | 90% |
| `parsers/akn-parser.ts` | 90% | 85% | 100% |
| `parsers/html-parser.ts` | 85% | 80% | 95% |
| `validators/article-validator.ts` | 95% | 90% | 100% |
| `plugin-registry.ts` | 90% | 85% | 100% |
| `registry.ts` | 85% | 80% | 100% |
| `sync-log.ts` | 85% | 80% | 100% |
| `models/legal-article-model.ts` | 80% | 75% | 100% |
| `stores/legal-corpus-store.ts` | 85% | 80% | 100% |
| `index.ts` (pipeline) | 85% | 80% | 100% |
| **MEDIA data-connector/** | **85%** | **80%** | **97%** |

### 6.5 Esecuzione parallela

Vitest esegue test in parallelo per default. I test Data Connector sono thread-safe perche:

1. **Unit test**: ogni test mocka le proprie dipendenze via `vi.mock()`, nessuno stato globale condiviso
2. **Integration test**: usano mock Supabase isolati per istanza
3. **Parser test**: CPU-bound puri (nessun I/O, nessun mock globale), beneficiano dal parallelismo
4. **E2E test**: Playwright usa `fullyParallel: false` (config attuale), i test Data Connector sono indipendenti dagli altri spec

### 6.6 Tempi stimati

| Suite | Tempo stimato | Note |
|-------|--------------|------|
| Unit data-connector (~195 test) | ~8s | Tutti mocked, zero I/O reale |
| Integration data-connector (~35 test) | ~4s | Mock Supabase, parser reali |
| E2E data-connector (~15 test) | ~20s | Browser + mock API routes |
| **Totale aggiuntivo** | **~32s** | Compatibile con CI attuale (~2min totale) |

---

## 7. Priorita di implementazione

| Priorita | Moduli | Motivazione | Effort stimato |
|----------|--------|-------------|----------------|
| **P0** | akn-parser, html-parser, article-validator | Cuore del parsing. Bug qui = dati corrotti in DB | 2-3h |
| **P1** | BaseConnector, NormattivaConnector, EurLexConnector | Connettori principali in produzione (~5600 articoli) | 3-4h |
| **P2** | Pipeline orchestrator, plugin-registry, sync-log | Logica di orchestrazione e tracking | 2-3h |
| **P3** | source-registry, legal-article-model, legal-corpus-store | Moduli di supporto, meno logica critica | 2h |
| **P4** | StatPearls, EuropePMC, OpenStax connectors | Connettori medici (verticale secondario) | 2h |
| **P5** | Mock OAuth server, E2E, integration pipeline | Completamento copertura | 2-3h |

**Effort totale stimato**: 13-17 ore di lavoro.

---

## 8. Rischi e mitigazioni

| Rischio | Impatto | Mitigazione |
|---------|---------|-------------|
| Parser test fragili se formato XML/HTML cambia | Test rotti frequenti | Usare fixture con struttura minima, non documenti di produzione completi |
| Mock fetch non copre tutti i casi reali (redirect chain, chunked responses) | Falsa confidenza | Test integration con fixture realistiche di grandi dimensioni |
| AdmZip in test: generare ZIP validi e complesso | Test lenti o fragili | Creare fixture ZIP una volta e riusare, oppure usare `adm-zip` per creare in-test |
| Connettori medici poco testati in produzione | Copertura superficiale | P4, ma almeno smoke test per connect() di ogni connettore |
| Mock OAuth non necessario oggi | Overengineering | Implementare solo quando Integration Office aggiunge connettori OAuth. Piano gia pronto |
| `vitest.setup.ts` cancella API keys | Test con provider reali impossibili | Design corretto: tutti i test devono funzionare offline. Nessun test deve chiamare API reali |

---

## 9. Convenzioni (allineate alla codebase)

Le seguenti convenzioni sono derivate dall'analisi dei 16 file test e 10 fixture esistenti nel progetto:

| Convenzione | Pattern | Fonte |
|-------------|---------|-------|
| **Mock hoisting** | `const mock = vi.hoisted(() => vi.fn())` | `generate.test.ts`, `analyze-route.test.ts` |
| **Mock modules** | `vi.mock("@/lib/module", () => ({ fn: mockFn }))` | Tutti i test unit |
| **Mock fetch** | `vi.stubGlobal("fetch", vi.fn())` | Da applicare per connettori |
| **Mock Supabase** | `makeMockSupabaseClient()` da `tests/mocks/supabase.ts` | `analyze-route.test.ts` |
| **Fixture factories** | `makeXxx(overrides?: Partial<T>)` | `normattiva.ts`, `classification.ts` |
| **Clear mocks** | `beforeEach(() => vi.clearAllMocks())` | Tutti i test |
| **Naming files** | `tests/unit/<module>.test.ts` | Convenzione esistente |
| **No network** | Tutti i test devono funzionare offline | `vitest.setup.ts` cancella API keys |
| **Determinismo** | Nessun `Date.now()` o `Math.random()` senza mock/seed | Convenzione globale |
| **Timeout** | 10s per unit (vitest.config.ts), 30s per E2E (playwright.config.ts) | Config esistente |

---

_Fine del piano. Questo documento e il riferimento per l'implementazione della test suite Data Connector._
