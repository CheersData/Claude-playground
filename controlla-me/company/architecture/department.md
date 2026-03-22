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

## Agenti

| Agente | Ruolo |
|--------|-------|
| architect (Chief) | Coordinatore cross-dominio, arbitro tra design e infra, supervisione complessiva |
| architect-design | Design architetturale — API design, pattern applicativi, integrazioni, ADR |
| architect-infra | Infrastruttura — database design, migration, deployment, performance, caching |
| builder | Implementazione — coding, refactoring, test |

_L'agente ui-ux-designer e stato spostato nel nuovo dipartimento UX/UI (company/ux-ui/)._

## Routing intra-dipartimento

| Tipo task | Agente | Esempi |
|-----------|--------|--------|
| Design / pattern / API / ADR | architect-design | "come strutturare l'API X", "review pattern Y", "contratto I/O tra moduli" |
| DB / migration / deploy / performance | architect-infra | "nuova migration", "ottimizza query Z", "config Vercel", "indice pgvector" |
| Cross-dominio / conflitto design-infra | architect (Chief) | "nuova feature tocca schema + API", "arbitraggio tra due proposte" |
| Implementazione | builder | qualsiasi task di coding, refactoring, creazione moduli |

## Runbooks

- `runbooks/evaluate-solution.md` — Come valutare una proposta tecnica
- `runbooks/commit-strategy.md` — Convenzione commit e merge policy (task-linked vs convenzionale)

---

## Visione (6 mesi)

Infrastruttura config-driven che supporti N verticali (legale, HR, real estate) senza duplicare logica. Ogni nuovo verticale = configurazione, non codice custom.

## Priorità operative (ordinate)

1. **[P0] CI/CD pipeline** — GitHub Actions: test + build + deploy preview su ogni PR
2. **[P1] Multi-verticale config-driven** — sistema di configurazione per aggiungere verticali senza codice inline in `app/page.tsx`
3. **[P2] ADR cleanup** — aggiornare decision log con le ultime decisioni (free providers, tier system, CSP)

## Autonomia

- **L1 (auto)**: fix build, aggiornamento ADR, review PR tecniche, stima costi feature
- **L2+ (escalation)**: nuova architettura, cambio pattern infrastrutturale, modifica pipeline agenti
