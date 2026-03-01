# Runbook: Generare Report Costi

## Procedura

### 1. Query costi

Usare l'API:
```
GET /api/company/costs?days=7
GET /api/company/costs?days=30
```

### 2. Analizzare breakdown

- Per agente: quale agente costa di più?
- Per provider: quale provider costa di più?
- Per giorno: trend crescente o decrescente?
- Fallback rate: quante chiamate usano fallback?

### 3. Confrontare con periodo precedente

- Costo questa settimana vs settimana scorsa
- Costo questo mese vs mese scorso

### 4. Report

```json
{
  "period": "2025-02-21 to 2025-02-28",
  "totalCost": 0.42,
  "byProvider": { "anthropic": 0.38, "gemini": 0.04 },
  "byAgent": { "analyzer": 0.15, "investigator": 0.12, "advisor": 0.08, "classifier": 0.04, "corpus-agent": 0.03 },
  "avgCostPerQuery": 0.05,
  "fallbackRate": 0.12,
  "trend": "stable",
  "alerts": []
}
```
