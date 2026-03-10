# Grid Search Cycle #4 — Piano TP/SL per Sharpe > 1.0

**Autore:** trading-lead
**Data:** 2026-03-10
**Task ID:** 2249c3f4
**Priorita:** MEDIUM
**Status:** Piano pronto per esecuzione

---

## Situazione attuale

### Ciclo #3 (ultimo backtest, 2026-03-03)

| Metrica | Valore | Soglia | Pass |
|---------|--------|--------|------|
| Sharpe Ratio | 0.975 | > 1.0 | NO (gap: 0.025) |
| Sortino Ratio | 1.668 | > 1.0 | SI |
| Max Drawdown | -3.85% | < 15% | SI |
| Win Rate | 52.2% | > 50% | SI |
| Profit Factor | 2.20 | > 1.5 | SI |
| Total Trades | 136 | > 100 | SI |
| CAGR | 11.12% | — | — |
| Avg Win | +8.0% | — | — |
| Avg Loss | -2.75% | — | — |
| Avg Hold | 20 days | — | — |

**Parametri ciclo #3:** SL=2.5x ATR, TP=6.0x ATR, max_positions=10, strategy=slope_volume, universe=43 ticker, periodo=2023-2024.

### Diagnosi: perche Sharpe = 0.975 e non > 1.0

1. **126/136 trade (92.6%) chiusi per stop loss** -- TP a 6x ATR e troppo distante, quasi nessun trade lo raggiunge.
2. **Avg loss -2.75% vs avg win +8.0%** -- il payoff ratio (2.91:1) e buono, ma la frequenza dei loss (47.8%) penalizza la volatilita dei rendimenti.
3. **La precedente grid search (TP=10x, SL=2x)** ha trovato +24.5% return e 322 trade, ma Sharpe ancora < 1.0 -- il TP troppo lontano aumenta i trade MA anche i drawdown intermedi.
4. **TP "ceiling" troppo alto** = i trade vincenti accumulano profitto non realizzato che viene poi eroso. Un TP piu vicino cristallizzerebbe il guadagno prima della regressione alla media.

### Insight chiave

Il problema NON e il SL troppo stretto (avg loss -2.75% e accettabile). Il problema e il **TP troppo distante** che:
- Non viene mai raggiunto (solo 10/136 = 7.4% dei trade chiude per TP)
- Lascia profitto non realizzato sul tavolo
- La chiusura avviene per trailing stop o slope exit, che arriva dopo un ritracciamento dal massimo

**La leva per migliorare Sharpe e avvicinare il TP**, non stringere il SL.

---

## Strategia Ciclo #4: Focus su TP vicino + trailing aggressivo

### Ipotesi

Riducendo il TP da 6x a 3-5x ATR, i trade vincenti chiuderanno prima, realizzando profitto prima che il prezzo ritraccia. Questo dovrebbe:
- Ridurre la varianza dei rendimenti (denominatore Sharpe)
- Aumentare la percentuale di trade chiusi per TP (attualmente 7.4%)
- Mantenere o migliorare il return totale
- Migliorare la win rate (piu trade raggiungono il target)

### Parametri da testare

#### Asse 1: Stop Loss ATR (3 valori)

| Valore | Razionale |
|--------|-----------|
| 1.5 | Stretto -- riduce avg loss, ma rischia piu stop premature |
| 2.0 | Moderato -- gia testato nel ciclo precedente, buon baseline |
| 2.5 | Corrente -- mantenuto come riferimento |

#### Asse 2: Take Profit ATR (4 valori)

| Valore | Razionale |
|--------|-----------|
| 3.0 | Molto vicino -- massimizza % trade chiusi per TP, R/R 1:1.2 con SL=2.5 |
| 4.0 | Vicino -- buon compromesso, R/R ~1:1.6 con SL=2.5 |
| 5.0 | Moderato -- un gradino sotto il ciclo #3 |
| 6.0 | Corrente -- mantenuto come riferimento di confronto |

#### Asse 3: Trailing stop (2 configurazioni)

**Config A (aggressivo):** trail piu presto, distanza stretta
| Parametro | Valore |
|-----------|--------|
| trailing_breakeven_atr | 0.5 |
| trailing_lock_atr | 1.0 |
| trailing_lock_cushion_atr | 0.3 |
| trailing_trail_threshold_atr | 2.0 |
| trailing_trail_distance_atr | 1.0 |
| trailing_tight_threshold_atr | 3.0 |
| trailing_tight_distance_atr | 0.5 |

**Config B (conservativo, baseline):** trail piu tardi, distanza larga
| Parametro | Valore |
|-----------|--------|
| trailing_breakeven_atr | 1.0 |
| trailing_lock_atr | 1.5 |
| trailing_lock_cushion_atr | 0.5 |
| trailing_trail_threshold_atr | 3.0 |
| trailing_trail_distance_atr | 1.5 |
| trailing_tight_threshold_atr | 4.0 |
| trailing_tight_distance_atr | 1.0 |

#### Asse 4: Signal Exit MACD (2 valori)

| Valore | Razionale |
|--------|-----------|
| OFF | Default -- exit solo per TP/SL/trailing/slope |
| ON | MACD bearish crossover chiude long -- potrebbe proteggere profitto non realizzato |

### Totale combinazioni

`3 (SL) x 4 (TP) x 2 (trailing) x 2 (signal exit) = 48 combinazioni`

48 combinazioni = ~50% del grid TPSL originale (96). Tempo stimato: 8-15 minuti su 2 anni, 14 ETF.

---

## Grid da implementare

Aggiungere in `trading/src/backtest/grid_search.py` un nuovo preset `CYCLE4_GRID`:

```python
CYCLE4_GRID = {
    "stop_loss_atr": [1.5, 2.0, 2.5],
    "take_profit_atr": [3.0, 4.0, 5.0, 6.0],
    # Trailing A (aggressivo)
    "trailing_breakeven_atr": [0.5, 1.0],
    "trailing_lock_atr": [1.0, 1.5],
    "trailing_lock_cushion_atr": [0.3, 0.5],
    "trailing_trail_threshold_atr": [2.0, 3.0],
    "trailing_trail_distance_atr": [1.0, 1.5],
    "trailing_tight_threshold_atr": [3.0, 4.0],
    "trailing_tight_distance_atr": [0.5, 1.0],
    "signal_exit_enabled": [False, True],
    "trend_filter": [True],
    "max_positions": [10],
}
```

NOTA: il prodotto cartesiano di TUTTI i trailing param e troppo grande (3x4x2x2x2x2x2x2x2x2 = 3072). Servono 2 configurazioni pre-assemblate, non il prodotto cartesiano.

**Approccio corretto:** definire 2 tuple di trailing come blocchi, non come fattori indipendenti.

```python
# 48 combinazioni: 3 SL x 4 TP x 2 trailing_config x 2 signal_exit
CYCLE4_TRAILING_CONFIGS = [
    {  # Config A: aggressivo
        "trailing_breakeven_atr": 0.5,
        "trailing_lock_atr": 1.0,
        "trailing_lock_cushion_atr": 0.3,
        "trailing_trail_threshold_atr": 2.0,
        "trailing_trail_distance_atr": 1.0,
        "trailing_tight_threshold_atr": 3.0,
        "trailing_tight_distance_atr": 0.5,
    },
    {  # Config B: conservativo (baseline)
        "trailing_breakeven_atr": 1.0,
        "trailing_lock_atr": 1.5,
        "trailing_lock_cushion_atr": 0.5,
        "trailing_trail_threshold_atr": 3.0,
        "trailing_trail_distance_atr": 1.5,
        "trailing_tight_threshold_atr": 4.0,
        "trailing_tight_distance_atr": 1.0,
    },
]
```

La funzione `run_grid_search` dovra gestire questo preset in modo speciale: iterare su `SL x TP x trailing_config x signal_exit` anziche fare il prodotto cartesiano di tutti i parametri trailing.

---

## Comando di esecuzione

```bash
cd C:\Users\crist\Claude-playground\controlla-me\trading

python -m src.backtest grid \
  --start 2023-01-01 \
  --end 2024-12-31 \
  --grid-preset cycle4 \
  --universe XLF,XLK,XLE,XLV,XLI,XLU,XLY,XLP,XLRE,XLB,XLC,SPY,QQQ,IWM \
  --capital 100000
```

Nota: usare lo STESSO periodo (2023-2024) e universo (14 ETF) del ciclo #3 per confronto diretto.

### Variante rapida per test

```bash
python -m src.backtest grid \
  --start 2024-01-01 \
  --end 2024-12-31 \
  --grid-preset cycle4 \
  --universe SPY,QQQ,XLK,XLF,XLE,IWM \
  --capital 100000
```

---

## Criteri di successo

### Primari (OBBLIGATORI per GO)

| Metrica | Soglia | Note |
|---------|--------|------|
| Sharpe Ratio | > 1.0 | Obiettivo minimo (gap attuale: 0.025) |
| Max Drawdown | < 15% | Attuale: 3.85% (ampio margine) |
| Win Rate | > 50% | Attuale: 52.2% |
| Profit Factor | > 1.5 | Attuale: 2.20 |
| Total Trades | > 100 | Attuale: 136 |

### Secondari (desiderabili)

| Metrica | Target | Note |
|---------|--------|------|
| Sharpe Ratio | > 1.3 | "Preferibile" da runbook |
| SL % dei trade | < 50% | Attuale: 92.6% -- deve scendere significativamente |
| TP % dei trade | > 20% | Attuale: 7.4% -- deve salire |
| Sortino Ratio | > 1.5 | Attuale: 1.668 -- mantenere o migliorare |

### Criteri di robustezza (anti-overfitting)

1. **No picco isolato** -- la configurazione vincente non deve avere Sharpe molto superiore alle 3-5 combinazioni vicine nel CSV.
2. **Stabilita su sub-periodi** -- se la configurazione vincente funziona sia su H1 2023 che H2 2024, e robusta. Conferma con run singolo su sotto-periodi:
   - 2023-01-01 / 2023-12-31
   - 2024-01-01 / 2024-12-31
3. **Stop loss ratio < 50%** -- meno della meta dei trade deve finire in SL.
4. **Equity curve senza cliff** -- il backtest run singolo con parametri vincenti deve mostrare curva monotonicamente crescente (senza cadute verticali).

---

## Rischi e vincoli

### Risk management NON NEGOZIABILE

Tutti i parametri di risk management restano invariati:

| Parametro | Valore | Vincolato |
|-----------|--------|-----------|
| Max daily loss | -2% portfolio | SI -- kill switch |
| Max weekly loss | -5% portfolio | SI -- kill switch |
| Max position size | 10% portfolio | SI |
| Max positions | 10 simultanee | SI |
| Max sector exposure | 30% | SI |
| Min risk/reward | 1:2 | ATTENZIONE: con TP=3x e SL=2.5x il R/R e 1.2:1, sotto soglia |

### Vincolo R/R con TP basso

Se TP=3.0x ATR e SL=2.5x ATR, il risk/reward ratio e solo 1.2:1 -- sotto la soglia minima di 2:1 definita nel risk management.

**Mitigazioni:**
- Con SL=1.5x ATR + TP=3.0x ATR → R/R = 2:1 (esattamente soglia)
- Con SL=2.0x ATR + TP=4.0x ATR → R/R = 2:1 (esattamente soglia)
- Il backtest engine NON applica il filtro R/R -- lo calcoleremo post-hoc dalla CSV
- Nel CSV, filtrare combinazioni con TP/SL < 2.0 come non-compliant

**Regola:** scartare qualsiasi configurazione con `take_profit_atr / stop_loss_atr < 2.0` anche se ha Sharpe > 1.0, perche viola il risk management.

### Rischi operativi

1. **Overfitting al periodo 2023-2024:** 2 anni e un campione limitato. Mitigazione: validazione su sub-periodi.
2. **Bull market bias:** 2023-2024 e un forte bull market. La strategia potrebbe non funzionare in bear market. Mitigazione: se si raggiunge Sharpe > 1.0, validare su 2019-2024 (include COVID crash 2020).
3. **Dati cachati:** se i dati in `.backtest-cache/` sono corrotti o incompleti, il grid search produce risultati errati. Mitigazione: verificare il numero di bar nel log iniziale.

---

## Misure del miglioramento

Per ogni combinazione nel CSV, confrontare con il baseline (ciclo #3):

| Metrica | Baseline (ciclo #3) | Delta necessario |
|---------|---------------------|-----------------|
| Sharpe | 0.975 | +0.025 (minimo) |
| SL % | 92.6% | -42.6% (target < 50%) |
| TP % | 7.4% | +12.6% (target > 20%) |
| Return | +23.39% | Mantenere o migliorare |

### Come leggere i risultati

```python
import pandas as pd

df = pd.read_csv("backtest-results/grid_YYYYMMDD_HHMMSS/grid_results.csv")

# 1. Filtra R/R compliant (TP/SL >= 2.0)
df["rr_ratio"] = df["take_profit_atr"] / df["stop_loss_atr"]
compliant = df[df["rr_ratio"] >= 2.0]

# 2. Top 10 per Sharpe tra i compliant
print(compliant.nlargest(10, "sharpe_ratio")[
    ["stop_loss_atr", "take_profit_atr", "rr_ratio",
     "signal_exit_enabled", "sharpe_ratio", "max_drawdown_pct",
     "win_rate_pct", "profit_factor", "total_trades",
     "stop_loss_count", "take_profit_count"]
])

# 3. Verifica robustezza: Sharpe stabile nelle 5 combinazioni vicine?
top1 = compliant.nlargest(1, "sharpe_ratio")
sharpe_top1 = top1["sharpe_ratio"].values[0]
neighbors = compliant.nlargest(6, "sharpe_ratio")
sharpe_std = neighbors["sharpe_ratio"].std()
print(f"Top Sharpe: {sharpe_top1:.3f}, STD top-6: {sharpe_std:.3f}")
# Se STD < 0.05 -> configurazione robusta (non picco isolato)
```

---

## Piano post-grid search

### Se Sharpe > 1.0 (GO)

1. Aggiornare `BacktestConfig` defaults in `engine.py` con parametri vincenti
2. Aggiornare `RiskSettings` in `settings.py` per la pipeline live
3. Eseguire backtest di conferma su periodo esteso (2019-2024)
4. Aggiornare `company/trading/status.json` con risultati ciclo #4
5. Salvare report in `company/trading/reports/grid-tpsl-2026-03-10.md`
6. Avanzare a paper trading 30 giorni

### Se Sharpe < 1.0 (NO-GO)

1. Analizzare i risultati per capire quale asse ha piu impatto
2. Opzioni:
   - **Ciclo #5**: espandere i parametri slope (lookback_bars, threshold, persistence)
   - **Cambio strategia**: tornare a daily composite con MACD crossover (Sharpe 0.975 gia vicino)
   - **Ibrido**: daily composite + slope intraday su account separati (Opzione C dal report NB)
3. Considerare periodo piu lungo (2019-2024) per ridurre bias temporale

---

## Checklist pre-esecuzione

- [ ] Verificare che `.backtest-cache/` contenga dati 2023-2024 per i 14 ETF (evita download lento)
- [ ] Verificare `ALPACA_API_KEY` nel file `trading/.env` (necessario per download dati)
- [ ] Implementare `CYCLE4_GRID` preset in `grid_search.py` (richiede modifica al codice)
- [ ] Assicurarsi che il campo `strategy` nel BacktestConfig sia impostato correttamente per le combinazioni (slope_volume o trend_following in base alla strategia target)
- [ ] Verificare che `slope_exit_enabled=True` sia il default per le run slope_volume

---

## Note

- Il grid search precedente (`TPSL_OPTIMIZATION_GRID`) testava SL=[2.0, 2.5] e TP=[6.0, 8.0, 10.0]. Il ciclo #4 sposta il focus verso il basso: TP=[3.0, 4.0, 5.0, 6.0] e aggiunge SL=1.5.
- Il preset `cycle4` richiede una modifica a `grid_search.py` per gestire i "trailing config blocks" (Config A e B) anziche il prodotto cartesiano completo dei parametri trailing.
- La strategia rimane `slope_volume` con 3-factor entry gate, identica al ciclo #3. L'unica variazione sono i parametri di uscita (TP/SL/trailing).
