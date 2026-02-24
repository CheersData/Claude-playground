# TODO — Prossima sessione

## Stato attuale (22 Feb 2026)
Branch: `claude/resume-data-loading-fh1xc` — tutto pushato e sincronizzato.

---

## COSE DA FARE SUL PC ATTUALE (prima di spostare)

### 1. Eseguire migrazione 004 (se non fatto)
- Supabase Dashboard → SQL Editor
- Incolla il contenuto di `supabase/migrations/004_align_legal_articles.sql`
- Clicca Run
- Questo aggiunge le colonne `source_id`, `source_name`, `source_type`, `article_number`, `in_force` alla tabella `legal_articles` esistente e le popola dai dati del Codice Civile

### 2. Eseguire migrazione 005
- Supabase Dashboard → SQL Editor
- Incolla il contenuto di `supabase/migrations/005_fix_hierarchy_data.sql`
- Clicca Run
- Questo normalizza la gerarchia (elimina nodi duplicati "Libro I" vs "Libro I — Delle persone...")

### 3. Merge in main e verifica pagina Corpus
```bash
git checkout main
git merge origin/claude/resume-data-loading-fh1xc
npm run dev
```
- Vai su http://localhost:3000/corpus — dovresti vedere tutti gli articoli del Codice Civile (~3000+)

### 4. Caricare le altre fonti legali (delta)
```bash
cd controlla-me
npx tsx scripts/seed-corpus.ts all
```
Questo carica tutte le 14 fonti (~5300 articoli). Il Codice Civile viene skippato (delta auto).

Fonti da caricare:
- Codice Penale (~734 art.)
- Codice del Consumo (~146 art.)
- Codice Proc. Civile (~831 art.)
- D.Lgs. 231/2001 (~85 art.)
- D.Lgs. 122/2005 (~21 art.)
- Statuto Lavoratori (~41 art.)
- TU Edilizia (~138 art.)
- GDPR (~99 art.)
- Dir. 93/13 Clausole abusive (~11 art.)
- Dir. 2011/83 Consumatori (~35 art.)
- Dir. 2019/771 Vendita beni (~28 art.)
- Roma I (~29 art.)
- DSA (~93 art.)

---

## SPOSTAMENTO SU PC PERSONALE

### Cosa serve:
1. **Git** installato
2. **Node.js** (v18+) e **npm**
3. **Accesso al repo GitHub**: `https://github.com/CheersData/Claude-playground`
4. **Il file `.env.local`** (copialo dal PC attuale — contiene le credenziali Supabase e API keys)

### Comandi per setup:
```bash
git clone https://github.com/CheersData/Claude-playground.git
cd Claude-playground/controlla-me
npm install
# Copia il file .env.local dal PC vecchio nella cartella controlla-me/
npm run dev
```

### Il file .env.local deve contenere:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```
(Le chiavi Stripe sono opzionali per ora)

### Supabase NON va reinstallato
Il database Supabase e in cloud — funziona da qualsiasi PC. Le migrazioni sono gia eseguite nel DB, non serve rieseguirle.

---

## FEATURE DA IMPLEMENTARE (prossime sessioni)

1. **Verifica visuale pagina Corpus** — tutti gli articoli visibili con gerarchia corretta
2. **Completare caricamento fonti** — le 13 fonti mancanti
3. **MissionSection 2x2 grid** — gia implementato, verificare visualmente l'effetto hover
4. **Ricerca semantica (opzionale)** — Voyage AI per embeddings vettoriali (costa, non urgente)
5. **Test analisi documenti** — verificare che il pipeline 4 agenti + userContext funzioni end-to-end

---

## RIEPILOGO MODIFICHE FATTE OGGI

1. Aggiunto `dotenv` al seed script (non serve piu dotenvx)
2. Creato `.gitignore` root per ridurre file tracciati da VS Code
3. Creato migrazione 004 — allinea schema DB al codice
4. Creato migrazione 005 — normalizza gerarchia duplicata
5. Fix paginazione query Supabase (superato limite 1000 righe)
6. Merge MissionSection + TeamSection in griglia 2x2 con expand-on-hover
7. Rimosso link "Il Team" dalla navbar
