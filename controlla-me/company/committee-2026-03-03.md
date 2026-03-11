# Comitato Generale — Piano di Lavoro
**Data:** martedì 3 marzo 2026
**Convocato da:** CME (CEO virtuale)
**Classificazione:** INTERNO — MANAGEMENT + BOARD
**Contesto:** Valutazione indipendente ricevuta il 2026-03-03 — score medio 6.5/10

---

## Executive Summary

La valutazione esterna conferma che Controlla.me è al **60-65% di un prodotto commercializzabile**. Il codice è professionale e l'architettura è differenziante. Il rischio reale non è tecnico — è di **governance**: decisioni critiche bloccate (DPA, EU AI Act, OKR) e 5 tech debt aperti da settimane.

**Vantaggio temporale sul mercato IT: 9-15 mesi.** La finestra si chiude.

---

## Score per Area (valutazione esterna)

| Area | Voto | Delta vs target |
|------|------|----------------|
| Architettura | 8/10 | +0 (ottimo) |
| Strategy | 8/10 | +0 (ottimo) |
| Marketing | 7/10 | -1 (0 pubblicato) |
| Codebase legale | 7/10 | -1 (console 30%) |
| Corpus dati | 7/10 | -1 (Statuto mancante) |
| Operations | 7/10 | -1 (trading cieco) |
| Security | 6/10 | -2 (DPA + EU AI Act) |
| Trading | 6/10 | -2 (0 tracciabilità) |
| QA | 5/10 | -3 (55% coverage, 9 fail) |
| **Governance** | **4/10** | **-5 (decisioni bloccate)** |
| **Media** | **6.5/10** | |

---

## Minacce per urgenza

| # | Minaccia | Deadline | Impatto |
|---|---------|---------|--------|
| 🔴 1 | **EU AI Act** | agosto 2026 (4.5 mesi) | €15M o 3% fatturato |
| 🔴 2 | **DPA provider AI** | ora (violazione in corso) | GDPR + blocca lancio PMI |
| 🟠 3 | Lexroom funding €16M | 12-18 mesi | erosione mercato |
| 🟡 4 | Big Tech entry | 6-12 mesi | commoditization |
| 🟡 5 | Tech debt produzione | ora | blocca scalabilità |

---

## Piano di Lavoro — 8 settimane

### FASE 0 — Questa settimana (immediato, max 3 giorni)

Azioni che richiedono 1 telefonata o 1 comando. Nessuna scusa.

| # | Azione | Owner | Effort | Sblocca |
|---|--------|-------|--------|---------|
| **A1** | Ingaggiare consulente EU AI Act specializzato | Boss | 1 telefonata | Compliance agosto 2026 |
| **A2** | Inviare DPA a Anthropic (disponibile sul sito) | Boss | 30 min | GDPR compliance |
| **A3** | Caricare Statuto dei Lavoratori (L. 300/1970) | Data Engineering | 1 comando | Verticale HR |
| **A4** | Committare backtest results + paper trading logs | Trading | 30 min | Tracciabilità trading |
| **A5** | Inviare DPA a Google (Gemini) e Mistral | Boss | 30 min | GDPR compliance |

**Nota su A3:** La pipeline data connector esiste. Il problema era ZIP vuoti da Normattiva async.
Approcci alternativi: HTML scraping Normattiva web, o testo consolidato EUR-Lex.
Assegnato a Data Engineering con priorità critica.

---

### FASE 1 — Settimane 1-2 (Tech Debt Critici)

| TD | Problema | Impatto | Owner | Effort |
|----|---------|--------|-------|--------|
| **TD-1** | Cache su filesystem → Supabase | Multi-istanza Vercel rotta | Architecture | 1-2 gg |
| **TD-2** | Rate limiting in-memory → Upstash Redis | DoS gratuito, bypassabile | Security + Architecture | 0.5 gg |
| **TD-3** | Dashboard mock data → query reali | 0 conversione free→pro | Operations + UX/UI | 1 gg |
| **TD-5** | Investigator non loggato in cost dashboard | Costi API sottostimati | Operations | 0.5 gg |

**TD-4 (Statuto Lavoratori) = A3 di Fase 0.**

**Sequenza obbligatoria:** TD-2 → TD-1 → TD-3 (TD-2 è prerequisito per produzione sicura).

---

### FASE 2 — Settimane 3-4 (QA + Qualità)

| Problema | Owner | Effort |
|---------|-------|--------|
| 9 test fail pre-esistenti | QA | 1 gg |
| 12 errori ESLint | QA | 0.5 gg |
| 5 componenti critici senza test (agent-runner, tiers, generate, analysis-cache, console-token) | QA | 2 gg |
| Copertura da 55% → 80% target | QA | 2 gg |

---

### FASE 3 — Settimane 5-8 (Console + Go-to-Market)

#### Console (30% → 80%)
| Feature | Owner | Effort |
|---------|-------|--------|
| State machine completa (sessioni persistenti su refresh) | Architecture + UX/UI | 3 gg |
| Rate limit per utente (previene abuso console) | Security | 1 gg |
| WCAG 2.1 AA compliance | UX/UI | 2 gg |
| UI scoring multidimensionale (backend pronto, solo frontend) | UX/UI | 0.5 gg |

#### Go-to-Market
| Azione | Owner | Effort |
|--------|-------|--------|
| Pubblicare 1 contenuto/settimana (già pronti) | Marketing | ongoing |
| OKR Q1 2026 finalizzati e pubblicati | Strategy + Boss | 1 gg |
| Preparazione materiali per prime PMI | Marketing + Ufficio Legale | 1 gg |

---

## Posizione Competitiva

**Siamo leader unici nel segmento consumer B2C legale IT.** Nessun competitor ha:
- Tier switch real-time + toggle agenti
- Auto-improvement via RAG (il sistema migliora ad ogni analisi)
- Corpus legislativo IT/EU specializzato (6.110 articoli + embeddings voyage-law-2)
- Prospettiva parte debole (differenziante etico)

**Il reframe "console come piattaforma madre" è corretto:**
- TAM solo LegalTech: $5B
- TAM con console multi-verticale: $93B

**La minaccia più immediata non è Lexroom (12-18 mesi). È l'EU AI Act (4.5 mesi).**

---

## Decisioni Richieste al Boss (Level 3 — Governance)

Queste decisioni NON possono essere delegate a CME o ai dipartimenti:

| # | Decisione | Urgenza | Note |
|---|----------|---------|------|
| **D1** | Ingaggiare consulente EU AI Act | 🔴 Critica | Entro questa settimana |
| **D2** | Firmare DPA Anthropic + Google + Mistral | 🔴 Critica | Violazione GDPR in corso |
| **D3** | Approvare OKR Q1 2026 | 🟠 Alta | Sblocca marketing e strategy |
| **D4** | Definire timing go-live trading | 🟡 Media | Dipende da Sharpe > 1.0 + 30gg paper |
| **D5** | Scegliere verticale HR come priorità post-Statuto | 🟡 Media | Pipeline pronta, effort basso |

---

## KPI di Monitoraggio

| KPI | Valore attuale | Target 8 settimane |
|-----|---------------|---------------------|
| Score complessivo | 6.5/10 | 8.0/10 |
| Tech debt aperti | 5 | 0 |
| Test coverage | 55% | 80% |
| Test fail aperti | 9 | 0 |
| ESLint errors | 12 | 0 |
| Console completeness | 30% | 80% |
| DPA firmati | 0/3 | 3/3 |
| EU AI Act compliance | 0% | assessment completato |
| Statuto Lavoratori | ❌ assente | ✅ caricato |
| Backtest versionati | ❌ 0 | ✅ nel repo |
| Sharpe ratio trading | 0.975 | ≥ 1.0 (go-live gate) |

---

## Assegnazioni per Dipartimento

| Dipartimento | Fase 0 | Fase 1 | Fase 2 | Fase 3 |
|-------------|--------|--------|--------|--------|
| **Boss** | D1, D2, D3 | — | — | D4, D5 |
| **Architecture** | — | TD-1 | — | Console state machine |
| **Security** | — | TD-2 | — | Console rate limit |
| **Data Engineering** | A3 (Statuto) | — | — | Pipeline HR |
| **QA** | — | — | 9 fail + ESLint + coverage | — |
| **Operations** | A4 (backtest) | TD-3, TD-5 | — | Monitoring trading |
| **UX/UI** | — | TD-3 (UI) | — | WCAG + scoring UI |
| **Marketing** | — | — | — | Contenuti + PMI |
| **Strategy** | — | — | — | OKR Q1 |
| **Ufficio Legale** | — | — | — | Materiali PMI |
| **Trading** | A4 | — | — | Backtest → paper → go-live |

---

## Note Operative

1. **EU AI Act non è un problema tecnico.** È un problema legale che richiede un consulente. Il codice può aspettare; agosto 2026 no.

2. **DPA non è un task per CME.** È un contratto tra l'azienda e i provider AI. Il boss deve firmarlo. I template sono disponibili sui siti di Anthropic, Google e Mistral.

3. **Il Statuto dei Lavoratori sblocca il verticale HR** — D.Lgs. 81/2008 (sicurezza lavoro) è già nella pipeline. Senza Statuto, l'analisi dei contratti di lavoro può hallucinarsi la normativa di base.

4. **Il trading è su un singolo PC.** Se si rompe, tutto si ferma. Considerare: backup API keys su password manager, configurazione documentata, eventuale migrazione a server dedicato dopo go-live.

5. **"Il prodotto è ciò che arriva all'utente."** Console al 30% significa che l'utente vede il 30% del valore reale del prodotto. Le 8 settimane di Fase 3 sono critiche per il go-to-market.

---

_Documento generato il 2026-03-03 da CME._
_Prossima revisione: 2026-03-10 (weekly standup)._
