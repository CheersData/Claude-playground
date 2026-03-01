# Runbook: Valutare una Proposta Tecnica

## Procedura

### 1. Analizzare la proposta

- Cosa risolve?
- Quanti file tocca?
- Quali dipartimenti impatta?

### 2. Stimare i costi

Consultare Finance:
- Costo API incrementale (nuove chiamate agente?)
- Costo infrastruttura (nuove tabelle DB?)
- Costo manutenzione (complessità aggiunta?)

### 3. Consultare Process Designer

Se la proposta tocca > 1 dipartimento:
- Verifica che non crei dipendenze circolari
- Verifica che le interfacce siano rispettate
- Verifica che il flusso resti lineare

### 4. Produrre proposal

```json
{
  "title": "...",
  "problem": "...",
  "solution": "...",
  "filesChanged": ["..."],
  "departmentsImpacted": ["..."],
  "estimatedCost": { "api": "$X/query", "infra": "...", "maintenance": "..." },
  "risks": ["..."],
  "recommendation": "approve | reject | needs-more-info"
}
```

### 5. Sottomettere a CME

Creare task con la proposal come `result_data`.
