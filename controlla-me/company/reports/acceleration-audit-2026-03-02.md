# Cleanup Report — 2026-03-02

**Eseguito da**: Acceleration / codebase-cleaner  
**Task**: #251 — Audit codebase + pulizia codice ridondante  
**Routing**: infrastructure:maintenance

---

## Scope

Audit completo codebase controlla-me: file inutili, codice ridondante, import non usati, dead code. Tool usati: `npx tsc --noEmit`, `npx depcheck`, `npm run lint`, analisi manuale file.

---

## Risultati Discovery

- File non referenziati trovati: 0 (stale .next/types non contano — artifact build)
- Import inutilizzati trovati (warnings lint): 30 warnings, distribuiti su script e componenti
- Errori lint actionable: 21 (21 errors pre-fix, 19 post-fix)
- Dipendenze npm non usate: 1 (`@stripe/stripe-js`) + 6 devDeps (falsi positivi depcheck)
- File di risultati da gitignorare: 0 (già in .gitignore e non tracciati)
- Parsing error critici: 1 → RISOLTO

---

## Interventi eseguiti (categoria A)

| Tipo | Elemento | Motivo |
|------|----------|--------|
| Fix parsing | `scripts/adversarial-testbook.ts:75` | Newline letterale dentro stringa `"..."` → cambiato in `"\n"`. ESLint Parsing error eliminato. |
| Fix lint auto | `scripts/audit-corpus-l1.ts:352,353` | `let` → `const` (2 variabili mai riassegnate). Auto-fix `--fix`. |

---

## Elementi analizzati — categoria B (task creati)

| Elemento | Problema | Task assegnato |
|----------|---------|----------------|
| `components/ops/ArchivePanel.tsx`, `TaskBoard.tsx`, `TaskBoardFullscreen.tsx` | TS2305: `TagBadge` not exported; TS2339: `tags`, `seqNum`, `benefitStatus` not on `TaskItem` | QA → Architecture |
| `components/ops/TaskModal.tsx:165,416` | `expectedBenefit` not on `TaskItem` | QA → Architecture |
| `@stripe/stripe-js` in package.json | Nessun `import` trovato nel codice, depcheck lo flagga unused. Verificare se è davvero inutile. | Architecture |
| `components/VideoShowcase.tsx:44-48` | 4 lint errors "Cannot access refs during render" — refs usati inline nel render, da spostare in useEffect | QA/UX-UI |
| `.next/types/app/affitti/` | Stale artifact da affitti verticale rimosso. Si risolve con `npm run build` pulito. | Operazioni normali — nessun task |

---

## Categoria C — elementi mantenuti

| Elemento | Motivo |
|----------|--------|
| `scripts/statuto-lavoratori-articles.json` (49KB) | Usato da `scripts/seed-statuto-lavoratori.ts` per caricare L. 300/1970. Feature incompleta ma dati necessari. |
| `scripts/archive/` | Migrazione storiche archiviate. Riferimento storico. |
| devDeps flaggate da depcheck (`@tailwindcss/postcss`, `tailwindcss`, `@types/react-dom`, `@vitejs/plugin-react`, `@vitest/coverage-v8`, `cross-env`) | Falsi positivi depcheck — tutte chiaramente usate nel build/test. |
| setState in effect (Navbar.tsx:73, HierarchyTree.tsx:55) | Pattern intenzionale: chiusura menu su route change, expand nodes su source change. Non breaking. |

---

## Metriche

- File rimossi: 0
- Fix applicati: 2 (parsing error + let→const)
- Lint issues risolti: 2 (parsing + 2 const)
- Dipendenze npm rimosse: 0 (richiedono verifica manuale)
- Build time delta: n/a (nessuna dipendenza rimossa)
- Lint stato finale: 19 errors, 30 warnings (da 21 errors, 30 warnings pre-fix)

---

## Task creati (categoria B)

Vedi task board — tasks assegnati a QA e Architecture per:
1. Fix TS errors in components/ops/ (TagBadge + TaskItem type)
2. Fix VideoShowcase.tsx ref access in render
3. Verifica @stripe/stripe-js realmente inutilizzato

---

## Verifica finale

- `npm run build`: non eseguito (richiederebbe env Supabase/Stripe live)
- `npx tsc --noEmit`: errori residui in components/ops/ (categoria B, task creato)
- `npm run lint`: 19 errors, 30 warnings — ridotti da 21 errors (parsing + const fix)
- `npm test`: non eseguito (scope di QA)
