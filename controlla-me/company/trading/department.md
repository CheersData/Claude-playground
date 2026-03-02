# Ufficio Trading

## Tipo

**Ufficio** (Revenue) — non un dipartimento staff.

## Missione

Trading automatizzato su azioni US e ETF via Alpaca per garantire sostenibilità finanziaria a Controlla.me. Ogni euro generato dal trading è un euro che non serve chiedere agli utenti.

## Vincolo Architetturale (direttiva boss)

**L'Ufficio Trading gira sullo stesso localhost dell'app Next.js.** Non è un microservizio remoto.
- Comunica con tutti i dipartimenti via Supabase condiviso
- CME è l'unico interlocutore — nessun dipartimento parla direttamente col Trading
- CME orchestra gli agenti Python localmente (es. `python -m src.agents.market_scanner`)
- Non serve una API HTTP separata tra Trading e Next.js

## Stack

- **Linguaggio**: Python 3.11+
- **Broker**: Alpaca Markets (commission-free, paper + live)
- **Dati**: Alpaca Market Data API + FRED (macro, opzionale)
- **Database**: Supabase condiviso (schema `trading_*`)
- **Infrastruttura**: `/trading` nel monorepo — stesso localhost dell'app principale

## Strategia

- **Swing trading**: hold 3-15 giorni
- **Universo**: azioni US (S&P 500, NASDAQ 100) + ETF settoriali
- **Frequenza decisionale**: hourly scan + signal generation (daily per backtest storici)
- **Esecuzione**: market/limit orders via Alpaca API
- **Timeframe**: 1Hour per segnali operativi, 1Day per analisi macro/trend

## Risk Management (NON NEGOZIABILE)

| Parametro | Valore | Note |
|-----------|--------|------|
| Max daily loss | -2% del portfolio | Kill switch automatico |
| Max weekly loss | -5% del portfolio | Kill switch automatico |
| Max position size | 10% del portfolio | Diversificazione obbligatoria |
| Max positions | 10 simultanee | Concentrazione limitata |
| Stop loss | -5% per posizione | Automatico su ogni trade |
| Paper trading | 30 giorni minimi | Prima di qualsiasi trade live |

## Pipeline

```
[1] MARKET SCANNER (daily, pre-market)
    → Filtra universo: volume, volatilità, trend, settore
    → Output: watchlist 20-30 titoli
    |
[2] SIGNAL GENERATOR (daily, post-scan)
    → Analisi tecnica + sentiment su watchlist
    → Output: segnali BUY/SELL/HOLD con confidence score
    |
[3] RISK MANAGER (pre-trade)
    → Valida segnali vs portfolio corrente
    → Verifica limiti: position size, correlazione, drawdown
    → Output: ordini approvati o rigettati con motivazione
    |
[4] EXECUTOR (on-signal)
    → Piazza ordini su Alpaca
    → Gestisce fill, partial fill, rejection
    → Output: trade log con execution details
    |
[5] PORTFOLIO MONITOR (continuous)
    → Monitora posizioni aperte
    → Triggera stop loss, take profit
    → Genera P&L report giornaliero
    → Alert a Finance + CME su eventi critici
```

## Fasi di Deployment

| Fase | Durata | Criteri go/no-go |
|------|--------|-----------------|
| 1. Fondamenta | 1-2 settimane | Infrastruttura Python funzionante, connessione Alpaca paper, schema DB |
| 2. Backtest | 1-2 settimane | Backtest su dati storici (min 1 anno), Sharpe > 1.0, max drawdown < 15% |
| 3. Paper Trading | 30 giorni minimi | Paper trading con risultati consistenti col backtest, nessun bug critico |
| 4. Go Live | Indefinito | Boss approva, capital allocato, kill switch testato |

## Agenti

| Agente | File | Ruolo |
|--------|------|-------|
| market-scanner | `agents/market-scanner.md` | Screening giornaliero universo titoli |
| signal-generator | `agents/signal-generator.md` | Generazione segnali buy/sell |
| risk-manager | `agents/risk-manager.md` | Validazione rischio pre-trade |
| executor | `agents/executor.md` | Esecuzione ordini su Alpaca |
| portfolio-monitor | `agents/portfolio-monitor.md` | Monitoring posizioni e P&L |
| trading-strategist | `agents/trading-strategist.md` | Analisi backtest, calibrazione parametri, nuove strategie |

## Leader

**trading-lead** — Coordina i 6 agenti, gestisce la pipeline, reporta a CME.

## Runbooks

- `runbooks/trading-pipeline.md` — Esecuzione pipeline giornaliera
- `runbooks/risk-management.md` — Procedure risk e kill switch
- `runbooks/backtest.md` — Come eseguire e validare backtest
- `runbooks/go-live.md` — Checklist per passaggio a live trading

## Env vars richieste

```env
ALPACA_API_KEY=...           # Alpaca API key (paper o live)
ALPACA_SECRET_KEY=...        # Alpaca secret key
ALPACA_BASE_URL=https://paper-api.alpaca.markets  # paper per default, live quando approvato
FRED_API_KEY=...             # Federal Reserve Economic Data (opzionale, macro indicators)
```
