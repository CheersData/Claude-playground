# Report — Architecture
**Data:** 1 marzo 2026 | **Task:** 30/30 completati | **Stato:** 🟢 Operativo

---

## Funzione del dipartimento

Progettare e implementare le soluzioni tecniche scalabili. Gestire le decisioni architetturali, il tech debt, le dipendenze, i sistemi di automazione interna (daily controls, task system) e garantire che l'infrastruttura regga la crescita.

---

## Cosa è stato fatto

### Retrieval improvement — P1 + P2

**P1 — Re-ranking times_seen + fallback testuale:**
- `searchLegalKnowledge`: re-ranking con formula `similarity*0.8 + log10(times_seen+1)*0.2` (cap 0.25). Articoli visti più spesso salgono in classifica.
- `searchArticles`: fallback testuale quando i risultati semantici sono < 3 (merge con `searchArticlesText`, dedup per `articleReference`)
- TypeScript strict: 0 errori. QA: PASS con riserva.

**P2 — Investigator self-retrieval:**
- `selfRetrieveForClauses()` in `lib/agents/investigator.ts`: query parallele a `searchLegalKnowledge` + `searchArticles` per ogni clausola critical/high (max 3, soglie 0.60/0.55)
- Risultati iniettati nel prompt prima del web search loop
- Effetto stimato: +30% coverage clausole critiche, -25% latenza web search (meno query necessarie)

### Console mobile responsive
Tutti i componenti console adattati per smartphone: `ConsoleHeader` (padding/font/gap responsive, pulsanti nascosti su sm), `ConsoleInput` (max-w responsive), `app/console/page.tsx` (padding responsive), `PowerPanel` (overlay width), `CorpusTreePanel` (scroll-snap carousel su mobile con `w-[calc(100vw-2px)] md:w-[220px] snap-start`).

### Poimandres routing
`next.config.ts` aggiornato con routing host-based: `poimandres.work/` → `/console` (beforeFiles rewrite). Per attivare: deploy Vercel + DNS CNAME → `cname.vercel-dns.com`. Console già mobile-responsive.

### Sistema idle-trigger + daily controls automatici
- `scripts/daily-controls.ts`: 5 task ricorrenti giornalieri per QA/OPS/SEC/FIN/DE con tag `[CTRL-YYYY-MM-DD]`, idempotenti
- Idle trigger: se open+inprogress < 5 → crea task pianificazione per 6 dipartimenti con tag `[IDLE-YYYY-MM-DD]`
- `daily-standup.ts` chiama `ensureDailyControls()` + `checkIdleAndPlan()` ad ogni esecuzione

### Auto-start task con --assign flag
Flag `--assign` su `company-tasks.ts create`. Il task nasce `in_progress` con `assigned_to` e `started_at` popolati. Elimina il claim manuale.

### TaskModal con azioni
Overlay con dettaglio completo (status, priority, description, result, ID). Bottoni: Claim / Mark Done / Reopen / Block / Cambia Stato. `onUpdate` callback propagato a `ops/page.tsx` e `TaskBoardFullscreen.tsx`.

### Fix CompanyPanel — dipartimenti non cliccabili
Security, Marketing, Strategy aggiunti a `TargetKey` e `TARGETS` nel frontend (`CompanyPanel.tsx`) e nel backend (`api/console/company/route.ts`).

### Fix bug messaggi duplicati nella console
Root cause: `sendFollowUp` aggiungeva il messaggio utente, poi i fallback API chiamavano `startSession(text, false)` aggiungendolo di nuovo. Fix: `startSession(text, true)` nei due fallback path.

### Assessment prodotto e tech debt critico
Identificati i 5 tech debt bloccanti (T-01..T-05) documentati nel `state-of-company-2026-03-01.md`. Decisioni architetturali da prendere: D-01 (schema DB contract monitoring), D-02 (CCNL connector), D-03 (provider lock PMI).

---

## Tech Debt aperto

| ID | Problema | Impatto | Effort |
|----|---------|---------|--------|
| TD-1 | Cache filesystem → multi-istanza rotta | Ripresa sessione KO, costi doppi | 1-2 giorni |
| TD-2 | Tier in-memory globale | Reset a ogni cold start | Basso — dopo TD-1 |
| TD-3 | ~~Migration duplicate~~ | Risolto 2026-03-01 | — |

**Dipendenze outdated (sicure da aggiornare):** `@anthropic-ai/sdk 0.78`, `@google/genai 1.43`, `supabase 2.98`, `stripe 20.4`, `framer-motion 12.34.3`. Major da valutare con breaking changes: `eslint 10.x`, `@types/node 25.x`.

---

## Cosa resta da fare

| Priorità | Task | Note |
|----------|------|------|
| Critica | Migrare cache da filesystem a Supabase (TD-1) | Blocca PMF e costi API corretti |
| Alta | Rate limiting su Redis/Vercel KV (TD-2) | Bypassabile in produzione |
| Alta | Schema DB contract monitoring (D-01) | Decidere prima di traction |
| Media | Update dipendenze patch/minor | Sprint separato |
| Media | Connector CCNL per verticale HR | Analisi fonti CNEL necessaria |
| Bassa | Estrazione Poimandres come progetto standalone | Rinviata a Q2 2026 |

---

## Allineamento con la funzione

✅ **Pieno.** Architecture ha gestito sia le feature (retrieval, responsive, routing) sia l'infrastruttura interna (task system, daily controls). Il rapporto feature/tech-debt è bilanciato. La parametrizzazione della pipeline è esattamente il tipo di investimento che rende scalabile la piattaforma madre.

---

## Stato competitivo

L'architettura multi-provider con N-fallback è il differenziatore tecnico più immediato. Nessun framework multi-agente consumer ha: tier switch real-time UI + N-fallback automatico + cost optimization built-in. LangGraph, CrewAI, AutoGen sono dev tools senza UI operatore. Il gap è di categoria, non di feature.
