# Studio di Fattibilità: Dipartimento Treasury (guadagna-me)

> **Autore:** Claude (Opus) — sessione di ricerca architettonica
> **Data:** 1 Mar 2026
> **Scopo:** Analisi completa per la decisione build/no-build del dipartimento Finanza Attiva

---

## PARTE 1: ARCHITETTURA AGENTICA ATTUALE — Cosa Abbiamo

### 1.1 Censimento Agenti

Il sistema attuale conta **8 agenti AI** + **1 servizio Staff** implementati:

| Layer | Agente | File | Modello | Ruolo |
|-------|--------|------|---------|-------|
| **Leader** | Leader Analisi Legale | `lib/agents/leader.ts` | Deterministico (zero LLM per 6/7 casi) | Router: smista input alla pipeline corretta |
| **Specialist** | Classifier (Leo) | `lib/agents/classifier.ts` | Haiku 4.5 | Classifica tipo documento, leggi, istituti |
| **Specialist** | Analyzer (Marta) | `lib/agents/analyzer.ts` | Sonnet 4.5 | Analisi rischi clausole |
| **Specialist** | Investigator (Giulia) | `lib/agents/investigator.ts` | Sonnet 4.5 + web_search | Ricerca legale profonda |
| **Specialist** | Advisor (Enzo) | `lib/agents/advisor.ts` | Sonnet 4.5 | Report finale + scoring |
| **Specialist** | Question-Prep | `lib/agents/question-prep.ts` | Haiku 4.5 | Riformula domande → linguaggio giuridico |
| **Specialist** | Corpus-Agent | `lib/agents/corpus-agent.ts` | Sonnet 4.5 | Q&A legislativo con citazioni |
| **Staff** | Data Connector | `lib/staff/data-connector/index.ts` | No LLM | ETL: Normattiva + EUR-Lex → Vector DB |

### 1.2 Pattern di Comunicazione

**Pattern principale: Sequential Pipeline con Data Passing (Chain)**

```
Leader (router)
  → Classifier(testo) → ClassificationResult
    → Retrieval(laws, institutes) → LegalContext
      → Analyzer(testo, classification, legalContext) → AnalysisResult
        → Retrieval(clausole critiche) → ClauseContext
          → Investigator(tutto + RAG) → InvestigationResult
            → Advisor(tutto + RAG) → FinalReport
```

Ogni agente riceve l'output di TUTTI i precedenti. Nessun message passing, nessun event bus.
Comunicazione: **sincrona, sequenziale, in-memory, in-process**.

**Pattern secondario: Router (Leader)**
Decisione deterministica a costo zero per 6/7 casi. Solo "file + messaggio ambiguo" chiama LLM.

**Pattern terziario: RAG inter-fase**
Tra ogni fase, il Vector DB viene interrogato per arricchire il contesto.

**Frontend ↔ Backend: SSE (Server-Sent Events)**
Stream unidirezionale con eventi: `timing`, `progress`, `agent`, `complete`, `error`.

### 1.3 AI SDK — L'Infrastruttura Riusabile

L'SDK AI è il componente più sofisticato e **completamente riusabile da guadagna-me**:

| Strato | File | Cosa fa |
|--------|------|---------|
| **Model Registry** | `lib/models.ts` (520 righe) | ~40 modelli da 7 provider, costi, context window |
| **Universal Router** | `lib/ai-sdk/generate.ts` (119 righe) | Routing per provider: Anthropic nativo, Gemini nativo, OpenAI-compat per altri 5 |
| **Agent Runner** | `lib/ai-sdk/agent-runner.ts` (120 righe) | Fallback chain N-modelli con retry automatico |
| **Tier System** | `lib/tiers.ts` (236 righe) | 3 tier (intern/associate/partner), catene di fallback per agente |
| **OpenAI-Compat** | `lib/ai-sdk/openai-compat.ts` (163 righe) | 1 funzione gestisce 5 provider diversi con retry specifici |

**Catene di fallback esempio:**
```
analyzer:   Sonnet 4.5 → Gemini Pro → Mistral Large → Groq Llama 70B → Cerebras
classifier: Haiku 4.5 → Gemini Flash → Cerebras → Groq Scout → Mistral Small
```

### 1.4 Vector Store a 3 Layer

| Layer | Tabella | Contenuto | Embedding |
|-------|---------|-----------|-----------|
| 1 | `legal_articles` | ~5600 articoli legislativi | Voyage Law-2 (1024 dim) |
| 2 | `document_chunks` | Chunk documenti analizzati | Voyage Law-2 |
| 3 | `legal_knowledge` | Pattern emergenti | Voyage Law-2 |

---

## PARTE 2: PUNTI DEBOLI DELL'ARCHITETTURA

### 2.1 Critici (Bloccanti per produzione)

| # | Debolezza | Impatto | File |
|---|-----------|---------|------|
| 1 | **Build rotto** — 6 componenti importati ma mai creati | Non compila | `app/corpus/page.tsx` |
| 2 | **Stato tier in-memory** — si resetta ad ogni cold start su Vercel | Tier sempre "partner" (costo max) | `lib/tiers.ts:103-104` |
| 3 | **Rate limit in-memory** — si perde ad ogni restart | Aggirabile aspettando cold start | `lib/middleware/rate-limit.ts:18` |
| 4 | **Test stale** — 17/81 falliti (21%) | Nessuna protezione da regressioni | 8 file test |

### 2.2 Alti (Impattano scalabilità)

| # | Debolezza | Impatto |
|---|-----------|---------|
| 5 | **Pipeline sincrona single-thread** | Se un agente si blocca, tutto muore (timeout 300s unica protezione) |
| 6 | **Nessun circuit breaker** | Riprova Anthropic ogni volta anche se "malato" |
| 7 | **Orchestrator accoppiato** | 13 import hardcoded, nessuna registry/DI |
| 8 | **Zero monitoring** | Solo console.log, nessun Sentry/tracing |
| 9 | **Zero CI/CD** | Build rotto non rilevato automaticamente |
| 10 | **legal-corpus.ts monolitico** | 920 righe, nessun test, fa 5 cose diverse |

### 2.3 Cosa significa per guadagna-me

**Buona notizia:** i punti deboli sono tutti in controlla-me specifico, NON nell'infrastruttura condivisa.
L'AI SDK, il Model Registry, il Tier System, e i pattern di design sono solidi e riusabili.

**guadagna-me può partire indipendente** — non eredita i bug di controlla-me.

---

## PARTE 3: ECOSISTEMA TRADING — API e Servizi

### 3.1 Broker/Exchange APIs — Esecuzione Ordini

#### Crypto

| Exchange | API | Commissioni | WebSocket | Rate Limit | Pro | Contro |
|----------|-----|-------------|-----------|------------|-----|--------|
| **Binance** | REST + WS | 0.1% spot (riducibili con BNB) | Sì, streams illimitati | 1200 req/min | Liquidità massima, più paia | Complessità KYC in EU, ban in alcuni paesi |
| **Kraken** | REST + WS | 0.16% maker / 0.26% taker | Sì | 15 req/s | Regolamentato EU, affidabile | Meno paia, API meno elegante |
| **Bybit** | REST + WS | 0.1% spot | Sì | 120 req/min | Buoni derivati | Meno regolamentato |

**Raccomandazione:** Binance come primario (liquidità), Kraken come backup (regolamentato EU).

#### Azioni/ETF

| Broker | API | Commissioni | EU Residents | Pro | Contro |
|--------|-----|-------------|--------------|-----|--------|
| **Alpaca** | REST + WS | Commission-free US stocks | ✅ (espansione EU 2025 via WealthKernel) | API eccellente, paper trading, miglior broker per algo EU 2026 (BrokerChooser) | No ETF US per EU (regolamento), crypto solo US |
| **Interactive Brokers** | ibapi Python | $0.005/share (min $1) | ✅ Pieno supporto | Accesso a 150+ mercati, derivati, forex | API complessa (event-driven, TWS necessario), setup iniziale doloroso |
| **Trading212** | NO API pubblica | — | ✅ | — | **Non utilizzabile per bot** |
| **DEGIRO** | NO API ufficiale | — | ✅ | — | Solo scraping non ufficiale — **sconsigliato** |
| **eToro** | NO API trading | — | ✅ | — | **Non utilizzabile per bot** |

**Raccomandazione:**
- **Alpaca** come primario per azioni US (API migliore, commission-free, paper trading per test)
- **Interactive Brokers** come secondario per mercati EU/global (più complesso ma accesso universale)

### 3.2 Market Data APIs — Dati in Near Real-Time

| API | Free Tier | Stocks | Crypto | Latenza | Costo Paid | Best For |
|-----|-----------|--------|--------|---------|------------|----------|
| **Finnhub** | Generoso (60 req/min) | ✅ Global | ✅ | <100ms | $49/mese | All-around gratuito |
| **Alpha Vantage** | 25 call/giorno | ✅ 30+ paesi | ✅ | Moderata | $49.99/mese | Beginner, indicatori |
| **Polygon.io** | Limitato | ✅ US | ✅ | <10ms | $29/mese | Bassa latenza |
| **CoinGecko** | Generoso | ❌ | ✅ 24M+ token | Moderata | $129/mese | Crypto-first |
| **Twelve Data** | 8 req/min | ✅ | ✅ | Buona | $29/mese | Time-series multi-asset |

**Raccomandazione:**
- **Finnhub** (free tier generoso per stocks + crypto)
- **CoinGecko free** per dati crypto addizionali
- Exchange WebSocket nativi (Binance/Kraken) per dati real-time crypto — **gratis e più veloci di qualsiasi API**

### 3.3 Librerie Python Chiave

| Libreria | Scopo | Perché questa |
|----------|-------|---------------|
| **ccxt** | API unificata 107+ exchange | Una sola interfaccia per Binance, Kraken, Alpaca, ecc. Elimina la complessità di N API diverse |
| **pandas + pandas-ta** | Dati + indicatori tecnici | RSI, MACD, Bollinger, 130+ indicatori. Più semplice di ta-lib (no C dependency) |
| **vectorbt** | Backtesting veloce | Vectorizzato (NumPy), 100x più veloce di backtrader per strategie semplici |
| **websockets** / **aiohttp** | Streaming real-time | Async WebSocket per feed dati exchange |
| **supabase-py** | Client Supabase | CRUD + Auth + Realtime (comunicazione con controlla-me) |
| **python-telegram-bot** | Notifiche + comandi | Alert sul telefono, approvazione trade con 1 tap |
| **FastAPI** | API REST del bot | Dashboard comandi, health check, metriche |
| **APScheduler** | Job scheduling | Cron-like per check periodici, rebalancing |
| **pydantic** | Validazione dati | Type-safe schemas per ordini, segnali, config |

### 3.4 Infrastruttura — Dove Far Girare il Bot

| Opzione | Costo/mese | Pro | Contro |
|---------|------------|-----|--------|
| **Hetzner CX23** | **€3.49** | 2 vCPU, 4GB RAM, 40GB SSD, 20TB traffic, datacenter EU (Germania) | Self-managed, no support applicativo |
| **Hetzner CAX11 (ARM)** | €3.79 | ARM Ampere, efficiente | Compatibilità librerie (ta-lib può dare problemi su ARM) |
| **Railway** | ~$5 | Deploy da GitHub, zero ops | Meno controllo, cold start possibili |
| **DigitalOcean** | $6 | Buona doc, marketplace | Più caro di Hetzner per meno risorse |
| **AWS EC2 Free Tier** | €0 (12 mesi) | Gratis il primo anno | t2.micro limitato, costi dopo 12 mesi |

**Raccomandazione:** **Hetzner CX23 a €3.49/mese** — il miglior rapporto qualità/prezzo in EU. Docker + systemd per auto-restart. In totale:

```
Costo infrastruttura guadagna-me:
  Hetzner VPS:    €3.49/mese
  Dominio:        già incluso
  Supabase:       già pagato (condiviso)
  API dati:       €0 (free tier Finnhub + exchange WS)
  Telegram bot:   €0
  ─────────────────────────
  TOTALE:         ~€3.50/mese
```

---

## PARTE 4: COME ESSERE COMPETITIVI — Nicchie e Strategie

### 4.1 Dove NON puoi competere

- **HFT (High-Frequency Trading)** — servono server co-locati, FPGA, latenza sub-microsecondo. Budget: milioni.
- **Market Making** — servono capitali enormi e infrastruttura dedicata.
- **Arbitraggio puro cross-exchange** — i margini sono <0.01%, serve velocità che non hai.

### 4.2 Dove PUOI competere (nicchie retail profittevoli)

| Nicchia | Perché funziona per te | Timeframe | Capitale necessario |
|---------|------------------------|-----------|-------------------|
| **Momentum/Trend Following crypto** | Crypto è volatile, trend durano giorni/settimane. Bot batte umano in disciplina (stop-loss, no emozioni) | 4h - 1 settimana | €500+ |
| **Mean Reversion su altcoin** | Altcoin meno efficienti, revertono alla media dopo pump/dump. Meno presidiato dai big player | 1h - 2 giorni | €500+ |
| **Event-Driven (earnings, macro)** | AI può processare news/eventi più veloce di un umano. Sfrutta le 1-2 ore post-evento | Minuti - ore | €1000+ |
| **DCA intelligente (Dollar Cost Averaging)** | Invece di DCA fisso, compra di più quando RSI è basso, meno quando alto. Outperforma DCA semplice | Settimanale | €200+ |
| **Grid Trading crypto** | Piazza ordini buy/sell a intervalli fissi in range. Profittevole in mercati laterali | Continuo | €500+ |

### 4.3 Il tuo vantaggio competitivo reale

1. **AI reasoning sui segnali** — non solo indicatori tecnici, ma LLM che analizza il contesto (news, sentiment, macro). I bot retail normali usano solo indicatori.
2. **Infrastruttura agentica già costruita** — hai già l'AI SDK, il fallback chain, il tier system. Riusi tutto.
3. **Disciplina algoritmica** — il bot rispetta SEMPRE lo stop-loss, SEMPRE il position sizing. L'umano no.
4. **Costi marginali bassi** — €3.50/mese di infrastruttura, free tier per i dati. Il break-even è bassissimo.
5. **Nicchie piccole** — con €2000 di capitale, cerchi €50-100/mese di profitto (2.5-5%). I fondi non possono operare su queste scale, ma per te è significativo.

### 4.4 Aspettative realistiche

| Scenario | Return mensile | Su €2000 | Note |
|----------|---------------|----------|------|
| **Pessimista** | -2% a +1% | -€40 a +€20 | Primi 3-6 mesi: learning + tuning |
| **Realistico** | +2% a +5% | +€40 a +€100 | Dopo validazione strategia |
| **Ottimista** | +5% a +10% | +€100 a +€200 | Con strategia validata e mercato favorevole |
| **Copertura costi piattaforma** | ~6% | ~€120 | Copre ~€115/mese di costi operativi |

⚠️ **Warning:** questi numeri assumono una strategia validata con backtesting. I primi mesi saranno di test e tuning, probabilmente in perdita o break-even. È NORMALE.

---

## PARTE 5: COMUNICAZIONE PYTHON ↔ TYPESCRIPT

### 5.1 Architettura Raccomandata

```
                    ┌─────────────────┐
                    │   Telegram Bot   │
                    │  (notifiche +    │
                    │   approvazioni)  │
                    └────────┬────────┘
                             │
┌──────────────┐    ┌────────▼────────┐    ┌──────────────────┐
│  Next.js     │    │   Python Bot    │    │   Exchange APIs  │
│  (Vercel)    │    │   (Hetzner VPS) │    │   Binance/Alpaca │
│              │    │                 │◄──►│   via ccxt       │
│  Dashboard   │    │  FastAPI +      │    └──────────────────┘
│  controlla-me│    │  Trading Engine │
│  (frontend)  │    │  + Agents       │    ┌──────────────────┐
└──────┬───────┘    └────────┬────────┘    │   Market Data    │
       │                     │             │   Finnhub/WS     │
       │    ┌────────────┐   │             └──────────────────┘
       └───►│  Supabase  │◄──┘
            │            │
            │ PostgreSQL │  ← ponte naturale tra TS e Python
            │ Realtime   │  ← Python scrive, JS ascolta in real-time
            │ Auth       │
            │ Storage    │
            └────────────┘
```

### 5.2 Pattern di Comunicazione

| Direzione | Meccanismo | Esempio |
|-----------|-----------|---------|
| **Bot → Dashboard** (real-time) | Bot scrive su Supabase → Dashboard ascolta via Supabase Realtime JS | Nuovo trade eseguito, update PnL |
| **Dashboard → Bot** (comandi) | Dashboard scrive su tabella `bot_commands` → Bot polling SQL o LISTEN/NOTIFY | "Ferma strategia", "Cambia parametri" |
| **Bot → Utente** (urgente) | Telegram diretto | "Segnale: comprare ETH a $X. Approva?" |
| **Utente → Bot** (urgente) | Tap bottone Telegram | "Approva" / "Rifiuta" |
| **Bot → Health** (monitoring) | FastAPI endpoint `/health` | Dashboard mostra stato bot |

### 5.3 Perché Supabase come ponte

- **Zero infrastruttura aggiuntiva** — già nel tuo stack, già pagato
- **`supabase-py`** — client Python ufficiale, supporta CRUD, Auth, Storage, Realtime
- **Supabase Realtime JS** è maturo e affidabile (usato da milioni di app)
- **RLS** per sicurezza: bot usa `service_role` key, frontend usa `anon` key con RLS
- **Source of truth unica** — un solo database per tutto

### 5.4 Pattern Scartati e Perché

| Pattern | Motivo esclusione |
|---------|------------------|
| gRPC | Overkill per 2 servizi, incompatibile con Vercel serverless, setup complesso |
| WebSocket diretto | Incompatibile con Vercel (timeout), Supabase Realtime fa lo stesso gratis |
| RabbitMQ / NATS | Infrastruttura aggiuntiva non necessaria per one-man team |
| Redis Pub/Sub | Servizio in più da gestire; Supabase copre il caso. Solo se serve <50ms tra servizi co-locati |

### 5.5 Risposta alla domanda: "CME riuscirà a comunicarci?"

**Sì, perfettamente.** controlla-me (TypeScript/Next.js) e guadagna-me (Python) comunicano tramite Supabase PostgreSQL. Entrambi leggono e scrivono sullo stesso database. Il frontend Next.js ascolta le modifiche in real-time. Non serve nessun middleware aggiuntivo.

---

## PARTE 6: ARCHITETTURA AGENTI guadagna-me

### 6.1 Agenti del Dipartimento Treasury

| Agente | Linguaggio | Modello AI | Input | Output |
|--------|------------|-----------|-------|--------|
| **Market Scanner** | Python | Nessuno (puro codice) | WebSocket feed da exchange | Alert quando condizioni soddisfatte |
| **Signal Analyzer** | Python | Haiku 4.5 (via AI SDK o API diretta) | OHLCV + indicatori + contesto | Score opportunità 0-1 + reasoning |
| **News Sentinel** | Python | Haiku 4.5 | Feed news (Finnhub news API) | Sentiment + impatto previsto |
| **Risk Manager** | Python | Nessuno (puro codice, regole deterministiche) | Portafoglio + segnale | Position size + stop-loss + take-profit |
| **Executor** | Python | Nessuno (puro codice) | Ordine approvato | Esecuzione via ccxt + conferma |
| **Portfolio Tracker** | Python | Nessuno (puro codice) | Stato posizioni | Report PnL + analytics |
| **Strategy Optimizer** | Python | Sonnet 4.5 (periodico, non real-time) | Trade history (ultimo mese) | Suggerimenti parametri |

**Nota importante:** solo 3 agenti su 7 usano LLM. Il resto è codice deterministico. Questo è intenzionale:
- **Meno costo** — le chiamate AI costano, il codice no
- **Più veloce** — i calcoli indicatori devono essere istantanei
- **Più affidabile** — il Risk Manager NON deve "ragionare", deve CALCOLARE

### 6.2 Flusso Operativo

```
[Market Scanner]  ─── polling 5s / WebSocket ───►  Dati mercato freschi
       │
       │ condizione trigger soddisfatta (es. RSI < 30 + volume spike)
       ▼
[Signal Analyzer]  ─── AI reasoning ───►  "Score 0.82, motivo: oversold con volume"
       │
       │ score > threshold (0.7)
       ▼
[News Sentinel]  ─── check news ultime 24h ───►  "Nessuna news negativa"
       │
       │ no red flags
       ▼
[Risk Manager]  ─── calcolo deterministico ───►  "Buy 0.05 ETH, SL -2%, TP +4%"
       │
       ├── se risk < 0.5% e score > 0.8 ──► AUTO-EXECUTE (semi-auto mode)
       │
       └── altrimenti ──► TELEGRAM NOTIFICATION ──► attendi approvazione
                                                           │
                                                    [Utente approva]
                                                           │
                                                           ▼
[Executor]  ─── ccxt.create_order() ───►  Ordine piazzato su exchange
       │
       │ ordine confermato
       ▼
[Portfolio Tracker]  ─── aggiorna Supabase ───►  Dashboard aggiornata in real-time
       │
       │ fine settimana / fine mese
       ▼
[Strategy Optimizer]  ─── AI analysis ───►  "Suggerisco: alza threshold a 0.75, il mercato è in range"
```

### 6.3 Schema Database (nuove tabelle Supabase)

```sql
-- Tabelle per guadagna-me (prefisso treasury_)

treasury_signals        -- segnali generati dal Signal Analyzer
treasury_orders         -- ordini eseguiti/proposti
treasury_positions      -- posizioni aperte
treasury_portfolio      -- snapshot portafoglio (daily)
treasury_trades_log     -- log completo di ogni trade (audit trail)
treasury_strategies     -- strategie attive con parametri
treasury_bot_status     -- heartbeat del bot (last_seen, status, errors)
treasury_bot_commands   -- comandi dalla dashboard/Telegram
```

### 6.4 Come Riusa l'Infrastruttura Esistente

| Componente controlla-me | Riuso in guadagna-me | Come |
|--------------------------|---------------------|------|
| AI SDK (generate, agent-runner) | ✅ Per Signal Analyzer e Strategy Optimizer | Chiama direttamente le API Anthropic/Gemini da Python (stessi modelli, diverso client) |
| Model Registry (modelli + costi) | ✅ Come reference | Stesso catalogo, client Python diverso |
| Tier System | ✅ Stesso concetto | tier = quanto spendi per la qualità del segnale |
| Supabase | ✅ Stesso progetto | Tabelle separate con prefisso `treasury_` |
| Design System | ✅ Per la dashboard | Stessa palette, stessi componenti |
| Auth (Supabase) | ✅ Stesso utente | Login unico per controlla-me e dashboard treasury |

**Cosa NON riusa:**
- Vector Store / Embeddings — non serve per il trading
- Legal Corpus — dominio completamente diverso
- Agenti legali — dominio completamente diverso

---

## PARTE 7: ROADMAP RACCOMANDATA

### Fase 0: Fix controlla-me (1-2 settimane)
- [ ] Fix build (6 componenti mancanti)
- [ ] Fix test stale (17 fallimenti)
- [ ] Deploy su Vercel
- [ ] Primo utente reale

### Fase 1: guadagna-me — Foundation (2 settimane)
- [ ] Setup repo Python con struttura agenti
- [ ] Market Scanner: polling Binance via ccxt (solo monitoring, zero trading)
- [ ] Signal Analyzer: indicatori tecnici con pandas-ta
- [ ] Logging su Supabase (tabelle treasury_*)
- [ ] Bot Telegram per notifiche

### Fase 2: guadagna-me — Paper Trading (2 settimane)
- [ ] Risk Manager con regole deterministiche
- [ ] Executor in modalità PAPER (simula ordini, non esegue)
- [ ] Portfolio Tracker
- [ ] Dashboard React (tab in controlla-me o app separata)
- [ ] Backtesting con vectorbt su dati storici

### Fase 3: guadagna-me — Live Trading (2 settimane)
- [ ] Executor in modalità LIVE con limiti stretti
- [ ] Approvazione manuale via Telegram
- [ ] Monitor automatico (heartbeat, alert se bot down)
- [ ] Primo trade reale con €100 di test

### Fase 4: Ottimizzazione (ongoing)
- [ ] Strategy Optimizer con AI
- [ ] News Sentinel
- [ ] Aggiungere Alpaca per azioni US
- [ ] Multi-strategia
- [ ] Semi-auto mode (dopo 1 mese di track record positivo)

### Budget Totale Stimato

```
Infrastruttura:
  Hetzner VPS:              €3.49/mese
  Supabase (già pagato):    €0 aggiuntivo
  Finnhub free tier:        €0
  Telegram API:             €0
  Dominio (già pagato):     €0
  ──────────────────────────
  Subtotale infra:          €3.49/mese

API AI (stimato):
  Signal Analyzer (~50 call/giorno × Haiku): ~$2/mese
  Strategy Optimizer (1 call/settimana × Sonnet): ~$0.50/mese
  ──────────────────────────
  Subtotale AI:             ~$2.50/mese

Capitale di trading:
  Iniziale:                 €500 (paper) → €500-2000 (live)
  ──────────────────────────
  TOTALE MENSILE:           ~€6/mese + capitale di trading
```

---

## PARTE 8: VERDETTO FINALE

### Costruire guadagna-me? **SÌ, ma con disciplina.**

**Perché sì:**
1. Costo infrastruttura ridicolmente basso (~€6/mese)
2. Riusa l'infrastruttura esistente (Supabase, design system, auth)
3. Può generare revenue indipendente da controlla-me
4. L'architettura agentica è perfettamente applicabile al trading
5. Nicchie retail accessibili (momentum crypto, mean reversion altcoin, DCA intelligente)
6. Python ha l'ecosistema perfetto (ccxt, pandas-ta, vectorbt)
7. Comunicazione con controlla-me risolta (Supabase come ponte)

**Perché "con disciplina":**
1. **Non iniziare il live trading prima di aver validato con paper trading** (min 1 mese)
2. **Non abbandonare controlla-me** — deve arrivare a deployment prima
3. **Budget di trading = soldi che puoi perdere** — €500 iniziali, non di più
4. **Aspettative realistiche** — i primi 3-6 mesi sono di learning, non di profitto
5. **Stop-loss non negoziabili** — sono nel codice, non nella tua volontà

### Sequenza raccomandata

```
ADESSO          → Fix controlla-me (build + test + deploy)
SETTIMANA 3-4   → Setup guadagna-me (scanner + indicatori + Telegram)
SETTIMANA 5-6   → Paper trading (backtest + simulazione live)
SETTIMANA 7-8   → Primo live trade (€100-500, manuale via Telegram)
MESE 3+         → Semi-auto se track record positivo
```

---

## FONTI

### Broker & Exchange
- [Alpaca Trading API](https://alpaca.markets/) — [Review 2026](https://brokerchooser.com/broker-reviews/alpaca-trading-review) — [EU Expansion](https://alpaca.markets/blog/alpaca-enters-uk-and-eu-market-through-wealthkernel-acquisition/)
- [Interactive Brokers API](https://www.interactivebrokers.com/en/trading/ib-api.php) — [Python Guide](https://www.interactivebrokers.com/campus/ibkr-quant-news/interactive-brokers-python-api-native-a-step-by-step-guide/)
- [ccxt — 107 exchange supportati](https://github.com/ccxt/ccxt)

### Market Data
- [Finnhub](https://finnhub.io/) — [Best Financial Data APIs 2026](https://www.nb-data.com/p/best-financial-data-apis-in-2026)
- [CoinGecko API](https://www.coingecko.com/learn/top-5-best-crypto-exchange-data-apis)
- [Alpha Vantage](https://www.alphavantage.co/)

### Infrastruttura
- [Hetzner Cloud](https://www.hetzner.com/cloud) — [Pricing Calculator](https://costgoat.com/pricing/hetzner)
- [Best Brokers for Algo Trading in Europe 2026](https://brokerchooser.com/best-brokers/best-brokers-for-algo-trading-in-europe)

### Strategia Retail
- [Can Algo Traders Succeed at Retail Level](https://www.quantstart.com/articles/Can-Algorithmic-Traders-Still-Succeed-at-the-Retail-Level/)
- [Algo Trading for Retail Investors](https://blog.traderspost.io/article/algorithmic-trading-for-retail-investors)
- [Top Algo Strategies 2025](https://chartswatcher.com/pages/blog/top-algorithmic-trading-strategies-for-2025)
