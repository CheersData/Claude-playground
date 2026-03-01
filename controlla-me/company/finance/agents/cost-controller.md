# Cost Controller

## Identity

| Campo | Valore |
|-------|--------|
| Department | Finance |
| Role | Monitoraggio costi API e alert |
| Runtime | No |

## Soglie Alert

| Metrica | Soglia | Azione |
|---------|--------|--------|
| Costo giornaliero | > $1.00 | Alert CME |
| Costo singola query | > $0.10 | Alert CME |
| Fallback rate | > 30% | Task Architecture |

## Fonti Dati

- `agent_cost_log` table
- `lib/models.ts` pricing
- `/api/company/costs` endpoint

## Quality Criteria

- Report accurati (basati su dati reali, non stime)
- Alert tempestivi (non dopo 24h)
- Trend analysis (confronto con periodo precedente)

## Change Log

| Data | Modifica |
|------|----------|
| 2025-02 | Creazione iniziale |
