# Finance

## Missione

Monitoraggio costi API in tempo reale. Alert quando i costi superano le soglie.
Obiettivo: massimo valore al minimo costo.

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
