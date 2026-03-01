# Runbook: Go Live

## Scopo

Checklist e procedura per passaggio da paper trading a live trading con soldi reali.

## Prerequisiti obbligatori

Tutti i seguenti devono essere completati:

- [ ] Backtest superato (Sharpe > 1.0, max DD < 15%)
- [ ] Paper trading completato (min 30 giorni)
- [ ] Paper trading risultati consistenti con backtest (entro 25% delle metriche)
- [ ] Nessun bug critico durante paper trading
- [ ] Kill switch testato e funzionante
- [ ] Boss ha approvato esplicitamente il go-live
- [ ] Capitale allocato e disponibile su Alpaca

## Procedura

### Fase 1: Pre-flight checks

```bash
# 1. Verifica stato paper trading
python -m agents.portfolio_monitor --mode summary --period 30d

# 2. Verifica kill switch
python -m agents.risk_manager --test-kill-switch

# 3. Verifica connessione Alpaca live
python -m utils.alpaca_health --mode live
```

Checklist:
- [ ] Paper trading P&L positivo negli ultimi 30 giorni
- [ ] Kill switch testato: attivazione e reset funzionano
- [ ] Connessione ad Alpaca live API funzionante
- [ ] Account Alpaca live funded (buying power > 0)

### Fase 2: Configurazione live

1. **Aggiornare env vars**:
```env
# DA
ALPACA_BASE_URL=https://paper-api.alpaca.markets
# A
ALPACA_BASE_URL=https://api.alpaca.markets
```

2. **Ridurre parametri risk per prima settimana**:
   - Max position size: 5% (invece di 10%)
   - Max positions: 5 (invece di 10)
   - Stop loss: 3% (invece di 5%)

3. **Configurare alert**:
   - Alert CME su ogni trade (prima settimana)
   - Daily report automatico

### Fase 3: Primo giorno live

1. **Esecuzione manuale** (non schedulata) per il primo giorno:
```bash
python -m agents.market_scanner
# Verificare output manualmente
python -m agents.signal_generator
# Verificare segnali manualmente
python -m agents.risk_manager
# Verificare decisioni manualmente
# Solo se tutto OK:
python -m agents.executor
```

2. **Monitoring intensivo**: osservare ogni ordine fino al fill
3. **Report al boss** a fine giornata

### Fase 4: Prima settimana

- Esecuzione manuale ogni giorno (non automatizzata)
- Review di ogni trade prima dell'esecuzione
- Report giornaliero al boss
- Se nessun problema: passare a esecuzione semi-automatica

### Fase 5: Stabilizzazione (settimane 2-4)

- Esecuzione semi-automatica (scheduler attivo, review manuale pre-execution)
- Gradualmente aumentare parametri risk verso i default
- Report settimanale al boss
- Se nessun problema: passare a full automation

### Fase 6: Full automation

- Scheduler completo attivo
- Alert solo su eventi critici
- Report settimanale
- Review mensile delle metriche

## Criteri di rollback (tornare a paper)

Se uno qualsiasi di questi si verifica nella prima settimana live:
- Perdita > 3% in un giorno
- Bug nell'esecuzione ordini
- Ordine piazzato non intenzionalmente
- Discrepanza tra segnale e ordine eseguito

Procedura rollback:
1. Kill switch immediato
2. Chiudere tutte le posizioni live
3. Tornare a paper URL in env vars
4. Post-mortem obbligatorio
5. Fix issue
6. Ripetere go-live da Fase 1

## Escalation

| Evento | Azione |
|--------|--------|
| Perdita > $500 in un giorno | Alert CME + Finance |
| Perdita > $1000 in una settimana | Kill switch + alert boss |
| Bug nell'executor | Kill switch + rollback immediato |
| Alpaca API outage | Stop trading, attendere recovery |
