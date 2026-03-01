# Runbook: Trading Pipeline Giornaliera

## Scopo

Esecuzione della pipeline di trading giornaliera, dal market scan all'esecuzione ordini.

## Prerequisiti

- Python environment attivo (`/trading`)
- Alpaca API key configurata (paper o live)
- Supabase accessibile
- Mercato US aperto (9:30-16:00 ET, lun-ven)

## Schedule

| Fase | Orario (CET) | Agente |
|------|-------------|--------|
| Market Scan | 13:00 (pre-market) | market-scanner |
| Signal Generation | 15:00 (post-scan) | signal-generator |
| Risk Check + Execution | 15:30-16:00 (market open) | risk-manager + executor |
| Monitoring | 15:30-22:00 (market hours) | portfolio-monitor |
| Daily Report | 22:30 (post-market) | portfolio-monitor |

## Procedura

### 1. Pre-market scan (13:00 CET)

```bash
cd /trading
python -m agents.market_scanner
```

Verifica output:
- [ ] Watchlist generata con 15-30 candidati
- [ ] Nessun errore API Alpaca
- [ ] Risultati scritti in `trading_signals`

### 2. Signal generation (15:00 CET)

```bash
python -m agents.signal_generator
```

Verifica output:
- [ ] Segnali generati per watchlist
- [ ] Confidence score > 0.6 per ogni segnale
- [ ] Entry/stop_loss/take_profit calcolati

### 3. Risk check + execution (15:30 CET)

```bash
python -m agents.risk_manager
python -m agents.executor
```

Verifica output:
- [ ] Risk checks tutti PASS per ordini approvati
- [ ] No KILL_SWITCH attivo
- [ ] Ordini eseguiti o in coda
- [ ] Stop loss piazzati per nuove posizioni

### 4. Monitoring (continuo)

```bash
python -m agents.portfolio_monitor --mode continuous
```

Il monitor gira fino a chiusura mercato. Verifica:
- [ ] Nessun alert critico
- [ ] Stop loss/take profit funzionanti

### 5. Daily report (22:30 CET)

```bash
python -m agents.portfolio_monitor --mode daily_report
```

Verifica:
- [ ] Snapshot salvato in `portfolio_snapshots`
- [ ] P&L calcolato correttamente
- [ ] Report leggibile

## Troubleshooting

| Problema | Soluzione |
|----------|----------|
| Alpaca API 429 | Attendere 1 minuto, retry automatico |
| Alpaca API 403 | Verificare API key e permessi |
| No signals generated | Normale se mercato laterale. Verificare soglie |
| Kill switch attivo | NON resettare senza approvazione boss. Verificare P&L |
| Supabase timeout | Verificare connessione, retry |

## Rollback

Se un ordine errato viene piazzato:
1. Cancellare ordine su Alpaca (se non fillato): `python -m agents.executor --cancel <order_id>`
2. Se fillato: piazzare ordine opposto manualmente su Alpaca dashboard
3. Loggare incidente nel task system
