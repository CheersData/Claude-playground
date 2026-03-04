# Report Quality Assurance — 3 marzo 2026

**Leader:** test-runner
**Stack:** Vitest 4 + Playwright 1.58

---

## STATO TEST

| Categoria | Copertura | Stato |
|-----------|-----------|-------|
| Agenti core (classifier, analyzer, investigator, advisor, corpus-agent) | ✅ Coperto | 🟢 |
| Middleware (auth, csrf, sanitize, rate-limit) | ✅ Coperto | 🟢 |
| E2E suite (auth, upload, analysis, console) | ✅ Coperto | 🟢 |
| `lib/ai-sdk/agent-runner.ts` | ❌ 0% | 🔴 P1 |
| `lib/tiers.ts` | ❌ 0% | 🔴 P2 |
| `lib/middleware/console-token.ts` | ❌ 0% | 🟡 P3 |
| `lib/analysis-cache.ts` | ❌ 0% | 🟡 P4 |
| `lib/ai-sdk/generate.ts` | ❌ 0% | 🟡 P5 |
| E2E deep search paywall | ❌ Mancante | 🟡 |

---

## COSA È STATO FATTO (recente)

- ✅ Vitest 4 + Playwright 1.58 configurati
- ✅ Test agenti core e middleware
- ✅ 7 spec E2E base + nuova suite `e2e/`
- ✅ Fix lint errors VideoShowcase.tsx (ref access durante render)
- ✅ Fix TS errors components/ops/ (TagBadge + TaskItem type mismatch)

---

## GAP CRITICI RIMASTI

### P1 — `lib/ai-sdk/agent-runner.ts`
Il cuore del tier system + fallback chain — zero test. Ogni modifica è cieca.

### E2E Deep Search Paywall
3 scenari non coperti:
1. Utente non autenticato → blocco paywall
2. Utente free con limite esaurito → upgrade prompt
3. Utente pro → accesso completo

---

## TASK APERTI OGGI

| # | Task | Priorità | Effort |
|---|------|----------|--------|
| 10 | E2E test deep search paywall (3 scenari) | MEDIUM | ~2h |

---

## CI/CD STATUS

`.github/` presente ma pipeline non completamente configurata. Bloccante risolta (migrations 001-015 rinumerati). Da completare: test automatici su PR, build check, deploy preview.
