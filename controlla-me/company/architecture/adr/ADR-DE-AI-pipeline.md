# ADR — DE AI-Powered Pipeline: Data Model Designer + Data Normalizer

**Data:** 2026-03-01
**Autore:** architect (CME Architecture)
**Stato:** PROPOSTA — in attesa approvazione CME/boss
**Task:** fc9c4eb8 (Data Normalizer), e2690657 (Data Model Agent)

---

## Contesto

Il boss ha proposto due nuovi agenti AI per il dipartimento Data Engineering:

1. **Data Model Designer** — un agente che analizza una nuova fonte dati (raw) e progetta il data model ottimale per strutturarla
2. **Data Normalizer** — un agente che, dato il data model definito, normalizza dati destrutturati verso quello schema

Oggi la pipeline DE è:
```
CONNECT → MODEL (parser hard-coded AKN/HTML) → LOAD
```

Con i nuovi agenti diventerebbe:
```
CONNECT → MODEL-DESIGNER (LLM) → NORMALIZER (LLM) → LOAD
```

---

## Analisi

### Problema che risolvono

- I parser attuali (`akn-parser.ts`, `html-parser.ts`) sono **hard-coded per formato specifico**. Per ogni nuova fonte bisogna scrivere un parser manualmente.
- Un Data Model Designer AI potrebbe analizzare qualsiasi struttura XML/HTML/JSON e produrre automaticamente lo schema target.
- Un Data Normalizer AI potrebbe estrarre dati destrutturati (HTML grezzo, PDF, XML non standard) e mapparli allo schema, **riducendo il tempo di onboarding di nuove fonti da giorni a minuti**.

### Applicabilità nel contesto Controlla.me

**Verticale Legale:**
- Normattiva produce AKN (già parsato bene con akn-parser.ts)
- EUR-Lex produce HTML (parsato con html-parser.ts)
- Nuove fonti (INPS, INAIL, CCNL) hanno formati diversi → qui il Normalizer è utile

**Piattaforma madre:**
- Se Controlla.me diventa piattaforma multi-verticale (HRTech, PropTech, HealthTech), ogni verticale ha formati dati propri
- Un agente normalizzatore generico ridurrebbe drasticamente il costo di espansione

### Stima costi

| Operazione | Modello suggerito | Costo stimato per fonte |
|-----------|------------------|------------------------|
| Data Model Design (1x per fonte) | Sonnet 4.5 | ~$0.01-0.03 |
| Normalization (per articolo, ~5000 token) | Gemini Flash | ~$0.001 per articolo |
| Totale corpus legal (5600 art) | Gemini Flash | ~$5-10 (one-time) |

### Rischi

1. **Qualità schema**: LLM può progettare schemi inconsistenti o sovra-complessi
2. **Latenza**: normalizzazione LLM è 10-50x più lenta del parsing hard-coded
3. **Costo ongoing**: se usato per delta-update frequenti, costa di più del parser
4. **Dipendenza**: cambi nel formato sorgente potrebbero richiedere re-design dello schema

### Raccomandazione Architecture

**Approccio ibrido in 2 fasi:**

**Fase 1 — Data Model Designer (solo design-time, non runtime):**
- Agente CLI che, dato il raw output di CONNECT, analizza la struttura e propone un mapping verso il data model `legal_articles`
- Output: file `.mapping.json` con regole di trasformazione XPath/CSS/JSONPath
- Uso: solo quando si aggiunge una nuova fonte, NON ad ogni sync
- Implementazione: ~2-3 giorni

**Fase 2 — Data Normalizer (opzionale, per fonti non-standard):**
- Agente che usa il `.mapping.json` prodotto dal Designer per trasformare dati raw → articoli strutturati
- Fallback automatico a parsing hard-coded se il mapping è disponibile
- Implementazione: ~3-5 giorni (dopo Fase 1)

**Immediato quick-win:**
- Usare il Designer per generare il mapping di `dlgs_81_2008` (attualmente bloccato da HTTP 404 Normattiva)

---

## Decisione proposta

✅ **Approvato concettualmente** — implementare Fase 1 (Data Model Designer) come CLI tool

⏸ **Fase 2 in standby** — valutare dopo che Fase 1 produce risultati misurabili

**Prerequisito:** approvazione boss → task a Data Engineering per implementazione

---

## Prossimi passi (se approvato)

1. Data Engineering crea `scripts/model-designer.ts` — CLI tool che prende raw output e produce mapping
2. QA valida output su 2-3 fonti esistenti (verifica accuracy > 80%)
3. Testare su D.Lgs. 81/2008 (caso reale bloccato)
4. Se successo → integrare nella pipeline standard come step opzionale
