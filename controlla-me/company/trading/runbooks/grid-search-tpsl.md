# Runbook: Grid Search TP/SL — 96 Combinazioni

**Task #263**
**Autore:** Trading Lead
**Data:** 2026-03-03
**Status:** Pronto per esecuzione — richiede dati Alpaca attivi

---

## Obiettivo

Ottimizzare i parametri di take profit, stop loss e trailing stop del sistema a 4
tier tramite una grid search automatizzata su 96 combinazioni. L'output e una CSV
ordinata per Sharpe ratio per identificare la configurazione vincente.

---

## Prerequisiti

- Python 3.11+ con ambiente `trading/` attivo
- `ALPACA_API_KEY` e `ALPACA_SECRET_KEY` configurati nel file `trading/.env`
- Dati scaricati via `DataLoader` (vengono cacciati in `.backtest-cache/`)

---

## Il preset TPSL — 96 combinazioni confermate

Il preset `tpsl` e definito in `trading/src/backtest/grid_search.py` come
`TPSL_OPTIMIZATION_GRID`. Le 96 combinazioni derivano dal prodotto cartesiano:

| Parametro | Valori testati | # valori |
|-----------|---------------|----------|
| `stop_loss_atr` | 2.0, 2.5 | 2 |
| `take_profit_atr` | 6.0, 8.0, 10.0 | 3 |
| `trailing_breakeven_atr` | 1.0, 1.5 | 2 |
| `trailing_lock_atr` | 1.5 | 1 |
| `trailing_lock_cushion_atr` | 0.5 | 1 |
| `trailing_trail_threshold_atr` | 2.5, 3.5 | 2 |
| `trailing_trail_distance_atr` | 1.5, 2.0 | 2 |
| `trailing_tight_threshold_atr` | 4.0 | 1 |
| `trailing_tight_distance_atr` | 1.0 | 1 |
| `signal_exit_enabled` | False, True | 2 |
| `trend_filter` | True | 1 |
| `max_positions` | 10 | 1 |

**Totale: 2 × 3 × 2 × 1 × 1 × 2 × 2 × 1 × 1 × 2 × 1 × 1 = 96 combinazioni**

---

## Comando da eseguire

```bash
cd C:\Users\crist\Claude-playground\controlla-me\trading

python -m src.backtest grid \
  --start 2019-01-01 \
  --end 2026-02-28 \
  --grid-preset tpsl \
  --universe XLF,XLK,XLE,XLV,XLI,XLU,XLY,XLP,XLRE,XLB,XLC,SPY,QQQ,IWM \
  --capital 100000
```

### Varianti per test piu rapidi

```bash
# Periodo piu breve per test rapido (consigliato per prima esecuzione)
python -m src.backtest grid \
  --start 2022-01-01 \
  --end 2026-02-28 \
  --grid-preset tpsl \
  --universe XLF,XLK,XLE,XLV,XLI,XLU,XLY,XLP,XLRE,XLB,XLC,SPY,QQQ,IWM \
  --capital 100000

# Solo ETF core (universo ridotto, piu veloce)
python -m src.backtest grid \
  --start 2019-01-01 \
  --end 2026-02-28 \
  --grid-preset tpsl \
  --universe XLF,XLK,XLE,XLV,XLI,SPY \
  --capital 100000

# Con output directory custom
python -m src.backtest grid \
  --start 2019-01-01 \
  --end 2026-02-28 \
  --grid-preset tpsl \
  --universe XLF,XLK,XLE,XLV,XLI,XLU,XLY,XLP,XLRE,XLB,XLC,SPY,QQQ,IWM \
  --capital 100000 \
  --output trading/backtest-results/grid-tpsl-2026-03-03
```

---

## Output del comando

### Durante l'esecuzione

Per ogni combinazione viene stampata una riga:

```
  [1/96] SL=2.0x TP=6.0x tBE=1.0x tTH=2.5x tTR=1.5x sigExit=OFF trend=ON pos=10 ...
         Sharpe=+0.87 DD=8.3% WR=61% PF=1.98 T=243 SL=89 TP=67 SE=0 [GO]  (ETA: 420s)
```

Campi:
- `SL/TP` — Stop loss / Take profit in multipli ATR
- `tBE` — Trailing breakeven trigger (Tier 0)
- `tTH/tTR` — Trailing trail threshold / distance (Tier 2)
- `sigExit` — Signal exit abilitato (MACD bearish crossover)
- `[GO]` o `[NO-GO]` — passa i criteri go/no-go standard
- `ETA` — tempo stimato rimanente

### Al termine

```
======================================================================
  GRID SEARCH COMPLETE
  Combinations: 96 | Time: Xs
  Results saved: trading/backtest-results/grid_YYYYMMDD_HHMMSS/grid_results.csv
======================================================================

  GO results: N/96

  TOP GO COMBINATIONS:
     SL   TP Trend Pos |  Sharpe   DD%  WR%    PF Trades  Return%
  ----------------------------------------------------------------------
   2.50 8.00    ON  10 |  +1.23   6.8%   62    2.1    287   +32.1
```

---

## Dove trovare i risultati

```
trading/backtest-results/grid_YYYYMMDD_HHMMSS/
  grid_results.csv     # tutte le 96 combinazioni, ordinate per Sharpe decrescente
```

Struttura CSV — colonne chiave:

| Colonna | Significato |
|---------|-------------|
| `stop_loss_atr` | Moltiplicatore ATR per stop loss |
| `take_profit_atr` | Moltiplicatore ATR per take profit |
| `trailing_breakeven_atr` | Tier 0: trigger breakeven |
| `trailing_trail_threshold_atr` | Tier 2: trigger trailing |
| `trailing_trail_distance_atr` | Tier 2: distanza trailing |
| `signal_exit_enabled` | True/False: MACD crossover exit |
| `sharpe_ratio` | Sharpe ratio annualizzato |
| `max_drawdown_pct` | Max drawdown (negativo) |
| `win_rate_pct` | % trade positivi |
| `profit_factor` | Gross profit / gross loss |
| `total_trades` | Numero totale trade |
| `total_return_pct` | Return % totale sul periodo |
| `go_nogo` | True = supera tutti i criteri standard |
| `stop_loss_count` | Trade chiusi per stop loss |
| `take_profit_count` | Trade chiusi per take profit |
| `signal_exit_count` | Trade chiusi per MACD exit |

---

## Criteri per la configurazione vincente

### Criteri primari (Sharpe > 1.0 obbligatorio)

| Metrica | Soglia minima | Preferibile |
|---------|--------------|-------------|
| Sharpe Ratio | > 1.0 | > 1.3 |
| Max Drawdown | < 15% | < 10% |
| Win Rate | > 50% | > 55% |
| Profit Factor | > 1.5 | > 1.8 |
| Total Trades | > 100 | > 200 |

### Criteri di robustezza

Una configurazione e considerata robusta se:

1. **Non e su un picco isolato** — La configurazione vincente non deve avere Sharpe molto
   superiore alle 3-5 combinazioni vicine nel CSV. Un picco isolato indica overfitting.

2. **Stop loss count accettabile** — `stop_loss_count / total_trades < 50%`. Se piu della
   meta dei trade finisce in stop loss, il pattern di entrata e debole.

3. **Signal exit contribuisce positivamente** — Se `signal_exit_enabled=True` vince su
   `signal_exit_enabled=False` con gli stessi altri parametri, abilitare l'exit MACD.

4. **Stability check manuale** — Aprire `equity_curve.png` del backtest singolo con i
   parametri vincitori (eseguire `run` con quei parametri) e verificare curva senza cliff.

---

## Come leggere il CSV con Python

```python
import pandas as pd

# Sostituire con la directory del run
df = pd.read_csv("backtest-results/grid_YYYYMMDD_HHMMSS/grid_results.csv")

# Top 10 per Sharpe
print(df.head(10)[["stop_loss_atr", "take_profit_atr", "trailing_breakeven_atr",
                    "trailing_trail_threshold_atr", "trailing_trail_distance_atr",
                    "signal_exit_enabled", "sharpe_ratio", "max_drawdown_pct",
                    "win_rate_pct", "profit_factor", "total_trades", "go_nogo"]])

# Solo configurazioni GO
go_df = df[df["go_nogo"] == True]
print(f"GO results: {len(go_df)}/96")
print(go_df.head(5))

# Analisi signal_exit: confronto ON vs OFF (stesse altre variabili)
for_exit = df.groupby("signal_exit_enabled")["sharpe_ratio"].mean()
print(f"Avg Sharpe con signal_exit=OFF: {for_exit[False]:.3f}")
print(f"Avg Sharpe con signal_exit=ON:  {for_exit[True]:.3f}")
```

---

## Come applicare i parametri vincenti alla pipeline live

Dopo aver identificato la configurazione vincente (es. SL=2.5, TP=8.0, tBE=1.5,
tTH=3.5, tTR=2.0, sigExit=True):

### 1. Aggiorna i default in `BacktestConfig`

File: `trading/src/backtest/engine.py` (classe `BacktestConfig`)

```python
# Parametri da aggiornare con i valori ottimali trovati
stop_loss_atr: float = 2.5       # era 2.0
take_profit_atr: float = 8.0     # era 10.0
trailing_breakeven_atr: float = 1.5  # era 1.5
trailing_trail_threshold_atr: float = 3.5   # era 3.5
trailing_trail_distance_atr: float = 2.0   # era 2.0
signal_exit_enabled: bool = True  # era False
```

### 2. Aggiorna i default in `settings.py` (per la pipeline live)

File: `trading/src/config/settings.py` (classe `RiskSettings` e `SignalSettings`)

I parametri trailing stop nella pipeline live sono gestiti in `RiskManager` e
applicati dall'`Executor` tramite `PortfolioMonitor`. Verificare che le stesse
costanti siano allineate al motore di backtest.

### 3. Aggiorna il runbook `backtest.md`

Aggiungere una riga nella sezione "Parametri ottimali trovati" con la data e i
valori della grid search.

### 4. Esegui un backtest di conferma con i parametri vincenti

```bash
cd C:\Users\crist\Claude-playground\controlla-me\trading

python -m src.backtest run \
  --start 2019-01-01 \
  --end 2026-02-28 \
  --universe XLF,XLK,XLE,XLV,XLI,XLU,XLY,XLP,XLRE,XLB,XLC,SPY,QQQ,IWM \
  --capital 100000 \
  --sl-atr 2.5 \
  --tp-atr 8.0 \
  --trail-breakeven 1.5 \
  --trail-threshold 3.5 \
  --trail-distance 2.0
```

---

## Stima tempi di esecuzione

| Periodo | Universo | Stima |
|---------|----------|-------|
| 3 anni (2022-2026) | 14 ETF | 5-10 minuti |
| 7 anni (2019-2026) | 14 ETF | 15-30 minuti |
| 7 anni (2019-2026) | 40 simboli | 45-90 minuti |

Il download dei dati avviene una sola volta (cache Parquet). Le run successive
sulla stessa data range sono molto piu veloci (solo calcolo, no rete).

---

## Errori comuni

| Errore | Causa | Soluzione |
|--------|-------|-----------|
| `No data loaded` | API key mancante o dati non disponibili | Verificare `.env` e range date |
| `KeyError: trailing_breakeven_atr` | Versione engine precedente | Pull ultima versione del codice |
| `Combinations: 0` | Grid vuota | Verificare che `--grid-preset tpsl` sia passato |
| Tutti `NO-GO` | Periodo difficile o parametri sbagliati | Provare 2022-2026 invece di 7 anni |

---

## Documentazione post-run

Salvare il risultato in `company/trading/reports/grid-tpsl-YYYY-MM-DD.md`:

```markdown
# Grid Search TPSL — YYYY-MM-DD

**Periodo:** YYYY-MM-DD → YYYY-MM-DD
**Universo:** 14 ETF settoriali
**Capital:** $100,000
**Combinazioni GO:** N/96

## Configurazione vincente

| Parametro | Valore |
|-----------|--------|
| SL ATR | X.X |
| TP ATR | X.X |
| Trail Breakeven | X.X |
| Trail Threshold | X.X |
| Trail Distance | X.X |
| Signal Exit | ON/OFF |
| Sharpe | +X.XX |
| Max DD | X.X% |
| Win Rate | X.X% |
| PF | X.XX |
| Trades | N |

**Azione:** [Applicare parametri / Iterare / NO-GO]
```
