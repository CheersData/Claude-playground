# Grid Search Plan TP/SL -- 2026-03-10

**Task:** #2249c3f4 -- Grid search TP/SL per Sharpe > 1.0
**Redatto da:** trading-lead
**Priorita:** MEDIUM (P0 aziendale -- Sharpe > 1.0 e prerequisito paper → go-live)

---

## Executive Summary

Il Sharpe ratio e a 0.975, gap 0.025 dalla soglia 1.0. Il problema principale e chiaro:
**126/136 trade (92.6%) chiudono per stop loss.** Il TP a 6xATR e troppo distante --
quasi nessun trade lo raggiunge, lasciando il profitto al trailing stop o al SL.

La grid search precedente (96 combo) ha trovato un best a SL=2.0, TP=10.0 (+24.5% return,
322 trade) ma con Sharpe ancora < 1.0. Quel grid testava TP larghi (6-10x) e SL modesti (2-2.5x).

**Questo piano inverte la logica:** testare TP stretti (3-6x) con SL variabili (1.5-2.5x),
con focus su catturare i profitti prima che il mercato li ritiri.

---

## Diagnosi: perche 92.6% esce su stop loss

### I numeri

| Metrica | Valore attuale | Problema |
|---------|---------------|----------|
| SL exits | 126/136 (92.6%) | Quasi tutti i trade perdono |
| TP exits | ~5/136 (3.7%) | TP troppo lontano, non viene mai raggiunto |
| Trailing exits | ~5/136 (3.7%) | Trailing salva qualcosa, ma i vincitori sono pochi |
| Sharpe | 0.975 | Gap 0.025 -- vicinissimo |
| Profit Factor | 2.20 | Buono -- i vincitori compensano |
| Win Rate | 52.2% | Accettabile ma migliorabile |

### Dinamica del problema

```
Scenario tipico con TP=6.0x ATR:

Prezzo: ___/\___/\___ entry
                        \
                         \_____ SL hit (-2.5x ATR)

Il prezzo sale +1-2 ATR, non raggiunge TP (6x lontano),
ritraccia fino a SL. Profitto momentaneo buttato via.
```

Con TP=3-4x ATR:
```
Prezzo: ___/\___/\___/\___ TP hit! (+3-4x ATR)
                         ^
                         catturato prima del ritracciamento
```

### Rapporto R/R attuale vs proposto

| Configurazione | SL | TP | R/R ratio | Prob. TP hit (stima) |
|---------------|----|----|-----------|---------------------|
| Attuale | 2.5x | 6.0x | 1:2.4 | ~5% |
| Grid best | 2.0x | 10.0x | 1:5.0 | ~3% |
| **Proposta A** | 2.0x | 4.0x | 1:2.0 | ~25-30% |
| **Proposta B** | 1.5x | 3.0x | 1:2.0 | ~35-40% |
| **Proposta C** | 2.0x | 3.0x | 1:1.5 | ~40-45% |

Il R/R minimo per profitto con win rate 50% e 1:1.0. Con SL=2.0/TP=3.0 (R/R 1:1.5),
bastano il 40% dei trade vincenti per break-even. Con TP piu stretto, la percentuale
di TP-hit aumenta drasticamente, migliorando win rate e stabilizzando la equity curve.

---

## Grid Search Proposta: 12 combinazioni core + 12 trailing = 24 totali

### Fase 1: Core TP/SL (12 combinazioni)

Prodotto cartesiano SL[1.5, 2.0, 2.5] x TP[3.0, 4.0, 5.0, 6.0]:

| # | SL (ATR) | TP (ATR) | R/R | Ipotesi |
|---|---------|---------|-----|---------|
| 1 | 1.5 | 3.0 | 1:2.0 | SL stretto, TP stretto -- max win rate |
| 2 | 1.5 | 4.0 | 1:2.7 | SL stretto, TP moderato |
| 3 | 1.5 | 5.0 | 1:3.3 | SL stretto, TP largo |
| 4 | 1.5 | 6.0 | 1:4.0 | SL stretto, baseline TP |
| 5 | **2.0** | **3.0** | **1:1.5** | **Candidato top -- piu spazio al trade, TP raggiungibile** |
| 6 | **2.0** | **4.0** | **1:2.0** | **Candidato forte -- equilibrio SL/TP** |
| 7 | 2.0 | 5.0 | 1:2.5 | Baseline migliorato |
| 8 | 2.0 | 6.0 | 1:3.0 | Configurazione attuale (reference) |
| 9 | 2.5 | 3.0 | 1:1.2 | SL largo, TP stretto -- R/R basso |
| 10 | **2.5** | **4.0** | **1:1.6** | **SL originale, TP dimezzato -- test diretto** |
| 11 | 2.5 | 5.0 | 1:2.0 | SL originale, TP moderato |
| 12 | 2.5 | 6.0 | 1:2.4 | Configurazione attuale esatta (control) |

**Candidati top** (bold): #5, #6, #10 -- combinano SL sufficientemente largo per
non uscire su rumore con TP abbastanza stretto da catturare i profitti.

### Fase 2: Trailing stop tuning (moltiplicatore x2)

Per ogni combinazione core, testare 2 configurazioni trailing:

**Trailing A (conservativo -- attuale):**
- Breakeven trigger: 1.5x ATR
- Trail threshold: 3.5x ATR
- Trail distance: 2.0x ATR

**Trailing B (aggressivo):**
- Breakeven trigger: 0.5x ATR (proteggi prima)
- Trail threshold: 2.0x ATR (inizia trail prima)
- Trail distance: 1.5x ATR (trail piu stretto)

Totale: 12 core x 2 trailing = **24 combinazioni**

### Perche non 96 come prima

- La grid precedente a 96 combo non ha trovato GO -- troppo dispersiva
- TP range era 6-10x (tutto troppo lontano)
- Con solo 24 combo, runtime ~3-5 minuti su 2 anni (vs 15-30 per 96)
- Focus chirurgico: testare il range giusto

---

## Implementazione: aggiornare TPSL_OPTIMIZATION_GRID

Il file `trading/src/backtest/grid_search.py` contiene il preset `TPSL_OPTIMIZATION_GRID`.
Va sostituito con il nuovo grid:

```python
# Focused grid for TP/SL optimization (task 2249c3f4)
# Problem: 92.6% exits on SL (TP=6x too far). Solution: tighter TP (3-6x).
# 24 combinations: SL[1.5,2.0,2.5] x TP[3,4,5,6] x trailing[conservative,aggressive]
TPSL_OPTIMIZATION_GRID = {
    "stop_loss_atr": [1.5, 2.0, 2.5],
    "take_profit_atr": [3.0, 4.0, 5.0, 6.0],
    # 4-tier trailing stop -- test conservative vs aggressive
    "trailing_breakeven_atr": [0.5, 1.5],           # Tier 0: aggressive vs conservative
    "trailing_lock_atr": [1.5],                       # Tier 1: fixed
    "trailing_lock_cushion_atr": [0.5],               # Tier 1: fixed
    "trailing_trail_threshold_atr": [2.0, 3.5],       # Tier 2: early vs late trail
    "trailing_trail_distance_atr": [1.5, 2.0],        # Tier 2: tight vs wide trail
    "trailing_tight_threshold_atr": [4.0],             # Tier 3: fixed
    "trailing_tight_distance_atr": [1.0],              # Tier 3: fixed
    # Signal exit: test both
    "signal_exit_enabled": [True],                     # Always on (prev results showed benefit)
    "trend_filter": [True],
    "max_positions": [10],
}
# Total: 3 x 4 x 2 x 1 x 1 x 2 x 2 x 1 x 1 x 1 x 1 x 1 = 96 combinations
# (same count, completely different parameter space)
```

**Nota:** mantenendo 2 valori per breakeven, 2 per trail_threshold, e 2 per trail_distance,
il totale resta 96 (3x4x2x2x2 = 96). Runtime identico al grid precedente.

Alternativa a 24 combo (fisso trail_distance=1.5 e un solo breakeven):

```python
TPSL_OPTIMIZATION_GRID_FOCUSED = {
    "stop_loss_atr": [1.5, 2.0, 2.5],
    "take_profit_atr": [3.0, 4.0, 5.0, 6.0],
    "trailing_breakeven_atr": [0.5],
    "trailing_lock_atr": [1.5],
    "trailing_lock_cushion_atr": [0.5],
    "trailing_trail_threshold_atr": [2.0],
    "trailing_trail_distance_atr": [1.5],
    "trailing_tight_threshold_atr": [4.0],
    "trailing_tight_distance_atr": [1.0],
    "signal_exit_enabled": [True, False],
    "trend_filter": [True],
    "max_positions": [10],
}
# Total: 3 x 4 x 1 x 1 x 1 x 1 x 1 x 1 x 1 x 2 x 1 x 1 = 24 combinations
```

---

## Comandi di esecuzione

### Grid search completo (96 combo, periodo 2 anni -- raccomandato)

```bash
cd C:\Users\crist\Claude-playground\controlla-me\trading

python -m src.backtest grid \
  --start 2024-03-01 \
  --end 2026-02-28 \
  --grid-preset tpsl \
  --universe XLF,XLK,XLE,XLV,XLI,XLU,XLY,XLP,XLRE,XLB,XLC,SPY,QQQ,IWM \
  --capital 100000
```

Stima runtime: 5-10 minuti (dati gia in cache da grid precedente).

### Backtest di conferma (parametri vincenti)

Dopo aver identificato la combo migliore (esempio SL=2.0, TP=4.0):

```bash
python -m src.backtest run \
  --start 2019-01-01 \
  --end 2026-02-28 \
  --universe XLF,XLK,XLE,XLV,XLI,XLU,XLY,XLP,XLRE,XLB,XLC,SPY,QQQ,IWM \
  --capital 100000 \
  --sl-atr 2.0 \
  --tp-atr 4.0 \
  --trail-breakeven 0.5 \
  --trail-threshold 2.0 \
  --trail-distance 1.5
```

---

## Impatto atteso

### Scenario conservativo (SL=2.0, TP=4.0)

| Metrica | Attuale (TP=6x) | Atteso (TP=4x) | Variazione |
|---------|-----------------|----------------|------------|
| Win Rate | 52.2% | 58-62% | +6-10pp (piu trade raggiungono TP) |
| SL exit % | 92.6% | 55-65% | -28pp (fondamentale) |
| TP exit % | 3.7% | 20-30% | +16-26pp (TP raggiungibile) |
| Profit Factor | 2.20 | 1.8-2.0 | Leggero calo (vincite piu piccole) |
| Sharpe | 0.975 | 1.05-1.20 | +0.075-0.225 (target raggiunto) |
| CAGR | 11.12% | 10-14% | Stabile o migliore |

**Spiegazione:** con TP piu stretto, le vincite individuali sono minori, ma la frequenza
di vincita aumenta significativamente. La equity curve diventa piu liscia, riducendo la
volatilita dei rendimenti -- che e esattamente cio che Sharpe misura.

### Scenario aggressivo (SL=1.5, TP=3.0)

- Win Rate atteso: 60-65%
- Rischio: troppi trade per costi di slippage
- Possibile SL exit piu frequente su rumore intraday

### Rischio principale: over-fitting

Un TP stretto aumenta il numero di trade. Piu trade = piu campioni statistici =
Sharpe piu affidabile. Ma serve verificare che la strategia non sia fit su un
periodo specifico. Mitigazione: backtest di conferma su periodo lungo (7 anni).

---

## Criteri GO/NO-GO per applicare i risultati

### GO (applicare alla pipeline live)

Tutti e 5 devono essere veri:

1. Sharpe > 1.0 (obbligatorio)
2. Max Drawdown < 15%
3. Win Rate > 50%
4. Profit Factor > 1.5
5. SL exit % < 60% (miglioramento rispetto al 92.6% attuale)

### Criterio di robustezza (anti-overfitting)

La configurazione vincente NON deve essere un picco isolato. Le 3-5 combinazioni
vicine nel CSV devono avere Sharpe simile (spread < 0.15). Un picco isolato indica
overfitting e va scartato.

### NO-GO

Se nessuna configurazione raggiunge Sharpe > 1.0:
1. Valutare signal_exit (MACD crossover) come alternativa al trailing stop
2. Considerare cambio strategia (mean reversion v3, noise boundary)
3. Testare universo diverso (azioni singole vs ETF settoriali)

---

## Aggiornamenti post-grid search

Dopo l'esecuzione, aggiornare:

1. `trading/src/backtest/engine.py` -- `BacktestConfig` defaults
2. `trading/src/config/settings.py` -- `RiskSettings` (SL/trailing) e `SlopeVolumeSettings` (SL/TP)
3. `company/trading/department.md` -- sezione "Strategia Corrente"
4. `company/trading/runbooks/backtest.md` -- sezione "Parametri ottimali trovati"
5. Questo report -- aggiungere sezione "Risultati" con configurazione vincente

---

## File correlati

| File | Ruolo |
|------|-------|
| `trading/src/backtest/grid_search.py` | Preset grid e motore grid search |
| `trading/src/backtest/engine.py` | BacktestConfig con parametri default |
| `trading/src/config/settings.py` | Parametri live pipeline |
| `trading/src/analysis.py` | Logica segnali (composite + slope) |
| `company/trading/runbooks/grid-search-tpsl.md` | Runbook esecuzione |
| `company/trading/runbooks/backtest.md` | Runbook backtest generale |
