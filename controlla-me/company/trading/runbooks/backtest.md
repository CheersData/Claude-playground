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
# Ciclo 4 defaults (SL=1.5, TP=3.0 — omessi perche ora sono default)
py -m src.backtest run --start 2023-01-01 --end 2024-12-31 --capital 100000

# Con override esplicito
py -m src.backtest run --start 2023-01-01 --end 2024-12-31 --capital 100000 --sl-atr 1.5 --tp-atr 3.0
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

Per strategia daily MACD su ETF (Ciclo 1-3):
- `--sl-atr 2.5` (stop loss = 2.5x ATR)
- `--tp-atr 6.0` (take profit = 6.0x ATR)
- `--threshold 0.3` (signal score minimo)
- `--max-positions 10`
- Filtro SMA200: ON
- Conferma RSI: ON

**Nuovi defaults Ciclo 4** (aggiornati 2026-03-14 in `engine.py` e `__main__.py`):
- `--sl-atr 1.5` (stop loss = 1.5x ATR, ridotto da 2.0)
- `--tp-atr 3.0` (take profit = 3.0x ATR, ridotto da 6.0)
- Risk/reward ratio: 2:1 (invariato)
- Rationale: 126/136 exit su SL nel Ciclo 3 (92.6%). TP a 6x mai raggiunto.

## Trailing Stop — sistema a 4 tier (aggiornato 2026-03-02)

Il trailing stop protegge i profitti in 4 fasi progressive. Tutti i parametri sono configurabili via CLI.

| Tier | Parametro CLI | Default | Effetto |
|------|--------------|---------|---------|
| 0 — Breakeven | `--trail-breakeven` | 1.0 ATR | Dopo +1.0 ATR: SL → entry (breakeven) |
| 1 — Lock | `--trail-lock` / `--trail-lock-cushion` | 1.5 / 0.5 ATR | Dopo +1.5 ATR: SL → entry + 0.5 ATR |
| 2 — Trail | `--trail-threshold` / `--trail-distance` | 2.5 / 1.5 ATR | Dopo +2.5 ATR: SL → highest - 1.5 ATR |
| 3 — Tight | `--trail-tight-threshold` / `--trail-tight-distance` | 4.0 / 1.0 ATR | Dopo +4.0 ATR: SL → highest - 1.0 ATR |

**Esempio**: trade entra a $100, ATR = $2:
- Prezzo sale a $102 (+1.0 ATR) → SL = $100 (breakeven)
- Prezzo sale a $103 (+1.5 ATR) → SL = $101 (lock +$1)
- Prezzo sale a $105 (+2.5 ATR) → SL = $105 - $3 = $102 (trail)
- Prezzo sale a $108 (+4.0 ATR) → SL = $108 - $2 = $106 (tight trail)

### Grid search trailing stop

```bash
# Grid search con preset TPSL (96 combinazioni, include trailing + signal exit)
py -m src.backtest grid --start 2019-01-01 --end 2026-02-28 --grid-preset tpsl \
  --universe XLF,XLK,XLE,XLV,XLI,XLU,XLY,XLP,XLRE,XLB,XLC,SPY,QQQ,IWM

# Run singolo con trailing custom
py -m src.backtest run --start 2019-01-01 --end 2026-02-28 --sl-atr 2.5 --tp-atr 6.0 \
  --trail-breakeven 1.0 --trail-lock 1.5 --trail-threshold 2.5 --trail-distance 1.5 \
  --universe XLF,XLK,XLE,XLV,XLI,XLU,XLY,XLP,XLRE,XLB,XLC,SPY,QQQ,IWM
```

---

## Ciclo 4 — Grid Search mirato (preparato 2026-03-14)

### Diagnosi dal Ciclo 3

| Metrica | Ciclo 3 (SL=2.5, TP=6.0) |
|---------|--------------------------|
| Sharpe | 0.975 (mancano 0.025) |
| SL exit rate | 92.6% (126/136) |
| TP exit rate | <1% |
| Avg Win | +8% |
| Avg Loss | -2.75% |
| Avg Hold | 20 giorni |

**Problema**: SL=2.5x ATR colpisce troppo spesso. TP=6.0x ATR quasi mai raggiunto (il trailing stop cattura i profitti prima). La volatilita dei ritorni e alta per i molti piccoli stop loss.

**Ipotesi Ciclo 4**: Abbassare SL (1.5-2.0) riduce la dimensione media della perdita. Abbassare TP (3-5x) cattura piu profitti prima che si ritirino. Signal exit puo chiudere posizioni su inversione MACD.

### Preset `cycle4` — 48 combinazioni

| Parametro | Valori | Note |
|-----------|--------|------|
| `stop_loss_atr` | 1.5, 2.0, 2.5 | Focus su 1.5-2.0 (SL piu stretto) |
| `take_profit_atr` | 3.0, 4.0, 5.0, 6.0 | Tighter TP range |
| `trailing_breakeven_atr` | 0.5, 1.5 | Early vs late breakeven |
| `signal_exit_enabled` | OFF, ON | Ciclo 3 usava OFF |
| Trailing trail/tight | Fissi (3.5/2.0/4.0/1.0) | Grid-optimal da ricerche precedenti |
| `trend_filter` | ON | Fisso |
| `max_positions` | 10 | Fisso |

**Totale: 3 x 4 x 2 x 2 = 48 combinazioni**

### Comandi da eseguire

```bash
cd C:\Users\crist\Claude-playground\controlla-me\trading

# Step 1: Grid search su 2 anni (2023-2024) — stesse condizioni del Ciclo 3
py -m src.backtest grid --start 2023-01-01 --end 2024-12-31 --grid-preset cycle4 --capital 100000

# Step 2: Se trovato GO, conferma su 3 anni (2022-2024) per robustezza
py -m src.backtest grid --start 2022-01-01 --end 2024-12-31 --grid-preset cycle4 --capital 100000

# Step 3: Run singolo con i parametri vincenti per equity curve
# (sostituire SL/TP/tBE/sigExit con i valori migliori dal CSV)
py -m src.backtest run --start 2023-01-01 --end 2024-12-31 --capital 100000 \
  --sl-atr X.X --tp-atr X.X --trail-breakeven X.X

# Step 4: Train/test split per out-of-sample validation
py -m src.backtest run --start 2022-01-01 --end 2024-12-31 --capital 100000 \
  --sl-atr X.X --tp-atr X.X --trail-breakeven X.X --mode train_test
```

### Criteri di successo Ciclo 4

- [ ] Almeno 1 combinazione con Sharpe > 1.0
- [ ] SL exit rate < 70% (miglioramento vs 92.6% del Ciclo 3)
- [ ] Combinazione vincente non su picco isolato nel CSV
- [ ] Out-of-sample entro 20% dell'in-sample
- [ ] Equity curve senza cliff

### Dopo il Ciclo 4

Se GO: applicare parametri a `BacktestConfig` defaults e `settings.py`, poi passare a Fase 3 (Paper Trading 30gg).

Se NO-GO: considerare cambio strategia (noise boundary momentum, mean reversion v3) o ampliamento universo.
