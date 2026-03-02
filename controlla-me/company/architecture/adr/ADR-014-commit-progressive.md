# ADR-014: Sistema Commit Progressivi (COMMIT_PROGRESS.ps1)

**Data**: 2026-03-02
**Stato**: accepted
**Autore**: architect / CME

## Contesto

CME non aveva un workflow standardizzato per committare dopo ogni task completato. Il risultato era commit grandi e difficili da leggere, storia git confusa, difficoltà nel tracciare quale codice appartiene a quale task. Il boss vuole commit progressivi strutturati per ogni task completato.

## Decisione

Creare `COMMIT_PROGRESS.ps1` nella root del progetto — script PowerShell per commit progressivi con le seguenti caratteristiche:

1. **Staging selettivo**: esclude automaticamente file sensibili (`.env`, `.env.local`, `*.log`, `scheduler-daemon-state.json`, file `*-results-*.json`, `.analysis-cache/`)
2. **Convenzione messaggi**: formato libero passato via `-Message` — il team segue la convenzione `[type]: [descrizione]` (feat, fix, refactor, company, docs, test)
3. **Tag opzionale** via `-Tag` per marcare sprint o release
4. **Push opzionale** via `-Push` (default off — no push automatico in produzione senza conferma esplicita)
5. **Dry-run** via `-DryRun` per preview senza commit

### Struttura commit consigliata per task aziendali

```
[dept]: [titolo-task-breve]
```

Esempi:
- `company: acceleration dept + runbooks`
- `feat: trailing stop 4-tier live`
- `fix: corpus rate-limit bypass`

### Merge strategy

- **Main branch**: sviluppo diretto su `main` (team piccolo, CI non bloccante)
- **Feature branch**: solo per modifiche strutturali che toccano > 3 dipartimenti o breaking changes
- **Sprint tag**: ogni 5-10 task → `.\COMMIT_PROGRESS.ps1 -Message "sprint: N" -Tag`

## Conseguenze

(+) Storia git leggibile, commit atomici, esclusi automaticamente file sensibili
(+) Workflow semplice: un comando dopo ogni `company-tasks.ts done`
(-) PowerShell only — non funziona su Linux/Mac senza adattamento
(-) Staging con `git add -A` può catturare file inattesi — il team deve verificare output prima di push
