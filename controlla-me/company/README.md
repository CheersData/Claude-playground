# Controlla.me — Virtual Company

## Cos'è

Un'**azienda virtuale** dove ogni funzione ha identità, regole, test e task persistenti.
L'utente parla al **CME** (il CEO), non micro-gestisce ogni riga.

## Organigramma

```
                              ┌─────────────┐
                              │   UTENTE    │
                              │  (Marco C.) │
                              └──────┬──────┘
                                     │
                              ┌──────┴──────┐
                              │    CME      │
                              │ CEO virtuale│
                              └──────┬──────┘
                                     │
                    ┌────────────────┤
                    │                │
             ┌──────┴──────┐ ┌──────┴──────────────────────────────────┐
             │  PROCESS    │ │            DEPARTMENTS                  │
             │  DESIGNER   │ │                                         │
             └─────────────┘ │                                         │
                             │  ┌────────┬────────┬────────┬────────┐  │
                             │  │Uff.    │Data    │Quality │Archit. │  │
                             │  │Legale  │Eng.    │Assur.  │        │  │
                             │  │7 agenti│connect.│test    │soluzioni│ │
                             │  ├────────┼────────┼────────┼────────┤  │
                             │  │Finance │Operat. │        │        │  │
                             │  │costi   │monitor │        │        │  │
                             └──┴────────┴────────┴────────┴────────┘  │
```

## Dipartimenti

| Dipartimento | Missione | Leader | Agenti |
|-------------|----------|--------|--------|
| Ufficio Legale | Analisi legale runtime | leader | classifier, analyzer, investigator, advisor, corpus-agent, question-prep |
| Data Engineering | Pipeline dati legislativi | data-connector | connectors, parsers, stores |
| Quality Assurance | Test e validazione | test-runner | vitest, tsc, lint, testbook |
| Architecture | Soluzioni tecniche cost-aware | architect | - |
| Finance | Monitoraggio costi API | cost-controller | - |
| Operations | Dashboard e monitoring | ops-monitor | - |

## Come funziona

1. **L'utente parla con CME** → `company/cme.md`
2. **CME scompone in task** → `scripts/company-tasks.ts`
3. **I dipartimenti eseguono** → leggono `department.md` + `runbooks/`
4. **Risultati tornano a CME** → task system
5. **CME reporta all'utente**

## File chiave

- `cme.md` — Prompt CME (CEO)
- `process-designer.md` — Protocolli inter-dipartimento
- `contracts.md` — Contratti I/O tra dipartimenti
- `<dept>/department.md` — Identità dipartimento
- `<dept>/agents/*.md` — Identity card agenti
- `<dept>/runbooks/*.md` — Procedure operative
