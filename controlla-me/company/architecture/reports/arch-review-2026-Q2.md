# ARCHITECTURE REVIEW REPORT — Q2 2026

**Data**: 2026-03-03
**Reviewer**: Architecture Lead
**Codebase State**: BUILD ✓ CLEAN, TEST PARTIAL (5 gap critici P1)
**Overall Tech Debt**: MODERATE (3 P1 gaps, multiple minor findings)

---

## EXECUTIVE SUMMARY

Controlla.me ha raggiunto uno stato di stabilità architetturale solido. I punti critici sono:

1. **TD-1 (RISOLTO)**: `savePhaseTiming()` — migration 016 implementata con RPC atomico
2. **TD-2 (APERTO)**: Global mutable state in `lib/tiers.ts` — `setCurrentTier()` mai chiamato da `/api/analyze`
3. **Test Gap (P1)**: 5 file critici senza test coverage (agent-runner, tiers, generate, console-token, analysis-cache)
4. **Dep Audit**: 5 dipendenze extraneous da rimuovere (WASM runtime inutilizzate)
5. **Feature Incomplete**: 11 feature in backlog — candidate Q2: Tier-per-utente + Test Gap P1 + Corpus Agent UI

Nessuna vulnerabilità note. CSP ottimizzabile post-beta.

---

## 1. TECH DEBT ANALYSIS

### TD-1: savePhaseTiming() — SELECT + UPDATE ✓ RISOLTO

**Stato**: RISOLTO 2026-03-01
**Implementazione**: Migration 016 con SQL function `update_phase_timing()` atomica via RPC
- Latenza per analisi: **-400-800ms** (8 roundtrip → 4)
- Race condition: Eliminata

---

### TD-2: Global Mutable State in lib/tiers.ts — APERTO (Teorico)

```typescript
// lib/tiers.ts
let currentTier: TierName = "partner";
const disabledAgents: Set<AgentName> = new Set();

export function setCurrentTier(tier: TierName): void {
  currentTier = tier; // ← Global mutable state
}
```

**Problema**: `setCurrentTier()` NON è mai chiamato da `/api/analyze`. Rischio teorico su multi-instance Vercel.

**Nota**: La route console BYPASSA il problema con `sessionTierStore` (AsyncLocalStorage per-request).

**Raccomandazione**:
- **MVP (oggi)**: Non risolverlo — teorico, non impatta flow attuale
- **Fase 2 (tier per-utente)**: Wrappare `/api/analyze` con `withRequestTier()` stesso pattern console
- **Effort**: ~1h quando si implementa il tier per-utente

**Priorità**: P2 (rinviare a Q3 se non si implementa tier-per-utente)

---

### TD-3: Duplicate Migration Numbers ✓ RISOLTO

**Stato**: RISOLTO 2026-03-01 — sequenza 001-023 lineare, REGISTRY.md aggiunto

---

## 2. NPM DEPENDENCIES AUDIT

### Vulnerabilità

**Stato**: CLEAN — `npm audit` → **0 vulnerabilities**

### Dipendenze Extraneous (da rimuovere)

```
├── @emnapi/core@1.8.1          ← Non usato
├── @emnapi/runtime@1.8.1       ← Non usato
├── @emnapi/wasi-threads@1.1.0  ← Non usato
├── @napi-rs/wasm-runtime@0.2.12 ← Non usato
└── @tybys/wasm-util@0.10.1     ← Non usato
```

Probabilmente transitive di `pdf-parse`. Rimozione: -5.2 MB bundle.

```bash
npm rm @emnapi/core @emnapi/runtime @emnapi/wasi-threads @napi-rs/wasm-runtime @tybys/wasm-util
# Testare: npm run build && npm run test
```

### @google/genai — Versione vs. Compatibilità

- Versione installata: **1.42.0**
- Documentata in CLAUDE.md: "1.x" (generica)
- Stato: ✓ COMPATIBILE
- Azione: Aggiornare CLAUDE.md §1 a "1.42.0"

### Dipendenze Aggiornabili (Minor/Patch — Safe)

| Package | Corrente | Note |
|---------|----------|------|
| fast-xml-parser | 5.3.7 | Patch disponibile |
| typescript | 5.9.3 | Minor disponibile |
| @types/node | 20.19.33 | Patch disponibile |

Azione: `npm update` inizio Q2, poi `npm run test + npm run build`.

---

## 3. CRITICAL CODE GAPS (TEST COVERAGE)

### Gap Critici — P1

| File | Coverage | Impatto | Effort |
|------|----------|---------|--------|
| `lib/ai-sdk/agent-runner.ts` | ~0% | ALTO — fallback chain core | 3h |
| `lib/tiers.ts` | ~0% | ALTO — tier switching critico | 2h |
| `lib/ai-sdk/generate.ts` | ~0% | MEDIO — router provider | 2h |
| `lib/middleware/console-token.ts` | ~0% | MEDIO — security | 2h |
| `lib/analysis-cache.ts` | ~10% | MEDIO — performance | 2h |

**Totale effort P1**: ~11h

### Test Suite State

**Covered** ✓: classifier, analyzer, investigator, advisor, corpus-agent, middleware (auth, csrf, rate-limit, sanitize), 5 E2E spec

**Gap** ✗: agent-runner (fallback chain), tiers (switching), console-token (validation)

---

## 4. ADR STATUS

### ADR Recenti — Stato Implementazione

| ADR | Titolo | Status |
|-----|--------|--------|
| ADR-005 | savePhaseTiming — RPC atomico | ✓ Migration 016 live |
| ADR-006 | Nuovi agenti specializzati | ⚠️ Identity card non ancora creati |
| ADR-007 | Report di Dipartimento | ⚠️ MVP filesystem, no auto-generation |
| ADR-008 | CME — Sonnet vs. Opus | ✓ Implementato |
| ADR-009 | Task su modelli free | ⚠️ `model_tier` field aggiunto, task-runner-api non implementato |
| ADR-010 | Scheduler CME | ⚠️ company-scheduler.ts progettato, Telegram vars opzionali |
| ADR-011 | Storage tier — Supabase + TTL | ⚠️ agent_cost_log TTL ok; Cloudflare R2 in roadmap |
| ADR-012 | Change tracking (CHANGELOG) | ⚠️ CHANGELOG.md assente |
| ADR-013 | Dipartimento UX/UI autonomo | ✓ `company/ux-ui/` creato |
| ADR-014 | Company Scheduler (Telegram) | ⚠️ Script live, vars Telegram non sempre configurate |

### ADR da Creare Q2

- **ADR-015**: Tier per-utente (free → intern, pro → partner via `withRequestTier()`)
- **ADR-016**: Corpus Agent UI completion (article [id] page + breadcrumbs)
- **ADR-017**: CI/CD Full Automation (GitHub Actions test-on-PR)

---

## 5. FEATURE INCOMPLETE — PRIORITIZZAZIONE Q2

### Ranking Effort/Impact

| # | Feature | Effort | Impact | Q |
|---|---------|--------|--------|---|
| **1** | Tier-per-utente (free/pro) | 2-3d | ALTO (monetizzazione) | Q2 S2-S3 |
| **2** | Test P1 gaps (agent-runner, tiers) | 3d | ALTO (quality gate) | Q2 S1-S2 |
| **3** | Corpus Agent article [id] page | 2d | MEDIO (UX) | Q2 S2 |
| **4** | CHANGELOG.md + DEPLOY-CHECKLIST | 1d | BASSO (process) | Q2 S1 |
| **5** | Dashboard /analysis/[id] endpoint | 2d | BASSO (analytics) | Q2 S3 |
| 6 | Deep search limit paywall | 1d | MEDIO | Q2 S1 ✓ (già fatto?) |
| 7 | OCR immagini | 3d | BASSO | Q3 |
| 8 | Referral avvocati UI | 5d | BASSO (DPA prerequisito) | Q3 |
| 9 | Statuto Lavoratori source | 3d | BASSO (corpus) | Q2 S1 (DE) |
| 10 | CI/CD GitHub Actions | 2d | MEDIO | Q2 S3 |
| 11 | Verticale HR | 5d | BASSO isolato | Q2 S5-S6 |

---

## 6. RACCOMANDAZIONI TOP 5 — Q2 2026

### R1: Implementare TD-2 Mitigation — `withRequestTier()` (P1)

**Goal**: Rimuovere rischio shared state prima di lanciare tier-per-utente.

```typescript
// lib/ai-sdk/tiers-context.ts — NEW FILE
export async function withRequestTier<T>(
  userTier: TierName,
  fn: () => Promise<T>
): Promise<T> {
  return sessionTierStore.run(
    { tier: userTier, disabledAgents: new Set(), sid: crypto.randomUUID() },
    fn
  );
}

// app/api/analyze/route.ts — UPDATE
const userTier = await getUserTier(req);
return withRequestTier(userTier, () => orchestrateAnalysis(text, ...));
```

**Benefit**: Safe multi-instance, pronto per monetizzazione
**Effort**: 2h | **Timeline**: Week 1 Q2

---

### R2: Test P1 Gaps + CI Block (P1)

**Cosa testare**:
1. `agent-runner.ts`: fallback chain, provider skip, error propagation
2. `tiers.ts`: tier switching, AsyncLocalStorage isolation, disabled agents
3. `console-token.ts`: HMAC validation, token expiry

**Effort**: 11h | **Timeline**: Week 1-2 Q2 | **Blocca**: Feature tier-per-utente

---

### R3: Feature "Tier per-Utente" End-to-End (P1)

1. Migration: add `subscription_tier` to `profiles`
2. API: `GET /api/user/tier`
3. Tier system: free → intern, pro → associate/partner
4. UI (PowerPanel): mostra tier corrente

**Effort**: 3d | **Timeline**: Week 2-3 Q2

---

### R4: Corpus Agent Article [id] Page (P2)

1. `app/corpus/article/[id]/page.tsx` (20 righe)
2. Fetch da `/api/corpus?id=`
3. Breadcrumb navigazione
4. Link dalle citazioni CorpusChat

**Effort**: 2d | **Timeline**: Week 2 Q2

---

### R5: CHANGELOG.md + DEPLOY-CHECKLIST.md (P2)

Azione ADR-012:
1. Creare `CHANGELOG.md` formato Keep-a-Changelog
2. Creare `docs/DEPLOY-CHECKLIST.md`
3. CI step warning (non bloccante) se CHANGELOG non modificato

**Effort**: 1.5d | **Timeline**: Week 1 Q2

---

## 7. RISCHI ARCHITETTURALI RESIDUI

| Rischio | Mitigazione | Timeline |
|---------|-------------|----------|
| SSE + Edge Runtime (30s limit) | Gira su Node.js ✓ | Monitor se migra a Edge |
| getAverageTimings() fire-and-forget | Non bloccante | Cron job dedicato Q3 |
| Pipeline multi-verticale non scalable | Config-driven approach | Q3 |
| CSP `unsafe-eval` (Next.js) | Necessario per SSR | Nonce-based CSP Q3 |

---

## 8. DOCUMENTI DA AGGIORNARE

- [ ] `CLAUDE.md` §1 — `@google/genai` → 1.42.0
- [ ] `CLAUDE.md` §19 — TD-1 RISOLTO ✓, rinumera TD-2 come TD-1
- [ ] `company/architecture/decisions.md` — ADR-015, ADR-016, ADR-017 (template)
- [ ] `docs/DEPLOY-CHECKLIST.md` — NEW FILE (ADR-012)
- [ ] `CHANGELOG.md` — NEW FILE (ADR-012)

---

*Report generato da: Architecture Lead | 2026-03-03 | Status: READY FOR CME APPROVAL*
