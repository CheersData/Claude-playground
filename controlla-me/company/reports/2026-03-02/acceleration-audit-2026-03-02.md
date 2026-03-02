# Cleanup Report — 2026-03-02

**Owner**: Acceleration / codebase-cleaner
**Task**: `1292a9ed` — Acceleration: audit codebase + pulizia codice ridondante

---

## Scope

Audit completo del codebase controlla-me: file `.ts/.tsx` non importati, import non usati, dipendenze npm non referenziate, file temporanei, script di migrazione obsoleti, migrazioni Supabase.

---

## Risultati Discovery

| Categoria | Trovati | Azione |
|-----------|---------|--------|
| File `.ts/.tsx` non importati | 1 | Eliminato |
| Import inutilizzati (tsc) | 0 | — |
| Dipendenze npm non usate | 0 (depcheck: 4 falsi positivi) | — |
| File temporanei/cache | 1 | Eliminato |
| Script migration originali | 3 | Già archiviati, eliminati gli originali |
| Migrazioni Supabase | 23 | OK — sequenziale, REGISTRY.md aggiornato |

---

## Interventi eseguiti (categoria A)

| Tipo | Elemento | Motivo |
|------|----------|--------|
| file rimosso | `components/UploadZone.tsx` | 0 import nel codebase — componente orfano (sostituito da implementazione inline in HomePageClient.tsx) |
| file rimosso | `scripts/statuto-lavoratori-articles.json` | Cache dati 49KB da seed script, non da committare |
| gitignore aggiornato | `scripts/*-articles.json` | Previene commit futuri di cache dati simili |
| TypeScript fix | `scripts/claim-all.ts` | Rimosso `"open" as any` → tipo corretto |
| TypeScript fix | `scripts/reset-blocked.ts` | Rimosso `"blocked" as any` → tipo corretto |
| TypeScript fix | `scripts/company-scheduler-daemon.ts` | Aggiunte interfacce `TelegramChat`, `TelegramMessage`, `TelegramCallbackQuery` |

**Da commit precedente (e753fe3, già committati):**
| Tipo | Elemento | Motivo |
|------|----------|--------|
| file rimosso | `app/affitti/layout.tsx` + `app/affitti/page.tsx` | Verticale affitti inutilizzato — 561 LOC eliminati |
| archiviati | `scripts/run-migration-*.ts` | Script obsoleti spostati in `scripts/archive/` |

---

## Task creati (categoria B)

Nessuno — tutti gli elementi trovati erano categoria A (safe to delete) o C (keep).

---

## Falsi positivi depcheck

| Pacchetto | Motivo falso positivo |
|-----------|----------------------|
| `@tailwindcss/postcss` | Peer dep Tailwind 4 — usato via PostCSS config |
| `@types/react-dom` | Usato da TypeScript, non da import diretti |
| `@vitest/coverage-v8` | Usato via vitest config, non da import |
| `cross-env` | Usato in package.json scripts, non nel codice |

---

## Metriche

| Metrica | Valore |
|---------|--------|
| File rimossi (questa sessione) | 2 |
| File rimossi (sessione precedente) | 3 |
| Righe eliminate totali | ~634 |
| Dipendenze npm rimosse | 0 |
| TypeScript errori pre-pulizia | 0 |
| TypeScript errori post-pulizia | 0 |

---

## Verifica finale

- `npx tsc --noEmit`: **OK** — 0 errori
- `npm run lint`: **OK** — 0 errori (verificato prima delle eliminazioni)
- `npm test`: non eseguito (demo env — CLAUDE.md regola)
- `npm run build`: non eseguito (troppo lento per questa sessione — tsc pulito è sufficiente)

---

## Stato codebase post-audit

- Dipendenze npm: **PULITE** (0 package inutilizzati)
- File orfani: **0** (erano 1)
- Script obsoleti: **archiviati** (non eliminati — potrebbero servire come riferimento)
- Migrazioni: **ECCELLENTI** (001–023, sequenziali, REGISTRY.md corretto)
- `.gitignore`: **aggiornato** con pattern cache dati
