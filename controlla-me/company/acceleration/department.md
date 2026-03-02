# Acceleration

## Missione

Ottimizzare velocità ed efficienza di tutta la virtual company. Due assi paralleli:
1. **Performance operativa** — processi, runbook, workflow dei dipartimenti: ridurre cycle time, eliminare blocchi, automatizzare il ripetitivo
2. **Pulizia codebase** — eliminare codice morto, file ridondanti, dipendenze inutili: ogni riga che non serve costa tempo a chi legge

## Strumenti

| Strumento | Comando | Cosa verifica |
|-----------|---------|---------------|
| TypeScript type check | `npx tsc --noEmit` | Import non usati, dead code rilevabile staticamente |
| depcheck | `npx depcheck` | Dipendenze npm non referenziate |
| ESLint | `npm run lint` | Import inutilizzati, pattern da eliminare |
| Task board | `npx tsx scripts/company-tasks.ts board` | Backlog size, task bloccati, cycle time |

## KPI

- Cycle time medio task medium/high: < 48h (alert se superato)
- Dipendenze npm non usate: 0
- File `.ts/.tsx` non importati da nessuno: 0
- Build senza warning: 100%
- Tasso task bloccati: < 10% del backlog

## Responsabilità

- Audit periodico efficienza dipartimenti (task time, blockers, colli di bottiglia)
- Identificare e rimuovere codice morto, file non usati, dipendenze inutili
- Refactoring opportunistico — sempre backward compatible, mai rompere interfacce
- Aggiornare runbook obsoleti quando i processi cambiano
- Misurare metriche: task cycle time, costi API, linee di codice ridondanti
- Proporre automazioni per task ripetitivi che consumano tempo senza valore
- Coordinare con Architecture per refactoring strutturali (categoria B)

## Principi

1. **Speed is everything** — ogni attività deve produrre risultati rapidi e misurabili
2. **Delete first** — eliminare è meglio che refactorare, refactorare è meglio che tenere
3. **Measure before optimize** — nessuna ottimizzazione senza metrica baseline
4. **Zero breaking changes** — ogni pulizia deve essere backward compatible
5. **Smallest useful change** — non fare tutto in una volta, incrementale

## Agenti

| Agente | Ruolo |
|--------|-------|
| `accelerator` | Leader — coordina audit, prioritizza interventi, misura risultati |
| `codebase-cleaner` | Builder — esegue pulizia codebase, documenta ogni eliminazione |

## Runbooks

- `runbooks/codebase-cleanup.md` — Procedura step-by-step per pulizia codebase
- `runbooks/dept-performance-audit.md` — Procedura audit performance dipartimentale

## Change Log

| Data | Modifica |
|------|----------|
| 2026-03-02 | Creazione iniziale (Compito 4 boss) |
