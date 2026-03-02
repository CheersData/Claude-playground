# Runbook: Codebase Cleanup

**Owner**: Acceleration / codebase-cleaner
**Trigger**: audit periodico o richiesta esplicita da CME
**Output**: codebase più snella, build più veloce, meno superficie da mantenere

---

## Step 1 — Discovery

### 1a. File `.ts/.tsx` non importati da nessuno

Cerca ogni file e verifica se è referenziato:

```bash
# Trova tutti i file ts/tsx del progetto (esclude node_modules, .next, dist)
find . -name "*.ts" -o -name "*.tsx" | grep -v node_modules | grep -v ".next" | grep -v "dist"

# Per ogni file sospetto, verifica se è importato:
grep -r "from '.*<filename>'" --include="*.ts" --include="*.tsx" .
grep -r "from \".*<filename>\"" --include="*.ts" --include="*.tsx" .
```

Candidati tipici da controllare:
- Script di utility usati una sola volta in passato
- Componenti React mai inclusi in nessuna pagina
- File di configurazione duplicati o sperimentali

### 1b. Import non usati nei file esistenti

```bash
npx tsc --noEmit 2>&1 | grep "'.*' is declared but its value is never read"
npx tsc --noEmit 2>&1 | grep "is declared but never used"
npm run lint 2>&1 | grep "no-unused-vars\|@typescript-eslint/no-unused-vars"
```

### 1c. Dipendenze npm non usate

```bash
npx depcheck
```

Output atteso: lista di `Unused dependencies` e `Unused devDependencies`.

Nota: `depcheck` può avere falsi positivi per dipendenze usate via peer, in config, o in script bash. Verificare manualmente prima di rimuovere.

### 1d. File di risultati script da rimuovere o gitignorare

```bash
# Cerca file di risultati lasciati in repo
ls *.json 2>/dev/null
find . -name "testbook-results-*.json" -not -path "*/node_modules/*"
find . -name "adversarial-results-*.json" -not -path "*/node_modules/*"
find . -name "*-results-*.json" -not -path "*/node_modules/*"
```

Questi file vanno aggiunti a `.gitignore` se non già presenti, o eliminati se già tracciati per errore.

### 1e. Migrazioni Supabase

```bash
ls supabase/migrations/
cat supabase/migrations/REGISTRY.md
```

Verificare:
- Numerazione sequenziale senza buchi o doppioni
- Ogni migrazione è nel REGISTRY.md
- Nessuna migrazione "draft" o sperimentale non eseguita

### 1f. Dipendenze di tipo peer/bin installate ma mai chiamate

```bash
# Verifica cosa c'è in package.json vs cosa è effettivamente referenziato
cat package.json | grep -A 50 '"dependencies"'
cat package.json | grep -A 50 '"devDependencies"'
```

Confrontare con gli import reali nel codice.

---

## Step 2 — Analisi e categorizzazione

Per ogni elemento trovato nella Discovery, assegnare una categoria:

| Categoria | Criterio | Azione |
|-----------|----------|--------|
| **A — Safe to delete** | Non referenziato in prod, test, CI, config | Eliminare direttamente |
| **B — Needs refactor first** | Referenziato ma il codice chiamante è anch'esso da rimuovere o refactorare | Creare task per Architecture |
| **C — Keep** | Ha ragione di esistere (futuro uso pianificato, script utile, config necessaria) | Documentare perché si tiene |

**Regola**: in caso di dubbio tra A e B, scegliere B e creare task.

---

## Step 3 — Esecuzione

### Eliminazione categoria A

```bash
# Rimuovi il file
rm path/to/unused-file.ts

# Rimuovi dipendenza npm inutilizzata
npm uninstall nome-pacchetto

# Aggiungi a .gitignore file di risultati
echo "testbook-results-*.json" >> .gitignore
echo "adversarial-results-*.json" >> .gitignore
```

**Incrementale**: eseguire un tipo di cleanup alla volta. Non mescolare rimozione file, dipendenze e refactoring nello stesso commit.

### Per categoria B

Creare task nel board:

```bash
npx tsx scripts/company-tasks.ts create \
  --title "Refactor: rimuovere <componente> dopo cleanup <dipendenza>" \
  --dept architecture \
  --priority medium \
  --by acceleration \
  --desc "Durante cleanup <data>, trovato <file> che usa <dipendenza obsoleta>. Richiede refactor prima di eliminare. Vedere report acceleration-audit-<data>.md"
```

### Per categoria C

Aggiungere commento nel file o nel runbook:

```typescript
// KEEP: usato da <script/contesto> — non rimuovere senza coordinare con <dept>
```

---

## Step 4 — Verifica

Eseguire in sequenza dopo ogni batch di eliminazioni:

```bash
# 1. Build completo
npm run build

# 2. Type check
npx tsc --noEmit

# 3. Lint
npm run lint

# 4. Test unitari
npm test
```

**Criterio di successo**: tutti e quattro i comandi escono con codice 0. Se uno fallisce, il cleanup non è completato — investigare e correggere prima di procedere.

---

## Step 5 — Documentazione

Produrre report in `company/reports/acceleration-audit-YYYY-MM-DD.md` con:

```markdown
# Cleanup Report — YYYY-MM-DD

## Scope
<cosa è stato analizzato>

## Risultati Discovery
- File non referenziati trovati: N
- Import inutilizzati trovati: N
- Dipendenze npm non usate: N
- File di risultati da gitignorare: N

## Interventi eseguiti (categoria A)
| Tipo | Elemento | Motivo |
|------|----------|--------|
| file rimosso | `path/to/file.ts` | Non importato da nessun modulo |
| dipendenza rimossa | `nome-pacchetto` | Non referenziato nel codice |
| gitignore aggiornato | `*-results-*.json` | File temporanei non da tracciare |

## Task creati (categoria B)
- <link o ID task> — descrizione breve

## Metriche
- File rimossi: N
- Righe eliminate: ~N
- Dipendenze npm rimosse: N
- Build time delta: -Ns (prima/dopo se misurabile)

## Verifica finale
- npm run build: OK
- npx tsc --noEmit: OK
- npm test: OK
```
