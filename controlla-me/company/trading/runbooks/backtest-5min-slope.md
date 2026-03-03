# Runbook: Backtest 5-min Slope+Volume vs Daily MACD

**Task #265**
**Autore:** Trading Lead
**Data:** 2026-03-03
**Status:** Framework operativo — dati da scaricare prima di eseguire

---

## Obiettivo

Confrontare la strategia intraday Slope+Volume (5-min, SPY) con la baseline daily MACD
su ETF settoriali. L'obiettivo è determinare se il Modello 2 raggiunge i criteri go/no-go
con target Sharpe > 1.5, max drawdown < 10%, win rate > 52%.

---

## Prerequisiti

- Python 3.11+ con ambiente `trading/` attivo
- `ALPACA_API_KEY` e `ALPACA_SECRET_KEY` configurati nel file `trading/.env`
- Dati 5-min scaricati (step 1 obbligatorio)

### Verifica ambiente

```bash
cd C:\Users\crist\Claude-playground\controlla-me\trading
python --version     # deve essere 3.11+
python -c "import alpaca; print('alpaca ok')"
python -c "import pandas; print('pandas ok')"
python -c "import ta; print('ta ok')"
```

---

## Step 1 — Scarica i dati SPY 5-min (6 mesi)

Il DataLoader usa Alpaca come sorgente per i dati 5-min e li salva in
`.backtest-cache/` come Parquet. Questo step popola la cache e non deve
essere ripetuto a ogni backtest (la cache viene riutilizzata automaticamente).

```bash
cd C:\Users\crist\Claude-playground\controlla-me\trading

# Download base: SPY 6 mesi
python scripts/fetch_5min_data.py --symbols SPY --months 6

# Dry run per verificare cosa viene scaricato senza eseguire
python scripts/fetch_5min_data.py --symbols SPY --months 6 --dry-run

# Se si vuole forzare il re-download (cache presente ma corrotta o outdated)
python scripts/fetch_5min_data.py --symbols SPY --months 6 --force
```

**Output atteso:**

```
  5-MIN DATA DOWNLOAD COMPLETE
  Period:  2025-09-03 → 2026-03-03  (6 months)
  Symbol       Bars  From          To            Cache
  ---------------------------------------------------
  SPY          ~6084  2025-09-03    2026-03-03    SPY_5Min_2025-09-03_2026-03-03.parquet

  Next step: run backtest with --timeframe 5Min
```

**Stima barre:** 6 mesi × 22 giorni × 78 bar/giorno (5 min in 6.5h) = ~10.296 bar.
Alpaca scarica in chunk da 30 giorni, quindi circa 6 chiamate API.

---

## Step 2 — Baseline: Backtest daily MACD (Modello 1)

Esegui il backtest daily per avere la baseline di confronto sullo stesso periodo
dei dati 5-min. Usare lo stesso capital e lo stesso periodo.

```bash
cd C:\Users\crist\Claude-playground\controlla-me\trading

python -m src.backtest run \
  --start 2025-09-01 \
  --end 2026-03-01 \
  --timeframe 1Day \
  --strategy trend_following \
  --universe SPY \
  --capital 100000 \
  --slippage 4.0 \
  --sl-atr 2.5 \
  --tp-atr 6.0
```

Salva l'output in un file di testo per confronto successivo:

```bash
python -m src.backtest run \
  --start 2025-09-01 \
  --end 2026-03-01 \
  --timeframe 1Day \
  --strategy trend_following \
  --universe SPY \
  --capital 100000 \
  --slippage 4.0 \
  --sl-atr 2.5 \
  --tp-atr 6.0 \
  > backtest-results/baseline-daily-spy-6m.txt 2>&1
```

---

## Step 3 — Backtest Slope+Volume 5-min (Modello 2)

Il CLI seleziona automaticamente la strategia `slope_volume` quando si passa
`--timeframe 5Min` (auto-detect in `__main__.py` riga 235).

### NOTA ARCHITETTURALE CRITICA

Il motore attuale (`engine.py`, metodo `_generate_signals`, riga 1063) fa
fallback su `analyze_stock` (composite MACD score) per la strategia `slope_volume`,
NON chiama `analyze_slope_volume` da `src.analysis`. Questo perche il punto 6 del
roadmap in `model-comparison.md` ("Implementare slope_volume strategy in BacktestEngine")
non e ancora completato.

**Conseguenza pratica:** il backtest con `--strategy slope_volume --timeframe 5Min`
eseguira la strategia composite MACD su timeframe 5-min con i periodi calibrati per
5-min (`FIVEMIN_INDICATOR_PERIODS`), NON la slope+volume pura.

Questo e comunque valido per il confronto (stesso motore, stesso periodo, stesso
slippage) ma i segnali saranno MACD-based, non slope-based.

```bash
cd C:\Users\crist\Claude-playground\controlla-me\trading

python -m src.backtest run \
  --start 2025-09-01 \
  --end 2026-03-01 \
  --timeframe 5Min \
  --strategy slope_volume \
  --universe SPY \
  --capital 100000 \
  --slippage 8.0
```

Con slippage aumentato a 8 bps (costo realistico per 5-min):

```bash
python -m src.backtest run \
  --start 2025-09-01 \
  --end 2026-03-01 \
  --timeframe 5Min \
  --universe SPY \
  --capital 100000 \
  --slippage 8.0 \
  > backtest-results/backtest-5min-spy-6m.txt 2>&1
```

---

## Step 4 — Train/Test split (anti-overfitting)

```bash
cd C:\Users\crist\Claude-playground\controlla-me\trading

python -m src.backtest run \
  --start 2025-09-01 \
  --end 2026-03-01 \
  --timeframe 5Min \
  --universe SPY \
  --capital 100000 \
  --slippage 8.0 \
  --mode train_test
```

Criteri: metriche out-of-sample (ultimo 30%) non devono peggiorare di piu del 30%
rispetto al training period.

---

## Step 5 — Lettura dei risultati

I report vengono salvati automaticamente in:

```
trading/backtest-results/YYYYMMDD_HHMMSS/
  report.json        # metriche complete + go/no-go checks
  equity_curve.png   # curva equity + drawdown
  trades.csv         # log completo trade
```

### Come leggere il report.json

```python
import json
from pathlib import Path

# Sostituire con la directory del run piu recente
report = json.load(open("backtest-results/YYYYMMDD_HHMMSS/report.json"))
m = report["metrics"]
print(f"Sharpe:      {m['sharpe_ratio']}")
print(f"Max DD:      {m['max_drawdown_pct']}%")
print(f"Win Rate:    {m['win_rate_pct']}%")
print(f"Profit Fac:  {m['profit_factor']}")
print(f"Total Trade: {m['total_trades']}")
print(f"CAGR:        {m['cagr_pct']}%")
print(f"GO/NO-GO:    {report['metrics']['go_nogo']['verdict']}")
```

---

## Metriche da confrontare

| Metrica | Modello 1 (Daily) | Modello 2 (5-min) | Target 5-min |
|---------|------------------|------------------|-----------:|
| Sharpe Ratio | baseline | result | > 1.5 |
| Max Drawdown | baseline | result | < 10% |
| Win Rate | baseline | result | > 52% |
| Profit Factor | baseline | result | > 1.4 |
| Avg Hold Duration | 3-7 giorni | minuti-ore | — |
| Total Trades (6m) | 20-80 | 100-500 | > 100 |
| CAGR | baseline | result | > risk-free (4%) |
| Slippage assunto | 4 bps | 8 bps | — |

### Criteri go/no-go specifici per il 5-min

Il sistema usa i criteri standard dal runbook `backtest.md`:

| Check | Soglia | Dove nel report |
|-------|--------|-----------------|
| Sharpe | > 1.0 (standard) | `go_nogo.checks.sharpe` |
| Max DD | < 15% (standard) | `go_nogo.checks.max_drawdown` |
| Win rate | > 50% (standard) | `go_nogo.checks.win_rate` |
| Profit factor | > 1.5 (standard) | `go_nogo.checks.profit_factor` |
| Total trades | > 100 | `go_nogo.checks.total_trades` |

I target specifici per 5-min (Sharpe > 1.5, DD < 10%, WR > 52%) sono soglie piu
stringenti rispetto ai criteri standard perche il 5-min deve compensare costi
operativi piu alti.

---

## Interpretazione risultati

### Scenario A — 5-min batte il daily

- Sharpe 5-min > Sharpe daily E > 1.5
- Max DD 5-min < 10%
- Win rate > 52%
- Azione: approvare per paper trading 30 giorni. Aggiornare `model-comparison.md`
  con i risultati. Aprire task per abilitare `SlopeVolumeSettings.enabled = True`
  nel paper trading config.

### Scenario B — 5-min non raggiunge i target ma e profittevole

- Sharpe 5-min > 1.0 ma < 1.5, oppure DD tra 10% e 15%
- Azione: grid search sui parametri slope (`--slope-threshold`, `--lookback-bars`).
  Implementare prima la vera `analyze_slope_volume` nel motore (punto 6 roadmap).
  Non approvare per paper trading.

### Scenario C — 5-min peggiore del daily

- Sharpe < 1.0 o DD > 15% o WR < 50%
- Azione: NO-GO. Documentare il risultato in `company/trading/reports/`.
  Valutare pivot a 15-min mean reversion oppure ottimizzazione del daily.

---

## Comandi di riepilogo (quick reference)

```bash
# Dalla directory: C:\Users\crist\Claude-playground\controlla-me\trading

# 1. Scarica dati (eseguire solo la prima volta)
python scripts/fetch_5min_data.py --symbols SPY --months 6

# 2. Baseline daily
python -m src.backtest run --start 2025-09-01 --end 2026-03-01 --timeframe 1Day --strategy trend_following --universe SPY --capital 100000 --slippage 4.0

# 3. Backtest 5-min
python -m src.backtest run --start 2025-09-01 --end 2026-03-01 --timeframe 5Min --universe SPY --capital 100000 --slippage 8.0

# 4. Train/test 5-min
python -m src.backtest run --start 2025-09-01 --end 2026-03-01 --timeframe 5Min --universe SPY --capital 100000 --slippage 8.0 --mode train_test
```

---

## Documentazione risultati

Dopo ogni run salvare i risultati in:

```
company/trading/reports/backtest-5min-YYYY-MM-DD.md
```

Con la struttura:

```markdown
# Backtest 5-min — YYYY-MM-DD

| Config | Daily baseline | 5-min result |
|--------|---------------|-------------|
| Sharpe | X.XX | X.XX |
| Max DD | X.X% | X.X% |
| Win rate | X.X% | X.X% |
| PF | X.XX | X.XX |
| Trades | N | N |

**Verdict:** GO / NO-GO — [motivazione]
```
