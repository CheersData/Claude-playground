# Runbook: Commit Strategy e Merge Policy

**Owner**: Architecture
**Trigger**: ogni volta che si chiude un task o si vuole committare lavoro
**Obiettivo**: storico git leggibile, tracciabile per task, coerente tra dipartimenti

---

## Convenzione messaggi di commit

### Commit task-linked (raccomandato quando si chiude un task)

Formato: `[dept/short-id] titolo task`

```
[architecture/eaab523b] sistema commit progressivi + merge strategy
[quality-assurance/a1b2c3d4] test coverage agent-runner
[trading/ff12ab34] trailing stop 4-tier implementation
[acceleration/1292a9ed] audit codebase + pulizia codice ridondante
```

**Come usarlo** — aggiungere `--commit` al comando `done`:

```bash
npx tsx scripts/company-tasks.ts done eaab523b \
  --summary "Aggiunto --commit al CLI + runbook commit strategy" \
  --commit
```

Per staging selettivo (invece di `git add -A`):

```bash
npx tsx scripts/company-tasks.ts done eaab523b \
  --summary "..." \
  --commit \
  --files "scripts/company-tasks.ts company/architecture/runbooks/"
```

### Commit convenzionale (per lavoro non legato a task)

Formato: `<type>(<scope>): <description>`

| Type | Quando usarlo |
|------|--------------|
| `feat` | Nuova feature |
| `fix` | Bug fix |
| `chore` | Manutenzione, dipendenze, config |
| `test` | Aggiunta o modifica test |
| `docs` | Documentazione |
| `refactor` | Refactoring senza cambio funzionale |
| `security` | Fix di sicurezza |

Esempi:
```
feat(trading): trailing stop 4-tier implementation
fix(auth): correggi redirect OAuth su mobile Safari
chore: aggiorna dipendenze npm a versioni stabili
security: aggiungi rate limit a /api/corpus/ask
```

### Regola pratica

- Hai un task ID aperto? → usa `[dept/short-id]`
- Lavoro trasversale senza task formale? → usa convenzionale
- Mai mescolare i due stili nello stesso commit

---

## Politica merge (branch vs main)

### Lavora su main direttamente

Per task **small/medium**: 1-3 file toccati, < 200 righe, nessun breaking change.

```bash
# Lavora, poi:
git add -A
git commit -m "[dept/short-id] titolo"
# oppure usa --commit nel CLI
```

Esempi: aggiungere flag CLI, aggiornare runbook, fix bug isolato, aggiungere migrazione DB semplice.

### Crea un branch feature

Per task **large o rischiosi**: > 3 file core, breaking change, nuove dipendenze, migration complessa.

```bash
git checkout -b feature/<dept>/<short-id>-<slug>
# esempio:
git checkout -b feature/architecture/eaab523b-commit-system
```

#### Threshold decisionale

| Criterio | main | branch |
|----------|------|--------|
| File toccati | ≤ 3 | > 3 |
| Righe cambiate | ≤ 200 | > 200 |
| Breaking change? | No | Sì |
| Nuove dipendenze npm? | No | Sì |
| Migration DB? | Semplice/additive | Distruttiva o complessa |
| Tocca lib/agents/? | No | Sì |

In caso di dubbio: branch. Costa poco, protegge molto.

### Merge del branch su main

Dopo aver completato il lavoro sul branch:

```bash
# 1. Verifica che tutto passi
npm run build
npx tsc --noEmit

# 2. Torna su main e mergia
git checkout main
git merge feature/<dept>/<id>-<slug> --no-ff
# --no-ff: preserva la storia del branch nel log

# 3. Elimina il branch locale
git branch -d feature/<dept>/<id>-<slug>
```

---

## Workflow completo (dal task al commit)

```
1. Claim task
   npx tsx scripts/company-tasks.ts claim <id> --agent <nome>

2. Lavora sui file

3. Verifica build
   npm run build   (obbligatorio per task che toccano app/)
   npx tsc --noEmit   (obbligatorio sempre)

4. Chiudi task con commit automatico
   npx tsx scripts/company-tasks.ts done <id> \
     --summary "cosa è stato fatto e perché" \
     --commit

5. Il CLI:
   - Marca il task done su Supabase
   - Esegue git add -A (o --files se specificato)
   - Crea il commit: [dept/short-id] titolo task
   - Stampa conferma o warn se fallisce
```

---

## Note

- Se il commit fallisce (pre-commit hook, niente da committare), il task è già marcato done su Supabase — nessuna perdita. Il CLI avverte e suggerisce il comando manuale.
- `git add -A` include tutto il working tree. Usare `--files` per staging selettivo quando si vuole escludere file temporanei o in-progress.
- I file in `.gitignore` (`.env.local`, `.analysis-cache/`, `node_modules/`, ecc.) non vengono mai inclusi da `git add -A`.

---

## Change Log

| Data | Modifica |
|------|----------|
| 2026-03-02 | Creazione iniziale (Compito 3 boss — task eaab523b) |
