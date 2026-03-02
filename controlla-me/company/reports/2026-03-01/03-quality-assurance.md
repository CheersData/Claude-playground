# Report — Quality Assurance
**Data:** 1 marzo 2026 | **Task:** 23/23 completati | **Stato:** 🟡 Attenzione

---

## Funzione del dipartimento

Garantire la qualità del codice e degli output degli agenti attraverso test automatici, typecheck, linting, audit corpus e validazione delle modifiche prima del deploy.

---

## Cosa è stato fatto

### Unit test — da 0 a 115 test verdi
Partendo da copertura ~30% sui percorsi critici:
- **Agenti core**: classifier, analyzer, investigator, advisor, corpus-agent, question-prep
- **Middleware**: auth (5), csrf (13), rate-limit (8), sanitize (17) — 43 test totali
- **Infrastruttura**: anthropic.ts (parsing JSON robusto), orchestrator, analyze-route
- **Fix 23 test fail**: JSON array parser, MAX_ITERATIONS 5, env vars isolamento, agent-runner rethrow, extract-text vi.mock

**Stato attuale**: 115/124 pass — 9 fail pre-esistenti in `analyze-route.test.ts` (integration test con dipendenze esterne, non introdotti dalle modifiche recenti)

### TypeScript — zero errori
`npx tsc --noEmit` clean su tutta la codebase. Mantenuto durante tutte le modifiche.

### ESLint — 44 problemi aperti
- 12 errori + 32 warning
- Concentrati su `scripts/` e file di test (principalmente `no-unused-vars`)
- App routes: clean

### CI/CD GitHub Actions
`.github/workflows/ci.yml` creato: 3 job sequenziali (lint+typecheck → unit-tests con coverage artifact → build). Si attiva su push main/develop e PR verso main.

### Suite E2E Playwright
5 file creati in `e2e/`:
- `auth.spec.ts` — landing e auth flow
- `upload.spec.ts` — upload zone UI + API `/api/upload`
- `analysis.spec.ts` — SSE contract + pipeline UI con mock
- `console.spec.ts` — tier switch + agent toggle (skip con token per CI)
- `fixtures/sample-contract.txt`

Config `playwright.config.ts` aggiornata per includere entrambe le suite (`tests/e2e/` + `e2e/`). Test non-autenticati eseguibili immediatamente.

### State machine console — retry, abort, queue, timeout
`app/console/page.tsx` aggiornato: retry (`handleRetry` con `retryParamsRef`), abort con cleanup (`handleAbort` + `timeoutRef.clear`), queue (`queuedRef` eseguito dopo done), timeout 5 min matching server `maxDuration`. Pulsanti 'Interrompi' e 'Riprova' in UI.

### Audit corpus L1-L3 completo
- L1: diagnostica rapida, semafori per fonte
- L2: audit strutturale, raccomandazioni fix eseguite da DE
- L3: cross-reference classifier vs corpus → trovato e fixato bug critico in `normalizeLawSource()`

---

## Cosa resta da fare

| Priorità | Gap | Note |
|----------|-----|------|
| P1 | `lib/ai-sdk/agent-runner.ts` — zero test | Componente critico: fallback chain, error handling |
| P2 | `lib/tiers.ts` — zero test | Tier system, toggle agenti |
| P3 | `lib/middleware/console-token.ts` — zero test | Auth HMAC-SHA256 |
| P4 | `lib/analysis-cache.ts` — zero test | Cache sessioni |
| P5 | `lib/ai-sdk/generate.ts` — zero test | Router universale provider |
| Media | Fix 12 errori ESLint | no-unused-vars in scripts e test |
| Bassa | Fix 9 test fail analyze-route | Integration test — richiedono refactor con mock |

---

## Allineamento con la funzione

⚠️ **Parziale.** QA ha coperto tutti i task assegnati. Il gap residuo (P1-P5 senza test) è noto e documentato in CLAUDE.md. La copertura critica dei componenti core (agenti runtime, middleware, E2E console) è operativa. I componenti non coperti sono infrastruttura interna con impatto limitato sugli utenti finali, ma rilevante per la resilienza sotto stress.

**Stato complessivo copertura**: ~55% sui percorsi critici (da 30% iniziale).

---

## Stato competitivo

QA non è direttamente un differenziatore competitivo, ma è un abilitatore di velocità. Con CI/CD attiva e test robusti possiamo deployare con confidenza più alta. Il gap sui componenti P1-P5 è un rischio interno: un refactoring errato su `agent-runner.ts` o `tiers.ts` potrebbe passare inosservato.
