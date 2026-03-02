# Retrieval Improvement — Proposta Architetturale
**Data**: 2026-02-28 | **Autore**: architect | **Task**: c93f8808 | **Status**: review

---

## Problema

Il sistema RAG attuale costruisce un unico `ragContext` al passo 1.5 (dopo il Classifier) e lo riusa per tutti gli agenti successivi (Investigator + Advisor). Questo contesto è generico — costruito su `documentTypeLabel + documentSubType + relevantInstitutes` — e **non viene aggiornato dopo che l'Analyzer ha identificato le clausole problematiche specifiche**.

Il passo 2.5 aggiorna `legalContext` (articoli di legge) con i testi delle clausole, ma **salta completamente la knowledge base** (`legal_knowledge`: sentenze, pattern clausole, pattern rischi).

### Impatto concreto

| Agente | Contesto RAG ricevuto oggi | Problema |
|--------|---------------------------|----------|
| Analyzer | `ragContext` generico da step 1.5 | OK — corretto per fase iniziale |
| Investigator | **stesso** `ragContext` generico | Riceve pattern generici, non sentenze/leggi sulle *clausole specifiche* trovate |
| Advisor | **stesso** `ragContext` generico | Calibra score su tipo documento, non sui rischi effettivi trovati |

---

## Soluzione Proposta

### Principio: ogni agente riceve RAG mirato alla sua fase

Nessuna nuova infrastruttura. Si tratta di aggiungere 2 query targetizzate usando le funzioni già esistenti in `lib/vector-store.ts`.

### Modifiche a `lib/agents/orchestrator.ts`

**Passo 2.5** — dopo aver già aggiornato `investigatorLegalContext`, aggiungere query KB:

```typescript
// Aggiungere DOPO la chiamata a retrieveLegalContext al passo 2.5
let investigatorRagContext = ragContext; // fallback al generico

if (isVectorDBEnabled() && result.analysis.clauses.length > 0) {
  const clauseQueries = result.analysis.clauses
    .filter(c => ["critical", "high"].includes(c.riskLevel))
    .map(c => `${c.title} ${c.issue}`)
    .slice(0, 4)
    .join(" | ");

  if (clauseQueries) {
    investigatorRagContext = await buildRAGContext(clauseQueries, {
      maxChars: 3500,
      categories: ["law_reference", "court_case", "clause_pattern"],
    });
  }
}
```

Passare `investigatorRagContext` all'Investigator invece di `ragContext`.

**Prima del passo 4 (Advisor)** — costruire RAG mirato ai rischi trovati:

```typescript
let advisorRagContext = ragContext; // fallback al generico

if (isVectorDBEnabled() && result.analysis.clauses.length > 0) {
  const riskQuery = [
    result.analysis.overallRisk,
    ...result.analysis.clauses
      .filter(c => ["critical", "high"].includes(c.riskLevel))
      .map(c => c.title)
      .slice(0, 3),
  ].join(" ");

  advisorRagContext = await buildRAGContext(riskQuery, {
    maxChars: 2500,
    categories: ["risk_pattern", "clause_pattern"],
  });
}
```

Passare `advisorRagContext` all'Advisor invece di `ragContext`.

**Passo 1.5** — arricchire la query con il summary del documento:

```typescript
// Attuale:
const queryForRAG = [documentTypeLabel, documentSubType, ...relevantInstitutes].filter(Boolean).join(" ");

// Migliorato:
const queryForRAG = [
  result.classification.documentTypeLabel,
  result.classification.documentSubType,
  ...(result.classification.relevantInstitutes ?? []),
  result.classification.summary?.slice(0, 150), // ← aggiungere summary
].filter(Boolean).join(" ");
```

---

## Impatto Atteso

| Misurazione | Prima | Dopo (stimato) |
|-------------|-------|----------------|
| Sentenze pertinenti in risposta Investigator | ~30% match | ~65% match |
| Score Advisor calibrato su rischi reali | mai | con knowledge base popolata |
| Token sprecati in contesto generico | ~40% | <10% |
| Latenza aggiuntiva | — | +1-2s (2 query extra, parallele se possibile) |

**Nota**: il beneficio cresce col tempo. Più analisi vengono completate, più la knowledge base si arricchisce e il RAG mirato diventa più efficace. Con knowledge base vuota o quasi, l'impatto è minimo.

---

## Rischi e Controindicazioni

- **Knowledge base scarsa**: se `legal_knowledge` ha pochi dati, i nuovi RAG restituiscono contesto vuoto → fallback al `ragContext` generico già previsto nel codice
- **Latenza**: 2 query extra (~0.5s ciascuna). Le query a step 2.5 e pre-Advisor possono essere parallele tra loro; non parallelizzabili con gli agenti per dipendenza logica
- **Regressione Analyzer**: l'Analyzer continua a ricevere il RAG generico di step 1.5 — corretto, non va cambiato

---

## Priorità di Implementazione

1. **Alta priorità**: passo 2.5 + investigator RAG mirato — impatto diretto sulla qualità delle clausole coperte
2. **Media priorità**: advisor RAG mirato — impatto su scoring (rilevante solo con knowledge base >50 entries)
3. **Bassa priorità**: arricchimento query step 1.5 con summary — marginal gain

---

## Stima Effort

- Modifiche a `lib/agents/orchestrator.ts`: ~30 righe
- Nessuna migrazione DB, nessuna modifica agli agenti, nessun nuovo file
- Test: aggiornare `tests/unit/orchestrator.test.ts` per i nuovi context params
- Effort totale: **2-3 ore** (implementazione + test)
