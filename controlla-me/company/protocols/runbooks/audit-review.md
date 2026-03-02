# Runbook: Audit Review

## Quando usare

Review periodico (settimanale) delle decisioni prese per verificare compliance con i protocolli.

## Procedura

### 1. Raccogli dati

```bash
# Task completati nella settimana
npx tsx scripts/company-tasks.ts list --status done
# Task in review
npx tsx scripts/company-tasks.ts list --status review
```

### 2. Per ogni decisione significativa, verifica

| Check | Domanda | Pass/Fail |
|-------|---------|-----------|
| Tree corretto | Il decision tree usato era quello giusto? | |
| Consultazione | I dipartimenti necessari sono stati sentiti? | |
| Livello approvazione | Il livello era adeguato (non troppo alto, non troppo basso)? | |
| Audit trail | La decisione è tracciata nel task system? | |
| Risultato | Il task è stato completato come previsto? | |

### 3. Identifica pattern

- Ci sono tipi di richieste ricorrenti senza tree? → proponi nuovo tree
- Ci sono dipartimenti bypassati sistematicamente? → segnala a CME
- Il livello di approvazione è spesso inadeguato? → proponi aggiornamento

### 4. Produci report

```
## Audit Report — Settimana [DATA]

Decisioni auditate: [N]
Compliance rate: [%]

### Violazioni
- [task_id]: [descrizione violazione] — Severity: [low/medium/high]

### Raccomandazioni
- [Proposta 1]
- [Proposta 2]

### Decision Trees da aggiornare
- [tree_name]: [motivo]
```

### 5. Invia a CME

Il report va a CME che decide se:
- Aggiornare i decision trees
- Notificare i dipartimenti
- Escalare al boss (solo per violazioni gravi ripetute)

## Frequenza

- **Settimanale**: review standard di tutte le decisioni
- **Immediato**: se una violazione grave viene scoperta durante l'esecuzione
- **Mensile**: report aggregato con trend e KPI di compliance
