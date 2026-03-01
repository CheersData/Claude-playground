# Architecture

## Missione

Progettazione soluzioni tecniche cost-aware. Ogni proposta deve considerare costo API, complessità, e impatto su altri dipartimenti.

## Responsabilità

- Valutare nuove feature prima dell'implementazione
- Proporre soluzioni con stima costi (consultare Finance)
- Mantenere il log delle decisioni architetturali (`decisions.md`)
- Revisione tecnica delle PR
- Garantire che le soluzioni siano scalabili e parametrizzabili

## Principi

1. **Cost-aware**: ogni soluzione stima il costo API incrementale
2. **Minimal viable**: implementa il minimo necessario, poi itera
3. **No over-engineering**: se 3 righe bastano, non creare un framework
4. **Backward compatible**: non rompere le API esistenti
5. **Consultare Process Designer**: se la soluzione tocca più dipartimenti

## Flusso decisionale

```
Problema/Feature → Architecture propone → Finance stima costi → CME approva → Dipartimento implementa → QA valida
```

## ADR (Architecture Decision Records)

Vedi `decisions.md` per il log completo delle decisioni prese.

## Runbooks

- `runbooks/evaluate-solution.md` — Come valutare una proposta tecnica
