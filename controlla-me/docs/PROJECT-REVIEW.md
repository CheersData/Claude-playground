# Project Review — controlla.me (Piattaforma Multi-Verticale)

> Valutazione come piattaforma di orchestrazione AI multi-agente replicabile su N domini.
> Data: 2026-02-24

---

## 1. Cosa e' realmente questo progetto

Non un "tool per contratti". E' un **template produttizzato di analisi documentale AI** con un core riutilizzabile al ~60%.

### Core riutilizzabile (60%)

| Componente | File | Ruolo |
|-----------|------|-------|
| Orchestratore | `lib/agents/orchestrator.ts` | Pipeline 4 agenti con callbacks, cache, resume |
| RAG pipeline | `lib/vector-store.ts` | Chunking, embedding, ricerca semantica, auto-indexing |
| Streaming | `app/api/analyze/route.ts` | SSE real-time con progress tracking |
| Progress UX | `components/AnalysisProgress.tsx` | 643 righe, riutilizzabile as-is |
| Auth + Pagamenti | Supabase + Stripe | Gia pronto |
| Cache sessioni | `lib/analysis-cache.ts` | SHA256, timing, ripresa |
| LLM client | `lib/anthropic.ts` | Retry, parsing JSON robusto, logging |

### Domain-specific (40% — da riscrivere per verticale)

| Componente | File | Da fare per nuovo dominio |
|-----------|------|--------------------------|
| Prompt | `lib/prompts/*.ts` | Riscrivere 4 prompt |
| Types | `lib/types.ts` | Nuove interfacce output |
| Corpus | `lib/legal-corpus.ts` | Nuovo corpus di dominio |
| Labels + Copy | Landing page, UI | Nuovo branding |

**Time-to-market per nuovo verticale (avendo il core): settimane, non mesi.**

---

## 2. Posizionamento nel mercato AI

| Livello | Esempi | Differenza |
|---------|--------|------------|
| Framework | CrewAI, LangGraph, AutoGen | Tool per developer. Nessuna UX, nessun utente finale |
| Vertical SaaS AI | Harvey (legal), Keeper (tax) | Un prodotto, un dominio, fundraising $100M+ |
| **Questo progetto** | controlla.me + futuri verticali | Core riutilizzabile, deploy rapido su N domini, mercato italiano |

Non competi con i framework (quelli sono per developer). Non competi con gli Harvey (quelli hanno $100M). Occupi la nicchia: **"vertical AI veloce per il mercato italiano"** — arrivi per primo su segmenti che i big ignorano.

---

## 3. I 5 segnali positivi per il mercato AI

### 3.1. Multi-agente e' il trend dominante 2025-26

Tutti stanno andando da "un prompt, una risposta" a pipeline di agenti specializzati. Ma i framework richiedono competenze tecniche forti. Qui c'e' gia l'implementazione produttizzata con UX, pagamenti, onboarding.

### 3.2. Knowledge base auto-alimentata = moat reale

Ogni analisi arricchisce `legal_knowledge` nel vector DB tramite `indexAnalysisKnowledge()`. Dopo 1000 analisi, il sistema ha visto pattern che nessun competitor nuovo puo replicare il giorno 1. Questo si replica su ogni verticale.

### 3.3. Mercato italiano dei servizi professionali: frammentato e underserved

- ~250.000 commercialisti
- ~60.000 agenzie immobiliari
- ~240.000 studi professionali
- ~4.5M di P.IVA

Nessuno costruisce AI verticali per questi segmenti in italiano.

### 3.4. Replicabilita abbatte il CAC

Un utente che usa controlla.me/contratti e' un lead naturale per /fiscale o /banca. Una base utenti, N prodotti. Il cross-sell e' organico.

### 3.5. Architettura a 4 agenti = messaging chiaro

"4 esperti AI analizzano il tuo documento in 90 secondi" — dimostrabile, memorabile, virale.

---

## 4. I 3 rischi strutturali

### 4.1. Nessun moat tecnico profondo

L'orchestratore e' ben fatto ma non e' proprietary tech. Qualcuno con competenze simili replica l'architettura in 2-3 settimane. Il moat reale viene dalla knowledge base (dati accumulati), dal brand, e dalla velocita di esecuzione.

### 4.2. Dipendenza totale da Anthropic

100% del valore passa per Claude API. Se Anthropic cambia pricing, rate limits, o TOS, il business e' esposto. Mitigazione necessaria: astrarre il layer LLM per supportare anche OpenAI/Mistral come fallback.

### 4.3. Regolamentazione AI in Italia/EU

L'AI Act europeo classifica certi usi come "ad alto rischio". Consulenza legale/fiscale/finanziaria potrebbe rientrare. Serve monitorare e strutturare disclaimer e compliance.

---

## 5. Verticali piu promettenti (roadmap)

| # | Verticale | Problema | Difficolta prompt | Mercato Italia |
|---|-----------|----------|-------------------|----------------|
| 1 | **Contratti** (attuale) | "Cosa sto firmando?" | Fatto | Tutti |
| 2 | **Commercialista AI** | Bilanci, dichiarazioni, anomalie | Media | 250K studi + 4.5M P.IVA |
| 3 | **Vantaggi fiscali** | Bonus, detrazioni, crediti d'imposta | Media-alta | Tutti i contribuenti |
| 4 | **Buste paga** | "Il mio stipendio e' giusto?" | Bassa | 17M dipendenti |
| 5 | **Consulente bancario** | Mutui, prestiti, condizioni nascoste | Media | Tutti |
| 6 | **Polizze assicurative** | Clausole oscure, esclusioni | Media | 40M+ polizze/anno |

**Buste paga** e' particolarmente interessante: volume altissimo, dolore reale, documento strutturato.

---

## 6. Monetizzazione multi-verticale

### Pricing attuale (troppo basso)

| Piano | Prezzo | Problema |
|-------|--------|---------|
| Free | €0, 3/mese | OK come trial |
| Pro | €4.99/mese illimitato | Sottocosto per tool professionale. "Illimitato" non scala |
| Single | €0.99 | Margine risicato con costi API |

### Pricing suggerito (per verticale)

| Piano | Prezzo | Target |
|-------|--------|--------|
| Free | €0 | 2 analisi/mese per verticale |
| Single | €3.99 | Pay-per-use, consumatore occasionale |
| Pro | €14.99/mese | 15 analisi/mese, consumatore frequente |
| Business | €39.99/mese | 50 analisi/mese, PMI e studi |
| Bundle | €24.99/mese | Accesso a tutti i verticali, 20 analisi totali |
| Enterprise | Custom | API, white-label, volumi |

### Revenue streams aggiuntive

1. **Referral professionisti** — Commissione per lead qualificati (avvocati, commercialisti). DB gia predisposto.
2. **API per integratori** — Studi e software house integrano l'analisi nei loro tool.
3. **White-label** — Associazioni di categoria / ordini professionali.

---

## 7. Cosa serve per farne una piattaforma vera

### 7.1. Astrarre l'orchestratore

Oggi i 4 agenti sono hardcoded. Per essere piattaforma, serve un orchestratore configurabile:

```
Oggi:   runClassifier() -> runAnalyzer() -> runInvestigator() -> runAdvisor()
Domani: definePipeline({ domain, agents[], types, corpus })
```

Ogni "domain pack" diventa un pacchetto: `/domains/legal/`, `/domains/fiscal/`, `/domains/payroll/`.

### 7.2. Astrarre il layer LLM

Supportare OpenAI / Mistral come fallback. Riduce dipendenza da Anthropic e permette ottimizzazione costi.

### 7.3. Brand ombrello

Non "controlla.me" per tutto, ma una famiglia: controlla.me/contratti, controlla.me/fisco, controlla.me/busta-paga. Un account, N servizi.

---

## 8. Verdetto finale

### Come prodotto singolo (solo legale)

| Dimensione | Voto |
|-----------|------|
| Architettura tecnica | 8/10 |
| UX/UI | 7.5/10 |
| Monetizzazione | 5/10 |
| Market fit B2C | 6.5/10 |
| Market fit B2B | 8/10 |
| Go-to-market readiness | 5/10 |

### Come piattaforma multi-verticale

| Dimensione | Voto |
|-----------|------|
| Architettura come piattaforma | 7.5/10 |
| Potenziale di scala | 8.5/10 |
| Appetibilita mercato AI | 8/10 |
| Moat / difendibilita | 5.5/10 |
| Replicabilita su N verticali | 7/10 |
| Monetizzazione multi-verticale | 8/10 |
| Rischio regolamentare | 6/10 |

### Conclusione

Come prodotto singolo: buon side-project. Come piattaforma multi-verticale di analisi documentale AI per il mercato italiano: **idea con potenziale serio**.

Il pezzo mancante critico e' l'astrazione del core (orchestratore configurabile + domain packs). Il moat verra dalla knowledge base accumulata e dalla velocita di esecuzione, non dalla tech in se.

Priorita immediate:
1. Lanciare il verticale legale con feature complete (corpus, dashboard, OCR)
2. Validare il pricing piu alto su primi utenti reali
3. Astrarre il core per il secondo verticale (commercialista o buste paga)
4. Costruire il brand ombrello
