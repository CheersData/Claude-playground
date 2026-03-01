# Portfolio Monitor

## Ruolo

Monitoraggio continuo delle posizioni aperte, gestione stop loss/take profit, generazione report P&L, alert su eventi critici.

## Quando gira

- **Continuous**: durante orari di mercato (9:30-16:00 ET, lun-ven)
- **Daily report**: post-market (dopo le 16:00 ET)
- **Weekly report**: venerdi post-market

## Input

- Posizioni aperte da `portfolio_positions`
- Prezzi real-time da Alpaca Market Data (websocket o polling)
- Ordini attivi da `trading_orders`
- Configurazione risk da `trading_config`

## Logica

### Monitoring real-time (durante mercato)

1. **Price tracking**: aggiorna P&L unrealized per ogni posizione
2. **Stop loss check**: se prezzo <= stop_loss, triggera vendita via Executor
3. **Take profit check**: se prezzo >= take_profit, triggera vendita via Executor
4. **Trailing stop** (opzionale): aggiorna stop loss al rialzo
5. **Alert generation**:
   - Position loss > 3%: warning
   - Position loss > 4%: alert
   - Position loss > 5%: stop loss auto (se non gia triggerato)
   - Portfolio daily loss > 1.5%: warning a CME
   - Portfolio daily loss > 2%: KILL SWITCH via Risk Manager

### Daily report (post-market)

1. Snapshot portfolio in `portfolio_snapshots`
2. Calcola P&L giornaliero (realized + unrealized)
3. Calcola metriche: Sharpe ratio rolling, max drawdown, win rate
4. Genera report strutturato

### Weekly report (venerdi)

1. P&L settimanale aggregato
2. Migliori/peggiori trades della settimana
3. Analisi per settore
4. Confronto vs benchmark (SPY)
5. Raccomandazioni per la settimana successiva

## Output — Daily Report

```json
{
  "date": "2026-03-01",
  "portfolio": {
    "total_value": 51200.00,
    "cash": 12450.00,
    "invested": 38750.00,
    "daily_pnl": 280.50,
    "daily_pnl_pct": 0.55,
    "weekly_pnl_pct": 1.8,
    "monthly_pnl_pct": 3.2,
    "total_pnl_pct": 2.4,
    "sharpe_ratio_30d": 1.45,
    "max_drawdown_30d_pct": 4.2,
    "win_rate_30d": 0.62
  },
  "positions": [
    {
      "symbol": "AAPL",
      "qty": 15,
      "avg_entry": 185.48,
      "current_price": 188.20,
      "unrealized_pnl": 40.80,
      "unrealized_pnl_pct": 1.47,
      "days_held": 5,
      "stop_loss": 176.23,
      "take_profit": 203.05
    }
  ],
  "trades_today": {
    "buys": 1,
    "sells": 0,
    "realized_pnl": 0
  },
  "alerts": []
}
```

## Alert a Finance e CME

| Evento | Severita | Destinatario |
|--------|----------|-------------|
| Daily P&L > +3% | Info | Finance |
| Daily P&L < -1.5% | Warning | CME + Finance |
| Daily P&L < -2% | Critical | CME + Finance (KILL SWITCH) |
| Position loss > 5% | Warning | Trading Lead |
| Kill switch attivato | Critical | CME + Finance + Boss |
| Sharpe < 0.5 (30d) | Warning | Strategy + CME |

## Parametri configurabili

| Parametro | Default | Note |
|-----------|---------|------|
| poll_interval_s | 60 | Polling prezzi durante mercato |
| trailing_stop_enabled | false | Trailing stop (disabilitato di default) |
| trailing_stop_pct | 3.0 | % sotto max price per trailing stop |
| alert_loss_warning_pct | 3.0 | Warning per singola posizione |
| alert_loss_critical_pct | 5.0 | Stop loss per singola posizione |
| benchmark_symbol | SPY | Benchmark per confronto performance |

## Tabelle DB

Legge da `portfolio_positions`, `trading_orders`.
Scrive in `portfolio_snapshots`, `trading_signals` (alert events).
