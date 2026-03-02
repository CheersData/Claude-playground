# Runbook: Backtest

## Scopo

Validare la strategia di trading su dati storici prima di passare a paper/live trading.

## Prerequisiti

- Python 3.11+ (`cd trading && python --version`)
- Alpaca API key configurata (`.env` in `trading/` o environment)
- I dati vengono scaricati automaticamente via Alpaca Market Data API — nessun download manuale necessario

## CLI — Comandi Corretti

> ⚠️ I comandi si eseguono dalla root del monorepo (es. `C:\...\controlla-me\`)

```bash
# Backtest standard (strategia daily MACD, universo completo)
cd C:\...\controlla-me
py -m src.backtest run --start 2023-03-01 --end 2026-02-28 --capital 20000

# Backtest su ETF settoriali (universo ridotto, consigliato)
py -m src.backtest run --start 2019-01-01 --end 2026-02-28 --capital 20000 --universe XLF,XLK,XLE,XLV,XLI,XLU,XLY,XLP,XLRE,XLB,XLC,SPY,QQQ,IWM --sl-atr 2.5 --tp-atr 6.0

# Con parametri personalizzati
py -m src.backtest run \
  --start 2023-03-01 \
  --end 2026-02-28 \
  --capital 20000 \
  --sl-atr 2.5 \
  --tp-atr 6.0 \
  --threshold 0.3 \
  --max-positions 10

# Train/test split (70/30)
py -m src.backtest run --start 2023-03-01 --end 2026-02-28 --capital 20000 --mode train_test

# Grid search su parametri
py -m src.backtest grid --start 2024-03-01 --end 2026-02-28 --capital 20000

# Intraday mean reversion su ETF (15-min) — sperimentale
py -m src.backtest run --start 2024-09-01 --end 2026-02-28 --timeframe 15Min --capital 20000 --max-positions 5

# Aiuto
py -m src.backtest run --help
py -m src.backtest grid --help
```

> **Nota Windows**: usare `py` invece di `python` se `python` non è nel PATH.
> Eseguire dalla directory `trading/` oppure passare il path completo (`cd trading && py -m src.backtest run ...`).

## Criteri go/no-go

| Metrica | Soglia minima | Note |
|---------|--------------|------|
| Sharpe Ratio | > 1.0 | Risk-adjusted return vs 4% risk-free |
| Max Drawdown | < 15% | Perdita max da picco |
| Win Rate | > 50% | % trade positivi |
| Profit Factor | > 1.5 | Gross profit / gross loss |
| Numero trade | > 100 | Significatività statistica |

**Nota su Sharpe**: il sistema usa `RISK_FREE_RATE = 0.04` (4%, T-bill 2024-2026). Se `CAGR < 4%` lo Sharpe risulta negativo anche con strategia profittevole. Per superare questa soglia occorre un CAGR > 6% (buffer sicuro sopra il risk-free).

## Output backtest

Ogni run genera automaticamente (in `trading/backtest-results/YYYYMMDD_HHMMSS/`):
- `report.json` — metriche complete + go/no-go checks
- `equity_curve.png` — curva equity
- `trades.csv` — log completo trades

## Procedura standard

### 1. Esecuzione

```bash
py -m src.backtest run --start 2023-03-01 --end 2026-02-28 --capital 20000 --sl-atr 2.5 --tp-atr 6.0
```

### 2. Verifica output CLI

Controllare nella stampa finale:
- [ ] Sharpe > 1.0
- [ ] Max drawdown < 15%
- [ ] Win rate > 50%
- [ ] Profit factor > 1.5
- [ ] Totale trade > 100
- [ ] VERDICT: GO

### 3. Analisi approfondita

Aprire `equity_curve.png` e verificare:
- [ ] Curva equity senza "cliff" improvvisi
- [ ] Drawdown brevi e recuperati
- [ ] Performance consistente in diversi periodi (bull, bear, sideways)

### 4. Out-of-sample validation

```bash
py -m src.backtest run --start 2023-03-01 --end 2026-02-28 --capital 20000 --mode train_test
```

Criteri:
- [ ] Metriche out-of-sample entro 20% delle metriche in-sample
- [ ] No degradazione significativa su periodo di test

### 5. Sensitivity analysis (grid search)

```bash
py -m src.backtest grid --start 2024-03-01 --end 2026-02-28 --capital 20000
```

Criteri:
- [ ] Strategia profittevole con almeno 70% delle combinazioni testate
- [ ] No "parameter cliff" (piccole variazioni non causano crolli)

### 6. Decisione go/no-go

Se TUTTI i criteri sono soddisfatti:
1. Documentare risultati nel task system (`npx tsx scripts/company-tasks.ts done <id>`)
2. Creare report in `company/trading/reports/backtest-YYYY-MM-DD.md`
3. Presentare a CME per approvazione
4. Se approvato: passare a Fase 3 (Paper Trading)

Se criteri NON soddisfatti:
1. Identificare la weakness principale
2. Iterare su strategia/parametri
3. Ripetere backtest
4. Max 3 iterazioni — se non soddisfa, pivot strategia completo

## Risultati storici

### Backtest 2026-03-02 — Daily MACD, ETF settoriali

Vedi report completo: `company/trading/reports/backtest-2026-03-02.md`

| Configurazione | Sharpe | MaxDD | WinRate | PF | Trade | Esito |
|---------------|--------|-------|---------|-----|-------|-------|
| Universo completo (43 simboli), 3yr | 0.098 | -17.2% | 53.5% | 1.31 | 432 | ❌ NO-GO |
| ETF only (14 simboli), 7yr, SL2.5/TP6.0 | -0.112* | -5.94% | 60.9% | 1.91 | 184 | ⚠️ 4/5 |
| 15Min mean reversion (12 ETF), v1 | -36.86 | -0.88% | 39.6% | 0.85 | 149 | ❌ NO-GO |

*Sharpe negativo causa CAGR (3.58%) < risk-free rate (4%). Strategia profittevole, non batte T-bill.

## Parametri ottimali trovati (da grid search)

Per strategia daily MACD su ETF:
- `--sl-atr 2.5` (stop loss = 2.5x ATR)
- `--tp-atr 6.0` (take profit = 6.0x ATR)
- `--threshold 0.3` (signal score minimo)
- `--max-positions 10`
- Filtro SMA200: ON
- Conferma RSI: ON
