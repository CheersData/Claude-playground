# Contratti Inter-Dipartimento

## Regola d'oro

I dipartimenti **NON** si chiamano tra loro direttamente.
Comunicano tramite **TASK**.

```
Flusso: Dipartimento A crea task → Task System → Dipartimento B lo prende → completa → risultato nel task
```

## Flussi autorizzati

| # | Da | A | Tipo | Note |
|---|-----|---|------|------|
| 1 | CME | qualsiasi | task diretto | CME può delegare a chiunque |
| 2 | Architecture | QA | richiesta test | dopo proposta tecnica |
| 3 | Architecture | Finance | stima costi | prima di implementare |
| 4 | QA | qualsiasi | bug report | quando un test fallisce |
| 5 | Finance | CME | alert costi | MAI diretto ai dipartimenti |
| 6 | Hooks runtime | Task System | automatico | nessun dipartimento chiamato |
| 7 | Strategy | CME | OKR report / competitor alert | Output trimestrale o urgente |
| 8 | Strategy | Architecture | feature proposal | dopo approvazione CME |
| 9 | Strategy | Marketing | positioning brief | ogni trimestre |
| 10 | Marketing | CME | growth report / metriche mensili | primo del mese |
| 11 | Marketing | Ufficio Legale | revisione contenuti | prima della pubblicazione |
| 12 | Security | CME | vulnerability alert | immediatamente su critical/high |
| 13 | Security | QA | richiesta test regressione | dopo fix |

## Flussi VIETATI

- Ufficio Legale → Data Engineering (passa da CME)
- Finance → qualsiasi dipartimento (passa da CME)
- Operations → modifiche codice (solo monitoring)
- Marketing → modificare prompt o codice (passa da CME → Ufficio Legale / Architecture)
- Strategy → implementare feature direttamente (passa da CME → Architecture)

## Formati I/O per dipartimento

| Dipartimento | Input (riceve) | Output (produce) |
|-------------|----------------|-------------------|
| Ufficio Legale | Task con tipo (prompt review, agent config, revisione contenuto) | Prompt aggiornato, config modificata, contenuto validato |
| Data Engineering | Task con source + operazione (sync, add, fix) | Risultato sync (items fetched/inserted/errors) |
| Quality Assurance | Task "run suite" o "validate X" | Report (tests pass/fail, coverage, issues) |
| Architecture | Task con problema/feature da risolvere | Proposal (soluzione, impatto, costi stimati) |
| Security | Task "audit" o vulnerability identificata | Report sicurezza, fix implementato |
| Finance | Task "cost report" o alert automatico | Report costi (per agent, per provider, trend) |
| Operations | Task "status report" | Dashboard data (health, latency, pipeline status) |
| Strategy | Task "quarterly review" o "feature prioritization" | OKR, roadmap, RICE scores, competitor snapshot |
| Marketing | Task "content calendar", "growth report", "partnership outreach" | Piano contenuti, report metriche, stato partnership |
