# TESTBOOK — controlla.me

Ultimo aggiornamento: 2026-02-22

## Coverage Summary — 5 Moduli Critici

| Modulo | File Test | Stmts | Branch | Funcs | Lines | Stato |
|--------|-----------|-------|--------|-------|-------|-------|
| `lib/agents/orchestrator.ts` | `tests/unit/orchestrator.test.ts` | 93% | 76% | 100% | 93% | ✅ |
| `lib/agents/investigator.ts` | `tests/unit/investigator.test.ts` | 96% | 71% | 100% | 98% | ✅ |
| `lib/agents/analyzer.ts` | `tests/unit/analyzer.test.ts` | 100% | 100% | 100% | 100% | ✅ |
| `lib/extract-text.ts` | `tests/unit/extract-text.test.ts` | 75% | 78% | 100% | 75% | 🟡 |
| `app/api/analyze/route.ts` | `tests/integration/analyze-route.test.ts` | 96% | 83% | 83% | 96% | ✅ |

### Moduli addizionali testati

| Modulo | File Test | Stmts | Lines | Stato |
|--------|-----------|-------|-------|-------|
| `lib/anthropic.ts` | `tests/unit/anthropic.test.ts` | 33% | 33% | 🟡 |

Legenda: ✅ >= 80% lines | 🟡 50-80% | 🔴 < 50% o mancante

## Dettaglio Test (69 test cases)

### tests/unit/anthropic.test.ts (15 tests)
- `parseAgentJSON`: JSON valido, code fences, regex extraction, errori, unicode, whitespace
- `extractTextContent`: blocco singolo, multipli, vuoto, ignora tool_use

### tests/unit/analyzer.test.ts (5 tests)
- Parametri API (MODEL, max_tokens, system prompt)
- Classification + document text nel messaggio
- Parsing AnalysisResult
- Propagazione errori API e JSON

### tests/unit/investigator.test.ts (13 tests)
- `runInvestigator`: early return senza clausole rischiose, filtro clausole, singola iterazione, loop agentico con tool_use, max 5 iterazioni, MODEL_FAST + web_search, parsing risultato, errori API
- `runDeepSearch`: usa MODEL Sonnet, contesto nel messaggio, multi-iterazione, parsing con sources

### tests/unit/orchestrator.test.ts (13 tests)
- Fresh session: crea sessione, 4 agenti, callbacks, cache, risultato completo
- Cache resume: resumeSessionId, findSessionByDocument, skip fasi cachate
- Errori: classifier fatale, analyzer fatale, investigator non-fatale, salvataggio cache dopo errore, advisor fatale

### tests/unit/extract-text.test.ts (11 tests)
- text/plain: UTF-8, estensione fallback
- PDF: v1 API, testo vuoto, estensione .pdf
- DOCX/DOC: mammoth, testo vuoto, .doc legacy
- Immagini: errore OCR (png, jpeg)
- MIME sconosciuto: fallback UTF-8

### tests/integration/analyze-route.test.ts (12 tests)
- Input validation: no file/text, testo < 50 char
- Usage limits: free esaurito, pro ok, auth fallita graceful
- Flusso testo: rawText, timing event, session event
- File upload: extractText con buffer/MIME/filename
- Post-completion: increment_analyses_count
- Headers: Content-Type, Cache-Control
- Errori: orchestrator throws -> SSE error event

## 🔴 Moduli critici senza test (PRIORITA MASSIMA)

1. **`lib/agents/classifier.ts`** — Agente classificatore, primo step della pipeline. Struttura identica ad analyzer.ts, test rapido da scrivere.
2. **`lib/agents/advisor.ts`** — Agente consigliere, produce output finale (fairness score, rischi, azioni). Struttura identica ad analyzer.ts.

## 🟡 Moduli sotto soglia

1. **`lib/extract-text.ts`** (75% lines) — Manca copertura per PDF v2 class API (PDFParse) e modulo non riconoscibile. Il codice v2 non e' raggiungibile con il mock attuale.
2. **`lib/anthropic.ts`** (33% lines) — Solo le pure functions testate (parseAgentJSON, extractTextContent). Il wrapper API con retry/rate-limit non e' testato (richiederebbe mock Anthropic SDK + fake timers).

## Moduli senza test (non critici)

| Modulo | Motivo skip | Priorita |
|--------|-------------|----------|
| `lib/analysis-cache.ts` | I/O filesystem, utile ma non critico | Media |
| `lib/stripe.ts` | Config statica, poco da testare | Bassa |
| `lib/types.ts` | Solo interfacce TypeScript, nessuna logica | Nessuna |
| `lib/prompts/*.ts` | Costanti stringa, validazione output via agenti | Bassa |
| `lib/supabase/*.ts` | Wrapper config Supabase, poco testabile in unit | Bassa |
| `app/api/upload/route.ts` | Endpoint semplice, coperto indirettamente | Media |
| `app/api/deep-search/route.ts` | Usa runDeepSearch gia testato | Media |
| Altre API routes | Auth, Stripe, webhook — richiedono integration test | Bassa |
| Components (17) | React UI, richiede jsdom + testing-library | Bassa |

## Test di integrazione

| Pipeline/Flusso | File Test | Stato |
|-----------------|-----------|-------|
| Analisi documento completa (SSE) | `tests/integration/analyze-route.test.ts` | ✅ |
| Deep search Q&A | — | 🔴 |
| Flusso pagamento Stripe | — | 🔴 |
| OAuth callback | — | 🔴 |

## Test e2e

| Flusso utente | File Test | Stato |
|---------------|-----------|-------|
| Upload -> Analisi -> Risultati | — | 🔴 |
| Login -> Dashboard -> Storico | — | 🔴 |
| Pricing -> Checkout -> Pro | — | 🔴 |

## Infrastruttura test

- **Framework**: Vitest 4.0.18
- **Coverage**: @vitest/coverage-v8
- **Fixtures**: `tests/fixtures/` (6 file factory)
- **Mocks**: `tests/mocks/supabase.ts` + inline vi.mock
- **Comandi**: `npm test` | `npm run test:watch` | `npm run test:coverage`

## Ultimi aggiornamenti

- 2026-02-22 — Setup iniziale: Vitest, 69 test, 6 file test, 7 fixture/mock. Copertura 5 moduli critici.
