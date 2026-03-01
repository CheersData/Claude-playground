# Operations

## Missione

Monitoring e dashboard. Visibilità completa sullo stato dell'azienda virtuale.
Endpoint: `/ops`

## Responsabilità

- Dashboard `/ops` con stato real-time
- Health check agenti (latenza, modello attivo, errori)
- Stato pipeline dati (ultimo sync, articoli)
- Stato task board (open, in progress, done)
- Stato QA (test pass/fail, coverage)
- Stato costi (daily, weekly, per-agent)

## Componenti dashboard

| Componente | Cosa mostra | Dati da |
|-----------|-------------|---------|
| TaskBoard | Kanban task per stato | `company_tasks` |
| CostSummary | Costi per provider/agente | `agent_cost_log` |
| AgentHealth | Latenza e modello per agente | runtime stats |
| DepartmentList | Status dot per dipartimento | aggregato |
| QAStatus | Test pass/fail | ultimo run QA |
| PipelineStatus | Stato sync per fonte | `connector_sync_log` |

## Runbooks

- `runbooks/status-report.md` — Come generare un report di stato
