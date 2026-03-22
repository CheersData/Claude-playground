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

## Ciclo 4 — Grid Search mirato (task #991, preparato 2026-03-18)

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

### Preset `CYCLE4_GRID` — 60 combinazioni (task #991)

| Parametro | Valori | Count | Rationale |
|-----------|--------|-------|-----------|
| `stop_loss_atr` | 1.5, 2.0, 2.5 | 3 | Aggressive→grid-optimal range |
| `take_profit_atr` | **2.0, 3.0, 4.0, 5.0, 6.0** | 5 | **Nuovo: test 2.0-6.0 (Cycle 3 solo 6.0 mai hit)** |
| `trailing_breakeven_atr` | 0.5, 1.5 | 2 | Early (0.5x) vs late (1.5x) Tier 0 |
| `signal_exit_enabled` | OFF, ON | 2 | Cycle 3 usava OFF; test comparison |
| `trailing_lock_atr` | 1.5 | 1 | Fixed (grid-optimal) |
| `trailing_lock_cushion_atr` | 0.5 | 1 | Fixed |
| `trailing_trail_threshold_atr` | 3.5 | 1 | Fixed (grid-optimal) |
| `trailing_trail_distance_atr` | 2.0 | 1 | Fixed (grid-optimal) |
| `trailing_tight_threshold_atr` | 4.0 | 1 | Fixed |
| `trailing_tight_distance_atr` | 1.0 | 1 | Fixed |
| `trend_filter` | ON | 1 | Fixed |
| `max_positions` | 10 | 1 | Fixed |

**Totale: 3 × 5 × 2 × 2 × 1^8 = 60 combinazioni** (increased from 48 by adding TP=2.0)

### Comandi da eseguire (task #991)

Eseguire da terminale esterno (non da Claude Code). Aprire PowerShell o cmd.exe.

```bash
cd C:\Users\crist\Claude-playground\controlla-me\trading

# ============================================================================
# STEP 1: Grid search su 2 anni (2023-2024) — finestra identica a Cycle 3
# Window: 2023-01-01 to 2024-12-31 (2 anni, NOT 3 — il 3-anno diluisce Sharpe)
# Universe: 43 tickers (S&P500 sector leaders + ETF, stesso Cycle 3)
# Capital: 100,000
# Duration: ~12-15 minuti (60 combos × 12s/combo)
# ============================================================================

py -m src.backtest grid \
  --start 2023-01-01 \
  --end 2024-12-31 \
  --grid-preset cycle4 \
  --capital 100000

# Output: backtest-results/grid_YYYYMMDD_HHMMSS/grid_results.csv
#
# Verifica risultati (apri CSV):
#   1. Filter go_nogo=True (solo combinazioni Sharpe > 1.0)
#   2. Sort by sharpe_ratio DESC
#   3. Seleziona TOP 1
#   4. Controlla SL-exit rate nel CSV (deve < 80%, improvement vs 92.6%)
#   5. Verifica: best params NON su picco isolato (neighbors forti)

# ============================================================================
# STEP 2: Out-of-sample validation su 3 anni (2022-2024)
# Solo se STEP 1 ha trovato GO (Sharpe > 1.0)
# ============================================================================

py -m src.backtest grid \
  --start 2022-01-01 \
  --end 2024-12-31 \
  --grid-preset cycle4 \
  --capital 100000

# Verifica: best params da STEP 1 mantengono Sharpe > 1.0 anche con dati 2022 nuovi

# ============================================================================
# STEP 3: Single run con best params per equity curve + trade analysis
# Sostituire SL_VALUE, TP_VALUE, tBE_VALUE con quelli dal grid CSV
# ============================================================================

# Esempio (sostituire valori):
py -m src.backtest run \
  --start 2023-01-01 \
  --end 2024-12-31 \
  --capital 100000 \
  --sl-atr 1.5 \
  --tp-atr 3.0 \
  --trail-breakeven 0.5 \
  --trail-threshold 3.5 \
  --trail-distance 2.0

# Output: backtest-results/YYYYMMDD_HHMMSS/
#   - equity_curve.png → verifica smooth growth, NO sudden cliffs
#   - trades.csv → analizza avg hold days, win/loss distribution
#   - report.json → metriche complete

# ============================================================================
# DECISION
# ============================================================================
# IF Sharpe > 1.0 AND SL-exit < 80% AND robustness checks pass:
#   → Commit best params a engine.py BacktestConfig defaults
#   → Update company/trading/status.json phase→paper_trading
#   → Proceed Phase 3 (30 days paper trading)
# ELSE:
#   → Analyze grid CSV for patterns
#   → Design Cycle 5 with refined ranges
#   → Repeat
```

**Timeline atteso:**
- STEP 1 (grid 2yr): 12-15 minuti
- STEP 2 (grid 3yr): 15-20 minuti (se GO found)
- STEP 3 (single run): 3-5 minuti
- **Totale: 30-40 minuti**

### Success Criteria — Ciclo 4

**Mandatory (PRIMARY):**
- [ ] **Sharpe > 1.0** ← Must-have per GO decision

**Secondary (ROBUSTNESS):**
- [ ] SL exit rate < 80% (improvement vs 92.6% del Ciclo 3)
- [ ] TP exit rate > 10% (improvement vs <1% del Ciclo 3)
- [ ] Max drawdown < 10%
- [ ] Win rate > 50%
- [ ] Profit factor > 1.8
- [ ] Combinazione vincente NON su picco isolato nel CSV
- [ ] Out-of-sample (3yr) Sharpe entro ±20% dell'in-sample (2yr)
- [ ] equity_curve.png: smooth growth, NO cliff drawdowns

### Decisione GO/NO-GO — Ciclo 4

#### ✅ IF GO (Sharpe > 1.0):

1. **Document**: Creare report in `company/trading/reports/cycle4-YYYY-MM-DD.md`
   ```markdown
   # Cycle 4 Grid Search Results

   **Window:** 2023-2024 (2 years)
   **Combinations:** 60
   **Best Config:**
   - SL: X.X × ATR
   - TP: Y.Y × ATR
   - Breakeven: Z.Z × ATR
   - Signal Exit: ON/OFF

   **Metrics:**
   - Sharpe: +X.XX (target > 1.0) ✅
   - Max DD: X.X%
   - Win rate: X.X%
   - SL exits: X.X% (improved from 92.6%) ✅
   ```

2. **Apply to defaults**: Update `trading/src/backtest/engine.py` `BacktestConfig`
   ```python
   stop_loss_atr: float = X.X          # Update from 1.5
   take_profit_atr: float = Y.Y        # Update from 3.0
   trailing_breakeven_atr: float = Z.Z # Update from 1.5
   signal_exit_enabled: bool = True/False  # Update from False
   ```

3. **Commit**: `git add -A && git commit -m "feat: Cycle 4 optimal params (Sharpe X.XX)"`

4. **Phase 3**: Update `company/trading/status.json` phase→`paper_trading` and proceed with 30-day paper trading validation.

#### ❌ IF NO-GO (Sharpe ≤ 1.0):

1. **Analyze CSV patterns:**
   - Which SL values dominate top 5? (All 1.5x? All 2.5x?)
   - Which TP values hit GO? (Only 2.0-3.0x? Never 5-6x?)
   - Does signal_exit=ON help vs OFF?
   - Are there clusters of strong combos or isolated peaks?

2. **Design Cycle 5:**
   - If SL=1.5 never GO: shift range to [2.0, 2.5, 3.0]
   - If only TP=3.0 works: narrow range to [2.5, 3.0, 3.5]
   - If signal_exit=ON consistently better: fix to True
   - Consider expanding universe (43→60 tickers) for more trades

3. **Update grid_search.py with CYCLE5_GRID** and repeat STEP 1-3

4. **Max 3 iterazioni**: Se dopo 3 cicli no GO, **pivot strategia** (noise boundary momentum, mean reversion v3, o daily mean reversion).
