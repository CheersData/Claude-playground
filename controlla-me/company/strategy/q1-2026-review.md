# Quarterly Review Q1 2026 — Controlla.me

> **Documento:** Revisione trimestrale | **Periodo:** Q1 2026 (gennaio–marzo)
> **Data:** 2026-03-01 | **Prodotto da:** Dipartimento Strategy
> **Destinatari:** CME + tutti i dipartimenti

---

## 1. RETROSPETTIVA Q1 2026

### 1.1 Stato board

| Metrica | Valore |
|---------|--------|
| Task totali Q1 | 128 |
| Task completati | 126 (98.4%) |
| Task bloccati su azioni umane | 2 (DPA provider AI + consulente EU AI Act) |
| OKR completion rate stimato | ~93% |
| Dipartimenti operativi | 9/9 |

### 1.2 Cosa e stato completato

#### Prodotto e feature

| # | Area | Risultato |
|---|------|-----------|
| 1 | **Corpus legislativo** | 6110 articoli puliti, 13/14 fonti attive, embedding 100% (voyage-law-2), HNSW index attivo |
| 2 | **Corpus Agent** | CorpusChat in hero + `/corpus`, question-prep (colloquiale → giuridico), pagina `/corpus/article/[id]` |
| 3 | **Scoring multidimensionale** | Backend + UI: `legalCompliance`, `contractBalance`, `industryPractice`. FairnessScore.tsx operativo |
| 4 | **Dashboard reale** | Mock data rimosso. Query Supabase live per storico analisi |
| 5 | **Deep search paywall** | Gate differenziato (non-auth vs limite raggiunto). Backend + UI completati |
| 6 | **Retrieval improvement** | Re-ranking `times_seen`, fallback testuale, Investigator self-retrieval (+30% coverage clausole critiche) |
| 7 | **Console mobile responsive** | Tutti i componenti console adattati per smartphone |

#### Infrastruttura e qualita

| # | Area | Risultato |
|---|------|-----------|
| 8 | **CI/CD GitHub Actions** | Pipeline: lint+typecheck → unit-tests (coverage artifact) → build. Attiva su push main/develop e PR |
| 9 | **Unit test** | 115/124 test verdi (da 0). Copertura: agenti core, middleware, infrastruttura AI |
| 10 | **Suite E2E Playwright** | 5 file in `e2e/`: auth, upload, analysis, console. Config unificata |
| 11 | **Audit corpus L1–L3** | 527 duplicati eliminati, 976 articoli puliti, bug critico `normalizeLawSource()` fixato |
| 12 | **Pipeline parametrizzata** | Plugin registry per N verticali. `hr-articles` dataType integrato |
| 13 | **Cron delta update** | `app/api/cron/delta-update/route.ts` + `vercel.json` schedule `0 6 * * *` |

#### Sicurezza

| # | Area | Risultato |
|---|------|-----------|
| 14 | **Security hardening** | M1–M4 risolti: `requireConsoleAuth` su `/api/company/*`, CSRF fail-closed, rate-limit su route corpus READ |
| 15 | **Headers HTTP** | CSP, HSTS, X-Frame-Options, Permissions-Policy in `next.config.ts` |
| 16 | **Dipartimento Security** | ADR-004 approvato. 23/23 task security completati |

#### Virtual Company e governance

| # | Area | Risultato |
|---|------|-----------|
| 17 | **9 dipartimenti operativi** | Tutti con department.md, agenti, runbook, task system |
| 18 | **3 nuovi agenti** | Data Analyst, Sistemista, UI/UX Designer (ADR-006) |
| 19 | **10 ADR documentati** | Da Virtual Company (ADR-001) a CME Scheduler (ADR-010) |
| 20 | **Cost tracking** | `agent_cost_log` + dashboard `/ops` + API costi operativa |
| 21 | **Daily controls + idle trigger** | `daily-controls.ts`, 5 task ricorrenti, auto-trigger dipartimenti idle |
| 22 | **Poimandres routing** | `next.config.ts` host-based routing. Deploy-ready per `poimandres.work` |

#### Architecture decisions approvate

| ADR | Decisione |
|-----|-----------|
| ADR-005 | Fix `savePhaseTiming` — jsonb_set atomico. Latenza analisi -400-800ms, 8 roundtrip → 4 |
| ADR-007 | Report dipartimentali in Markdown (`company/<dept>/reports/`) |
| ADR-008 | Modello CME ibrido: Sonnet default, Opus su richiesta esplicita |
| ADR-009 | Routing task su modelli free (anti-subscription drain) |
| ADR-010 | Company Scheduler CME via Groq free tier |

### 1.3 Cosa NON e stato completato (carry over Q2)

| Feature | Stato attuale | Blocco / Azione richiesta |
|---------|--------------|--------------------------|
| **Statuto Lavoratori (L. 300/1970)** | Connector pronto, load non eseguito | 1 comando manuale: `npx tsx scripts/data-connector.ts load statuto_lavoratori` |
| **Corpus HR (D.Lgs. 81/2008)** | `lifecycle: planned`, pronto per load | Esecuzione pipeline DE |
| **Test P1–P5** | 0 test su agent-runner, tiers, console-token, analysis-cache, generate | QA: sprint dedicato |
| **9 test fail analyze-route** | Integration test con dipendenze esterne | Refactor con mock — stima 2 giorni |
| **12 errori ESLint** | `no-unused-vars` in `scripts/` e test | Quick fix < 1 giorno |
| **Sistema referral avvocati** | Schema DB + migration ready | Bloccato: GDPR review — quale base giuridica per condivisione dati con avvocati? |
| **OCR immagini** | `tesseract.js` rimosso da dependencies | Bassa priorita, reinstallare quando si implementa concretamente |
| **DPA provider AI** | Non firmato | Azione boss: Anthropic, Google, Mistral DPA GDPR |
| **Consulente EU AI Act** | Non ingaggiato | Deadline agosto 2026. Azione boss |

### 1.4 Sorprese e lezioni apprese

| Lezione | Impatto |
|---------|---------|
| **Corpus audit e fondamentale per RAG** | L1–L3 ha rivelato 527 duplicati e bug critico su normalizeLawSource. Senza audit la qualita RAG sarebbe rimasta bassa. Pianificare audit periodico (trimestrale) |
| **Pipeline parametrizzata vale il refactoring** | Il costo del refactoring (2 giorni) si ammortizza su ogni nuovo verticale. Primo beneficiario: HR |
| **Security prima della traction** | Hardening completato a costo minimo ora. Con utenti reali il costo sarebbe 5–10x |
| **ADR pattern riduce il tech debt** | Le 10 decisioni documentate hanno evitato revisioni costose. Continuare sistematicamente |
| **Tier system + N-fallback funziona** | Multi-provider ha assorbito rate limit spike senza downtime. Validato in demo |
| **Reframe "console come prodotto"** | Cambio di frame strategico piu importante del trimestre: da LegalTech a piattaforma orchestrazione agenti (TAM $7B → $93B). Non cambia il prodotto immediato, cambia la visione 18 mesi |

---

## 2. ANALISI COMPETITIVA — STATO AL 2026-03-01

| Competitor | Posizionamento | Gap rispetto a noi | Minaccia |
|------------|---------------|-------------------|---------|
| **Lexroom** | B2B avvocati (€16M Series A) | Serve professionisti, non consumatori. No corpus RAG pubblico | Media — se pivot consumer: 12–18 mesi |
| **Lexdo.it** | Contratti + NDA aziende | Zero AI real-time. Template statici | Bassa — gap tecnologico 12+ mesi |
| **Lawyeria** | Matching avvocati | Q&A umani, 24h response. No AI | Bassa — complementare |
| **Avvocato di Quartiere** | Portale informativo | Web1 style, zero AI | Nessuna |
| **PratoLegale** | Documenti consumatori | Template compilabili, no scoring dinamico | Nessuna |
| **Big Tech (Gemini/Copilot)** | "Analisi contratto" gratis | Corpus IT+EU specializzato e il differenziatore che regge | Alta in 6–12 mesi — corpus e unico moat |

**Vantaggio stimato:** 9–15 mesi sul consumer B2C italiano.
**Moat reale:** knowledge base auto-accrescente + corpus legislativo IT+EU con embedding specializzati + prospettiva parte debole codificata nei prompt.

---

## 3. TOP 3 OPPORTUNITA Q2 — RICE SCORING

### Metodo RICE
`Score = (Reach × Impact × Confidence) / Effort`
- **Reach**: utenti impattati (1–10 scala relativa)
- **Impact**: impatto per utente (1–10)
- **Confidence**: certezza della stima (0.1–1.0)
- **Effort**: settimane di sviluppo

---

### Opportunita 1: Verticale HR / Lavoro

**Descrizione:** Espandere controlla.me al segmento HR — analisi contratti di lavoro, verifica D.Lgs. 81/2008 (sicurezza lavoro), Statuto Lavoratori, Jobs Act. Target: HR manager, lavoratori, consulenti del lavoro.

| Componente RICE | Valore | Ragionamento |
|-----------------|--------|-------------|
| Reach | 8 | HR manager IT stimati 120K+. Contratti di lavoro = 2° tipo documento piu cercato dopo contratti commerciali |
| Impact | 9 | Gap totale sul mercato: nessun player IT ha corpus lavoro EU + AI. Differenziatore immediato |
| Confidence | 0.85 | Tech ready al 80%: pipeline parametrizzata, hr-sources.ts pronto, D.Lgs. 81/2008 solo da caricare |
| Effort | 3.5 settimane | Corpus load (1gg) + HR Agent prompts (3gg) + UI verticale (5gg) + test + validazione |

**RICE Score: (8 × 9 × 0.85) / 3.5 = 17.5 → normalizzato: 175**

**Prerequisiti:**
- Caricare Statuto Lavoratori (1 comando, DE)
- Caricare D.Lgs. 81/2008 (pipeline standard, DE)
- Definire prompt HR Agent (Ufficio Legale)
- Validazione Ufficio Legale su perimetro analizzabile (rischi lavoro vs consulenza sindacale)

---

### Opportunita 2: Poimandres — Console Multi-Agente Standalone

**Descrizione:** Estrarre la console di controlla.me come prodotto SaaS standalone (`poimandres.work`). B2B dev/ops: piattaforma per costruire e gestire pipeline multi-agente con tier switch real-time, N-fallback, cost control.

| Componente RICE | Valore | Ragionamento |
|-----------------|--------|-------------|
| Reach | 7 | TAM piattaforme orchestrazione agenti: $7B (2025) → $93B (2032). Dev/ops italiani ed EU |
| Impact | 9 | Differenziatore unico vs LangGraph/CrewAI: tier switch UI + N-fallback + cost tracking built-in |
| Confidence | 0.9 | Tech ready al 95%: `lib/ai-sdk/`, `lib/tiers.ts`, `components/console/` gia estratti. Routing host-based in `next.config.ts` |
| Effort | 3 settimane | Branding/UI separata (1 sett.) + auth indipendente (3gg) + pricing (2gg) + deploy + marketing |

**RICE Score: (7 × 9 × 0.9) / 3 = 21.0 → normalizzato: 210**

**Window:** 4–5 mesi prima che LangGraph copra il gap feature.
**Prerequisiti:**
- Decisione boss (D-04)
- DNS poimandres.work + deploy Vercel separato
- Pricing model B2B (token-based o seat-based)

---

### Opportunita 3: Deep Search Limit UI + Monetization Gate

**Descrizione:** Quick win di monetizzazione: il backend del deep search limit e gia pronto (`canDeepSearch`, `deepSearchLimit`), manca solo l'enforcement UI completo e il gate paywall per upgrade a Pro.

| Componente RICE | Valore | Ragionamento |
|-----------------|--------|-------------|
| Reach | 6 | Tutti gli utenti free che hanno raggiunto il limite |
| Impact | 8 | Sblocco diretto conversion free→pro. Ogni analisi con clausola rischiosa e un funnel |
| Confidence | 0.95 | Backend completamente pronto. Solo UI e copy |
| Effort | 0.5 settimane | RiskCard.tsx, PaywallBanner.tsx, copy italiano — 2 giorni |

**RICE Score: (6 × 8 × 0.95) / 0.5 = 91.2 → normalizzato: 91**

**Nota:** RICE basso per effort minimo ma ROI immediato — da eseguire nella prima settimana di Q2 come task indipendente.

---

### Riepilogo RICE Q2

| Rank | Opportunita | RICE | Effort | Tipo |
|------|-------------|------|--------|------|
| 1 | Poimandres standalone | 210 | 3 sett. | Nuovo prodotto |
| 2 | Verticale HR / Lavoro | 175 | 3.5 sett. | Espansione verticale |
| 3 | Deep Search Limit UI | 91 | 0.5 sett. | Quick win monetization |

**Raccomandazione:** eseguire Deep Search Limit UI nella settimana 1 (zero blocco, massimo ROI immediato), poi decidere sequenza Poimandres vs HR in base all'approvazione del boss (D-03, D-04).

---

## 4. OKR Q2 2026 (PROPOSTI — IN ATTESA APPROVAZIONE BOSS)

> **Regola:** massimo 3 obiettivi, 2–3 KR per obiettivo, ogni KR con metrica verificabile nel DB o analytics.

---

### O1 — Monetizzazione e retention utenti Pro

**Rationale:** La piattaforma e tecnicamente matura. Q2 e il trimestre in cui si valida se il prodotto genera ricavi reali.

| KR | Target | Metrica | Come misurare |
|----|--------|---------|---------------|
| KR1-1 | Conversion free → pro ≥ 3% | % attivazioni Pro su nuovi signup | `profiles.plan = 'pro'` / `COUNT(new_signups)` |
| KR1-2 | Analisi medie per utente Pro ≥ 2.5/mese | Engagement profondo | `SUM(analyses_count) / COUNT(pro_users)` |
| KR1-3 | Deep search paywall gate attivo | Feature enforcement | Deploy RiskCard.tsx completo verificato |

---

### O2 — Verticale HR operativo

**Rationale:** Pipeline dati e tech stack sono pronti. Q2 porta il primo verticale aggiuntivo in produzione, validando la scalabilita della piattaforma madre.

| KR | Target | Metrica | Come misurare |
|----|--------|---------|---------------|
| KR2-1 | Corpus HR ≥ 500 articoli nel DB | Copertura normativa | `SELECT COUNT(*) FROM legal_articles WHERE vertical = 'hr'` |
| KR2-2 | HR Agent prototipo validato da Ufficio Legale | Qualita agente | Review completata, firma Ufficio Legale su perimetro |
| KR2-3 | 30 analisi con documenti di lavoro completate | Validazione mercato | `analyses WHERE classification->>'type' ILIKE '%lavoro%'` |

---

### O3 — Qualita tecnica e sicurezza pre-lancio

**Rationale:** Prima di scalare l'acquisizione utenti, eliminare i rischi tecnici e normativi che bloccherebbero un lancio commerciale (PMI B2B, fundraising).

| KR | Target | Metrica | Come misurare |
|----|--------|---------|---------------|
| KR3-1 | Test coverage P1–P5 completata | Resilienza infrastruttura | `agent-runner`, `tiers`, `console-token`, `analysis-cache`, `generate` — tutti con test |
| KR3-2 | DPA provider AI firmati (Anthropic + Google) | Compliance GDPR | Documenti firmati — azione boss |
| KR3-3 | Cache sessioni migrata da filesystem a Supabase (TD-1) | Stabilita multi-istanza | `session_cache` tabella attiva, zero filesystem dependency |

---

### O4 (stretch) — Poimandres MVP live

**Rationale:** Window di mercato di 4–5 mesi. Se il boss approva (D-04) in settimana 1 di Q2, e possibile avere un MVP live entro fine Q2.

| KR | Target | Metrica | Come misurare |
|----|--------|---------|---------------|
| KR4-1 | `poimandres.work` live con console funzionante | Deploy verificato | URL accessibile, tier switch funzionante |
| KR4-2 | 3 early adopter B2B ingaggiati | Validazione mercato | Contratti pilota o trial attivi |
| KR4-3 | Pricing model definito e pubblicato | Revenue readiness | Pagina pricing live |

---

## 5. NUOVI AGENTI E SERVIZI DA COSTRUIRE IN Q2

### 5.1 HR Agent (priorita alta)

**Tipo:** nuovo agente runtime specializzato
**Dipartimento:** Ufficio Legale (design prompt) + Architecture (integrazione)

L'attuale pipeline analizza contratti generici dalla prospettiva del consumatore. Per il verticale HR serve un agente con:
- Conoscenza specifica di D.Lgs. 81/2008 (sicurezza lavoro), Statuto Lavoratori, Jobs Act
- Punto di vista del lavoratore (non consumatore generico)
- Indicatori specifici: mansioni, orario, ferie, retribuzione, sicurezza, clausole di non concorrenza
- Integrazione con corpus HR (articoli caricati da DE)

**Output tecnico:** nuovo prompt in `lib/prompts/hr-analyzer.ts`, agente in `lib/agents/hr-analyzer.ts`, integrazione in orchestratore con flag verticale.

**Effort stimato:** 1 settimana (Ufficio Legale: 2 giorni prompt + review; Architecture: 3 giorni integrazione)

---

### 5.2 Contract Monitoring Agent (priorita media — decisione D-05 richiesta)

**Tipo:** nuovo servizio di monitoraggio periodico
**Dipartimento:** Architecture (schema DB) + Ufficio Legale (logica alert)

Agente che monitora contratti attivi nel tempo: scadenze, rinnovi automatici, variazioni normative che impattano clausole gia accettate. Il boss deve prima decidere lo schema DB (D-05) per evitare migrazione dolorosa post-traction.

**Output:** tabella `contract_alerts`, cron giornaliero, notifica email/in-app.
**Effort stimato:** 2 settimane (post-decisione schema DB)

---

### 5.3 CCNL Agent (priorita media — corpus prerequisito)

**Tipo:** nuovo connettore + agente
**Dipartimento:** Data Engineering (connettore CNEL) + Ufficio Legale (prompts)

I CCNL (Contratti Collettivi Nazionali) sono la fonte normativa piu rilevante per il verticale HR B2B ma non sono su Normattiva. Richiedono un connettore custom verso l'archivio CNEL (`www.cnel.it/CCNL`) o l'API INPS. Senza CCNL il verticale HR e incompleto per PMI e professionisti HR.

**Effort stimato:** 3 settimane (analisi fonti + connettore custom + ingest + test)

---

### 5.4 API Pubblica (priorita bassa — post-traction)

**Tipo:** nuovo servizio B2B
**Dipartimento:** Architecture

Esporre l'analisi contrattuale come API REST per integrazioni (CRM avvocati, HR platform, portali immobiliari). Modello: pay-per-call. Prerequisiti: traction dimostrata, DPA firmati, pricing validato.

**Effort stimato:** 1 settimana (auth API key, rate limit, documentazione Swagger, pricing)

---

## 6. NEXT STEPS DATA ENGINEERING — VERTICALE HR

### Stato attuale corpus HR

| Fonte | Articoli stimati | Stato | Connector |
|-------|-----------------|-------|-----------|
| L. 300/1970 — Statuto Lavoratori | 42 art. | `api-tested` — connector pronto, load da eseguire | `directAkn`, `codiceRedazionale: 070U0300` |
| D.Lgs. 81/2008 — T.U. Sicurezza | 306 art. | `planned` — connector pronto | `directAkn`, `codiceRedazionale: 008G0104` |
| D.Lgs. 276/2003 — Riforma Biagi | 86 art. | `planned` — connector pronto | `directAkn`, `codiceRedazionale: 003G0297` |
| D.Lgs. 23/2015 — Jobs Act | 11 art. | `planned` — connector pronto | `directAkn`, `codiceRedazionale: 15G00037` |
| CCNL (CNEL) | variabile | Non avviato | Connector custom da costruire |

**Totale stimato senza CCNL: 445 articoli** → sufficiente per MVP verticale HR.

### Sequenza di esecuzione consigliata

**Settimana 1 di Q2 — Caricamento fonti pronte (1 giorno, DE)**
```bash
# Statuto Lavoratori (connector gia pronto da commit 586f63f)
npx tsx scripts/data-connector.ts load statuto_lavoratori

# D.Lgs. 81/2008 (pipeline standard, directAkn)
npx tsx scripts/data-connector.ts connect dlgs_81_2008
npx tsx scripts/data-connector.ts load dlgs_81_2008

# D.Lgs. 276/2003 e D.Lgs. 23/2015 (stessa pipeline)
npx tsx scripts/data-connector.ts connect dlgs_276_2003
npx tsx scripts/data-connector.ts load dlgs_276_2003
npx tsx scripts/data-connector.ts connect dlgs_23_2015
npx tsx scripts/data-connector.ts load dlgs_23_2015
```

**Settimana 2 — Audit e validazione corpus HR**
- Audit L1: diagnostica articoli caricati (duplicati, copertura, gerarchia)
- AI pass istituti giuridici: tagging automatico per fonti HR (coordinare con Ufficio Legale)
- Verifica `normalizeLawSource()` per nuove fonti HR

**Settimana 3–4 — Connector CCNL (analisi e prototipo)**
Ricerca fonti nell'ordine: API ufficiale CNEL → dataset open su GitHub/HuggingFace → alternativa EUR-Lex → scraping (solo con approvazione boss). Aprire task CME con findings prima di procedere.

### Regola immutabile (da `company/data-engineering/department.md`)

> Scraping = ultima risorsa. Ordine: API ufficiali → repo/dataset open → fonti alternative → scraping (con approvazione boss). Non si esegue senza task formale CME con documentazione delle opzioni 1–3 esaurite.

---

## 7. DECISIONI IN SOSPESO (richiedono boss)

| # | Decisione | Urgenza | Impatto se ritardata |
|---|-----------|---------|---------------------|
| D-01 | Firmare DPA Anthropic + Google + Mistral | Alta — GDPR | Blocca lancio PMI B2B, espone a sanzioni GDPR |
| D-02 | Ingaggiare consulente EU AI Act | Alta — deadline agosto 2026 | Multa fino €15M + €3M o 1% fatturato |
| D-03 | Approvare OKR Q2 2026 | Media — settimana 1 Q2 | Direzione azienda Q2 non allineata |
| D-04 | Approvare lancio Poimandres Q2 | Media — window 4–5 mesi | Si perde la finestra di mercato |
| D-05 | Schema DB contract monitoring | Media — prima di traction | Migrazione dolorosa e costosa post-utenti reali |

---

## 8. METRICHE DI SALUTE END-Q1

| KPI | Valore | Trend |
|-----|--------|-------|
| Task completion rate | 98.4% (126/128) | Eccellente |
| Corpus articoli | 6110 (puliti) | Obiettivo superato (target >5000) |
| Unit test coverage | ~55% percorsi critici | In miglioramento (da 30%) |
| Security score | 8.5/10 | Tutti i finding medi risolti |
| Embedding coverage | 100% (voyage-law-2) | Ottimo |
| CI/CD | Attiva (3 job) | Nuovo in Q1 |
| Costi API Q1 | ~$0.31 (parziali, demo) | Sotto controllo |
| ADR documentati | 10 | Ottimo ritmo decisionale |
| Dipartimenti operativi | 9/9 | Piena copertura |

---

## 9. SINTESI ESECUTIVA PER CME

**Q1 e stato un trimestre di fondamenta.** L'azienda ha costruito l'infrastruttura tecnica, la governance, la sicurezza e il corpus dati necessari per scalare. Il 98.4% dei task completati e un segnale di maturita operativa.

**Il reframe strategico piu importante:** controlla.me non e solo LegalTech, e il primo prototipo di una piattaforma orchestrazione agenti (TAM $7B → $93B). Il moat e la console multi-agente con N-fallback + tier switch + cost control, non il corpus legale da solo.

**Q2 deve essere il trimestre della validazione:** primo verticale aggiuntivo (HR) live, monetizzazione attiva (paywall enforcement), decisione Poimandres. Le fondamenta sono pronte — ora serve trazione.

**Due rischi non tecnici richiedono azione immediata del boss:**
1. DPA provider AI — senza questo nessun contratto PMI B2B e firmabile
2. Consulente EU AI Act — deadline agosto 2026 non e negoziabile

---

*Documento prodotto da: Dipartimento Strategy*
*Prossima revisione: Q2 Review — giugno 2026*
