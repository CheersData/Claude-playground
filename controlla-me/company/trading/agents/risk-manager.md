# Risk Manager

## Ruolo

Validazione rischio pre-trade. Gatekeeper tra segnali e esecuzione. Nessun ordine passa senza la sua approvazione.

## Quando gira

Pre-trade, su ogni segnale BUY/SELL generato da Signal Generator.

## Input

- Segnali da Signal Generator (BUY/SELL con confidence)
- Portfolio corrente (da `portfolio_positions`)
- Snapshot portfolio (da `portfolio_snapshots`)
- Storico ordini recenti (da `trading_orders`)
- Configurazione risk (da `trading_config`)

## Logica

### Check obbligatori (tutti devono passare)

1. **Daily loss check**: P&L giornaliero >= -2% del portfolio
   - Se violato: KILL SWITCH — rigetta tutti i segnali, chiudi posizioni aperte
2. **Weekly loss check**: P&L settimanale >= -5% del portfolio
   - Se violato: KILL SWITCH — stop trading per il resto della settimana
3. **Position size check**: valore ordine <= 10% del portfolio
   - Se viola: ridimensiona posizione al massimo consentito
4. **Max positions check**: posizioni aperte < 10
   - Se viola: rigetta nuovi BUY finche non si liberano slot
5. **Correlation check**: no piu di 3 posizioni nello stesso settore
   - Se viola: rigetta o ridimensiona
6. **Liquidity check**: volume medio > 500k shares/day
   - Se viola: rigetta (rischio slippage)

### Output per ogni segnale

- **APPROVED**: ordine passa a Executor con size calcolata
- **RESIZED**: ordine approvato con size ridotta (+ motivazione)
- **REJECTED**: ordine bloccato (+ motivazione dettagliata)
- **KILL_SWITCH**: emergenza, stop totale trading

## Output

```json
{
  "date": "2026-03-01",
  "decisions": [
    {
      "symbol": "AAPL",
      "original_action": "BUY",
      "decision": "APPROVED",
      "position_size_shares": 15,
      "position_value_usd": 2782.50,
      "position_pct_portfolio": 5.6,
      "risk_checks": {
        "daily_loss": "PASS",
        "weekly_loss": "PASS",
        "position_size": "PASS",
        "max_positions": "PASS",
        "correlation": "PASS",
        "liquidity": "PASS"
      },
      "reason": "All checks passed. Position sized at 5.6% of portfolio."
    }
  ],
  "portfolio_status": {
    "total_value": 49750.00,
    "daily_pnl_pct": -0.3,
    "weekly_pnl_pct": 1.2,
    "open_positions": 6,
    "available_slots": 4
  },
  "kill_switch": false
}
```

## Kill Switch

Quando attivato:
1. Logga evento critico in `trading_signals` con `signal_type = 'kill_switch'`
2. Invia alert a Finance e CME (via Supabase insert in `trading_alerts`)
3. Tutti i nuovi ordini vengono rigettati
4. Richiede reset manuale dal boss per riprendere il trading

## Parametri configurabili

| Parametro | Default | Note |
|-----------|---------|------|
| max_daily_loss_pct | 2.0 | Max perdita giornaliera % |
| max_weekly_loss_pct | 5.0 | Max perdita settimanale % |
| max_position_pct | 10.0 | Max % portfolio per posizione |
| max_positions | 10 | Max posizioni simultanee |
| max_sector_concentration | 3 | Max posizioni per settore |
| min_liquidity_volume | 500000 | Volume minimo per trade |

## Tabella DB

Legge da `portfolio_positions`, `portfolio_snapshots`, `trading_orders`.
Scrive in `trading_signals` con `signal_type = 'risk_check'`.
