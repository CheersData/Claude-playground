# Finance

## Missione

Monitoraggio costi real-time. Ogni token ha un prezzo. Il creator vede quanto spende.

## Metriche monitorate

| Metrica | Soglia alert | Azione |
|---------|-------------|--------|
| Costo giornaliero totale | > $1.00 | Alert CME |
| Costo singola query | > $0.10 | Alert CME |
| Fallback rate | > 30% | Task per Architecture |
| Provider down | qualsiasi | Task per Operations |

## Fonti dati

- `agent_cost_log` table — log reale di ogni chiamata agente
- `lib/models.ts` — pricing per modello
- API `/api/company/costs` — report aggregati

## Report

Il cost controller produce report con:
- Costo totale per periodo (giorno/settimana/mese)
- Breakdown per agente
- Breakdown per provider
- Trend e confronto con periodo precedente
- Modelli più costosi vs più economici

## Runbooks

- `runbooks/cost-report.md` — Come generare un report costi

---

## Visione (6 mesi)

Costo per analisi < $0.02 (free tier maximization). Dashboard P&L che unisce costi API + revenue trading + subscription. Alert automatici su sforamenti budget.

## Priorità operative (ordinate)

1. **[P0] Dashboard costi per-progetto creator** — visibilità costi API segmentati per progetto/creator sulla piattaforma
2. **[P1] Alert soglie budget** — sistema di alerting automatico quando i costi superano soglie configurabili
3. **[P2] P&L per verticale** — profit & loss segmentato per verticale (legale, trading, musica, integrazione)

## Autonomia

- **L1 (auto)**: generare cost report, analisi breakdown per agente/provider, alert budget
- **L2+ (escalation)**: modifica soglie alert, proposta cambio tier default, decisioni budget
