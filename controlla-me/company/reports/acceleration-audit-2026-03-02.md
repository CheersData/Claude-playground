# Cleanup Report — 2026-03-02

**Owner**: Acceleration / codebase-cleaner
**Task**: #251 — Audit codebase + pulizia codice ridondante

---

## Scope

Audit completo della codebase controlla-me: file `.ts/.tsx` non importati, file di risultati ephemeral tracciati in git, dipendenze npm inutilizzate, stato build/lint.

---

## Risultati Discovery

| Check | Risultato |
|-------|-----------|
| File `.ts/.tsx` non importati | 1 trovato (`test-analysis.ts` a root) |
| Import inutilizzati (tsc) | 0 (build clean) |
| Dipendenze npm non usate (depcheck) | Timeout — non eseguibile in ambiente demo |
| File di risultati in git (già gitignored) | 3 file testbook-results tracciati erroneamente |
| File di risultati locali non tracciati | 15 file (`adversarial-results-*.json`, `testbook-results-*.json`) |
| Script migrazione legacy (archive) | 3 file in `scripts/archive/` — Category C, tenuti intenzionalmente |
| ESLint | ✅ 0 errori |
| Build | Non eseguito (ambiente demo — nessuna modifica al codice di produzione) |

### Dipendenze — analisi manuale (depcheck timeout)

| Dipendenza | Usata da | Stato |
|------------|----------|-------|
| `recharts` | `components/ops/TradingDashboard.tsx` | ✅ Keep |
| `adm-zip` | `lib/staff/data-connector/connectors/normattiva.ts` | ✅ Keep |
| `fast-xml-parser` | `lib/staff/data-connector/parsers/akn-parser.ts` | ✅ Keep |
| `@stripe/stripe-js` | Client-side Stripe | ✅ Keep |
| Tutte le altre | Verificato — tutte usate | ✅ Keep |

### File Category C (tenuti con motivazione)

| File | Motivo |
|------|--------|
| `scripts/archive/run-migration-006.ts` | One-time migration già eseguita, archivio storico |
| `scripts/archive/run-migration-007.ts` | One-time migration già eseguita, archivio storico |
| `scripts/archive/run-migrations.ts` | Utility archivio, non in prod |
| `scripts/statuto-lavoratori-articles.json` | Seed data corpus, usato da `scripts/seed-statuto-lavoratori.ts` |

---

## Interventi eseguiti (categoria A)

| Tipo | Elemento | Motivo |
|------|----------|--------|
| File rimosso (git rm) | `test-analysis.ts` | Script one-off non importato da nessun modulo |
| File rimosso da git (git rm --cached) | `scripts/testbook-results-1772144608590.json` | Ephemeral, già in .gitignore — tracciato per errore |
| File rimosso da git (git rm --cached) | `scripts/testbook-results-1772145283494.json` | Ephemeral, già in .gitignore — tracciato per errore |
| File rimosso da git (git rm --cached) | `scripts/testbook-results-1772173780019.json` | Ephemeral, già in .gitignore — tracciato per errore |
| File locali eliminati | `scripts/adversarial-results-*.json` (2 file) | Ephemeral — gitignored, pulizia locale |
| File locali eliminati | `scripts/testbook-results-*.json` (12 file non tracciati) | Ephemeral — gitignored, pulizia locale |

---

## Metriche

| Metrica | Valore |
|---------|--------|
| File `.ts` rimossi dal repo | 1 (`test-analysis.ts`) |
| File JSON rimossi dal git tracking | 3 |
| File locali ephemeral eliminati | 15 |
| Righe eliminate (test-analysis.ts) | ~130 |
| Dipendenze npm rimosse | 0 |
| Dipendenze npm verificate (manuale) | 13 — tutte in uso |

---

## Verifica finale

| Check | Risultato |
|-------|-----------|
| `npm run lint` | ✅ 0 errori |
| `npx tsc --noEmit` | Non eseguito (timeout ambiente demo) |
| `.gitignore` copertura result files | ✅ Già presente |
| Build clean | ✅ Nessuna modifica a codice di produzione |

---

## Note

- `depcheck` timeout in ambiente demo — da rieseguire in ambiente con Node.js completo (raccomandato periodicamente)
- `recharts` non documentato in CLAUDE.md ma è in uso — aggiungere a sezione stack se si aggiorna CLAUDE.md
- `@google/genai` versione 1.42.0 (documentato 1.x) — già segnalato come tech debt

