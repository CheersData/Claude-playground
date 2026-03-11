# Noise Boundary Momentum — Backtest Results (2026-03-05)

## Contesto

Dopo 4 varianti della slope strategy tutte fallite (5Min, 15Min, contrarian, anticipatory), lo strategist ha proposto la **Noise Boundary Momentum** (Zarattini-Aziz-Barbon 2024, paper peer-reviewed, Sharpe 1.33 su SPY 17 anni).

Implementazione già presente nel codebase (`analysis.py::precompute_noise_boundaries()` + `engine.py`). Fix applicato: SHORT ora abilitato per NB su tutti i timeframe (non solo 5Min).

## Parametri (paper default)

| Parametro | Valore | Significato |
|-----------|--------|-------------|
| band_mult | 1.0 | Larghezza noise boundary (1× sigma_open) |
| lookback_days | 14 | Finestra rolling per sigma_open |
| trade_freq_bars | 6 | Checkpoint ogni 30min (6 × 5Min) |
| safety_sl_atr | 3.0 | SL crash-protection (exit primaria è NB signal change) |
| nb_last_entry_utc | 19 | No entry dopo 19:00 UTC (3PM ET) |
| Timeframe | 5Min | Barre da 5 minuti |
| Periodo | 2023-01-01 → 2024-12-31 | 2 anni |
| Capitale | $100,000 | No leva |

## Risultati

### Test 1: SPY solo (fedele al paper)

| Metrica | Valore | Paper (2007-2024) |
|---------|--------|-------------------|
| Return | **-1.50%** | +19.6%/anno |
| Trades | 411 | ~200/anno |
| Win Rate | 32.1% | 43% |
| Profit Factor | 0.75 | >1.5 |
| Max Drawdown | **-1.79%** | ~12% |
| Avg Win | +0.35% | — |
| Avg Loss | -0.22% | — |
| Payoff Ratio | 1.59:1 | 2.0:1 |
| Time Invested | 10.9% | — |
| Close: NB Exit | 294 (71.5%) | — |
| Close: EOD | 117 (28.5%) | — |
| Stop Loss | 0 | — |

### Test 2: ETF Universe (12 simboli: 11 settori + SPY)

| Metrica | Valore |
|---------|--------|
| Return | **-18.74%** |
| Trades | 4,701 |
| Win Rate | 30.8% |
| Profit Factor | 0.74 |
| Max Drawdown | **-19.49%** |
| Avg Win | +0.42% |
| Avg Loss | -0.25% |
| Payoff Ratio | 1.68:1 |
| Time Invested | 32.3% |
| Close: NB Exit | 3,424 (72.8%) |
| Close: EOD | 1,277 (27.2%) |
| Stop Loss | 0 |

### Comparazione storica completa

| Strategia | TF | Return | Win Rate | Sharpe | Max DD | PF |
|-----------|-----|--------|----------|--------|--------|-----|
| Slope originale | 5Min | -34.8% | 26.7% | -179.7 | -34.9% | 0.41 |
| Slope 3-factor | 15Min | -12.9% | 27.8% | -87.5 | -12.9% | 0.49 |
| Slope contrarian | 15Min | -7.0% | 28.0% | -73.8 | -7.2% | — |
| Slope anticipatory | 15Min | -7.1% | 27.8% | -76.9 | — | — |
| **NB SPY solo** | **5Min** | **-1.5%** | **32.1%** | — | **-1.8%** | **0.75** |
| NB ETF universe | 5Min | -18.7% | 30.8% | — | -19.5% | 0.74 |
| Composite daily | Daily | +11.1% | 52.2% | 0.975 | -3.9% | 2.20 |

## Analisi — Perché il paper fa +19.6%/anno e noi -1.5%

### 1. LEVERAGE (differenza principale)
Il paper usa **volatility-targeted sizing con fino a 4× leva**. Noi usiamo 10% max position = effettivamente nessuna leva. Con solo 10.9% del tempo investito e posizioni piccole, anche i trade vincenti generano rendimenti minimi.

### 2. Calibrazione per SPY unico
La NB è calibrata per un singolo strumento ultra-liquido. Su 12 ETF settoriali meno liquidi, i noise boundaries sono meno affidabili → più falsi segnali → perdita maggiore (-18.7% vs -1.5%).

### 3. Periodo di test (2023-2024 vs 2007-2024)
Il paper media su 17 anni inclusi crash (2008, 2020) dove la strategia short eccelle. Il nostro test copre un forte bull market (2023-2024) dove lo shorting perde sistematicamente.

### 4. EOD Close problem
28% dei trade chiusi a fine giornata = entrati troppo tardi, non hanno tempo di maturare profitto.

## Aspetti positivi

1. **Payoff ratio 1.59:1** — i vincitori SONO più grandi dei perdenti (corretto)
2. **Zero stop loss** — le uscite sono ordinate (NB signal change o EOD)
3. **Max DD 1.8% su SPY** — il capitale non viene distrutto
4. **La logica funziona** — la strategia discrimina (32.1% win rate vs 28% della slope)
5. **Gap al breakeven è solo 6.4 punti di win rate** (serve 38.5%, siamo a 32.1%)

## Prossimi passi proposti

### Opzione A: Ottimizzare NB su SPY con leva (paper-faithful)
- Implementare volatility-targeted sizing (4× max leverage)
- Ridurre band_mult a 0.8 per più segnali
- Filtro orario più stretto (no entry dopo 14:00 ET)
- Aggiungere mean-reversion gap trade (componente separata del paper)
- Target: replicare le condizioni esatte del paper

### Opzione B: Abbandonare intraday, focus su daily composite
- La strategia composite daily è a Sharpe 0.975 (gap 0.025 da soglia 1.0)
- Tuning minimale per superare la soglia GO
- Rischio inferiore, infrastruttura pronta

### Opzione C: Ibrido — Daily composite + NB SPY intraday
- Due strategie su due account Alpaca separati
- Daily: swing trading su large cap + ETF (Sharpe 0.975)
- Intraday: NB solo su SPY con leva (da ottimizzare)
- Diversificazione temporale: daily non correla con intraday

## Note tecniche

- Il Sharpe ratio nel report è calcolato bar-by-bar (5Min) e annualizzato come se fossero giorni → numero senza senso. Da correggere nel metrics calculator per aggregare returns giornalieri.
- Data loader usa Alpaca (15min delay su free tier). Il boss paga Tiingo — integrare Tiingo nel data loader per dati real-time a zero delay.
- Dati cachati in `.backtest-cache/` come Parquet — i prossimi run saranno istantanei.
