# Eval Suite — Agenti Legali Controlla.me

## Cos'è

Questa è la suite di **valutazione qualitativa** degli agenti legali.
A differenza dei test unitari (che mockano il LLM e validano solo lo schema JSON),
l'eval suite:

1. Usa **contratti reali** progettati per essere trappole ("domande bastarde")
2. Esegue la **pipeline reale** (Classifier → Analyzer → Advisor) con API vere
3. Valuta la **qualità dell'output** contro rubrics predefinite

**Scopo**: capire se gli agenti riescono a rilevare clausole problematiche camuffate
e se i punteggi di rischio sono calibrati correttamente.

---

## ⚠️ Prerequisiti

- Crediti API Anthropic attivi (`ANTHROPIC_API_KEY` configurata in `.env.local`)
- Opzionalmente Gemini/Groq/Mistral per il fallback tier
- **NON funziona in ambiente demo** (credit balance too low → pipeline fallisce)

---

## Golden Dataset — 5 Contratti Adversariali

| ID | Contratto | Trappola principale |
|----|-----------|---------------------|
| `01` | Affitto con penale illegittima | Penale 12 mensilità + foro lontano + revisione unilaterale canone |
| `02` | Consulenza che maschera subordinazione | Esclusività + orario fisso + eterodirezione = lavoro dipendente |
| `03` | Compromesso immobiliare, caparra 30% | Caparra sproporzionata + venditore può recedere senza raddoppio |
| `04` | Locazione transitoria con clausole vietate | Pagamento solo in contanti + preavviso 12 mesi (illegale) + cauzione 5 mesi |
| `05` | CGV e-commerce, esclusione garanzie B2C | Rinuncia recesso + esclusione garanzia legale + legge Singapore |

---

## Come Eseguire

```bash
# Tutti i contratti
npx tsx tests/eval/eval-runner.ts

# Solo un contratto specifico
npx tsx tests/eval/eval-runner.ts --id=01

# Output verboso (mostra output completo di ogni agente)
npx tsx tests/eval/eval-runner.ts --verbose

# Ferma al primo fallimento
npx tsx tests/eval/eval-runner.ts --fail-fast

# Combinazioni
npx tsx tests/eval/eval-runner.ts --id=02 --verbose
```

---

## Come Leggere i Risultati

```
──────────────────────────────────────────────────────────────
▶  01-affitto-penale-illegittima — Affitto con penale illegittima (12 mensilità)
──────────────────────────────────────────────────────────────
   Contratto caricato: 2847 caratteri
   [1/3] Classifier...
   [2/3] Analyzer...
   [3/3] Advisor...
   ✅ 8/8 checks — 45.2s

══════════════════════════════════════════════════════════════
  EVAL REPORT — Agenti Legali Controlla.me
══════════════════════════════════════════════════════════════
  Contratti testati: 5
  Passati: 4 ✅
  Falliti: 1 ❌
──────────────────────────────────────────────────────────────
  ✅ 01-affitto-penale-illegittima    score=2.3  clausole=5  45.2s
  ❌ 02-lavoro-subordinato-camuffato  score=4.8  clausole=3  38.1s
       ↳ Score troppo alto: 4.8 > max 3.0 (contratto problematico non adeguatamente penalizzato)
       ↳ Clausola mancante [esclusività]: NON rilevata
```

I risultati vengono anche salvati in `tests/eval/results/eval-YYYY-MM-DD...json`
per storico e confronto tra sessioni.

---

## Struttura dei Check

Per ogni contratto vengono verificati:

1. **Tipo documento**: il Classifier classifica correttamente il tipo?
2. **Clausole must-detect**: l'Analyzer rileva TUTTE le clausole problematiche chiave?
   - Con severità minima richiesta (critical/high/medium)
3. **Score calibrato**: il fairnessScore è abbastanza basso per un contratto problematico?
4. **needsLawyer**: l'Advisor raccomanda avvocato quando necessario?
5. **Hallucination check**: l'Investigator non inventa sentenze? *(solo se Investigator incluso)*

---

## Rubrics — Dove sono definite

File: `tests/eval/rubrics.ts`

Ogni rubric ha:
```typescript
{
  id: "01-affitto-penale-illegittima",
  expectedDocumentType: "locazione",
  mustDetectClauses: [
    { keyword: "penale", minSeverity: "critical", description: "..." },
    // ...
  ],
  maxFairnessScore: 3.5,   // contratto così problematico NON può avere score > 3.5
  expectNeedsLawyer: true,
  legalNotes: "Spiegazione legale completa..."
}
```

---

## Aggiungere un Nuovo Contratto Adversariale

1. Crea il file contratto in `tests/eval/golden-contracts/NN-nome.txt`
2. Aggiungi la rubric in `tests/eval/rubrics.ts` nell'array `EVAL_RUBRICS`
3. Esegui l'eval per verificare che il contratto sia effettivamente una "trappola"

**Buone pratiche per contratti adversariali:**
- Usa linguaggio legale corretto per far sembrare il contratto legittimo
- Inserisci clausole illegali *camuffate* da clausole standard
- Il contratto deve apparire "normale" a una lettura veloce
- Ogni contratto dovrebbe testare una *tipologia specifica* di rischio

---

## Frequenza di Esecuzione Consigliata

- **Prima di ogni deploy importante**: verificare che i prompt non abbiano regressioni
- **Dopo modifica di un prompt agente**: re-eval completo
- **Mensile**: baseline check qualità
- **Non in CI automatica**: costo API elevato (~$0.50-1.00 per run completa)

---

## Interpretazione dei Risultati

| Esito | Azione |
|-------|--------|
| ✅ Tutti i check passati | Agenti funzionano correttamente — ok per deploy |
| ❌ Clausola non rilevata | Revisionare prompt Analyzer: aggiungere esempi del tipo mancante |
| ❌ Score troppo alto | Revisionare prompt Advisor: calibrazione scoring per contratti gravi |
| ❌ Tipo sbagliato | Revisionare prompt Classifier: migliorare distinzione tipi |
| ❌ needsLawyer mancante | Revisionare soglie Advisor per raccomandazione avvocato |

---

*Mantenuto da: QA + Ufficio Legale*
*Aggiornato: 2026-03-01*
