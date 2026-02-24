# Censimento Modelli AI — controlla.me

> **Ultimo aggiornamento**: 2026-02-24
>
> Riferimento per la scelta dei modelli per ogni agente della piattaforma.
> Prezzi in USD per 1 milione di token. Fonti ufficiali in fondo.
>
> Configurazione centralizzata in `lib/models.ts` — 7 provider, 22+ modelli registrati.

---

## 1. LLM — Catalogo Completo per Provider

### 1.1 Anthropic (Claude)

Client: `lib/anthropic.ts` — SDK dedicato, retry 60s su rate limit.

| Modello | Model ID | Input | Output | Context | Punti di forza | Limiti |
|---------|----------|-------|--------|---------|----------------|--------|
| **Claude Sonnet 4.5** | `claude-sonnet-4-5-20250929` | $3.00 | $15.00 | 200K | Top reasoning, segue istruzioni alla lettera | Costoso |
| **Claude Haiku 4.5** | `claude-haiku-4-5-20251001` | $1.00 | $5.00 | 200K | Eccellente per istruzioni complesse, bassa latenza | 5-8x piu' caro di Flash |
| Claude Opus 4.5 | `claude-opus-4-5-20250217` | $5.00 | $25.00 | 200K | Massima qualita' assoluta | Molto costoso, raramente necessario |

**Usati attualmente**: Sonnet (Analyzer, Investigator, Advisor), Haiku (Classifier, fallback Corpus).

---

### 1.2 Google Gemini

Client: `lib/gemini.ts` — SDK `@google/genai`, retry 10s. Free tier: 250 req/giorno Flash, 100/giorno Pro.

| Modello | Model ID | Input | Output | Context | Punti di forza | Limiti |
|---------|----------|-------|--------|---------|----------------|--------|
| **Gemini 2.5 Flash** | `gemini-2.5-flash` | $0.15 | $0.60 | 1M | Veloce, JSON affidabile, costo minimo | Meno preciso su reasoning complesso |
| Gemini 2.5 Flash-Lite | `gemini-2.5-flash-lite` | $0.10 | $0.40 | 1M | Budget estremo | Meno capace di Flash standard |
| **Gemini 2.5 Pro** | `gemini-2.5-pro` | $1.25 | $10.00 | 1M | Reasoning forte, context 1M | Meno testato su prompt legali IT |

**Usati attualmente**: Flash (Question-Prep, Corpus Agent).

---

### 1.3 OpenAI

Client: `lib/openai.ts` — SDK `openai`. Subscription ChatGPT Plus ($20/mese) NON include crediti API.

#### Modelli principali (consigliati)

| Modello | Model ID | Input | Output | Context | Punti di forza | Limiti |
|---------|----------|-------|--------|---------|----------------|--------|
| GPT-5 Nano | `gpt-5-nano` | $0.05 | $0.40 | 400K | Il piu' economico OpenAI, context 400K | Nuovo, da validare |
| **GPT-4.1 Nano** | `gpt-4.1-nano` | $0.10 | $0.40 | 1M | Ultra-economico con context 1M | Qualita' inferiore su task articolati |
| GPT-4o Mini | `gpt-4o-mini` | $0.15 | $0.60 | 128K | Stesso prezzo di Flash, ecosistema OpenAI | Context piu' limitato |
| GPT-5 Mini | `gpt-5-mini` | $0.25 | $2.00 | 400K | Rapporto qualita'/prezzo top | Nuovo, da validare |
| **GPT-4.1 Mini** | `gpt-4.1-mini` | $0.40 | $1.60 | 1M | Buon rapporto qualita'/prezzo, context 1M | Non eccelle in reasoning legale |
| GPT-5 | `gpt-5` | $1.25 | $10.00 | 400K | Flagship OpenAI, reasoning forte | Costoso |
| **GPT-4.1** | `gpt-4.1` | $2.00 | $8.00 | 1M | Reasoning avanzato, context 1M | Costoso per la fascia |
| GPT-4o | `gpt-4o` | $2.50 | $10.00 | 128K | Maturo, ben documentato | Context limitato |

#### Modelli GPT-5.x (ultima generazione)

| Modello | Model ID | Input | Output | Context | Note |
|---------|----------|-------|--------|---------|------|
| GPT-5.1 Codex Mini | `gpt-5.1-codex-mini` | $0.25 | $2.00 | 400K | Specializzato codice, economico |
| GPT-5.1 | `gpt-5.1` | $1.25 | $10.00 | 400K | Evoluzione di GPT-5 |
| GPT-5.1 Codex | `gpt-5.1-codex` | $1.25 | $10.00 | 400K | Coding avanzato |
| GPT-5.2 | `gpt-5.2` | $1.75 | $14.00 | 400K | Ultimo modello flagship |
| GPT-5 Pro | `gpt-5-pro` | $15.00 | $120.00 | 400K | Massima qualita', costosissimo |
| GPT-5.2 Pro | `gpt-5.2-pro` | $21.00 | $168.00 | 400K | Top assoluto OpenAI |

#### Modelli GPT Open Source (nuovi)

| Modello | Model ID | Input | Output | Context | Note |
|---------|----------|-------|--------|---------|------|
| GPT-OSS 20B | `gpt-oss-20b` | $0.03 | $0.14 | 128K | Open source, ultra-economico |
| GPT-OSS 120B | `gpt-oss-120b` | $0.04 | $0.19 | 128K | Open source, qualita' forte |

#### Reasoning Models (O-series)

Attenzione: usano **reasoning token nascosti** fatturati come output ma invisibili. Costi imprevedibili.

| Modello | Model ID | Input | Output | Context | Note |
|---------|----------|-------|--------|---------|------|
| o4 Mini | `o4-mini` | $1.10 | $4.40 | 200K | Reasoning economico |
| o3 Mini | `o3-mini` | $1.10 | $4.40 | 200K | Simile a o4-mini |
| o3 | `o3` | $2.00 | $8.00 | 200K | Reasoning forte |
| o1 | `o1` | $15.00 | $60.00 | 200K | Reasoning premium |
| o3 Pro | `o3-pro` | $20.00 | $80.00 | 200K | Massima qualita' reasoning |

**Sconsigliati O-series per i nostri agenti**: costi effettivi imprevedibili. Meglio Sonnet 4.5 o Gemini Pro.

---

### 1.4 Mistral

Client: `lib/mistral.ts` — API OpenAI-compatibile. **Free tier: TUTTI i modelli, 2 RPM, 1B tok/mese.**

#### Modelli generali

| Modello | Model ID | Input | Output | Context | Punti di forza | Limiti |
|---------|----------|-------|--------|---------|----------------|--------|
| **Ministral 3 3B** | `ministral-3b-2512` | $0.10 | $0.10 | 128K | Ultra-leggero, task semplici | Qualita' limitata |
| **Ministral 3 8B** | `ministral-8b-2512` | $0.15 | $0.15 | 256K | Buon rapporto per task leggeri, context 256K | — |
| Ministral 3 14B | `ministral-14b-2512` | $0.20 | $0.20 | 256K | Miglior Ministral | — |
| **Mistral Small 3.2** | `mistral-small-3.2-24b-instruct` | $0.06 | $0.18 | 128K | 24B params, buona qualita', economico | — |
| Mistral Medium 3.1 | `mistral-medium-3.1` | $0.40 | $2.00 | 128K | Fascia media | — |
| **Mistral Large 3** | `mistral-large-2512` | $0.50 | $1.50 | 256K | MoE 675B, reasoning forte, **costa 10x meno di Sonnet** | Da validare su prompt legali IT |

#### Modelli specializzati

| Modello | Model ID | Input | Output | Context | Specializzazione |
|---------|----------|-------|--------|---------|-----------------|
| **Codestral** | `codestral-2508` | $0.30 | $0.90 | 256K | Codice — 80+ linguaggi |
| Devstral 2 | `devstral-2512` | $0.40 | $2.00 | 256K | Sviluppo software agenticovvv |
| Devstral Small | `devstral-small` | $0.10 | $0.30 | 128K | Dev economico |
| Saba | `mistral-saba` | $0.20 | $0.60 | 32K | Multilingue (arabo, persiano) |
| Mistral OCR 3 | `mistral-ocr-2512` | — | — | — | OCR da immagini/PDF |
| Mistral Moderation | `mistral-moderation-24-11` | — | — | — | Content moderation |

#### Reasoning (Magistral)

| Modello | Model ID | Input | Output | Context | Note |
|---------|----------|-------|--------|---------|------|
| Magistral Small | `magistral-small-2509` | $0.50 | $1.50 | 40K | Reasoning economico |
| Magistral Medium | `magistral-medium-2509` | $2.00 | $5.00 | 40K | Reasoning forte |

#### Audio & Embeddings

| Modello | Model ID | Prezzo | Specializzazione |
|---------|----------|--------|-----------------|
| Voxtral Mini Transcribe 2 | `voxtral-mini-transcribe-26-02` | — | Speech-to-text |
| Codestral Embed | `codestral-embed-25-05` | — | Embeddings per codice |

**Modelli piu' interessanti per noi**: Mistral Small 3.2 ($0.06/$0.18) come alternativa a Flash, Mistral Large 3 ($0.50/$1.50) come alternativa economica a Sonnet.

---

### 1.5 Groq (Llama su hardware LPU)

Client: `lib/groq.ts` — API OpenAI-compatibile. **Free tier: 1000 req/giorno.** Velocita' estrema.

#### Modelli production

| Modello | Model ID | Input | Output | Context | Punti di forza | Limiti |
|---------|----------|-------|--------|---------|----------------|--------|
| **Llama 3.1 8B** | `llama-3.1-8b-instant` | $0.05 | $0.08 | 128K | Ultra-veloce, quasi gratis | Qualita' limitata |
| GPT-OSS 20B | `openai/gpt-oss-20b` | $0.075 | $0.30 | 128K | Open source, economico | — |
| GPT-OSS 120B | `openai/gpt-oss-120b` | $0.15 | $0.60 | 128K | Open source, qualita' forte | — |
| **Llama 3.3 70B** | `llama-3.3-70b-versatile` | $0.59 | $0.79 | 128K | Reasoning forte, veloce | Piu' costoso |

#### Modelli preview

| Modello | Model ID | Input | Output | Context | Note |
|---------|----------|-------|--------|---------|------|
| **Llama 4 Scout** | `meta-llama/llama-4-scout-17b-16e-instruct` | $0.11 | $0.34 | 128K | MoE 109B, context lungo, economico |
| Qwen 3 32B | `qwen/qwen3-32b` | $0.29 | $0.59 | 128K | Alternativa a Llama |
| Kimi K2 | `moonshotai/kimi-k2-instruct-0905` | $1.00 | $3.00 | 256K | MoE, reasoning forte |

#### Audio

| Modello | Prezzo | Note |
|---------|--------|------|
| Whisper Large V3 | $0.111/ora | Speech-to-text |
| Whisper Large V3 Turbo | $0.04/ora | Speech-to-text veloce |

**Modelli piu' interessanti per noi**: Llama 3.1 8B ($0.05/$0.08) per task semplicissimi, Llama 4 Scout ($0.11/$0.34) come alternative economy.

---

### 1.6 Cerebras (Llama su hardware WSE)

Client: `lib/cerebras.ts` — API OpenAI-compatibile. **Free tier: 24M token/giorno ($48/giorno di valore!).**

| Modello | Model ID | Input | Output | Velocita' | Punti di forza | Limiti |
|---------|----------|-------|--------|-----------|----------------|--------|
| **Llama 3.1 8B** | `llama3.1-8b` | $0.10 | $0.10 | ~2200 tok/s | Gratuito, velocissimo | Qualita' limitata |
| **GPT-OSS 120B** | `gpt-oss-120b` | $0.35 | $0.75 | ~3000 tok/s | Qualita' forte, veloce | — |
| Qwen 3 235B* | `qwen-3-235b-a22b-instruct-2507` | $0.60 | $1.20 | ~1400 tok/s | MoE 235B, reasoning | Preview, puo' essere rimosso |
| GLM 4.7* | `zai-glm-4.7` | $2.25 | $2.75 | ~1000 tok/s | 355B params, reasoning top | Preview, puo' essere rimosso |

*Preview = solo valutazione, possono essere rimossi senza preavviso.

**Free tier generoso**: 24M tok/giorno (developer), 120M tok/giorno (Max $200/mese). Perfetto per prototyping.

---

### 1.7 DeepSeek

Client: `lib/deepseek.ts` — API OpenAI-compatibile. 5M token gratis per nuovi account (30gg). **⚠️ Server in Cina.**

| Modello | Model ID | Input | Output | Context | Punti di forza | Limiti |
|---------|----------|-------|--------|---------|----------------|--------|
| **DeepSeek V3.2** | `deepseek-chat` | $0.28 | $0.42 | 128K | Ultimo modello, economico | Server Cina, privacy |
| DeepSeek V3.1 | `deepseek-chat` (v3.1) | $0.15 | $0.75 | 128K | Piu' economico in input | Output piu' caro |
| **DeepSeek R1** | `deepseek-reasoner` | $0.55 | $2.19 | 128K | Reasoning economico | Reasoning token nascosti, privacy |

**Cache pricing**: cache hit $0.028/1M (10x piu' economico), cache miss = prezzo pieno.

**⚠️ ATTENZIONE PRIVACY**: NON inviare documenti legali sensibili a DeepSeek. Server in Cina, preoccupazioni su data retention. Usare solo per task non-sensibili (classificazione, riformulazione) durante lo sviluppo.

---

## 2. Embeddings — Catalogo Completo

| Modello | Provider | Prezzo/1M | Dimensioni | Free tier | Punti di forza | Limiti |
|---------|----------|-----------|------------|-----------|----------------|--------|
| **voyage-law-2** | Voyage AI | $0.12 | 1024 | 50M tok | **Specializzato legale**, ottimo per IT/EU law | Solo legale, modello 2024 |
| voyage-4 | Voyage AI | $0.06 | 1024 | 200M tok | General purpose, piu' recente e economico | Non specializzato legale |
| voyage-4-lite | Voyage AI | $0.02 | 512 | 200M tok | Molto economico | Qualita' inferiore |
| text-embedding-3-small | OpenAI | $0.02 | 1536 | — | Il piu' economico, buona qualita' general | Non specializzato legale |
| text-embedding-3-large | OpenAI | $0.13 | 3072 | — | Alta qualita', dimensioni maggiori | Costoso, non specializzato |
| codestral-embed | Mistral | — | — | Free tier | Embeddings per codice | Solo codice |

**Raccomandazione**: `voyage-law-2` resta la scelta migliore per il corpus legale. Il vantaggio di un modello addestrato su testi giuridici e' significativo per la similarita' semantica.

---

## 3. Classifica per Costo (dal piu' economico)

### Top 10 modelli piu' economici per output

| # | Modello | Provider | Output/1M | Input/1M | Note |
|---|---------|----------|-----------|----------|------|
| 1 | GPT-OSS 20B | OpenAI | $0.03 | $0.14 | Open source |
| 2 | Mistral Nemo | Mistral | $0.04 | $0.02 | **Free tier** |
| 3 | Llama 3.1 8B | Groq | $0.08 | $0.05 | **Free tier** |
| 4 | Llama 3.1 8B | Cerebras | $0.10 | $0.10 | **24M tok/giorno gratis** |
| 5 | Ministral 3 3B | Mistral | $0.10 | $0.10 | **Free tier** |
| 6 | Ministral 3 8B | Mistral | $0.15 | $0.15 | **Free tier**, 256K context |
| 7 | GPT-OSS 120B | OpenAI | $0.19 | $0.04 | Qualita' 120B params |
| 8 | Mistral Small 3.2 | Mistral | $0.18 | $0.06 | **Free tier**, 24B params |
| 9 | Ministral 3 14B | Mistral | $0.20 | $0.20 | **Free tier**, 256K context |
| 10 | DeepSeek V3 | DeepSeek | $0.28 | $0.14 | ⚠️ Server Cina |

### Top 5 miglior rapporto qualita'/prezzo

| # | Modello | Provider | Output/1M | Perche' |
|---|---------|----------|-----------|---------|
| 1 | **Gemini 2.5 Flash** | Google | $0.60 | JSON affidabile, 1M context, free tier 250/gg |
| 2 | **Mistral Large 3** | Mistral | $1.50 | MoE 675B a 10x meno di Sonnet, free tier |
| 3 | **Llama 4 Scout** | Groq | $0.34 | MoE 109B, 512K context, free tier |
| 4 | **GPT-4.1 Mini** | OpenAI | $1.60 | 1M context, buona qualita' |
| 5 | **Gemini 2.5 Pro** | Google | $10.00 | Reasoning forte, 1M context, free tier |

---

## 4. Mappa Agenti — Configurazione Attuale vs Raccomandata

### Configurazione attuale

| Agente | Modello | Provider | Costo/exec | Note |
|--------|---------|----------|------------|------|
| Question-Prep | Gemini 2.5 Flash | Google | ~$0.0002 | Ottimale |
| Classifier | Claude Haiku 4.5 | Anthropic | ~$0.009 | Sovradimensionato |
| Analyzer | Claude Sonnet 4.5 | Anthropic | ~$0.15 | Adeguato |
| Investigator | Claude Sonnet 4.5 | Anthropic | ~$0.12 | Costoso per il task |
| Advisor | Claude Sonnet 4.5 | Anthropic | ~$0.08 | Adeguato |
| Corpus Agent | Gemini 2.5 Flash | Google | ~$0.005 | Ottimale |
| Embeddings | voyage-law-2 | Voyage AI | ~$0.001 | Ottimale |
| **Totale per analisi** | | | **~$0.36** | |

### Configurazione raccomandata (miglior rapporto qualita'/prezzo)

| Agente | Modello | Provider | Costo/exec | Variazione | Motivazione |
|--------|---------|----------|------------|------------|-------------|
| Question-Prep | Gemini 2.5 Flash | Google | ~$0.0002 | = | Gia' ottimale |
| **Classifier** | **Gemini 2.5 Flash** | Google | **~$0.001** | **-88%** | Task semplice, Flash sufficiente |
| Analyzer | Claude Sonnet 4.5 | Anthropic | ~$0.15 | = | Serve reasoning profondo |
| **Investigator** | **Mistral Large 3** | Mistral | **~$0.03** | **-75%** | MoE 675B, reasoning forte, 10x meno di Sonnet |
| Advisor | Claude Sonnet 4.5 | Anthropic | ~$0.08 | = | Output critico per l'utente |
| Corpus Agent | Gemini 2.5 Flash | Google | ~$0.005 | = | Gia' ottimale |
| Embeddings | voyage-law-2 | Voyage AI | ~$0.001 | = | Specializzato legale |
| **Totale per analisi** | | | **~$0.27** | **-25%** | |

### Configurazione budget (massimo risparmio)

| Agente | Modello | Provider | Costo/exec | Variazione | Rischio |
|--------|---------|----------|------------|------------|---------|
| Question-Prep | Mistral Small 3.2 | Mistral | ~$0.00003 | -85% | Basso: free tier |
| Classifier | Ministral 3 8B | Mistral | ~$0.0003 | -97% | Basso: task semplice, free tier |
| Analyzer | Mistral Large 3 | Mistral | ~$0.03 | -80% | Medio: da validare su prompt legali IT |
| Investigator | Mistral Large 3 | Mistral | ~$0.03 | -75% | Medio: no web search nativo |
| Advisor | Mistral Large 3 | Mistral | ~$0.02 | -75% | Medio-alto: output finale |
| Corpus Agent | Mistral Small 3.2 | Mistral | ~$0.001 | -80% | Basso: free tier |
| Embeddings | voyage-law-2 | Voyage AI | ~$0.001 | = | Nessuno |
| **Totale per analisi** | | | **~$0.08** | **-78%** | Free tier Mistral! |

### Configurazione dev/gratis (prototyping)

| Agente | Modello | Provider | Costo/exec | Note |
|--------|---------|----------|------------|------|
| Question-Prep | Llama 3.1 8B | Cerebras | $0.00 | Free tier 24M tok/gg |
| Classifier | Llama 3.1 8B | Cerebras | $0.00 | Free tier |
| Analyzer | GPT-OSS 120B | Cerebras | ~$0.01 | Free tier |
| Investigator | Llama 3.3 70B | Groq | ~$0.01 | Free tier 1000 req/gg |
| Advisor | Llama 4 Scout | Groq | ~$0.005 | Free tier |
| Corpus Agent | Llama 3.1 8B | Cerebras | $0.00 | Free tier |
| Embeddings | voyage-law-2 | Voyage AI | ~$0.001 | Free tier 50M tok |
| **Totale per analisi** | | | **~$0.03** | **Quasi gratis** |

---

## 5. Considerazioni Strategiche

### Provider integrati (7)

Tutti integrati con client wrapper in `lib/`, logging e retry automatico. Configurazione centralizzata in `lib/models.ts`.

| Provider | Client | API | Free tier | Note |
|----------|--------|-----|-----------|------|
| **Anthropic** | `lib/anthropic.ts` | SDK dedicato | No | Provider principale, retry 60s |
| **Google** | `lib/gemini.ts` | SDK dedicato | 250 req/giorno Flash | Corpus Agent, Question-Prep |
| **OpenAI** | `lib/openai.ts` | SDK `openai` | $5 crediti | Subscription Plus NON include API |
| **Mistral** | `lib/mistral.ts` | OpenAI-compatibile | **Tutti i modelli, 2 RPM, 1B tok/mese** | Nemo a $0.02 = ultra-economico |
| **Groq** | `lib/groq.ts` | OpenAI-compatibile | **1000 req/giorno** | Llama su hardware LPU, velocissimo |
| **Cerebras** | `lib/cerebras.ts` | OpenAI-compatibile | **24M tok/giorno** | Llama su hardware WSE, velocissimo |
| **DeepSeek** | `lib/deepseek.ts` | OpenAI-compatibile | 5M tok (30gg) | ⚠️ Server in Cina, sconsigliato per dati legali |
| **Voyage AI** | `lib/embeddings.ts` | API HTTP | 50M tok | Embeddings legali specializzati |

### Regole per la scelta modello

1. **Task semplice (classificazione, riformulazione, routing)** → Mistral Small/Nemo o Gemini Flash
2. **Task analitico (analisi, investigazione)** → Mistral Large 3 o Sonnet
3. **Output finale utente** → Claude Sonnet 4.5. L'utente vede questo output, deve essere impeccabile
4. **Embeddings legali** → voyage-law-2. La qualita' del retrieval e' il fondamento del RAG
5. **Prototyping** → Cerebras/Groq free tier. Zero costi durante lo sviluppo
6. **Privacy** → Mai inviare documenti legali a DeepSeek o provider con server fuori EU/US

### Batch API — Risparmio 50%

Tutti i provider offrono Batch API con sconti 50%. Utile per:
- Re-indicizzazione corpus (embeddings batch)
- Analisi multiple in coda (non real-time)
- **Non applicabile** per l'analisi live (serve risposta immediata)

---

## 6. Fonti

- [Anthropic Claude API Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Google Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [OpenAI API Pricing](https://openai.com/api/pricing/)
- [Mistral AI Pricing](https://mistral.ai/pricing)
- [Mistral Models Docs](https://docs.mistral.ai/getting-started/models)
- [Groq Pricing](https://groq.com/pricing)
- [Groq Supported Models](https://console.groq.com/docs/models)
- [Cerebras Pricing](https://www.cerebras.ai/pricing)
- [Cerebras Models](https://inference-docs.cerebras.ai/models/overview)
- [DeepSeek API Pricing](https://api-docs.deepseek.com/quick_start/pricing)
- [Voyage AI Pricing](https://docs.voyageai.com/docs/pricing)
- [LLM Price Comparison](https://pricepertoken.com)
