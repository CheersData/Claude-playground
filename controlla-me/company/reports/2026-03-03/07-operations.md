# Report Operations — 3 marzo 2026

**Leader:** ops-monitor

---

## STATO RUNTIME

| Componente | Stato |
|-----------|-------|
| App Next.js (dev) | 🟢 Operativo |
| Build produzione | 🔴 Fallisce (useContext regressione — task #4) |
| Supabase | 🟢 Online |
| API analyze | 🟢 OK |
| API corpus | 🟢 OK |
| Trading pipeline (Python) | 🟢 Scheduler attivo hourly 16-21 CET |
| Daily standup automation | 🟢 Operativo |

---

## AUTOMAZIONI ATTIVE

| Script | Frequenza | Stato |
|--------|-----------|-------|
| `daily-standup.ts` | On-demand | 🟢 |
| `company-scheduler-daemon.ts` | Continuo | 🟢 Approvazione via Telegram + Claude Code (dopo oggi) |
| Trading scheduler (PowerShell) | Ogni 5 min | 🟢 |
| `company-tasks.ts` auto-claim | Ogni 5 min | 🟢 |

---

## DASHBOARD

- `/ops` — console operativa attiva
- Reports dipartimentali: leggibili da ReportsPanel
- Cost tracking: `GET /api/company/costs?days=7`
- Agent cost log: aggiornamento automatico ogni chiamata

---

## TODO OPERATIONS

- [ ] Configurare cron per `reset_monthly_analyses()` (Supabase pg_cron o Edge Function)
- [ ] `getAverageTimings()` fire-and-forget in alta concorrenza — sostituire con cron job dedicato
- [ ] CI/CD pipeline GitHub Actions (bloccante non critico)
- [ ] Monitor paper trading alert Telegram → integrazione con `/ops`

---

## LEGAL_KNOWLEDGE STATUS

`legal_knowledge` (knowledge base auto-accrescente) si popola automaticamente dopo ogni analisi completata. In assenza di analisi reali da utenti, è vuota o minimale. Sblocco: primo utente beta (marketing task #5/#6).
