# Report Architecture — 3 marzo 2026

**Leader:** architect
**Stack:** Next.js 16 / TypeScript / Supabase

---

## STATO CORRENTE

| Metrica | Stato |
|---------|-------|
| Build produzione | 🔴 FALLISCE — useContext regressione |
| Deploy Vercel | 🔴 BLOCCATO |
| Tech Debt attivi | 1 (TD-2 tier global state — teorico) |
| ADR attive | schema DB contract monitoring (D-04) |

---

## COSA È STATO FATTO (ultimi 7 giorni)

- ✅ Migration 023: tags, beneficio, outcome, seq_num
- ✅ CLI company-tasks: `--tags`, `--benefit`, `--benefit-status`, risoluzione `#N`
- ✅ Scheduler PowerShell wrapper + task auto-claim ogni 5 min
- ✅ Sistema commit progressivi + merge strategy (per sessioni multi-step)

---

## BUG CRITICO — useContext regressione

**Pagine affette:** `/console`, `/_global-error`
**Errore:** `useContext` chiamato fuori da un React tree valido — null context
**Causa probabile:** Import condizionale o wrapping mancante del Provider

**Task aperto:** Fix useContext regressione — ~30 minuti, bloccante per deploy.

---

## TECH DEBT

| ID | File | Problema | Urgenza |
|----|------|---------|---------|
| TD-2 | `lib/tiers.ts` | `let currentTier` global mutable state — teorico, nessun caller attuale | Bassa |

TD-1 (cache race condition) risolto con RPC atomica — migration 016.
TD-3 (migrations duplicate) risolto con renumerazione 001-015.

---

## TASK APERTI OGGI

| # | Task | Priorità | Effort |
|---|------|----------|--------|
| 4 | Fix useContext regressione /console + /_global-error | HIGH | ~30m |

---

## NOTE ARCHITETTURALI

- Pipeline multi-verticale: approccio `app/[verticale]/page.tsx` non scala oltre 3 verticali — serve config-driven system quando si aprono nuovi verticali (da pianificare in Q2)
- SSE + Edge Runtime: attualmente su Node.js (OK). Se si migra a Vercel Edge, maxDuration=300 non funziona (limite 30s)
- `getAverageTimings()` fire-and-forget: in alta concorrenza genera RPC Supabase parallele inutili — candidato per cron job
