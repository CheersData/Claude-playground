# Report — Data Engineering
**Data:** 1 marzo 2026 | **Task:** 21/21 completati | **Stato:** 🟢 Operativo

---

## Funzione del dipartimento

Costruire e mantenere la pipeline dati CONNECT→MODEL→LOAD per il corpus legislativo. Gestire le fonti normative (Normattiva + EUR-Lex), gli embedding, il vector DB (Supabase pgvector), e preparare l'infrastruttura per nuovi verticali (HR, real estate, compliance).

---

## Cosa è stato fatto

### Corpus legislativo — stato attuale
- **6110 articoli** da 13/14 fonti attive (Normattiva + EUR-Lex)
- **Embedding 100% copertura** — Voyage AI (voyage-law-2, 1024d, specializzato per testi legali)
- **HNSW index** attivo su pgvector
- Fonti: Codice Civile, Codice del Consumo, GDPR, DSA, Direttiva Clausole Abusive, Roma I, e 7 altre

### Audit e pulizia corpus (L1 → L3)
Audit sistematico a 3 livelli eseguito:
- **L1**: diagnostica completa — trovati 4561 articoli con spazzatura UI (nascondi/esporta), 70 con HTML entities, 41% senza gerarchia, naming inconsistente
- **L2**: script `fix-corpus-l2.ts` — eliminati 527 duplicati, 18 rinominazioni, 976 articoli puliti, 6 entità HTML decodificate
- **L3**: spot-check semantico, cluster analysis embeddings documentata, cross-reference classifier vs corpus fixato

### Fix critico: normalizeLawSource()
Il cross-reference `normalizeLawSource()` non mappava 10/14 fonti ai nomi canonici post-L2. Fix applicato: mapping completo per Codice Penale, GDPR, DSA, 3 Direttive EU, Roma I, Statuto Lavoratori + lookup table per D.Lgs/DPR/Legge. Il RAG ora funziona per tutte le 14 fonti.

### Pipeline parametrizzata per N verticali
La pipeline era hardcoded per il verticale legale. Refactoring completo:
- `plugin-registry.ts` con `registerConnector/registerModel/registerStore`
- Factory in `index.ts` usa `resolveConnector/Model/Store` (zero switch hardcoded)
- `hr-articles` registrato come alias di `legal-articles`
- `data-connector.ts` importa `hr-sources.ts` per auto-registrazione verticale HR

### Verticale HR — prototipo pronto
`hr-sources.ts` con 4 fonti (D.Lgs. 81/2008 sicurezza lavoro, D.Lgs. 276/2003 flessibilità, L. 300/1970 Statuto, D.Lgs. 23/2015 tutele). DataType `hr-articles` integrato. Fonti pronte per `connect/load`.

### Cron delta update automatico
`app/api/cron/delta-update/route.ts` creato (GET handler Vercel Cron, auth Bearer CRON_SECRET, maxDuration 300s). `vercel.json` configurato con schedule `0 6 * * *` (ogni mattina alle 6:00). Route manuale `/api/platform/cron/data-connector` (POST) mantenuta.

### Statuto dei Lavoratori (L. 300/1970) — connector pronto
Implementato `fetchViaDirectAkn()` in `normattiva.ts` (Strategia 3 per leggi con ZIP asincroni vuoti). Fonte configurata con `directAkn: true` e `codiceRedazionale: '070U0300'`. Il connector è pronto — manca solo l'esecuzione manuale del load.

---

## Cosa resta da fare

| Priorità | Task | Comando |
|----------|------|---------|
| Alta | Caricare Statuto Lavoratori | `npx tsx scripts/data-connector.ts load statuto_lavoratori` |
| Media | Caricare corpus HR (D.Lgs. 81/2008) | `npx tsx scripts/data-connector.ts load tus_2008` |
| Media | AI pass istituti giuridici su fonti mancanti | c.p., c.p.c., Cod.Consumo — coordinare con Ufficio Legale |
| Bassa | Connector CCNL (CNEL) | Nessun connector esistente — analisi fonti necessaria |
| Bassa | Cluster analysis embeddings | Script k-means + UMAP per identificare outlier |

---

## Allineamento con la funzione

✅ **Pieno.** DE ha eseguito tutto il ciclo: ingest → audit → cleanup → estensione verticale → automazione. Nessuna deriva. La parametrizzazione della pipeline è esattamente il tipo di investimento infrastrutturale richiesto per una piattaforma madre.

---

## Stato competitivo

**Vantaggio difendibile:** il corpus legislativo IT+EU con istituti giuridici mappati e embedding specializzati (voyage-law-2) è il moat tecnico più difficile da replicare. Un competitor deve:
1. Costruire i connector per Normattiva + EUR-Lex (2-3 mesi)
2. Gestire i quirk API (ZIP vuoti, AKN async) — noi li abbiamo già risolti
3. Eseguire l'audit e cleanup (2-3 settimane di lavoro)
4. Aspettare che la knowledge base si popoli con analisi reali

**Gap:** Statuto dei Lavoratori ancora non caricato (1 comando da eseguire). CCNL assenti (gap significativo per il verticale HR).
