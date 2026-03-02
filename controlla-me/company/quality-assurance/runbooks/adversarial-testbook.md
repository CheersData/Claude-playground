# Runbook: Adversarial Testbook — Corpus Agent Pro
**Owner:** Quality Assurance (test-runner)
**Script:** `scripts/adversarial-testbook.ts`
**Aggiornato:** 2026-03-01

---

## Obiettivo

Testare la pipeline completa del Corpus Agent con domande "bastarde" da personas professionali (Notaio e Avvocato). Valuta la qualità delle risposte LLM su 4 dimensioni automatizzate + 1 dimensione manuale.

---

## Quando eseguire

- Dopo ogni modifica ai prompt `lib/prompts/corpus-agent.ts` o `lib/prompts/question-prep.ts`
- Dopo ogni aggiornamento del corpus legislativo (nuove fonti ingestate)
- Prima del lancio verso avvocati/notai in produzione
- Mensilmente come benchmark di regressione

---

## Prerequisiti

```bash
# Verifica che le variabili siano configurate
echo $VOYAGE_API_KEY    # embedding — obbligatorio
echo $GEMINI_API_KEY    # LLM corpus agent — obbligatorio per tier intern/associate (default)
# ANTHROPIC_API_KEY     # solo per --tier partner (richiede crediti API a pagamento)
```

Il Vector DB deve avere almeno le fonti principali (Codice Civile, Codice Penale, codice consumo).

---

## Come eseguire

```bash
# Run completo (30 domande, ~$0.09 con Gemini Flash)
npx tsx scripts/adversarial-testbook.ts

# Solo persona notaio (15 domande)
npx tsx scripts/adversarial-testbook.ts --notaio

# Solo persona avvocato (15 domande)
npx tsx scripts/adversarial-testbook.ts --avvocato

# Dry run — no LLM, solo testing dello scoring (gratis)
npx tsx scripts/adversarial-testbook.ts --dry-run

# Tier esplicito (default: intern — usa Gemini/Cerebras/Groq, salta Anthropic)
npx tsx scripts/adversarial-testbook.ts --tier intern     # default: Cerebras+Gemini
npx tsx scripts/adversarial-testbook.ts --tier associate  # Gemini+Haiku
npx tsx scripts/adversarial-testbook.ts --tier partner    # Sonnet (richiede crediti Anthropic)
```

### Tier e catene di fallback

| Tier | question-prep | corpus-agent | Quando usarlo |
|------|--------------|--------------|---------------|
| `intern` (default) | Cerebras → Groq → Mistral | Gemini Flash → Cerebras → Groq | Demo/CI senza crediti Anthropic |
| `associate` | Gemini Flash → Cerebras → Groq | Haiku → Gemini → Cerebras | Ambiente con crediti Anthropic limitati |
| `partner` | Haiku → Gemini → Cerebras | Sonnet → Haiku → Gemini | Produzione, valutazioni di qualità top |

**Nota**: il tier `intern` è il default per evitare errori "Credit balance too low" in ambiente demo. Non usa Anthropic come primo tentativo, parte direttamente da provider free tier.

---

## Output

Il runner produce:
1. **Report colorato in console** con score per ogni dimensione
2. **JSON file**: `scripts/adversarial-results-{timestamp}.json`

---

## Dimensioni di valutazione (100 pt automatici + 20 pt bonus manuale)

| Dimensione | Punti | Criterio |
|---|---|---|
| Citation accuracy | 25 | Articoli citati esistono e corrispondono agli attesi |
| Gap detection | 25 | L'agente riconosce i limiti del corpus quando necessario |
| Confidence calibration | 25 | Confidence nel range atteso (overclaiming = penalità) |
| Response completeness | 25 | Answer + azione pratica + follow-up presenti |
| Legal correctness | +20 bonus | Valutazione umana esperta |

---

## Soglie di accettabilità

| Metrica | Target | Critico |
|---|---|---|
| Media globale | ≥ 65% | < 50% = problema serio nel corpus o nel prompt |
| Gap detection | ≥ 70% corretta | < 60% = overclaiming pericoloso per utenti pro |
| Domande "expert" | ≥ 50% | < 35% = corpus troppo limitato per uso pro |
| Forbidden claims | 0 | > 0 = hallucination confermata, blocca il lancio |

---

## Valutazione manuale (dopo il run automatico)

Aprire il JSON generato e compilare il campo `manualEval` per ogni test case:

```json
{
  "id": 1,
  "testCase": { ... },
  "agentResult": { ... },
  "score": { ... },
  "manualEval": {
    "legalCorrectness": 8,
    "evaluatorName": "nome_avvocato",
    "evaluatorNotes": "Risposta corretta sull'art. 1524 ma manca la menzione della trascrizione.",
    "evaluatedAt": "2026-03-15T10:00:00Z"
  }
}
```

Poi eseguire il runner con il JSON manuale per vedere lo score finale (funzionalità future).

---

## Analisi dei risultati

### Se gap detection < 60%:
- L'agente sta affermando cose fuori corpus (pericoloso per professionisti)
- Azione: rinforzare nel prompt `lib/prompts/corpus-agent.ts` le istruzioni sui limiti
- Verificare le domande categoria `corpus_boundary` e `jurisprudence`

### Se citation accuracy < 60%:
- Il corpus manca delle fonti necessarie per le domande expert
- Azione: aggiungere fonti in `scripts/corpus-sources.ts` e reingestare
- Verificare quali `expectedArticleRefs` non vengono trovati

### Se confidence calibration < 60%:
- L'agente è troppo sicuro su domande difficili (overclaiming) o troppo insicuro su domande semplici
- Azione: aggiustare le istruzioni di confidence nel prompt corpus-agent

---

## Categorie di domande

| Categoria | Descrizione | N. domande |
|---|---|---|
| `corpus_boundary` | Fuori scope: giurisprudenza, c.p.c., normativa speciale | 10 |
| `institute_trap` | Confusione tra istituti simili | 2 |
| `sub_article` | Richiede dettaglio di un comma specifico | 4 |
| `multi_area` | Più aree giuridiche coinvolte | 7 |
| `false_premise` | Premessa sbagliata — agente deve correggerla | 4 |
| `eu_regulation` | Normativa UE non sempre nel corpus | 3 |

---

## Task associati

Quando il run produce un risultato inferiore alla soglia critica, aprire un task QA:

```bash
npx tsx scripts/company-tasks.ts create \
  --title "Fix corpus agent: gap detection <60% su run adversarial" \
  --dept qa \
  --priority high \
  --by qa \
  --desc "Run adversarial-testbook del YYYY-MM-DD ha evidenziato X casi di overclaiming. Rivedere prompt corpus-agent.ts sezione limiti corpus."
```
