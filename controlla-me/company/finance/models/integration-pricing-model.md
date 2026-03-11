# Integration Pricing Model — Controlla.me

**Autore:** Finance Department (Cost Controller)
**Data:** 2026-03-10
**Stato:** v3.0 — Modello completo allineato a Strategy Brief (integration-office-brief.md)
**Task:** c437ae81
**Fonti dati:** lib/models.ts, lib/tiers.ts, lib/embeddings.ts, lib/stripe.ts, docs/MODEL-CENSUS.md, company/strategy/briefs/integration-office-brief.md
**Valuta:** Tutti gli importi in EUR salvo costi infrastruttura (denominati in USD dai provider, convertiti a EUR 1:1.08)

---

## Indice

1. [Cost-per-Sync Analysis](#1-cost-per-sync-analysis)
2. [Pricing Tiers for Integration](#2-pricing-tiers-for-integration)
3. [Unit Economics](#3-unit-economics)
4. [Revenue Projections (M1-M12)](#4-revenue-projections-m1-m12)
5. [ROI per Connector](#5-roi-per-connector)
6. [Risk Factors](#6-risk-factors)
7. [Raccomandazioni](#7-raccomandazioni)
8. [Appendici](#appendici)

---

## 1. Cost-per-Sync Analysis

### 1.1 Componenti di costo per singola operazione di sync

Ogni operazione di sincronizzazione (pull di un documento/record da un sistema esterno, trasformazione, analisi opzionale, salvataggio) genera costi su 5 dimensioni:

| # | Componente | Descrizione | Costo unitario | Note |
|---|------------|-------------|----------------|------|
| 1 | **API call provider** | Chiamata REST al sistema esterno (CRM, Drive, ecc.) | EUR 0.00 - 0.09/call | Quasi tutti i provider nel nostro target hanno API gratuite |
| 2 | **Compute (Vercel)** | Serverless function execution | ~EUR 0.00007/invocazione | CPU + memoria + invocazione |
| 3 | **Storage (Supabase)** | Riga PostgreSQL + pgvector embedding | EUR 0.11/GB extra | Free: 500MB, Pro: 8GB inclusi |
| 4 | **AI field mapping** | LLM per trasformazione/validazione campi dati | EUR 0.0001 - 0.0014/record | Dipende dal tier (Intern/Associate/Partner) |
| 5 | **Embeddings** | Voyage AI per indicizzazione semantica | EUR 0.09/1M token | ~200 token/record, opzionale |

### 1.2 Costo API per connettore target (allineato a RICE Strategy Brief)

I connettori sono quelli identificati dalla Strategy (top 10 RICE). I costi API si riferiscono alle chiamate necessarie per estrarre documenti/record.

| # RICE | Connettore | Modello pricing API | Costo/1.000 record | Free tier / Limiti |
|--------|-----------|--------------------|--------------------|---------------------|
| 1 | **Fatture in Cloud** | API REST TeamSystem, inclusa nel piano | ~EUR 0 | Rate limit da verificare (partnership) |
| 2 | **Google Drive** | Google Workspace API, quota 12.000 req/utente/min | ~EUR 0 | 100 query/100s per utente |
| 3 | **HubSpot** | REST API v3, inclusa nel piano CRM | ~EUR 0 | 500K call/giorno (privata app) |
| 4 | **Shopify** | GraphQL Admin API, inclusa nel piano | ~EUR 0 | 40 req/s (burst), rate limit leaky bucket |
| 5 | **Zucchetti HR** | API partner (non pubblica, richiede accordo) | ~EUR 0 (da negoziare) | Da definire con partnership |
| 6 | **Slack** | Events API + Web API, gratuita | ~EUR 0 | Tier 1: ~1 req/s, Tier 2-4: fino a 100/min |
| 7 | **Salesforce** | REST API, inclusa nel piano Enterprise | ~EUR 0 (entro limiti) | 100K call/giorno (Enterprise) |
| 8 | **WooCommerce** | REST API WordPress, gratuita | ~EUR 0 | Self-hosted, no limiti provider |
| 9 | **Microsoft Teams** | Graph API, inclusa in M365 | ~EUR 0 | Throttling per app: 10.000/10min |
| 10 | **SharePoint** | Graph API, inclusa in M365 | ~EUR 0 | Come Teams (stessa API) |

**Conclusione API**: tutti i connettori target hanno API gratuite incluse nei piani dei rispettivi provider. Il costo API per controlla.me e effettivamente zero. Questo e un vantaggio strutturale: i nostri utenti pagano gia il provider esterno, la nostra integrazione non aggiunge costi di terze parti.

### 1.3 Costo compute (Vercel serverless)

Pricing Vercel Pro (piano attuale del progetto), convertito in EUR:

| Metrica | Costo (USD) | Costo (EUR ~1:1.08) | Note |
|---------|-------------|---------------------|------|
| Invocazione | $0.60/1M | EUR 0.56/1M | ~EUR 0.00000056/invocazione |
| CPU time | $0.128/CPU-h | EUR 0.119/CPU-h | Solo durante esecuzione codice |
| Memory | $0.0106/GB-h | EUR 0.0098/GB-h | Per durata istanza |
| **Incluso nel Pro** | 1.000 GB-h/mese | | ~50.000 sync/mese senza overage |

Stima per singolo sync (1 invocazione, ~2s CPU, 256MB RAM):

```
CPU:         2s / 3600 * EUR 0.119              = EUR 0.0000661
Memory:      2s / 3600 * 0.256GB * EUR 0.0098   = EUR 0.0000014
Invocazione: EUR 0.56 / 1.000.000               = EUR 0.0000006
                                         TOTALE  = EUR 0.00007/sync
```

### 1.4 Costo storage (Supabase)

| Volume | Size raw | Size con embedding (1024d) | Costo mensile | Note |
|--------|----------|---------------------------|---------------|------|
| 1 record | ~2 KB | ~6 KB | EUR 0 | — |
| 1.000 record | ~2 MB | ~6 MB | EUR 0 | Entro piano Free (500MB) |
| 10.000 record | ~20 MB | ~60 MB | EUR 0 | Entro piano Free |
| 100.000 record | ~200 MB | ~600 MB | EUR 0 | Entro Pro (8GB) |
| 1.000.000 record | ~2 GB | ~6 GB | EUR 0 | Entro Pro (8GB) |
| >8 GB | — | — | EUR 0.11/GB extra | Overage Supabase Pro |

**Risultato**: lo storage non e un driver di costo significativo fino a ~1.3 milioni di record con embeddings (soglia 8GB Pro).

### 1.5 Costo AI field mapping per tier

L'AI field mapping usa un modello LLM per trasformare i campi del sistema sorgente nel formato target di controlla.me, gestire mapping complessi (es. "ragione_sociale" di Fatture in Cloud -> campo `company_name` interno) e validare la coerenza dei dati.

**Stima token per singolo record**: ~500 token input (schema sorgente + record + istruzioni), ~200 token output (record mappato).

Prezzi da `lib/models.ts` e `docs/MODEL-CENSUS.md`:

| Tier | Modello primario | Input/1M tok (USD) | Output/1M tok (USD) | Costo/record (EUR) | Costo/1K record (EUR) |
|------|-----------------|-------------------|--------------------|--------------------|----------------------|
| **Intern** | Groq Llama 4 Scout | $0.11 | $0.34 | EUR 0.00011 | **EUR 0.11** |
| **Associate** | Gemini 2.5 Flash | $0.15 | $0.60 | EUR 0.00018 | **EUR 0.18** |
| **Partner** | Claude Haiku 4.5 | $1.00 | $5.00 | EUR 0.0014 | **EUR 1.39** |

Formula per singolo record:
```
costo_mapping = (500 / 1.000.000) * input_cost + (200 / 1.000.000) * output_cost
```

Per **batch processing** (100 record/batch in un singolo prompt, ~50K tok input, ~20K tok output), il costo per record e identico perche i token scalano linearmente.

**Analisi completa di un documento** (la pipeline 4 agenti, non solo mapping):

Per i documenti che vengono auto-analizzati (non solo sincronizzati), il costo sale significativamente perche si attiva la pipeline completa:

| Tier | Costo/analisi (da cost-per-analysis report) | Note |
|------|---------------------------------------------|------|
| Intern | EUR 0.039 | Cerebras, Groq, Mistral free tier |
| Associate | EUR 0.092 | Gemini Flash/Pro, Haiku |
| Partner | EUR 0.236 | Sonnet 4.5, Haiku |

### 1.6 Costo embeddings

Necessario per la ricerca semantica sui documenti sincronizzati (core feature di controlla.me).

| Modello | Costo/1M tok (USD) | Token medi/record | Costo/1K record (EUR) | Free tier |
|---------|-------------------|-------------------|-----------------------|-----------|
| **voyage-law-2** | $0.10 | ~200 | EUR 0.019 | 50M tok (~250K record) |
| voyage-4 | $0.06 | ~200 | EUR 0.011 | 200M tok (~1M record) |
| voyage-4-lite | $0.02 | ~200 | EUR 0.004 | 200M tok (~1M record) |

**Raccomandazione**: usare `voyage-law-2` per documenti legali (specializzato), `voyage-4-lite` per dati generici CRM/fatture.

### 1.7 Formula cost-per-sync completa

```
cost_per_sync(N, tier, with_analysis, with_embeddings) =
    API_call(N)                                            # = EUR 0 per tutti i connettori target
  + compute(N)                                             # = EUR 0.00007 * ceil(N / batch_size)
  + storage_monthly(N)                                     # = EUR 0 fino a 1.3M record
  + AI_mapping(N, tier)                                    # = costo_per_record[tier] * N
  + embeddings(N)                  [se with_embeddings]    # = EUR 0.019/1K * N (voyage-law-2)
  + full_analysis(N, tier)         [se with_analysis]      # = costo_analisi[tier] * N (4 agenti)
```

### 1.8 Stima per volume — Solo sync (mapping + embeddings, SENZA analisi legale completa)

Tier Intern (target: piano Free e Pro):

| Volume | API | Compute | Storage | AI mapping | Embeddings | **Totale** | **Per record** |
|--------|-----|---------|---------|------------|------------|-----------|----------------|
| **1 record** | EUR 0 | EUR 0.00 | EUR 0 | EUR 0.00 | EUR 0.00 | **EUR 0.00** | EUR 0.00013 |
| **100 record** | EUR 0 | EUR 0.01 | EUR 0 | EUR 0.01 | EUR 0.002 | **EUR 0.02** | EUR 0.00020 |
| **1.000 record** | EUR 0 | EUR 0.01 | EUR 0 | EUR 0.11 | EUR 0.019 | **EUR 0.14** | EUR 0.00014 |
| **10.000 record** | EUR 0 | EUR 0.07 | EUR 0 | EUR 1.10 | EUR 0.19 | **EUR 1.36** | EUR 0.00014 |

Tier Partner (target: piano Business/Business+):

| Volume | API | Compute | Storage | AI mapping | Embeddings | **Totale** | **Per record** |
|--------|-----|---------|---------|------------|------------|-----------|----------------|
| **1 record** | EUR 0 | EUR 0.00 | EUR 0 | EUR 0.00 | EUR 0.00 | **EUR 0.00** | EUR 0.0016 |
| **100 record** | EUR 0 | EUR 0.01 | EUR 0 | EUR 0.14 | EUR 0.002 | **EUR 0.15** | EUR 0.0015 |
| **1.000 record** | EUR 0 | EUR 0.01 | EUR 0 | EUR 1.39 | EUR 0.019 | **EUR 1.42** | EUR 0.0014 |
| **10.000 record** | EUR 0 | EUR 0.07 | EUR 0 | EUR 13.90 | EUR 0.19 | **EUR 14.16** | EUR 0.0014 |

### 1.9 Stima per volume — Sync CON analisi legale completa (auto-analisi documenti)

Questa e la feature chiave: ogni documento sincronizzato viene analizzato dalla pipeline 4 agenti AI.

Tier Intern:

| Volume | Sync cost | Analisi cost | **Totale** | **Per documento** |
|--------|----------|-------------|-----------|-------------------|
| **10 doc** | EUR 0.001 | EUR 0.39 | **EUR 0.39** | EUR 0.039 |
| **50 doc/mese** | EUR 0.007 | EUR 1.95 | **EUR 1.96** | EUR 0.039 |
| **200 doc/mese** | EUR 0.03 | EUR 7.80 | **EUR 7.83** | EUR 0.039 |
| **500 doc/mese** | EUR 0.07 | EUR 19.50 | **EUR 19.57** | EUR 0.039 |

Tier Partner:

| Volume | Sync cost | Analisi cost | **Totale** | **Per documento** |
|--------|----------|-------------|-----------|-------------------|
| **10 doc** | EUR 0.015 | EUR 2.36 | **EUR 2.38** | EUR 0.238 |
| **50 doc/mese** | EUR 0.075 | EUR 11.80 | **EUR 11.88** | EUR 0.238 |
| **200 doc/mese** | EUR 0.30 | EUR 47.20 | **EUR 47.50** | EUR 0.238 |
| **500 doc/mese** | EUR 0.75 | EUR 118.00 | **EUR 118.75** | EUR 0.238 |

**Insight critico**: il costo del sync (mapping + storage) e trascurabile (~0.5-1% del totale). Il driver di costo dominante e l'analisi legale AI (99% del costo). Questo significa che il pricing delle integrazioni deve essere calibrato sul numero di documenti auto-analizzati, non sul numero di sync generici.

### 1.10 Costo per fonte corpus gia operativa (riferimento)

| Fonte | Articoli | Embedding | Compute | Totale |
|-------|----------|-----------|---------|--------|
| Codice Civile | 2.969 | EUR 0.33 | EUR 0.28 | **EUR 0.61** |
| Codice del Consumo | 146 | EUR 0.02 | EUR 0.01 | **EUR 0.03** |
| Statuto Lavoratori | 41 | EUR 0.005 | EUR 0.004 | **EUR 0.01** |
| D.Lgs. 81/2008 | 321 | EUR 0.04 | EUR 0.03 | **EUR 0.07** |
| GDPR (EU) | ~99 | EUR 0.01 | EUR 0.01 | **EUR 0.02** |
| EUR-Lex Direttive | ~500 | EUR 0.06 | EUR 0.05 | **EUR 0.10** |
| **Corpus completo (~5.600 art.)** | | | | **EUR 1.14** |

---

## 2. Pricing Tiers for Integration

### 2.1 Struttura pricing — Piani attuali + Integrazione

Il pricing si innesta sui piani esistenti (Free EUR 0, Pro EUR 4.99/mese, Single EUR 0.99) e aggiunge 3 tier dedicati all'integrazione, come raccomandato dalla Strategy Brief (sezione 5.4).

| Piano | Prezzo/mese | Analisi manuali | Doc auto-analizzati/mese | Connettori | Tier AI | Target |
|-------|-------------|-----------------|--------------------------|------------|---------|--------|
| **Free** | EUR 0 | 3/mese | 0 | 0 | Intern | Trial |
| **Pro** (invariato) | EUR 4.99 | Illimitate | 0 | 0 | Associate | Utente singolo |
| **Single** (invariato) | EUR 0.99 (una tantum) | 1 | 0 | 0 | Associate | One-shot |
| **Pro + Integrazione** | EUR 14.99 | Illimitate | 50/mese | 1 connettore | Associate | PMI micro |
| **Business** | EUR 29.99 | Illimitate | 200/mese | 3 connettori | Partner | PMI piccola |
| **Business+** | EUR 49.99 | Illimitate | 500/mese | Tutti | Partner | PMI media, studio legale |
| **Enterprise** | Su preventivo | Illimitate | Illimitati | Tutti + custom | Partner + SLA | PMI strutturata |

### 2.2 Dettaglio feature per piano

| Feature | Free | Pro | Pro+Int | Business | Business+ | Enterprise |
|---------|------|-----|---------|----------|-----------|------------|
| Analisi manuali | 3/mese | Illimitate | Illimitate | Illimitate | Illimitate | Illimitate |
| Deep search AI | 1 | Illimitate | Illimitate | Illimitate | Illimitate | Illimitate |
| Doc auto-analizzati | 0 | 0 | 50/mese | 200/mese | 500/mese | Illimitati |
| Connettori attivi | 0 | 0 | 1 | 3 | Tutti | Tutti + custom |
| Frequenza sync | — | — | Ogni 15 min | Ogni 5 min | Ogni 1 min | Real-time webhook |
| AI mapping tier | — | — | Associate | Partner | Partner | Partner |
| Storico documenti | — | 30 gg | 30 gg | 90 gg | 180 gg | 1 anno |
| Corpus legislativo | Read-only | Read-only | Read-only | Read + export | Read + export | Completo |
| API access | No | No | No | Read-only | Full CRUD | Full + custom |
| Utenti | 1 | 1 | 1 | Fino a 5 | Fino a 10 | Illimitati |
| Audit trail | No | No | No | Si | Si + compliance | Si + GDPR report |
| Supporto | Community | Email (48h) | Email (48h) | Email (24h) | Prioritario (12h) | Dedicato + SLA |

### 2.3 Overage pricing

Quando un utente supera il limite di documenti auto-analizzati inclusi nel piano:

| Piano | Costo per doc extra | Max doc extra/mese | Note |
|-------|--------------------|--------------------|------|
| Free | Non disponibile (upgrade) | — | — |
| Pro | EUR 0.99 (Single) | 1 alla volta | Solo analisi manuale |
| Pro + Integrazione | EUR 0.25/doc | 100 | ~2.5x il costo interno Associate |
| Business | EUR 0.15/doc | 500 | ~0.6x il costo interno Partner |
| Business+ | EUR 0.10/doc | Illimitati | Volume discount |
| Enterprise | Contrattuale | Illimitati | — |

### 2.4 Confronto competitor

| Piattaforma | Free | Piano entry | Piano mid | Piano top | Unita misura | Analisi AI legale |
|-------------|------|-----------|-----------|-----------|-------------|-------------------|
| **Zapier** | 100 task/mese | EUR 19.99/mese (750 task) | EUR 69/mese (2K task) | Custom | Task (azione) | No |
| **Make.com** | 1K ops/mese | EUR 9/mese (10K ops) | EUR 16/mese (10K ops) | EUR 29/mese | Operazione | No |
| **n8n Cloud** | — | EUR 24/mese (2.5K exec) | EUR 60/mese (10K exec) | EUR 800/mese | Esecuzione | No |
| **n8n Self-hosted** | Illimitato | — | — | — | N/A | No |
| **Controlla.me** | 3 analisi | EUR 14.99/mese (50 doc) | EUR 29.99/mese (200 doc) | EUR 49.99/mese (500 doc) | Documento analizzato | **Si, 4 agenti AI** |

**Vantaggi competitivi di pricing:**

1. **Entry point piu basso**: EUR 14.99 vs EUR 19.99 (Zapier) con analisi AI inclusa
2. **Value proposition unica**: nessun competitor include analisi legale AI nel prezzo
3. **Costo per valore**: un consulente legale costa EUR 100-300 per contratto. A EUR 29.99/mese per 200 analisi, il costo e EUR 0.15/doc -- 1.000x meno di un consulente
4. **Connettori italiani nativi**: Fatture in Cloud, Zucchetti HR -- nessun competitor li offre
5. **Corpus normativo incluso**: 5.600+ articoli IT+EU, valore del database: ~EUR 100K se dovesse essere costruito da zero
6. **Nessun lock-in**: dati su PostgreSQL standard (Supabase), export sempre possibile

### 2.5 Posizionamento di mercato

```
     Prezzo/mese (EUR)
EUR 800 |                                    n8n Enterprise
        |
EUR 100 |          Zapier Team    LegalSifter
        |  Zapier Pro                Juro
        |
EUR  50 |  ★ Controlla.me Business+
EUR  30 |  n8n Pro    ★ Controlla.me Business
EUR  16 |              Make Pro
EUR  15 |  ★ Controlla.me Pro+Int
EUR  10 |              Make Core
EUR   5 |  ★ Controlla.me Pro
        |
EUR   0 |  ★ Controlla.me Free     n8n self-hosted
        +─────────────────────────────────────────────
          iPaaS generici      |    LegalTech verticale
```

---

## 3. Unit Economics

### 3.1 Costo e margine per piano

Ipotesi di utilizzo medio mensile per utente:

| Metrica | Pro+Int | Business | Business+ |
|---------|---------|----------|-----------|
| Doc auto-analizzati/mese | 30 (di 50 inclusi) | 120 (di 200) | 350 (di 500) |
| Sync generici/mese (no analisi) | 500 | 2.000 | 5.000 |
| Tier AI usato | Associate | Partner | Partner |
| Costo/doc auto-analizzato | EUR 0.092 | EUR 0.236 | EUR 0.236 |
| Costo/sync generico | EUR 0.00018 | EUR 0.0014 | EUR 0.0014 |

| Voce | Pro+Int (EUR 14.99) | Business (EUR 29.99) | Business+ (EUR 49.99) |
|------|---------------------|----------------------|-----------------------|
| **Revenue/utente/mese** | **EUR 14.99** | **EUR 29.99** | **EUR 49.99** |
| Costo analisi AI (doc auto) | EUR 2.76 | EUR 28.32 | EUR 82.60 |
| Costo sync generici | EUR 0.09 | EUR 2.80 | EUR 7.00 |
| Costo embeddings | EUR 0.01 | EUR 0.04 | EUR 0.07 |
| Costo infra ammortizzato | EUR 0.20 | EUR 0.20 | EUR 0.20 |
| **Costo totale/utente/mese** | **EUR 3.06** | **EUR 31.36** | **EUR 89.87** |
| **Margine lordo** | **EUR 11.93 (80%)** | **EUR -1.37 (-5%)** | **EUR -39.88 (-80%)** |

**ATTENZIONE**: Il Business e il Business+ hanno margine negativo con utilizzo medio al tier Partner. Questo e un problema critico.

### 3.2 Analisi di sensibilita del margine

Il margine dipende criticamente dal **tier AI** e dall'**utilizzo medio**:

| Piano | Se usa 20% del limite | Se usa 60% del limite | Se usa 100% del limite |
|-------|----------------------|----------------------|------------------------|
| **Pro+Int** (Associate, 50 doc) | EUR 13.15 (88%) | EUR 10.47 (70%) | EUR 7.89 (53%) |
| **Business** (Partner, 200 doc) | EUR 20.56 (69%) | EUR -1.37 (-5%) | EUR -17.21 (-57%) |
| **Business** (Associate, 200 doc) | EUR 25.80 (86%) | EUR 18.96 (63%) | EUR 12.02 (40%) |
| **Business+** (Partner, 500 doc) | EUR 26.36 (53%) | EUR -39.88 (-80%) | EUR -67.81 (-136%) |
| **Business+** (Associate, 500 doc) | EUR 40.80 (82%) | EUR 22.60 (45%) | EUR 4.41 (9%) |

### 3.3 Correzione raccomandata: Business/Business+ con tier Associate (non Partner)

Per mantenere margini sani, il tier Partner dovrebbe essere riservato solo all'Enterprise (su preventivo, dove il pricing copre i costi). La proposta rivista:

| Piano | Tier AI | Margine @ 60% utilizzo | Margine @ 100% utilizzo |
|-------|---------|------------------------|-------------------------|
| Pro + Integrazione | Associate | EUR 10.47 (70%) | EUR 7.89 (53%) |
| **Business** | **Associate** | **EUR 18.96 (63%)** | **EUR 12.02 (40%)** |
| **Business+** | **Associate** | **EUR 22.60 (45%)** | **EUR 4.41 (9%)** |
| Enterprise | Partner | Contrattuale (margine target > 30%) | — |

Con questa correzione, tutti i piani hanno margine positivo anche al 100% di utilizzo. Il Business+ al 100% ha margine basso (9%) ma il pattern reale mostra che l'utilizzo medio e tipicamente 50-70% del limite.

### 3.4 CAC (Customer Acquisition Cost)

| Canale | CAC stimato | Volume/mese | % del totale | Note |
|--------|------------|-------------|-------------|------|
| Organico (SEO blog legale) | EUR 0 | 300-800 | 60% | 6 articoli blog gia presenti |
| Social/community (LinkedIn, forum legali IT) | EUR 2-5 | 50-200 | 15% | — |
| Google Ads ("analisi contratto AI", "compliance PMI") | EUR 15-25 | 100-300 | 20% | CPC medio IT ~EUR 1.50 |
| Referral avvocati | EUR 5-10 | 20-50 | 5% | Da attivare (tabella lawyer_referrals esiste) |
| **CAC medio ponderato** | **EUR 3-8** | — | — | |

### 3.5 LTV (Lifetime Value)

| Piano | ARPU/mese | Churn mensile | Vita media (1/churn) | LTV | LTV/CAC (CAC=EUR 5) |
|-------|----------|---------------|---------------------|-----|---------------------|
| **Pro** | EUR 4.99 | 5-8% | 12-20 mesi | EUR 60-100 | 12-20x |
| **Pro + Integrazione** | EUR 14.99 | 4-6% | 17-25 mesi | EUR 255-375 | 51-75x |
| **Business** | EUR 29.99 | 3-5% | 20-33 mesi | EUR 600-990 | 120-198x |
| **Business+** | EUR 49.99 | 2-4% | 25-50 mesi | EUR 1.250-2.500 | 250-500x |
| **Single** | EUR 0.99 | 100% (one-shot) | 1 | EUR 0.99 | 0.20x |

**Note LTV**:
- Churn atteso piu basso per piani integrazione: gli utenti hanno i propri dati connessi al sistema (switching cost elevato)
- LTV/CAC > 3x: tutti i piani subscription superano ampiamente la soglia di salute
- Il Single e sotto soglia (0.20x) ma serve come lead generation per upgrade

### 3.6 Payback period

| Piano | Revenue/mese | Costo/utente/mese | CAC (EUR 5) | Payback |
|-------|-------------|-------------------|-------------|---------|
| Pro | EUR 4.99 | EUR 1.20 | EUR 5 | **1.3 mesi** |
| Pro + Integrazione | EUR 14.99 | EUR 3.06 | EUR 5 | **0.4 mesi** |
| Business | EUR 29.99 | EUR 8.10* | EUR 5 | **0.2 mesi** |
| Business+ | EUR 49.99 | EUR 14.20* | EUR 5 | **0.1 mesi** |

*Con tier Associate e utilizzo medio 60%.

Payback sotto 2 mesi per tutti i piani -- eccellente. Il CAC basso (organico al 60%) e il principale driver.

### 3.7 Break-even point (numero minimo di utenti paganti)

Costi fissi mensili:

| Voce | EUR/mese |
|------|----------|
| Vercel Pro | EUR 18.50 |
| Supabase Pro | EUR 23.15 |
| Dominio + SSL | EUR 1.85 |
| Voyage AI (oltre free tier) | EUR 0-9.25 |
| **Totale fisso** | **EUR 43.50-52.75** |

Break-even per mix di utenti (EUR 50/mese di costi fissi):

| Scenario | Mix utenti | Revenue/mese | Costi var./mese | **Utenti totali per break-even** |
|----------|-----------|-------------|----------------|----------------------------------|
| Solo Pro | 100% Pro | EUR 4.99/ut | EUR 1.20/ut | **14 utenti Pro** |
| Solo Pro+Int | 100% Pro+Int | EUR 14.99/ut | EUR 3.06/ut | **5 utenti Pro+Int** |
| Mix realistico | 60% Pro, 30% Pro+Int, 10% Business | EUR 10.94/ut | EUR 2.80/ut | **7 utenti misti** |

**Conclusione**: break-even raggiungibile con 5-14 utenti paganti. Con conversion rate 5% dal Free, servono 100-280 utenti Free registrati.

---

## 4. Revenue Projections (M1-M12)

### 4.1 Assunzioni

| Parametro | Pessimistico | Base | Ottimistico |
|-----------|-------------|------|-------------|
| Utenti Free registrati (M12) | 1.500 | 5.000 | 15.000 |
| Crescita Free/mese (lineare) | 125 | 417 | 1.250 |
| Free -> Pro (%) | 3% | 5% | 8% |
| Free -> Pro+Int (%) | 1% | 2% | 4% |
| Free -> Business (%) | 0.2% | 0.5% | 1% |
| Free -> Business+ (%) | 0% | 0.1% | 0.3% |
| Churn Pro (mensile) | 8% | 5% | 3% |
| Churn Pro+Int (mensile) | 6% | 4% | 2.5% |
| Churn Business (mensile) | 5% | 3% | 2% |
| Churn Business+ (mensile) | 3% | 2% | 1.5% |
| Single acquisti/mese | 10 | 30 | 80 |

**Note sulle assunzioni:**
- I piani integrazione (Pro+Int, Business, Business+) sono disponibili da M4 (Fase 1 MVP completata)
- M1-M3: solo piani attuali (Free, Pro, Single)
- La crescita e lineare (non esponenziale) -- conservativo per un prodotto early-stage senza investimenti marketing significativi

### 4.2 Revenue Mix: analisi legale + integrazione

| Mese | Revenue da piani base (Pro+Single) | Revenue da integrazione (Pro+Int, Biz, Biz+) | % integrazione |
|------|-----------------------------------|----------------------------------------------|----------------|
| M1-M3 | 100% | 0% (non ancora live) | 0% |
| M6 | ~60% | ~40% | 40% |
| M9 | ~40% | ~60% | 60% |
| M12 | ~30% | ~70% | 70% |

### 4.3 MRR Proiezione — Scenario Pessimistico

| Mese | Free | Pro | Pro+Int | Biz | Biz+ | Single (cum) | **MRR** | Costi | **Net** |
|------|------|-----|---------|-----|------|-------------|---------|-------|---------|
| 1 | 125 | 4 | — | — | — | 10 | EUR 29.86 | EUR 55 | EUR -25 |
| 3 | 375 | 11 | — | — | — | 30 | EUR 84.79 | EUR 58 | EUR 27 |
| 6 | 750 | 23 | 8 | 2 | 0 | 60 | EUR 294.53 | EUR 75 | EUR 220 |
| 9 | 1.125 | 34 | 11 | 2 | 0 | 90 | EUR 394.47 | EUR 85 | EUR 309 |
| 12 | 1.500 | 45 | 15 | 3 | 0 | 120 | EUR 538.71 | EUR 100 | EUR 439 |

### 4.4 MRR Proiezione — Scenario Base

| Mese | Free | Pro | Pro+Int | Biz | Biz+ | Single (cum) | **MRR** | Costi | **Net** |
|------|------|-----|---------|-----|------|-------------|---------|-------|---------|
| 1 | 417 | 21 | — | — | — | 30 | EUR 134.49 | EUR 60 | EUR 74 |
| 3 | 1.251 | 63 | — | — | — | 90 | EUR 403.47 | EUR 75 | EUR 328 |
| 6 | 2.502 | 125 | 50 | 13 | 3 | 180 | EUR 1.722.72 | EUR 200 | EUR 1.523 |
| 9 | 3.753 | 188 | 75 | 19 | 4 | 270 | EUR 2.540.67 | EUR 320 | EUR 2.221 |
| 12 | 5.004 | 250 | 100 | 25 | 5 | 360 | EUR 3.462.77 | EUR 480 | EUR 2.983 |

### 4.5 MRR Proiezione — Scenario Ottimistico

| Mese | Free | Pro | Pro+Int | Biz | Biz+ | Single (cum) | **MRR** | Costi | **Net** |
|------|------|-----|---------|-----|------|-------------|---------|-------|---------|
| 1 | 1.250 | 100 | — | — | — | 80 | EUR 578.20 | EUR 80 | EUR 498 |
| 3 | 3.750 | 300 | — | — | — | 240 | EUR 1.734.60 | EUR 180 | EUR 1.555 |
| 6 | 7.500 | 600 | 300 | 75 | 23 | 480 | EUR 9.593.67 | EUR 900 | EUR 8.694 |
| 9 | 11.250 | 900 | 450 | 113 | 34 | 720 | EUR 14.353.09 | EUR 1.500 | EUR 12.853 |
| 12 | 15.000 | 1.200 | 600 | 150 | 45 | 960 | EUR 19.450.65 | EUR 2.200 | EUR 17.251 |

### 4.6 P&L Riepilogo Annuale

| Voce | Pessimistico | Base | Ottimistico |
|------|-------------|------|-------------|
| **Revenue MRR cumulato (12 mesi)** | EUR 2.400 | EUR 14.600 | EUR 55.000 |
| **Revenue Single (12 mesi)** | EUR 119 | EUR 356 | EUR 950 |
| **Revenue totale** | **EUR 2.519** | **EUR 14.956** | **EUR 55.950** |
| | | | |
| Costi infrastruttura (fissi, 12 mesi) | -EUR 578 | -EUR 578 | -EUR 578 |
| Costi API AI (variabili) | -EUR 420 | -EUR 2.500 | -EUR 9.000 |
| Costi sviluppo connettori (capex) | -EUR 2.200 | -EUR 5.900 | -EUR 8.300 |
| Costi marketing (Google Ads) | EUR 0 | -EUR 1.100 | -EUR 3.300 |
| **Costi totali** | **-EUR 3.198** | **-EUR 10.078** | **-EUR 21.178** |
| | | | |
| **Margine operativo** | **-EUR 679** | **EUR 4.878** | **EUR 34.772** |
| **Margine %** | -27% | 33% | 62% |

### 4.7 Break-even timeline

| Scenario | Mese break-even MRR | Mese break-even cumulativo (incl. capex) | Condizione |
|----------|---------------------|------------------------------------------|------------|
| **Pessimistico** | Mese 5 (MRR > costi mensili) | ~Mese 18 (capex ammortizzato) | Crescita lenta, 1.500 Free a M12 |
| **Base** | Mese 2 | ~Mese 8 | 5.000 Free a M12, buon conversion |
| **Ottimistico** | Mese 1 | ~Mese 4 | Crescita rapida, 15.000 Free a M12 |

---

## 5. ROI per Connector

### 5.1 Costo sviluppo per tipo di connettore

Basato sull'esperienza del Data Engineering department con la pipeline CONNECT-MODEL-LOAD (6 connettori operativi):

| Tipo | Complessita | Effort dev | Costo dev (@ EUR 370/giorno) | Esempi |
|------|------------|-----------|------------------------------|--------|
| **Simple** (API REST standard, auth API key) | Bassa | 2-3 giorni | EUR 740-1.110 | Slack, WooCommerce |
| **Medium** (API REST + OAuth2 per-utente) | Media | 3-5 giorni | EUR 1.110-1.850 | Google Drive, HubSpot, Shopify |
| **Complex** (API non standard, partnership, locale IT) | Alta | 5-8 giorni | EUR 1.850-2.960 | Fatture in Cloud, Zucchetti HR, SharePoint |

Costo aggiuntivo per ogni connettore:
- **Test e QA**: +1 giorno (EUR 370)
- **Documentazione + UI wizard**: +0.5 giorno (EUR 185)
- **Totale overhead**: ~EUR 555/connettore

### 5.2 Costo totale stimato per connettore (allineato a RICE Strategy Brief)

| # RICE | Connettore | Tipo | Dev cost | Overhead | **Costo totale** | Fase |
|--------|-----------|------|---------|---------|-------------------|------|
| 1 | **Fatture in Cloud** | Complex | EUR 2.220 | EUR 555 | **EUR 2.775** | MVP (Fase 1) |
| 2 | **Google Drive** | Medium | EUR 1.480 | EUR 555 | **EUR 2.035** | MVP (Fase 1) |
| 3 | **HubSpot** | Medium | EUR 1.480 | EUR 555 | **EUR 2.035** | MVP (Fase 1) |
| 4 | **Shopify** | Medium | EUR 1.480 | EUR 555 | **EUR 2.035** | Fase 2 |
| 5 | **Zucchetti HR** | Complex | EUR 2.590 | EUR 555 | **EUR 3.145** | Fase 2 |
| 6 | **Slack** | Simple | EUR 740 | EUR 555 | **EUR 1.295** | Fase 2 |
| 7 | **Salesforce** | Medium | EUR 1.850 | EUR 555 | **EUR 2.405** | Fase 3 |
| 8 | **WooCommerce** | Simple | EUR 740 | EUR 555 | **EUR 1.295** | Fase 3 |
| 9 | **Microsoft Teams** | Medium | EUR 1.850 | EUR 555 | **EUR 2.405** | Fase 3 |
| 10 | **SharePoint** | Complex | EUR 2.220 | EUR 555 | **EUR 2.775** | Fase 3 |

**Investimento totale top 10**: EUR 22.200
**Investimento MVP (top 3)**: EUR 6.845
**Investimento Fase 2 (top 6)**: EUR 13.320

### 5.3 Expected adoption rate per connettore

Stime basate su penetrazione nel target PMI italiane e RICE score:

| # | Connettore | RICE | % utenti Pro+Int che lo usano | % utenti Business che lo usano | Driver di adozione |
|---|-----------|------|------------------------------|-------------------------------|-------------------|
| 1 | **Fatture in Cloud** | 216.0 | 60% | 80% | Ogni PMI IT emette fatture. Obbligatorio. |
| 2 | **Google Drive** | 168.0 | 50% | 70% | Google Workspace ubiquo. Zero friction. |
| 3 | **HubSpot** | 126.0 | 25% | 50% | Free CRM diffuso, ma non ubiquo tra micro-PMI |
| 4 | **Shopify** | 94.5 | 15% | 35% | Solo PMI con e-commerce |
| 5 | **Zucchetti HR** | 64.0 | 10% | 30% | Solo PMI con dipendenti + Zucchetti |
| 6 | **Slack** | 60.0 | 20% | 40% | Notifiche, non dati core. Adoption laterale |
| 7 | **Salesforce** | 45.7 | 5% | 20% | Solo PMI medie-grandi |
| 8 | **WooCommerce** | 42.0 | 10% | 20% | PMI tech-savvy con WordPress |
| 9 | **Teams** | 42.0 | 15% | 35% | M365 diffuso ma Graph API complessa |
| 10 | **SharePoint** | 40.8 | 5% | 25% | Solo PMI con M365 strutturato |

### 5.4 Revenue attribution per connettore

Ipotesi: ogni connettore contribuisce proporzionalmente al suo tasso di adozione nella conversione Free -> piani integrazione. Revenue attribuito = (adoption_rate * revenue_integrazione).

**Scenario Base (M12): 100 utenti Pro+Int + 25 Business + 5 Business+ = EUR 3.212/mese MRR integrazione**

| # | Connettore | Revenue attribuito/mese | Revenue attribuito/anno | Costo dev | **Break-even** | **ROI 12 mesi** |
|---|-----------|------------------------|------------------------|-----------|----------------|-----------------|
| 1 | **Fatture in Cloud** | EUR 674 (21%) | EUR 8.088 | EUR 2.775 | **4.1 mesi** | **+192%** |
| 2 | **Google Drive** | EUR 578 (18%) | EUR 6.936 | EUR 2.035 | **3.5 mesi** | **+241%** |
| 3 | **HubSpot** | EUR 353 (11%) | EUR 4.236 | EUR 2.035 | **5.8 mesi** | **+108%** |
| 4 | **Shopify** | EUR 257 (8%) | EUR 3.084 | EUR 2.035 | **7.9 mesi** | **+52%** |
| 5 | **Zucchetti HR** | EUR 225 (7%) | EUR 2.700 | EUR 3.145 | **14.0 mesi** | **-14%** |
| 6 | **Slack** | EUR 289 (9%) | EUR 3.468 | EUR 1.295 | **4.5 mesi** | **+168%** |
| 7 | **Salesforce** | EUR 160 (5%) | EUR 1.920 | EUR 2.405 | **15.0 mesi** | **-20%** |
| 8 | **WooCommerce** | EUR 160 (5%) | EUR 1.920 | EUR 1.295 | **8.1 mesi** | **+48%** |
| 9 | **Teams** | EUR 257 (8%) | EUR 3.084 | EUR 2.405 | **9.4 mesi** | **+28%** |
| 10 | **SharePoint** | EUR 160 (5%) | EUR 1.920 | EUR 2.775 | **17.4 mesi** | **-31%** |

### 5.5 ROI cumulativo per fase

| Fase | Connettori | Investimento totale | Revenue/anno attribuito | ROI 12 mesi |
|------|-----------|--------------------|-----------------------|-------------|
| **MVP (Fase 1)** | Fatture in Cloud + Google Drive + HubSpot | EUR 6.845 | EUR 19.260 | **+181%** |
| **Fase 2** | + Shopify + Zucchetti HR + Slack | EUR 13.320 | EUR 28.512 | **+114%** |
| **Fase 3** | + Salesforce + WooCommerce + Teams + SharePoint | EUR 22.200 | EUR 37.356 | **+68%** |

### 5.6 Prioritizzazione raccomandata (RICE x ROI)

| Rank | Connettore | RICE | ROI 12m | Score composito | Raccomandazione |
|------|-----------|------|---------|-----------------|-----------------|
| **1** | **Google Drive** | 168.0 | +241% | **10/10** | MVP -- massimo ROI, basso effort, ubiquo |
| **2** | **Fatture in Cloud** | 216.0 | +192% | **10/10** | MVP -- killer feature per PMI IT, RICE #1 |
| **3** | **Slack** | 60.0 | +168% | **8/10** | Fase 2 -- ROI altissimo per basso effort |
| **4** | **HubSpot** | 126.0 | +108% | **9/10** | MVP -- RICE alto, solido ROI |
| **5** | **Shopify** | 94.5 | +52% | **7/10** | Fase 2 -- buon ROI, nichia e-commerce |
| **6** | **WooCommerce** | 42.0 | +48% | **6/10** | Fase 2/3 -- basso effort compensa basso RICE |
| **7** | **Teams** | 42.0 | +28% | **5/10** | Fase 3 -- effort medio, RICE basso |
| **8** | **Zucchetti HR** | 64.0 | -14% | **5/10** | Fase 2 -- RICE alto ma effort alto, partnership necessaria |
| **9** | **Salesforce** | 45.7 | -20% | **4/10** | Fase 3 -- solo Enterprise |
| **10** | **SharePoint** | 40.8 | -31% | **3/10** | Fase 3 -- ROI negativo, solo Enterprise |

**Nota sulla discrepanza RICE vs ROI per Zucchetti HR**: il RICE score e alto (64.0) per il reach nel target HR, ma il ROI a 12 mesi e negativo perche il costo di sviluppo e alto (API non pubblica, partnership necessaria). La raccomandazione e: negoziare la partnership con Zucchetti PRIMA di iniziare lo sviluppo per ridurre incertezza e effort.

---

## 6. Risk Factors

### 6.1 Provider API pricing changes

| Rischio | Probabilita | Impatto | Scenario | Mitigazione |
|---------|------------|---------|----------|-------------|
| **AI provider aumenta prezzi** (Anthropic, Google) | Media | Alto | Sonnet passa da $3/$15 a $5/$25 (come Opus) | Catena N-fallback su 7 provider gia operativa. Switch a tier Associate/Intern automatico. Impatto: costo/analisi Partner sale da EUR 0.236 a ~EUR 0.40 |
| **AI provider rimuove free tier** (Groq, Cerebras, Mistral) | Bassa | Medio | Groq elimina 1.000 req/day free | 7 provider = ridondanza. Se uno elimina free tier, gli altri 6 coprono. Impatto: tier Intern diventa piu costoso (~EUR 0.01/analisi vs ~EUR 0 attuale) |
| **Connettore cambia API** (breaking change) | Media | Medio | HubSpot v4 depreca v3 | Versioning connettori (gia nel design pipeline). Health check automatici. Budget manutenzione: ~EUR 370/connettore/anno |
| **Voyage AI cambia pricing embeddings** | Bassa | Basso | Prezzo voyage-law-2 raddoppia | Embeddings sono ~1% del costo totale. Alternative: voyage-4-lite (EUR 0.004/1K record), OpenAI text-embedding-3-small (EUR 0.02/1M tok) |
| **Fatture in Cloud limita API** | Bassa | Alto | TeamSystem impone pricing API o limita rate | Contattare TeamSystem per partnership tecnica (nel piano Go-to-Market). API marketplace gia esistente = segnale positivo |

**Impatto aggregato stimato (worst case)**: se tutti i provider AI raddoppiassero i prezzi simultaneamente, il costo per analisi raddoppierebbe (da EUR 0.092 a EUR 0.184 per Associate). Il margine del Pro+Int scenderebbe dal 80% al 60% -- ancora sano. Il Business passerebbe dal 63% al 25% -- necessario adeguamento pricing (EUR +5-10/mese).

### 6.2 Free tier abuse / Rate limiting costs

| Rischio | Probabilita | Impatto | Scenario | Mitigazione |
|---------|------------|---------|----------|-------------|
| **Utenti Free creano account multipli** | Media | Medio | Stesso utente con 10 email = 30 analisi gratis/mese | Rate limit per IP gia implementato (checkRateLimit). Fingerprinting browser. Flag Supabase Auth per pattern sospetti |
| **API scraping** (bot che usano l'API programmaticamente) | Bassa | Alto | Bot che eseguono 1.000+ analisi/giorno via API | CSRF check gia attivo su tutte le POST route. Rate limit per IP (5 req/min su /api/analyze). Captcha opzionale |
| **Utenti Pro+Int al 100% del limite ogni mese** | Media | Basso | 50/50 doc analizzati ogni mese = costo pieno | Margine ancora positivo (53% @ 100% utilizzo Associate). Monitorare e considerare overage automatico |
| **Free tier provider AI esauriti da volume** | Media | Medio | 5.000 utenti Free x 3 analisi/mese = 15.000 analisi. Groq free = 1.000 req/day, insufficiente | Fallback chain gia operativa: se Groq esaurito, cade su Cerebras (24M tok/day), poi Mistral (2 RPM). Costo marginale per analisi: EUR 0.00-0.04 |

**Costo stimato free tier abuse**: nel caso peggiore (10% degli utenti Free sono abusivi), il costo aggiuntivo e ~EUR 50-100/mese nello scenario Base. Gestibile con le mitigazioni gia in atto.

### 6.3 Support costs scaling

| Volume utenti | Ticket stimati/mese | Tempo/ticket | Costo stimato/mese | % del revenue |
|--------------|--------------------|--------------|--------------------|---------------|
| 0-500 Free | 5-10 | 15 min | EUR 0 (founder gestisce) | 0% |
| 500-2.000 Free | 10-30 | 15 min | EUR 0 (founder + community) | 0% |
| 2.000-5.000 Free | 30-80 | 15 min | EUR 400-800 (part-time support) | 5-10% |
| 5.000-15.000 Free | 80-200 | 15 min | EUR 1.500-2.500 (1 FT support) | 8-15% |

**Mitigazioni**:
- Knowledge base / FAQ self-service (costo: EUR 0, gia implementabile con blog)
- Chatbot AI per supporto tier 1 (gia abbiamo l'infrastruttura -- riutilizziamo corpus-agent)
- Community forum per utenti Free (EUR 0)
- Support email solo per Pro+Int, Business, Business+

### 6.4 Churn analysis

| Piano | Churn atteso (mensile) | Motivi principali | Intervento |
|-------|----------------------|-------------------|-----------|
| **Pro** (EUR 4.99) | 5-8% | Basso valore percepito, non abbastanza sticky | Integrazioni come upsell (Pro+Int). Engagement email. Feature teasing |
| **Pro + Integrazione** (EUR 14.99) | 4-6% | Connettore non funziona come atteso. Troppo pochi doc/mese | Feedback loop durante beta. UX wizard chiaro. Expansion path a Business |
| **Business** (EUR 29.99) | 3-5% | Costo percepito alto per PMI micro. Feature non usate | Trial period 14 giorni. Billing annuale con sconto 20% (EUR 287.90/anno = EUR 24/mese) |
| **Business+** (EUR 49.99) | 2-4% | Solo se cambiano esigenze o chiudono attivita | Account manager per retention. Review trimestrale. Custom features |

**Churn naturale vs evitabile**:
- **Naturale** (~30% del churn): chiusura attivita, cambio di esigenze, fusioni/acquisizioni. Non mitigabile.
- **Evitabile** (~70% del churn): UX insufficiente, feature mancanti, supporto lento, bug connettori. Mitigabile con: QA automatica, feedback loop, SLA di risposta.

**Cohort analysis target**: misurare retention a 30/60/90 giorni per ogni piano e ogni connettore. Se un connettore ha retention < 50% a 30 giorni, e un segnale di UX/reliability issues.

### 6.5 Rischi regolamentari

| Rischio | Probabilita | Impatto | Timeline | Mitigazione |
|---------|------------|---------|----------|-------------|
| **EU AI Act** (agosto 2026) | Certa | Alto | 5 mesi | Audit log gia implementato. Human-in-the-loop (CTA avvocato). Documentazione tecnica conforme. Costo compliance: EUR 5.000-10.000 (consulente) |
| **GDPR per dati PMI** | Alta | Critico | Immediato | Processamento in-memory, no storage raw documents. DPA con AI providers obbligatorio pre-lancio. Costo: EUR 2.000-5.000 (DPA legal review) |
| **Fatturazione elettronica** (evoluzione normativa) | Bassa | Medio | 12+ mesi | Monitorare Agenzia delle Entrate. Connettore Fatture in Cloud e un wrapper, non accesso diretto SDI |

### 6.6 Rischi competitivi

| Rischio | Probabilita | Impatto | Mitigazione |
|---------|------------|---------|-------------|
| **Zapier/Make aggiungono AI legale** | Bassa (12-18 mesi) | Alto | First-mover + corpus 5.600 articoli + connettori IT nativi = moat di 12+ mesi. La localizzazione normativa italiana e costosa da replicare |
| **Startup italiana copia il modello** | Media (6-12 mesi) | Medio | Velocita di esecuzione. Network effect (knowledge base migliora con l'uso). Brevetto non applicabile (metodo software) |
| **LegalTech enterprise scende nel segmento PMI** | Bassa | Alto | Pricing 10-100x inferiore (EUR 14.99 vs EUR 800+ /mese). Semplicita UX. Connettori italiani nativi |

---

## 7. Raccomandazioni

### 7.1 Azioni immediate (Q2 2026 -- pre-lancio integrazione)

1. **Confermare tier Associate (non Partner) per Business/Business+** -- margine negativo con Partner al 60%+ di utilizzo. Partner riservato a Enterprise con pricing custom
2. **Sviluppare MVP (top 3 RICE)**: Google Drive + Fatture in Cloud + HubSpot. Investimento: EUR 6.845. ROI cumulativo: +181% a 12 mesi
3. **Pricing entry EUR 14.99/mese** con 50 doc auto-analizzati e 1 connettore -- sotto il punto prezzo psicologico di Zapier (EUR 19.99)
4. **Billing annuale con sconto 20%** per ridurre churn: Pro+Int EUR 143.90/anno, Business EUR 287.90/anno, Business+ EUR 479.90/anno

### 7.2 Azioni medio termine (Q3-Q4 2026 -- post-beta)

5. **Espandere a Fase 2**: Slack (EUR 1.295, ROI +168%), Shopify (EUR 2.035, ROI +52%), poi Zucchetti HR solo dopo partnership confermata
6. **Implementare overage billing** (EUR 0.25/doc per Pro+Int, EUR 0.15/doc per Business) -- revenue incrementale senza churn
7. **Monitorare metriche chiave**: LTV/CAC > 3x (alert sotto 2x), margine lordo > 40% (alert sotto 25%), churn < 5% (alert sopra 8%)
8. **Attivare programma referral avvocati** -- CAC EUR 5-10 vs EUR 15-25 Google Ads

### 7.3 Azioni strategiche (2027)

9. **Enterprise tier** con pricing custom per studi legali strutturati (LTV EUR 1.000-2.500+)
10. **White-label offering** per commercialisti e associazioni di categoria
11. **Billing usage-based ibrido**: abbonamento base + pay-per-analysis per volumi alti

---

## Appendici

### Appendice A -- Costo per analisi per tier (riferimento)

Dettaglio completo in `company/finance/cost-per-analysis-2026-03.md`.

| Tier | Costo/analisi (EUR) | Modelli primari | Free tier? |
|------|---------------------|-----------------|------------|
| Intern | ~EUR 0.039 | Cerebras, Groq, Mistral | Si (250-1000 req/day) |
| Associate | ~EUR 0.092 | Gemini Flash/Pro, Haiku | Parziale (Gemini free) |
| Partner | ~EUR 0.236 | Sonnet 4.5, Haiku | No |

### Appendice B -- Competitor pricing dettagliato

**Zapier (2026):** Free 100 task/mese, Professional EUR 19.99/mese 750 task, Team EUR 69/mese 2K task. Scala fino a EUR 5.999/mese per 2M task. Solo trigger+azione, nessun AI mapping incluso.
Fonte: [zapier.com/pricing](https://zapier.com/pricing)

**Make.com (2026):** Free 1K ops/mese, Core EUR 9/mese 10K crediti, Pro EUR 16/mese 10K crediti, Teams EUR 29/mese 10K crediti. 1 operazione = 1 azione modulo.
Fonte: [make.com/en/pricing](https://www.make.com/en/pricing)

**n8n (2026):** Self-hosted Community gratuito illimitato. Cloud: Starter EUR 24/mese 2.5K exec, Pro EUR 60/mese 10K exec, Enterprise EUR 800/mese illimitato. 1 esecuzione = 1 run workflow intero.
Fonte: [n8n.io/pricing](https://n8n.io/pricing/)

### Appendice C -- Formule utilizzate

```
# Cost per sync (solo mapping, no analisi)
cost_sync(N, tier) = 0 + (N * EUR 0.00007) + 0 + (N * mapping_cost[tier]) + (N * EUR 0.000019)

# Cost per auto-analysis (sync + pipeline 4 agenti)
cost_auto_analysis(N, tier) = cost_sync(N, tier) + (N * analysis_cost[tier])

# LTV
LTV = ARPU_mensile / churn_mensile

# CAC
CAC = (spesa_marketing + spesa_sales) / nuovi_clienti_paganti

# Payback
payback_mesi = CAC / (ARPU_mensile - COGS_mensile)

# Break-even (utenti per coprire costi fissi)
break_even_utenti = costi_fissi_mensili / (ARPU_mensile - COGS_mensile)

# ROI connettore
ROI = (revenue_attribuito_anno - costo_sviluppo) / costo_sviluppo * 100

# Margine lordo per piano
margine = (ARPU - COGS) / ARPU * 100
```

### Appendice D -- Fonti dati

| Dato | Fonte |
|------|-------|
| Costi AI per modello | `lib/models.ts` -- 41 modelli, 7 provider |
| Tier system e fallback | `lib/tiers.ts` -- 3 tier, catene N-fallback |
| Pricing attuale app | `lib/stripe.ts` -- Free EUR 0, Pro EUR 4.99, Single EUR 0.99 |
| Embeddings | `lib/embeddings.ts` -- Voyage AI voyage-law-2 |
| Data connector pipeline | `lib/staff/data-connector/index.ts` |
| Strategy brief integrazioni | `company/strategy/briefs/integration-office-brief.md` |
| RICE scoring connettori | Strategy brief sezione 2 |
| Costo per analisi per tier | `company/finance/cost-per-analysis-2026-03.md` |
| Vercel pricing | [vercel.com/docs/functions/usage-and-pricing](https://vercel.com/docs/functions/usage-and-pricing) |
| Supabase pricing | [supabase.com/pricing](https://supabase.com/pricing) |
| Voyage AI pricing | [docs.voyageai.com/docs/pricing](https://docs.voyageai.com/docs/pricing) |
| Zapier pricing | [zapier.com/pricing](https://zapier.com/pricing) |
| Make pricing | [make.com/en/pricing](https://www.make.com/en/pricing) |
| n8n pricing | [n8n.io/pricing](https://n8n.io/pricing/) |

### Appendice E -- Conversion table USD/EUR

Tasso di cambio utilizzato: 1 USD = 0.926 EUR (media Q1 2026).

I costi infrastruttura (Vercel, Supabase, AI providers) sono fatturati in USD. I prezzi al cliente sono in EUR. Il margine puo variare di +/- 5% con le fluttuazioni del cambio.
