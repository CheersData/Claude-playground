# Runbook: Trading Pipeline Giornaliera

## Scopo

Esecuzione della pipeline di trading giornaliera, dal market scan all'esecuzione ordini.

## Prerequisiti

- Python environment attivo (`/trading`)
- Alpaca API key configurata (paper o live)
- Supabase accessibile
- Mercato US aperto (9:30-16:00 ET, lun-ven)

## Esecuzione automatica (scheduler)

```bash
cd trading
python -m src.scheduler
```

Gira continuamente in background. Schedule automatico:
- **09:00 ET** — full pipeline (scan + signal + risk + execution)
- **16:30 ET** — daily report post-market
- Skip automatico weekend

Per girare in background su Windows:
```bash
start /B python -m src.scheduler > logs/scheduler.log 2>&1
```

Per girare in background su Linux/Mac:
```bash
nohup python -m src.scheduler > logs/scheduler.log 2>&1 &
```

**Nota DST**: `ET_OFFSET_HOURS` in `src/scheduler.py` è impostato a `-5` (EST).
Cambiare a `-4` durante l'ora legale US (seconda domenica di marzo → prima domenica di novembre).

## Schedule

| Fase | Orario (CET) | Orario (ET) | Agente |
|------|-------------|-------------|--------|
| Daily pipeline (scan + signal + risk + exec) | **15:00** (pre-market) | 09:00 | market-scanner + signal-generator + risk-manager + executor |
| Intraday scan slot 1 | 16:00 | 10:00 | signal-generator (intraday) |
| Intraday scan slot 2 | 17:00 | 11:00 | signal-generator (intraday) |
| Intraday scan slot 3 | 18:00 | 12:00 | signal-generator (intraday) |
| Intraday scan slot 4 | 19:00 | 13:00 | signal-generator (intraday) |
| Intraday scan slot 5 | 20:00 | 14:00 | signal-generator (intraday) |
| Intraday scan slot 6 | 21:00 | 15:00 | signal-generator (intraday) |
| Monitoring continuo | 15:30-22:00 | 09:30-16:00 | portfolio-monitor |
| Daily Report | 22:30 (post-market) | 16:30 | portfolio-monitor |

**Note scheduler (`trading/src/scheduler.py`):**
- `ET_OFFSET_HOURS = -5` (EST) → `-4` durante ora legale US (2a domenica di marzo → 1a domenica di novembre)
- `INTRADAY_ENABLED = True` — slot intraday 16:00-21:00 CET attivi
- Skip automatico weekend

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
