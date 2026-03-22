# ADR-017: Critic Agent Pattern

**Data**: 2026-03-18
**Stato**: proposed
**Autore**: architect / CME
**Task**: d5d38223

## Contesto

La pipeline legale (4 agenti) produce output senza verifica interna. L'Advisor genera scoring multidimensionale, citazioni normative e raccomandazioni ma nessun agente valida la coerenza di questi output. Problemi osservati:

1. **Score inconsistenti**: `fairnessScore` non sempre corrisponde alla media dei 4 sub-scores
2. **Citazioni non verificate**: `legalBasis` e `courtCase` nei risks possono essere inventati dal modello
3. **Calibrazione linguaggio**: il tono "da bar" richiesto dall'Advisor a volte scivola nel legalese
4. **Nessun feedback loop**: gli errori si ripetono perche non c'e meccanismo di apprendimento

Il Layer 4 (Riflessione) e il Layer 5 (Iteration Loop) esistono ma non sono wired alla pipeline legale. Il trading ha gia un pattern di iteration (backtest cycles) che puo essere riusato.

## Decisione

### Posizione nella pipeline

```
[1] Classifier -> [2] Analyzer -> [3] Investigator -> [4] Advisor
                                                           |
                                                     [5] CRITIC (nuovo)
                                                           |
                                              pass? --> output finale
                                              fail? --> Advisor retry (max 1)
```

Il Critic si inserisce **dopo l'Advisor** (Step 4), prima dell'auto-indexing (Step 6). Non e un agente bloccante: se fallisce, l'output dell'Advisor passa invariato.

### Cosa valuta (3 check)

| Check | Input | Criterio |
|-------|-------|----------|
| **Score consistency** | `advice.scores.*`, `advice.fairnessScore` | `fairnessScore == avg(4 sub-scores) +/- 0.5` |
| **Citation spot-check** | `advice.risks[].legalBasis`, `investigation.findings[].laws` | Ogni `legalBasis` citato nei risks deve avere un match in `investigation.findings` o nel contesto normativo RAG |
| **Language calibration** | `advice.summary`, `advice.risks[].detail` | Assenza di termini legalese puro (lista blacklist: "segnatamente", "di talche", "teste", "in forza di"), frasi < 30 parole media |

### Input/Output interface

```typescript
// lib/agents/critic.ts
interface CriticInput {
  classification: ClassificationResult;
  analysis: AnalysisResult;
  investigation: InvestigationResult;
  advice: AdvisorResult;
  ragContext?: string;
}

interface CriticVerdict {
  pass: boolean;              // true = output ok, false = needs revision
  scoreConsistency: boolean;  // sub-check 1
  citationAccuracy: boolean;  // sub-check 2
  languageCalibration: boolean; // sub-check 3
  issues: string[];           // lista problemi trovati (max 5)
  suggestedFixes: string[];   // suggerimenti per l'Advisor (max 3)
  confidence: number;         // 0.0-1.0
}
```

### Modello

**Haiku 4.5** (o primo modello free disponibile nella catena Intern). Il Critic fa pattern matching e confronto dati, non generazione creativa. Costo stimato: ~$0.001/analisi con Haiku, $0 con free tier.

### Flusso nel codice (orchestrator.ts)

```typescript
// Dopo Step 4 (Advisor), prima di onComplete:
if (isAgentEnabled("critic") && result.advice) {
  const criticResult = await runCritic({
    classification: result.classification,
    analysis: result.analysis,
    investigation: result.investigation,
    advice: result.advice,
    ragContext,
  });

  if (!criticResult.pass && criticResult.issues.length > 0) {
    // Retry Advisor con feedback del Critic (max 1 retry)
    result.advice = await runAdvisor(
      result.classification, result.analysis, result.investigation,
      ragContext + "\n\nCRITIC FEEDBACK:\n" + criticResult.suggestedFixes.join("\n")
    );
  }

  // Log nel decision journal (Layer 4)
  recordDecision({
    title: `Critic review: session ${sessionId}`,
    department: "ufficio-legale",
    decisionType: "operational",
    decidedBy: "critic-agent",
    expectedOutcome: "Quality gate on Advisor output",
    description: JSON.stringify({ pass: criticResult.pass, issues: criticResult.issues }),
    sourceSessionId: sessionId,
    tags: ["critic", "quality-gate"],
  });
}
```

### Integrazione Layer 4 (Riflessione)

Ogni esecuzione del Critic genera una entry nel `decision_journal` via `recordDecision()`. Dopo N analisi, `getDecisionPatterns()` rivela pattern ricorrenti (es. "score inconsistency nel 30% dei casi con contratti HR"). Questi pattern alimentano il prompt dell'Advisor come contesto aggiuntivo.

### Trading iteration loop

Il trading usa gia `runIterationLoop()` da Layer 5. Per il Critic, il pattern e diverso: non e un loop iterativo (backtest N volte), ma un **single-pass quality gate con max 1 retry**. Non serve `runIterationLoop()` perche:
- Max 2 passaggi (Advisor + opzionale retry), non N
- Il Critic non cambia parametri tra iterazioni
- Il costo di >1 retry supera il beneficio

Per il trading, il Critic pattern si applica cosi: il `portfolio_monitor` (agente 5) gia fa post-hoc evaluation. Il vero valore e connettere i `risk_events` al decision journal di Layer 4, cosi le decisioni di trading (entry/exit) vengono tracciate e reviewate.

## Conseguenze

### Positive
- Quality gate prima dell'output all'utente
- Feedback loop che migliora l'Advisor nel tempo (via Layer 4 patterns)
- Score consistency garantita (catch errori aritmetici del modello)
- Citazioni verificabili (riduce hallucination)

### Negative
- **Latenza**: +2-4s per analisi (Haiku) o +1-2s (free tier, piu veloce)
- **Costo**: ~$0.001/analisi con Haiku, $0 con Intern tier
- **Complessita**: nuovo agente nella pipeline, nuovo tipo in `AgentPhase`

### Stima costi per analisi

| Componente | Tier Partner | Tier Intern |
|------------|-------------|-------------|
| Critic call | ~$0.001 | $0 |
| Advisor retry (30% dei casi) | ~$0.015 | $0 |
| **Overhead medio** | **~$0.005** | **$0** |

## Piano di implementazione

### Fase 1: Critic Agent nella pipeline legale (Ufficio Legale)
- Creare `lib/agents/critic.ts` + `lib/prompts/critic.ts`
- Aggiungere `"critic"` a `AgentName`, `AgentPhase`, `AGENT_MODELS`, `AGENT_CHAINS`
- Inserire Step 5 in `orchestrator.ts` (dopo Advisor, prima di auto-index)
- Aggiungere toggle in PowerPanel (`isAgentEnabled("critic")`)
- Test: Vitest unit test con mock di AdvisorResult buoni e difettosi

### Fase 2: Layer 4 decision tracking
- Connettere `recordDecision()` nel flusso Critic (gia implementato in Layer 4)
- Creare dashboard pattern in `/ops` (decision_journal query per dept=ufficio-legale, tag=critic)
- Dopo 100+ analisi: estrarre learnings automatici con `indexLearnings()`

### Fase 3: Trading integration
- Connettere `risk_events` trading al `decision_journal` via `recordDecision()`
- Il `portfolio_monitor` diventa il "critic" naturale del trading: valuta entry vs exit
- Learnings da decisioni di trading alimentano `department_memory` del trading dept
