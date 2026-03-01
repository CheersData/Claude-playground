# Runbook: Backtest

## Scopo

Validare la strategia di trading su dati storici prima di passare a paper/live trading.

## Prerequisiti

- Python environment attivo
- Dati storici Alpaca (min 1 anno, ideale 3 anni)
- Librerie: pandas, numpy, matplotlib (nel pyproject.toml)

## Criteri go/no-go

| Metrica | Soglia minima | Note |
|---------|--------------|------|
| Sharpe Ratio | > 1.0 | Risk-adjusted return |
| Max Drawdown | < 15% | Perdita max da picco |
| Win Rate | > 50% | % trade positivi |
| Profit Factor | > 1.5 | Gross profit / gross loss |
| Numero trade | > 100 | Significativita statistica |
| Recovery time | < 30 giorni | Tempo per recuperare drawdown |

## Procedura

### 1. Preparazione dati

```bash
cd /trading
python -m backtest.data_loader --symbols SP500 --period 3y
```

Verifica:
- [ ] Dati OHLCV scaricati per tutti i simboli
- [ ] No gap significativi nei dati
- [ ] Split/dividendi gestiti correttamente

### 2. Esecuzione backtest

```bash
python -m backtest.run \
  --start 2023-03-01 \
  --end 2026-02-28 \
  --initial-capital 50000 \
  --config config/strategy_default.json
```

Output:
- Report JSON con metriche
- Equity curve (PNG)
- Trade log (CSV)
- Drawdown chart (PNG)

### 3. Analisi risultati

```bash
python -m backtest.analyze --report backtest_results/latest.json
```

Checklist:
- [ ] Sharpe > 1.0
- [ ] Max drawdown < 15%
- [ ] Win rate > 50%
- [ ] Profit factor > 1.5
- [ ] Equity curve senza "cliff" improvvisi
- [ ] Performance consistente in diversi periodi (bull, bear, sideways)
- [ ] No overfitting (out-of-sample test positivo)

### 4. Out-of-sample validation

Dividere dati: 70% training, 30% out-of-sample.

```bash
python -m backtest.run --mode out_of_sample --split 0.7
```

Criteri:
- [ ] Metriche out-of-sample entro 20% delle metriche in-sample
- [ ] No degradazione significativa

### 5. Sensitivity analysis

Testare con parametri variati (+-20%):

```bash
python -m backtest.sensitivity --params rsi_period,macd_fast,stop_loss_pct
```

Criteri:
- [ ] Strategia profittevole con almeno 70% delle combinazioni testate
- [ ] No "parameter cliff" (piccole variazioni non causano crolli)

### 6. Decisione go/no-go

Se TUTTI i criteri sono soddisfatti:
1. Documentare risultati nel task system
2. Presentare a CME per approvazione
3. CME presenta al boss
4. Se approvato: passare a Fase 3 (Paper Trading)

Se criteri NON soddisfatti:
1. Identificare weakness
2. Iterare su strategia/parametri
3. Ripetere backtest
4. Max 3 iterazioni — se non soddisfa, pivot strategia

## Report template

```
BACKTEST REPORT — {data}
Period: {start} to {end}
Initial Capital: ${capital}

METRICHE:
- Total Return: {return}%
- Annualized Return: {ann_return}%
- Sharpe Ratio: {sharpe}
- Max Drawdown: {max_dd}%
- Win Rate: {win_rate}%
- Profit Factor: {pf}
- Total Trades: {trades}
- Avg Hold Time: {hold_days} days

VERDICT: {GO / NO-GO}
```
