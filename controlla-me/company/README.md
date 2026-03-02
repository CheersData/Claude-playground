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
               ┌─────────────────────┼─────────────────────┐
               │                     │                     │
        ┌──────┴──────┐    ┌────────┴────────┐    ┌──────┴──────┐
        │  PROCESS    │    │    UFFICI       │    │ DIPARTIMENTI│
        │  DESIGNER   │    │   (Revenue)     │    │   (Staff)   │
        └─────────────┘    └────────┬────────┘    └──────┬──────┘
                                    │                     │
                           ┌────────┴────────┐    ┌──────┴──────────────────┐
                           │ Uff. Legale     │    │ Architecture  │ QA     │
                           │ 7 agenti AI     │    │ Data Eng.     │Finance │
                           │ analisi legale  │    │ Security      │Ops     │
                           ├─────────────────┤    │ Strategy      │Mktg    │
                           │ Uff. Trading    │    └────────────────────────┘
                           │ 5 agenti Python │
                           │ swing trading   │
                           └─────────────────┘
```

## Struttura: Uffici vs Dipartimenti

**Uffici** generano revenue o valore diretto per gli utenti.
**Dipartimenti** supportano gli uffici con funzioni trasversali.

### Uffici (Revenue)

| Ufficio | Missione | Stack | Leader | Agenti |
|---------|----------|-------|--------|--------|
| Ufficio Legale | Analisi legale AI per utenti | TypeScript/Next.js | leader | classifier, analyzer, investigator, advisor, corpus-agent, question-prep |
| Ufficio Trading | Trading automatizzato per sostenibilità finanziaria | Python/Alpaca | trading-lead | market-scanner, signal-generator, risk-manager, executor, portfolio-monitor |

### Dipartimenti (Staff)

| Dipartimento | Missione | Leader |
|-------------|----------|--------|
| Architecture | Soluzioni tecniche cost-aware | architect |
| Data Engineering | Pipeline dati legislativi e corpus | data-connector |
| Quality Assurance | Test e validazione | test-runner |
| Finance | Monitoraggio costi API e P&L | cost-controller |
| Operations | Dashboard e monitoring runtime | ops-monitor |
| Security | Audit e protezione dati | security-auditor |
| Strategy | Vision, OKR, analisi competitiva | strategist |
| Marketing | Market intelligence, acquisizione | growth-hacker |

## Come funziona

1. **L'utente parla con CME** → `company/cme.md`
2. **CME scompone in task** → `scripts/company-tasks.ts`
3. **Uffici e dipartimenti eseguono** → leggono `department.md` + `runbooks/`
4. **Risultati tornano a CME** → task system
5. **CME reporta all'utente**

## File chiave

- `cme.md` — Prompt CME (CEO)
- `process-designer.md` — Protocolli inter-dipartimento/ufficio
- `contracts.md` — Contratti I/O tra unità organizzative
- `<unit>/department.md` — Identità unità
- `<unit>/agents/*.md` — Identity card agenti
- `<unit>/runbooks/*.md` — Procedure operative
