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

## Agenti

| Agente | Ruolo |
|--------|-------|
| sistemista | Dependency audit, performance profiling, infra monitoring, build health |

## Runbooks

- `runbooks/status-report.md` — Come generare un report di stato

---

## Visione (6 mesi)

Ops completamente autonoma: alerting automatico, dashboard self-service, monitoring proattivo. Nessun team deve chiedere "come stiamo?" — la risposta è sempre visibile su /ops.

## Priorità operative (ordinate)

1. **[P0] Alerting automatico** — notifiche Telegram quando: test falliscono, costi superano soglia, sync fallisce, task bloccati >48h
2. **[P1] Dashboard KPI dipartimenti** — metriche in tempo reale su /ops (cycle time, coverage, corpus status)
3. **[P2] Cron monitoring** — health check automatico dei cron job (data-connector, trading scheduler)

## Autonomia

- **L1 (auto)**: aggiornare dashboard, aggiungere metriche, generare report, monitoring infra
- **L2+ (escalation)**: nuovi endpoint API, modifica schema DB, nuove integrazioni esterne
