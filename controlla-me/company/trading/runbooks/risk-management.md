# Runbook: Risk Management e Kill Switch

## Scopo

Procedure per gestione rischio, attivazione/disattivazione kill switch, e risposta a eventi critici.

## Limiti non negoziabili

| Limite | Valore | Azione su violazione |
|--------|--------|---------------------|
| Daily loss | -2% portfolio | KILL SWITCH automatico |
| Weekly loss | -5% portfolio | KILL SWITCH automatico |
| Position size | 10% portfolio | Ridimensionamento automatico |
| Max positions | 10 | Rigetto nuovi BUY |
| Sector concentration | 3 per settore | Rigetto o ridimensionamento |
| Stop loss singola posizione | -5% | Vendita automatica |

## Procedura: Kill Switch attivato

### 1. Identificazione

Il kill switch si attiva automaticamente quando:
- Daily loss >= 2% del portfolio
- Weekly loss >= 5% del portfolio

Segnale: `trading_signals` record con `signal_type = 'kill_switch'`

### 2. Azioni immediate (automatiche)

1. Tutti i nuovi ordini vengono rigettati
2. Stop loss ordini rimangono attivi (protezione posizioni)
3. Alert inviato a CME + Finance + Boss

### 3. Valutazione (manuale, entro 1 ora)

```bash
python -m agents.portfolio_monitor --mode status
```

Verifica:
- [ ] Causa della perdita identificata (crollo mercato? singola posizione? bug?)
- [ ] Posizioni aperte revisionate
- [ ] Nessun ordine pending anomalo

### 4. Decisione

**Opzione A — Attendere**: il kill switch rimane attivo fino al giorno/settimana successiva
- Daily kill switch: reset automatico al giorno successivo
- Weekly kill switch: reset automatico lunedi successivo

**Opzione B — Reset manuale**: SOLO con approvazione boss

```bash
python -m agents.risk_manager --reset-kill-switch --reason "Boss approved: <motivazione>"
```

**Opzione C — Liquidazione**: chiudere tutte le posizioni

```bash
python -m agents.executor --liquidate-all --reason "<motivazione>"
```

### 5. Post-mortem

Per ogni kill switch:
1. Creare task nel task system: `company-tasks create --title "Post-mortem kill switch <data>" --dept trading --priority high`
2. Analizzare causa root
3. Documentare lessons learned
4. Aggiustare parametri se necessario

## Procedura: Aggiustamento parametri risk

I parametri risk sono in `trading_config` (Supabase).

**REGOLA**: nessun parametro puo essere reso meno conservativo senza approvazione boss.

Parametri modificabili (piu conservativi = OK senza approvazione):
- Ridurre max position size (es. da 10% a 8%)
- Ridurre max positions (es. da 10 a 8)
- Ridurre stop loss % (es. da 5% a 3%)

Parametri che richiedono approvazione boss:
- Aumentare max daily/weekly loss
- Aumentare max position size
- Disabilitare qualsiasi check

## Monitoring quotidiano

```bash
# Status rapido
python -m agents.risk_manager --status

# Report rischio dettagliato
python -m agents.risk_manager --risk-report
```

Output atteso:
- Portfolio exposure per settore
- Correlazione tra posizioni
- Distance-to-kill-switch (quanta perdita rimane prima del trigger)
- Worst-case scenario (se tutte le posizioni colpiscono stop loss)
