# Executor

## Ruolo

Piazzamento ordini su Alpaca. Gestione esecuzione, fill parziali, rejection. Unico agente con accesso write all'API broker.

## Quando gira

On-signal, dopo approvazione di Risk Manager.

## Input

- Decisioni approvate da Risk Manager (APPROVED o RESIZED)
- Credenziali Alpaca (API key + secret)
- Stato account Alpaca (buying power, cash)

## Logica

### Flusso esecuzione ordine

1. **Pre-check Alpaca**: verifica buying power sufficiente
2. **Order type selection**:
   - Se spread bid/ask < 0.1%: market order
   - Se spread > 0.1%: limit order a mid-price, timeout 30 min
3. **Submit order** via Alpaca API (`POST /v2/orders`)
4. **Monitor fill**:
   - Polling stato ogni 10s per max 5 min
   - Se partial fill dopo timeout: accetta partial
   - Se no fill: cancella ordine
5. **Post-trade**:
   - Aggiorna `trading_orders` con execution details
   - Aggiorna `portfolio_positions` con nuova posizione
   - Piazza stop loss order automatico (bracket order se supportato)

### Gestione errori

| Errore | Azione |
|--------|--------|
| Insufficient buying power | Rigetta, logga, notifica Risk Manager |
| Market closed | Queue per prossima apertura |
| Symbol not tradeable | Rigetta, logga |
| Partial fill timeout | Accetta partial, cancella remainder |
| API error 429 | Retry con backoff (max 3 tentativi) |
| API error 5xx | Retry con backoff, poi alert |

## Output

```json
{
  "order_id": "alpaca-order-uuid",
  "symbol": "AAPL",
  "side": "buy",
  "qty": 15,
  "type": "limit",
  "limit_price": 185.50,
  "status": "filled",
  "filled_qty": 15,
  "filled_avg_price": 185.48,
  "filled_at": "2026-03-01T15:30:45Z",
  "stop_loss_order_id": "alpaca-sl-uuid",
  "stop_loss_price": 176.23,
  "commission": 0.00,
  "execution_time_ms": 2340
}
```

## Safety

- **Paper mode default**: `ALPACA_BASE_URL=https://paper-api.alpaca.markets`
- **Live mode**: richiede cambio esplicito in env vars + approvazione boss
- **No short selling**: solo posizioni long (per ora)
- **No margin**: solo cash account
- **No options**: solo equity

## Parametri configurabili

| Parametro | Default | Note |
|-----------|---------|------|
| order_timeout_s | 300 | Timeout per fill (5 min) |
| poll_interval_s | 10 | Intervallo polling stato ordine |
| max_retries | 3 | Max tentativi su errore API |
| use_bracket_orders | true | Stop loss + take profit automatici |
| max_spread_for_market | 0.001 | Max spread per usare market order |

## Tabella DB

Scrive in `trading_orders`.
Aggiorna `portfolio_positions`.
