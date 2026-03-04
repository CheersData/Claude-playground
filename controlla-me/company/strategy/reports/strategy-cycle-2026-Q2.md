# Strategy Planning Session — Q2 2026 Roadmap
## Controlla.me Strategic Planning Report

**Data:** 2026-03-03
**Prodotto da:** Strategy Lead (Agent)
**Base documentale:** CLAUDE.md §17-19, Q1 Review definitivo, department.md, runbooks, Quarterly Review Q1
**Stato:** Ready for CME Approval (D-05)

---

## EXECUTIVE SUMMARY

Q1 2026 ha stabilito le fondamenta di controlla.me: 7 agenti AI, 6 provider, corpus legislativo 6110 articoli, infrastruttura security VERDE. Q2 deve completare il prodotto per il lancio commerciale reale.

**North Star:** Convertire la piattaforma di orchestrazione multi-agente ($93B TAM) in un prodotto con traction consumer (validazione interna) + early B2B revenue stream (validazione esterna).

**Priorità S1-S7 Q2:**
- S1: Completare test coverage percorsi critici (P1: agent-runner.ts)
- S2: Lanciare verticale HR con corpus legislativo completato
- S3: Firmare DPA provider AI (prerequisito commerciale)
- S4: Deploy produzione con utenti reali
- S5: Validare Poimandres come opportunità strategica
- S6: Chiudere tech debt critico
- S7: Completare UI/UX monetizzazione (deep search limit enforcement)

---

## 1. OPPORTUNITY SCOUTING — TOP 3 OPPORTUNITÀ

### Opportunità 1: Verticale HR / Diritto del Lavoro ⭐ GO IMMEDIATO

**Dimensioni di business:**
- TAM: 180M euro (mercato IT). HR manager stimati 120.000+
- Market Signal: 2.300/mese "contratto di lavoro illegale", 1.800/mese "diritti lavoratori contratto"
- Competitive Gap: Nessun player LegalTech IT con corpus diritto del lavoro EU + AI consumer-first

**Stato tecnico:**
- Pipeline parametrizzata: PRONTA
- Fonti configurate: D.Lgs. 81/2008, D.Lgs. 276/2003, D.Lgs. 23/2015 in `hr-sources.ts`
- Statuto dei Lavoratori (L. 300/1970): 1 comando load (24h attesa API)
- Prompt HR Agent: da scrivere (UL, 3 giorni effort)

**Dipendenze critiche:**
1. Load Statuto Lavoratori — DE, 0.1w (S1 Q2)
2. Load D.Lgs. 81/2008 — DE, 0.5w (S1-S2 Q2)
3. AI pass istituti giuridici HR-specific — DE+UL, 1w (S2-S3 Q2)
4. Prompt HR Agent — UL, 3 giorni (S2 Q2)
5. QA validazione contratti reali — QA, 3 giorni (S3 Q2)

**Raccomandazione:** GO IMMEDIATO. Effort totale 3.5 settimane. RICE 510.

---

### Opportunità 2: Poimandres — Console Multi-Agente Standalone ⭐ GO PARALLELO (D-04)

**Dimensioni di business:**
- TAM: Orchestrazione agenti $7B (2025) → $93B (2032, CAGR 44.6%)
- Competitive Window: 4-5 mesi prima che LangGraph copra il gap
- Tech Readiness: 95% — `lib/ai-sdk/`, `lib/tiers.ts`, `lib/models.ts`, `components/console/` pronti

**Prerequisiti decision (D-04 — approvazione boss):**
1. Approvazione lancio parallelo (non sostitutivo di controlla.me)
2. Decisione pricing: freemium vs SaaS vs API consumption
3. DNS + branding: poimandres.work vs altro dominio

**Effort:** 3 settimane parallele a verticale HR (1 dev ARCH dedicato)

**Raccomandazione:** GO — MA PARALLELO. Non interferisce con focus consumer.

---

### Opportunità 3: PMI Compliance B2B — D.Lgs. 231/2001 ⭐ EXPLORE Q2, GO Q3

**Dimensioni di business:**
- TAM: PMI IT con >50 dipendenti (~45.000). Obbligo responsabilità amministrativa
- Corpus: D.Lgs. 231/2001 (88 articoli) già nel corpus, embeddings attivi

**Prerequisiti bloccanti:**
- DPA firmati (D-01, D-02, D-03) — prerequisito B2B legale
- Consulente EU AI Act (D-06) — prerequisito compliance

**Raccomandazione:** EXPLORE SOLO in Q2. Marketing valida: 5 interviste PMI, landing SEO, 3 articoli. GO in Q3 post-DPA.

---

## 2. COMPETITOR SNAPSHOT Q2 2026

| Competitor | Paese | Mossa Q1 2026 | Threat | Nota |
|-----------|-------|---------------|--------|------|
| **Lexroom** | IT | Nessuna rilevante | Media | 16.2M Series A. Gap tecnologico 12+ mesi |
| **LexDo** | IT | Template contratti | Bassa | Zero AI real-time. Complementare |
| **Lawhive** | UK | $60M Series B | Media-Alta | Proof: consumer legal AI è mercato reale |
| **Harvey** | US | Agentic workflows | Bassa | Enterprise-only, non diretto |
| **Big Tech** | US | Nessuna azione legale | Alta (6-12m) | Rischio esistenziale se integrano analisi contratti |

### Vantaggi difendibili

1. **Corpus IT+EU specializzato** — Barrier: 3-4 mesi per competitor
2. **Prospettiva parte debole** — Unico in Italia, barrier: riscrittura prompt
3. **N-fallback + tier system real-time** — Barrier: architettura, difficile replicare
4. **Multi-verticale** — HR Q2 + immobiliare Q3 potenziale
5. **EU-native compliance** — GDPR-first, EU AI Act roadmap

### Trend di mercato Q1

1. EU AI Act accelera: deadline agosto 2026
2. Consumer legal AI validato: Lawhive $60M — finestra IT aperta 9-15 mesi
3. Agentic workflows mainstream: Harvey, Luminance multi-pipeline
4. Provider AI proliferano: costi tendono a zero, valore nei dati

---

## 3. ROADMAP UPDATE PROPOSAL — Q2 2026

### Matrice priorità RICE

| # | Feature | RICE | Effort | Settimana | Priority |
|---|---------|------|--------|-----------|----------|
| 1 | Statuto Lavoratori L.300/1970 | 5700 | 0.1w | S1 | **P0** |
| 2 | Test agent-runner.ts (P1) | 1080 | 0.5w | S1 | **P1** |
| 3 | Deep Search Limit UI | 540 | 0.5w | S1-S2 | **P1** |
| 4 | D.Lgs. 81/2008 corpus HR | 510 | 0.5w | S1-S2 | **P1** |
| 5 | AI pass istituti giuridici 80%+ | 480 | 1w | S2-S3 | **P1** |
| 6 | Fix 9 test fail + 12 ESLint | 380 | 0.5w | S1 | **P1** |
| 7 | Poimandres code extraction | 270 | 3w | S1-S4 | **P1 (strategico)** |
| 8 | UI scoring multidimensionale | 227 | 1.5w | S2-S3 | **P2** |
| 9 | Test P2-P5 (tiers, generate, cache) | 213 | 1.5w | S3-S4 | **P2** |
| 10 | HR Agent prompts + end-to-end | 210 | 1.5w | S2-S3 | **P1** |
| 11 | Sistema referral avvocati UI | 129 | 3.5w | Q3+ | **P3** |
| 12 | OCR immagini | 10 | 3w | Backlog | **P4** |

### Timeline Q2 (12 settimane)

**S1 (Mar 3-14): Quick Wins Bloccanti**
- DE: Statuto load (0.1w) — Day 1
- QA: Fix test fail + ESLint (0.5w)
- QA: Test agent-runner.ts P1 (0.5w)
- ARCH: Deep Search Limit UI (0.5w)

**S2-S3 (Mar 17-28): Verticale HR**
- DE: D.Lgs. 81/2008 load
- UL: HR Agent prompts
- ARCH: Poimandres extraction (parallelo, se D-04 GO)
- QA: HR Agent validation

**S4-S5 (Mar 31 - Apr 11): Quality**
- DE: AI pass istituti 80%+
- ARCH: UI scoring multidimensionale
- QA: Test P2-P5

**S6-S8 (Apr 14 - May 2): Deploy + Validation**
- OPS: Staging → Production
- MKT: Campaign HR launch
- ARCH: Poimandres MVP finalization

**S9-S12 (May 5-23): Stabilizzazione**
- ARCH: TD-1 cache Supabase migration
- QA: E2E production testing
- Strategy: Quarterly Review Q2 redazione

---

## 4. OKR PROPOSAL — Q2 2026

> **Approvazione richiesta:** Boss + CME (D-05)

---

### O1: Rendere il Prodotto Production-Ready
**Owner:** QA + Architecture

#### KR1: Test Coverage ≥ 80%
- Baseline: ~55% (P1-P5 gap)
- Target: ≥80% (tutti P1-P5 covered)
- Metrica: `npm run test:coverage` → ≥80%

#### KR2: Tech Debt TD-1 Risolto
- Baseline: cache filesystem (non scala multi-istanza)
- Target: cache Supabase atomico (RPC `update_phase_timing`)
- Metrica: `grep "import.*fs" lib/analysis-cache.ts` → 0 match

#### KR3: CI/CD Verde
- Baseline: 115/124 test pass, 12 ESLint errors
- Target: 100% test pass, 0 ESLint, build success
- Metrica: CI/CD log GitHub Actions, exit 0

---

### O2: Espandere il Corpus e Lanciare il Verticale HR
**Owner:** Data Engineering + Ufficio Legale + Architecture

#### KR1: Corpus HR ≥ 400 Articoli
- Baseline: 0 articoli HR
- Target: ≥400 (Statuto + TUS + D.Lgs. 276 + D.Lgs. 23)
- Metrica: `SELECT COUNT(*) FROM legal_articles WHERE source IN (...)`

#### KR2: Copertura Istituti da 54.5% a ≥ 80%
- Baseline: 54.5% (3329/6110 articoli con institutes non NULL)
- Target: ≥80% (4888/6110)
- Metrica: query Supabase settimanale

#### KR3: HR Agent Prototipo Operativo
- Baseline: non esiste
- Target: 3+ analisi contratti lavoro end-to-end validate
- Metrica: `analyses` table, 3 record status='completed' + category='hr'

---

### O3: Validare il Mercato con Primi Utenti Reali
**Owner:** Marketing + Operations + CME

#### KR1: Primo Utente Pro Pagante
- Baseline: 0 utenti Pro
- Target: ≥1 utente Pro con pagamento Stripe confermato
- Metrica: `profiles WHERE plan='pro' AND stripe_customer_id IS NOT NULL`

#### KR2: ≥ 20 Analisi Reali Completate
- Baseline: 0
- Target: ≥20 analisi da utenti distinti, status='completed'
- Metrica: query `analyses` table, created_at ≥ 2026-04-01

#### KR3: ≥ 4 Articoli SEO Pubblicati
- Baseline: 0 live (draft calendar pronto)
- Target: ≥4 articoli live su controlla.me
- Metrica: GA organic sessions ≥50 per articolo

---

### O4 (STRETCH): Poimandres MVP — Condizionale a D-04

**Condizione:** Solo se boss approva lancio parallelo (D-04).
**Owner:** Architecture (1 dev dedicato)

#### KR1: Poimandres MVP Live
- Target: poimandres.work live, login + tier switch + cost calculator

#### KR2: 3 Early Adopter Integrati
- Target: 3 dev team reali usando Poimandres

#### KR3: Pricing Model Pubblicato
- Target: 3-tier pricing live, ≥1 pagamento completato

---

## 5. RISCHI CRITICI E MITIGAZIONE

### R1: EU AI Act — Deadline Agosto 2026 ⚠️ CRITICO
- Problema: controlla.me classificato alto rischio (Allegato III, punto 5b)
- Impatto: Multa fino a 15M euro + blocco operativo EU
- Mitigazione: Ingaggiare consulente EU AI Act entro **aprile 2026** (D-06)
- Owner: CME + Security

### R2: DPA Non Firmati — Blocca B2B ⚠️ URGENTE
- Problema: Senza DPA GDPR, nessun contratto B2B possibile
- Impatto: Blocca verticale HR B2B, blocca PMI compliance
- Mitigazione: Anthropic (D-01) + Mistral (D-02) self-served 30 min. Google: Vertex AI vs AI Studio (D-03)
- Azione: Boss firma entro Week 1 Q2

### R3: Cache Filesystem Non Scala
- Problema: Multi-istanza Vercel = cache persa, costi API +50%
- Mitigazione: TD-1 migrazione settimana 9-10 Q2

### R4: Big Tech Entra nel Mercato
- Finestra: 6-12 mesi
- Moat: corpus specializzato, prospettiva parte debole, legal knowledge auto-accrescente
- Azione: Traction veloce Q2 prima che big tech scaldi

### R5: Finestra Poimandres Si Chiude
- Finestra: 4-5 mesi (LangGraph aggiunge fallback)
- Azione: D-04 approvazione inizio Q2, parallel track

---

## 6. DIPENDENZE ESTERNE (AZIONE BOSS)

| # | Dipendenza | Urgenza | Deadline |
|---|-----------|---------|----------|
| **D-01** | DPA Anthropic firma | P0 | Week 1 Q2 |
| **D-02** | DPA Mistral firma | P0 | Week 1 Q2 |
| **D-03** | DPA Google: Vertex AI vs AI Studio | P0 | Week 2 Q2 |
| **D-04** | Approvazione Poimandres lancio parallelo | Media | Week 1 Q2 |
| **D-05** | Approvazione OKR Q2 (questo documento) | Media | Week 1 Q2 |
| **D-06** | Consulente EU AI Act engagement | P0 (agosto deadline) | Week 2 Q2 |
| **D-07** | Landing `/affitti` deployment | Media | Week 1 Q2 |

---

## 7. SUCCESS DEFINITION — FINE Q2 2026

Controlla.me è **production-ready e validated** se:

- ✅ **O1 (Production-Ready):** Test 80%+, TD-1 risolto, CI/CD verde → go deploy produzione
- ✅ **O2 (Verticale HR):** Corpus 400+, istituti 80%+, HR Agent funzionante → secondo verticale lanciato
- ✅ **O3 (Validazione Mercato):** ≥1 Pro pagante, ≥20 analisi reali, ≥4 articoli SEO → traction consumer
- ✅ **Prerequisiti:** DPA 3/3 signed, consulente EU AI Act ingaggiato → go-live commerciale autorizzato
- 🎯 **Bonus (Poimandres):** MVP + 3 adopter (se D-04) → TAM $93B validated

**3/4 objectives + prerequisiti = Q2 SUCCESS.**

---

## ALLEGATI

### A1. Quick Reference RICE Scores Q2

```
[5700] Statuto Lavoratori load
[1080] Test agent-runner P1
[540]  Deep Search Limit UI
[510]  D.Lgs. 81/2008 load
[480]  AI pass istituti 80%+
[380]  Fix ESLint + 9 tests
[270]  Poimandres extraction
[227]  UI scoring multidimensionale
[213]  Test P2-P5
[210]  HR Agent prompts
[129]  Sistema referral avvocati (Q3)
[10]   OCR immagini (Backlog)
```

### A2. Decision Timeline

```
W1 (Mar 3-7):   D-01,D-02,D-03 firma DPA, D-05 OKR approval, D-04 Poimandres GO/NO-GO
W2 (Mar 10-14): Statuto loaded, Test P1 avviato, Deep Search UI 50%
W3 (Mar 17-21): D.Lgs. 81 loaded, HR Agent prompt draft
W4 (Mar 24-28): HR Agent 1a analisi validata
W5-6 (Apr):     UI scoring, Test P2-P5
W7-8 (Apr):     Production deploy, Campaign HR
W9-10 (May):    TD-1 cache migration, E2E prod testing
W11-12 (May):   Final stabilization, Q2 Review redazione

Key dates:
- Mar 3:  D-01,D-02,D-03 signed
- Mar 24: HR Agent first validated analysis
- Apr 14: Production deploy live
- May 1:  Consulente EU AI Act contattato
- May 20: Quarterly Review Q2 draft ready
```

---

*Report generato da: Strategy Lead | Sessione: 2026-03-03 | Status: READY FOR APPROVAL (D-05)*
