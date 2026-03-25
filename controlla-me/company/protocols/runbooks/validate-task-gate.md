# Runbook: Validate Task Gate

## Quando usare

**SEMPRE** — prima di qualsiasi modifica a file di codice, config o script. Nessuna eccezione.

Questo runbook garantisce che ogni lavoro svolto sia tracciato nel task board. Lavoro non tracciato = lavoro invisibile = debito organizzativo.

## Problema risolto

CME e i dipartimenti a volte eseguono fix, debug, troubleshooting senza creare un task formale. Il lavoro viene completato ma non appare nel board, rendendo impossibile:
- Sapere chi ha fatto cosa
- Misurare la velocità dei dipartimenti
- Fare audit delle decisioni
- Capire le priorità reali dell'organizzazione

## Pre-action checklist

Prima di modificare QUALSIASI file in `app/`, `lib/`, `trading/`, `scripts/`, `music/`, `components/`:

```
□ 1. Esiste un task ID nel board per questo lavoro?
     → npx tsx scripts/company-tasks.ts list --status in_progress
     → Se sì: verificare che il task sia in stato `in_progress`
     → Se no: STOP — creare il task PRIMA di toccare codice

□ 2. Il task ha un department owner assegnato?
     → Il campo `dept` deve corrispondere al dipartimento competente
     → Se mancante: assegnare prima di procedere

□ 3. Il livello di approvazione è rispettato?
     → L1 (operativo): CME può procedere
     → L2 (cross-dept): CME decide dopo consultazione
     → L3/L4 (strategico/critico): approvazione boss obbligatoria

□ 4. Il task è in stato `in_progress`?
     → npx tsx scripts/company-tasks.ts claim <id> --agent <agente>
     → Solo DOPO il claim si può iniziare a scrivere codice

□ 5. Al termine: chiudere il task con summary
     → npx tsx scripts/company-tasks.ts done <id> --summary "..."
```

## Workflow corretto vs scorretto

### Corretto

```
1. Boss chiede: "Fixa il bug nel trading"
2. CME crea task:
   npx tsx scripts/company-tasks.ts create \
     --title "Fix bug trailing stop trading" \
     --dept trading --priority high --by cme \
     --desc "Il trailing stop non aggiorna il tier dopo breakeven. Diagnosticare e fixare."
3. CME fa claim:
   npx tsx scripts/company-tasks.ts claim TASK-123 --agent trading-lead
4. CME (come trading dept) modifica trading/src/agents/portfolio_monitor.py
5. CME chiude:
   npx tsx scripts/company-tasks.ts done TASK-123 --summary "Fixato: tier_reached non veniva persistito dopo update. Aggiunto upsert esplicito."
```

### Scorretto (VIOLAZIONE)

```
1. Boss chiede: "Fixa il bug nel trading"
2. CME apre direttamente trading/src/agents/portfolio_monitor.py
3. CME modifica il file
4. Nessun task creato, nessun tracking
→ Il fix è invisibile. Nessuno sa cosa è cambiato o perché.
```

### Scorretto — task creato dopo (VIOLAZIONE)

```
1. CME vede un problema durante un audit
2. CME fixa direttamente il codice
3. CME crea un task "dopo" per coprire il lavoro
→ Il timestamp del task è DOPO il commit. L'audit lo rileva come retroattivo.
```

## Eccezioni ammesse (zero)

Non ci sono eccezioni. Anche per:
- **Hotfix urgenti**: crea il task con `--priority critical`, poi lavora. Costa 10 secondi.
- **Typo banali**: crea il task con `--priority low`. Il tracking vale più del tempo risparmiato.
- **Debug esplorativo**: se il debug porta a una modifica, il task va creato PRIMA della modifica, non del debug. Leggere codice senza modificare non richiede task.

**Regola chiara**: LEGGERE file = nessun task richiesto. MODIFICARE file = task obbligatorio.

## Violation detection — Audit procedure

### Audit manuale (periodico)

```bash
# 1. Lista commit recenti
git log --oneline -20

# 2. Per ogni commit, verifica che esista un task corrispondente
npx tsx scripts/company-tasks.ts list --status done

# 3. Match: il summary del task deve corrispondere al contenuto del commit
# 4. Red flag: commit senza task corrispondente = violazione
```

### Segnali di violazione

| Segnale | Significato |
|---------|-------------|
| Commit senza task ID nel board | Lavoro non tracciato |
| Task creato DOPO il commit (timestamp) | Tracking retroattivo |
| Task con summary generico ("fix vari", "cleanup") | Evasione del tracking |
| File modificati in dept diverso dal task owner | Violazione competenze |

## Escalation

| Gravità | Situazione | Azione |
|---------|-----------|--------|
| Warning | Prima violazione, task banale | Annotazione nel daemon report. CME crea il task retroattivamente e annota "gate bypass" |
| Incident | Violazione ripetuta o task non banale | Report al boss via Telegram. Review del processo con il dipartimento coinvolto |
| Critical | Violazione su codice L3/L4 (trading live, security, deploy) | Stop immediato. Boss notificato. Rollback se necessario |

## Integrazione con il daemon

Il daemon (`scripts/cme-autorun.ts`) può rilevare violazioni confrontando:
- `git log` degli ultimi N commit
- Task board (status `done` con timestamp)
- Mismatch = segnale `gate_bypass` nel `daemon-report.json`

## Metriche

| Metrica | Target |
|---------|--------|
| Gate compliance rate | 100% |
| Task creati prima del commit | 100% |
| Tempo medio creazione task | < 30 secondi |
| Violazioni per settimana | 0 |
