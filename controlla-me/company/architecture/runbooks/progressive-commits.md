# Runbook: Progressive Commits & Merge Strategy

**Owner**: Architecture / architect
**Trigger**: Ogni task completato nel sistema aziendale
**Output**: Storico git leggibile e tracciabile per ogni task aziendale

---

## Principio

Ogni task completato genera un commit strutturato. Il git log diventa uno specchio del task board: leggibile, tracciabile, auditabile.

---

## Strumento

**Script**: `COMMIT_PROGRESS.ps1` (root del progetto)

```powershell
# Uso base — dopo un task completato
.\COMMIT_PROGRESS.ps1 -Message "feat(dept/task-id): descrizione"

# Con tag di sprint — dopo 5+ task completati
.\COMMIT_PROGRESS.ps1 -Message "release: sprint N" -Tag

# Dry run — verifica cosa verrebbe committato senza farlo
.\COMMIT_PROGRESS.ps1 -Message "..." -DryRun

# Con push — per ambienti con remote configurato
.\COMMIT_PROGRESS.ps1 -Message "..." -Push
```

---

## Formato Messaggi di Commit

### Struttura

```
<tipo>(<dipartimento>/<task-id>): <titolo breve>
```

### Tipi

| Tipo | Quando usarlo |
|------|--------------|
| `feat` | Nuova feature o funzionalità |
| `fix` | Bug fix |
| `refactor` | Refactoring senza cambio funzionale |
| `test` | Aggiunta/modifica test |
| `docs` | Documentazione company o codice |
| `chore` | Pulizia, archivio, manutenzione |
| `perf` | Ottimizzazione performance |
| `release` | Tag di sprint (5+ task) |

### Esempi

```
feat(ufficio-legale/abc123): aggiunta analisi clausole penali
fix(architecture/def456): corretto bug nel parser Normattiva
chore(acceleration/ghi789): rimosso app/affitti verticale inutilizzato
docs(protocols/jkl012): aggiornato decision tree feature-request
test(quality-assurance/mno345): copertura lib/legal-corpus.ts
release: sprint 2026-03-02 (12 task completati)
```

---

## Workflow Completo

### Dopo ogni task

```
1. CME: npx tsx scripts/company-tasks.ts done <id> --summary "..."
2. CME: .\COMMIT_PROGRESS.ps1 -Message "tipo(dept/id): titolo task"
```

### Dopo ogni sprint (5+ task)

```
1. Verifica task board: npx tsx scripts/company-tasks.ts board
2. Tag di sprint: .\COMMIT_PROGRESS.ps1 -Message "release: sprint <data>" -Tag
3. Push se configurato: .\COMMIT_PROGRESS.ps1 -Message "..." -Tag -Push
```

---

## Esclusioni Automatiche

Lo script esclude automaticamente dal commit:
- `.env`, `.env.local` — credenziali
- `*.log` — log di debug
- `company/scheduler-daemon-state.json` — stato daemon volatile
- `scripts/adversarial-results-*.json` — output test locali
- `scripts/testbook-results-*.json` — output test locali
- `.analysis-cache/` — cache analisi

---

## Branch Strategy

| Branch | Uso | Regola |
|--------|-----|--------|
| `main` | Produzione | Commit diretti per task singoli. Tag per sprint |
| `feature/*` | Feature sperimentali | Solo per lavori > 1 settimana, poi merge su main |
| `hotfix/*` | Fix urgenti produzione | Merge immediato su main + tag |

**In questo progetto**: tutto su `main` per semplicità. Feature branch solo se esplicitamente richiesto dal boss.

---

## KPI del Sistema

- Ogni task ha almeno 1 commit corrispondente nel git log
- Ogni sprint (5+ task) ha un tag
- Nessun commit generico ("fix stuff", "update files")
- Il git log deve essere leggibile senza aprire il task board

---

## Change Log

| Data | Modifica |
|------|----------|
| 2026-03-02 | Creazione runbook (task Architecture #250/#252) |
