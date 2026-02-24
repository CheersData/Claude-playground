# Censimento Modelli AI — controlla.me

> **Ultimo aggiornamento**: 2026-02-24
>
> Riferimento per la scelta dei modelli per ogni agente della piattaforma.
> Prezzi in USD per 1 milione di token. Fonti ufficiali in fondo.

---

## 1. LLM — Catalogo Completo

### Fascia Economy ($0.10–$0.60/1M output)

Per task leggeri: classificazione, riformulazione, estrazione JSON, routing.

| Modello | Provider | Input | Output | Context | Punti di forza | Limiti |
|---------|----------|-------|--------|---------|----------------|--------|
| **Gemini 2.5 Flash** | Google | $0.15 | $0.60 | 1M | Veloce, JSON affidabile, costo minimo | Meno preciso su reasoning complesso |
| GPT-4o Mini | OpenAI | $0.15 | $0.60 | 128K | Stesso prezzo di Flash, ecosistema OpenAI | Context piu' limitato |
| GPT-4.1 Nano | OpenAI | $0.10 | $0.40 | 1M | Il piu' economico con context 1M | Qualita' inferiore su task articolati |
| Gemini 2.5 Flash-Lite | Google | $0.10 | $0.40 | 1M | Budget estremo | Meno capace di Flash standard |
| DeepSeek V3 | DeepSeek | $0.14 | $0.28 | 128K | Output piu' economico in assoluto | Server in Cina, latenza EU alta, privacy |

### Fascia Media ($1.00–$8.00/1M output)

Per task sostanziali: analisi strutturata, agentic multi-step, output lungo e preciso.

| Modello | Provider | Input | Output | Context | Punti di forza | Limiti |
|---------|----------|-------|--------|---------|----------------|--------|
| GPT-4.1 Mini | OpenAI | $0.40 | $1.60 | 1M | Buon rapporto qualita'/prezzo, context 1M | Non eccelle in reasoning legale |
| **Claude Haiku 4.5** | Anthropic | $1.00 | $5.00 | 200K | Eccellente per istruzioni complesse, bassa latenza | 5-8x piu' caro di Flash |
| DeepSeek R1 | DeepSeek | $0.55 | $2.19 | 128K | Reasoning economico | Server in Cina, privacy, reasoning token nascosti |
| GPT-4.1 | OpenAI | $2.00 | $8.00 | 1M | Reasoning avanzato, context 1M | Costoso per la fascia |

### Fascia Premium ($10.00–$25.00/1M output)

Per task critici: analisi legale profonda, output finale utente, zero tolleranza errori.

| Modello | Provider | Input | Output | Context | Punti di forza | Limiti |
|---------|----------|-------|--------|---------|----------------|--------|
| Gemini 2.5 Pro | Google | $1.25 | $10.00 | 1M | Reasoning forte, context 1M, economico per la fascia | Meno testato su prompt legali IT |
| GPT-4o | OpenAI | $2.50 | $10.00 | 128K | Maturo, ben documentato | Context limitato, non il migliore in reasoning |
| **Claude Sonnet 4.5** | Anthropic | $3.00 | $15.00 | 200K | Top reasoning, segue istruzioni alla lettera | Costoso |
| Claude Opus 4.5 | Anthropic | $5.00 | $25.00 | 200K | Massima qualita' assoluta | Molto costoso, raramente necessario |

### Reasoning Models (O-series OpenAI)

Attenzione: i modelli O-series usano **reasoning token nascosti** fatturati come output ma invisibili nella risposta. Un output di 500 token puo' costare 2000+ token reali.

| Modello | Provider | Input | Output | Note |
|---------|----------|-------|--------|------|
| o4-mini | OpenAI | $1.10 | $4.40 | Reasoning economico, ma costi imprevedibili |
| o3-mini | OpenAI | $1.10 | $4.40 | Simile a o4-mini |
| o3 | OpenAI | $2.00 | $8.00 | Reasoning forte |

**Sconsigliati per i nostri agenti**: i costi effettivi sono imprevedibili per via dei reasoning token nascosti. Meglio Sonnet 4.5 o Gemini Pro per reasoning controllato.

---

## 2. Embeddings — Catalogo Completo

| Modello | Provider | Prezzo/1M | Dimensioni | Free tier | Punti di forza | Limiti |
|---------|----------|-----------|------------|-----------|----------------|--------|
| **voyage-law-2** | Voyage AI | $0.12 | 1024 | 50M tok | **Specializzato legale**, ottimo per IT/EU law | Solo legale, modello 2024 |
| voyage-4 | Voyage AI | $0.06 | 1024 | 200M tok | General purpose, piu' recente e economico | Non specializzato legale |
| voyage-4-lite | Voyage AI | $0.02 | 512 | 200M tok | Molto economico | Qualita' inferiore |
| text-embedding-3-small | OpenAI | $0.02 | 1536 | — | Il piu' economico, buona qualita' general | Non specializzato legale |
| text-embedding-3-large | OpenAI | $0.13 | 3072 | — | Alta qualita', dimensioni maggiori | Costoso, non specializzato |

**Raccomandazione**: `voyage-law-2` resta la scelta migliore per il corpus legale. Il vantaggio di un modello addestrato su testi giuridici e' significativo per la similarita' semantica. Valutare `voyage-4` come alternativa se si espande oltre il legale.

---

## 3. Mappa Agenti — Configurazione Attuale vs Raccomandata

### Configurazione attuale

| Agente | Modello | Provider | Costo/exec | Note |
|--------|---------|----------|------------|------|
| Question-Prep | gemini-2.5-flash | Google | ~$0.0002 | Ottimale |
| Classifier | claude-haiku-4-5 | Anthropic | ~$0.009 | Sovradimensionato |
| Analyzer | claude-sonnet-4-5 | Anthropic | ~$0.15 | Adeguato |
| Investigator | claude-sonnet-4-5 | Anthropic | ~$0.12 | Costoso per il task |
| Advisor | claude-sonnet-4-5 | Anthropic | ~$0.08 | Adeguato |
| Corpus Agent | gemini-2.5-flash | Google | ~$0.005 | Ottimale |
| Embeddings | voyage-law-2 | Voyage AI | ~$0.001 | Ottimale |
| **Totale per analisi** | | | **~$0.36** | |

### Configurazione raccomandata (miglior rapporto qualita'/prezzo)

| Agente | Modello | Provider | Costo/exec | Variazione | Motivazione |
|--------|---------|----------|------------|------------|-------------|
| Question-Prep | gemini-2.5-flash | Google | ~$0.0002 | = | Gia' ottimale |
| **Classifier** | **gemini-2.5-flash** | Google | **~$0.001** | **-88%** | Task semplice (classificazione JSON), Flash sufficiente |
| Analyzer | claude-sonnet-4-5 | Anthropic | ~$0.15 | = | Serve reasoning profondo per analisi rischi |
| **Investigator** | **gemini-2.5-pro** | Google | **~$0.06** | **-50%** | Reasoning forte, context 1M, meta' prezzo |
| Advisor | claude-sonnet-4-5 | Anthropic | ~$0.08 | = | Output critico per l'utente, zero errori |
| Corpus Agent | gemini-2.5-flash | Google | ~$0.005 | = | Gia' ottimale |
| Embeddings | voyage-law-2 | Voyage AI | ~$0.001 | = | Specializzato legale, insostituibile |
| **Totale per analisi** | | | **~$0.30** | **-17%** | |

### Configurazione budget (massimo risparmio)

| Agente | Modello | Provider | Costo/exec | Variazione | Rischio |
|--------|---------|----------|------------|------------|---------|
| Question-Prep | gemini-2.5-flash | Google | ~$0.0002 | = | Nessuno |
| Classifier | gpt-4.1-nano | OpenAI | ~$0.0005 | -94% | Basso: task molto semplice |
| Analyzer | gemini-2.5-pro | Google | ~$0.08 | -47% | Medio: da validare su prompt legali IT |
| Investigator | gemini-2.5-pro | Google | ~$0.06 | -50% | Medio: da validare web search |
| Advisor | gemini-2.5-pro | Google | ~$0.05 | -37% | Medio-alto: output finale, serve qualita' |
| Corpus Agent | gemini-2.5-flash | Google | ~$0.005 | = | Nessuno |
| Embeddings | voyage-law-2 | Voyage AI | ~$0.001 | = | Nessuno |
| **Totale per analisi** | | | **~$0.20** | **-44%** | Da validare |

---

## 4. Considerazioni Strategiche

### Provider che usiamo oggi

- **Anthropic** (Claude) — Provider principale. SDK gia' integrato, retry logic, rate limit 60s.
- **Google** (Gemini) — Provider secondario. SDK integrato, retry 10s, usato per Corpus Agent.
- **Voyage AI** — Embeddings legali. API HTTP diretta, no SDK.

### Provider da valutare

- **OpenAI** — Richiederebbe integrazione SDK nuovo. GPT-4.1 Mini e' interessante come fascia media economica. Richiede account API separato (la subscription Plus da $20/mese NON include crediti API). $5 crediti gratis per nuovi account.
- **DeepSeek** — Prezzi bassissimi ma server in Cina: latenza alta per EU, preoccupazioni privacy su dati legali sensibili. **Sconsigliato per dati legali**.

### Regole per la scelta modello

1. **Task semplice (classificazione, riformulazione, routing)** → Fascia economy (Flash/GPT-4o Mini)
2. **Task analitico (analisi, investigazione)** → Fascia media-premium (Haiku/Pro/Sonnet)
3. **Output finale utente** → Fascia premium (Sonnet). L'utente vede questo output, deve essere impeccabile
4. **Embeddings legali** → Modello specializzato (voyage-law-2). La qualita' del retrieval e' il fondamento di tutto il RAG
5. **Privacy** → Mai inviare documenti legali a provider con server fuori EU/US senza consenso esplicito

### Batch API — Risparmio 50%

Tutti i provider offrono Batch API con sconti 50%. Utile per:
- Re-indicizzazione corpus (embeddings batch)
- Analisi multiple in coda (non real-time)
- **Non applicabile** per l'analisi live (serve risposta immediata)

---

## 5. Fonti

- [Anthropic Claude API Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Google Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [OpenAI API Pricing](https://openai.com/api/pricing/)
- [DeepSeek API Pricing](https://api-docs.deepseek.com/quick_start/pricing)
- [Voyage AI Pricing](https://docs.voyageai.com/docs/pricing)
- [LLM Benchmark Comparison](https://artificialanalysis.ai/models/comparisons/claude-4-5-haiku-vs-gemini-2-5-flash)
