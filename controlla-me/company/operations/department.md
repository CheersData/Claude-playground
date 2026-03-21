# Operations

## Missione

Monitoring, dashboard e infrastruttura operativa. Visibilità completa sullo stato dell'azienda virtuale.
Endpoint: `/ops`

## Responsabilità

- Dashboard `/ops` con stato real-time (6+ pannelli)
- Health check agenti (latenza, modello attivo, errori)
- Stato pipeline dati (ultimo sync, articoli)
- Stato task board (open, in progress, done)
- Stato QA (test pass/fail, coverage)
- Stato costi (daily, weekly, per-agent)
- **Daemon CME** — sensore puro ($0/ciclo), scan dipartimenti, report strutturato, direttiva CME
- **Process Monitor** — aggregatore unificato processi (sessions, tasks, trading, syncs)
- **Zombie Reaper** — FASE 4.5 daemon, auto-cleanup processi stale >30min
- **Self-Timeout** — `enableSelfTimeout()` per prevenzione zombie negli script
- **Alerting** — notifiche Telegram per segnali critical/high (`company/ops-alert-state.json`)

## Componenti dashboard

| Componente | Cosa mostra | Dati da |
|-----------|-------------|---------|
| TaskBoard | Kanban task per stato | `company_tasks` |
| CostSummary | Costi per provider/agente | `agent_cost_log` |
| AgentHealth | Latenza e modello per agente | runtime stats |
| DepartmentList | Status dot per dipartimento | aggregato `status.json` |
| QAStatus | Test pass/fail | ultimo run QA |
| PipelineStatus | Stato sync per fonte | `connector_sync_log` |
| DaemonControlPanel | Stato daemon, heartbeat, intervallo, enable/disable | `cme-daemon-state.json` |
| TerminalPanel | Process monitor unificato con per-item kill | `process-monitor.ts` |
| OverviewSummaryPanel | Focus del giorno, report dipartimenti | aggregato |
| ActivityFeed | Feed attività recente | `agent_cost_log` + sessions |

## Agenti

| Agente | Ruolo |
|--------|-------|
| ops-monitor | Monitoring e status reporting — dashboard /ops, metriche, alerting business |
| ops-sysadmin | System administration — server, daemon, processi, tmux, cron, cleanup zombie |
| sistemista | Dependency audit, performance profiling, infra monitoring, build health |
| builder | Implementa infrastruttura: daemon, scheduler, scripts automazione, dashboard |

## Routing intra-dipartimento

| Tipo task | Agente | Esempi |
|-----------|--------|--------|
| Dashboard / metriche / alerting | ops-monitor | "aggiungi metrica X a /ops", "dashboard KPI", "alert costi soglia" |
| Server / daemon / processi / infra runtime | ops-sysadmin | "configura tmux", "cleanup zombie", "cron job", "restart daemon" |
| Dependency / bundle / build health | sistemista | "npm audit", "bundle size analysis", "check .env vars" |
| Implementazione | builder | qualsiasi task di coding, nuovi componenti dashboard, script automazione |

## Runbooks

- `runbooks/status-report.md` — Come generare un report di stato
- `runbooks/ops-dashboard-plan.md` — Piano dashboard /ops

## Key Files

| File | Cosa fa |
|------|---------|
| `scripts/cme-autorun.ts` | Daemon sensore: 7 fasi (scan, Forma Mentis, directive, report, Telegram, zombie reaper) |
| `lib/company/self-preservation.ts` | Zombie reaper (`reapZombies()`) + self-timeout (`enableSelfTimeout()`) + sacred PID protection |
| `lib/company/process-monitor.ts` | Aggregatore unificato: sessions, tasks, trading, syncs → `MonitoredProcess[]` |
| `lib/company/sessions.ts` | Session tracker 2-layer + file + heartbeat |
| `company/cme-daemon-state.json` | Stato runtime daemon (heartbeat, cicli, intervallo, enabled) |
| `company/daemon-report.json` | Output daemon: segnali, board stats, `cmeDirective` |
| `company/ops-alert-state.json` | Stato alerting (costi, task bloccati, sync fallite) |

---

## Visione (6 mesi)

Ops completamente autonoma: alerting automatico, dashboard self-service, monitoring proattivo. Nessun team deve chiedere "come stiamo?" — la risposta è sempre visibile su /ops.

## Priorità operative (ordinate)

1. **[P0] Alerting automatico** — ✅ PARZIALE: notifiche Telegram via daemon per segnali critical/high. Manca: alert su test falliti, costi soglia
2. **[P0.5] Daemon + Zombie monitoring** — ✅ COMPLETATO: FASE 4.5 zombie reaper, enableSelfTimeout() su script, daemon heartbeat
3. **[P1] Dashboard KPI dipartimenti** — metriche in tempo reale su /ops (cycle time, coverage, corpus status)
4. **[P2] Cron monitoring** — health check automatico dei cron job (data-connector, trading scheduler)

## Autonomia

- **L1 (auto)**: aggiornare dashboard, aggiungere metriche, generare report, monitoring infra, daemon config
- **L2+ (escalation)**: nuovi endpoint API, modifica schema DB, nuove integrazioni esterne
