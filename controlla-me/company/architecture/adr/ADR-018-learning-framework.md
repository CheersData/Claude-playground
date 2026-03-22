# ADR-018: Learning & Adaptation Framework

**Data**: 2026-03-18
**Stato**: proposed
**Autore**: architect / CME

## Contesto

Ogni analisi completata arricchisce `legal_knowledge` via `indexAnalysisKnowledge()` (clause patterns, risk patterns, law references, court cases). Questo RAG passivo migliora il contesto, ma non c'e nessun segnale di qualita: non sappiamo se un'analisi era utile, accurata o fuorviante. Senza feedback loop, il sistema non distingue conoscenza buona da rumore, e i prompt restano statici indipendentemente dai risultati osservati.

## Decisione

Tre componenti incrementali, ognuno utile indipendentemente dagli altri.

### Component 1: User Feedback Loop

**UI**: Widget 1-5 stelle su `ResultsView.tsx` / `FinalEvaluationPanel.tsx`, visibile dopo completamento analisi. Opzionale, non bloccante. Testo libero opzionale (max 500 char).

**Storage**: Nuova tabella `analysis_feedback` (non colonna su `analyses` — separa concerns e abilita analytics indipendenti):

```sql
create table public.analysis_feedback (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid references public.analyses(id) on delete cascade,
  user_id uuid references public.profiles(id),
  rating smallint not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 500),
  created_at timestamptz default now(),
  unique(analysis_id, user_id)  -- 1 feedback per utente per analisi
);
```

RLS: utenti inseriscono/leggono solo i propri. Service role legge tutto per aggregazioni.

**Dynamic few-shot**: Le 3 analisi con rating >= 4 e `fairness_score` diversificato (alto, medio, basso) vengono iniettate nel prompt Advisor come esempi. Query: join `analysis_feedback` + `analyses` dove `rating >= 4`, ordinate per rating DESC + recency, limit 3. Iniettate in `buildRAGContext()` come categoria `exemplar_analysis`. Cache in-memory 1h (poche query Supabase).

### Component 2: LLM-as-Judge

**Modello**: Haiku 4.5 (costo stimato: ~$0.001/giudizio, ~150 token input + 200 output).

**5 criteri**, ognuno 1-5:
1. **Accuracy** — I riferimenti normativi citati sono reali e pertinenti?
2. **Clarity** — Il linguaggio e comprensibile per un non-giurista?
3. **Completeness** — I rischi principali sono tutti coperti?
4. **Actionability** — Le azioni suggerite sono concrete e attuabili?
5. **Calibration** — Il fairnessScore riflette la reale gravita dei problemi?

**Esecuzione**: Async, fire-and-forget dopo che l'Advisor completa. Nessun impatto su latenza utente. Il judge riceve `classification + analysis + advice` (non investigation — troppi token).

**Storage**: Colonna JSONB `quality_scores` su `analyses`:

```sql
alter table public.analyses add column quality_scores jsonb;
-- Formato: { "accuracy": 4, "clarity": 5, "completeness": 3, "actionability": 4, "calibration": 3, "judge_model": "haiku-4.5", "judged_at": "..." }
```

**Impatto su knowledge base**: Analisi con `quality_scores` media < 2.5 vengono escluse da `indexAnalysisKnowledge()` (non inquinare la knowledge base con output scadente). Soglia configurabile.

### Component 3: Prompt A/B Testing

**Meccanismo**: 2 varianti del prompt Advisor (`ADVISOR_SYSTEM_PROMPT_A`, `_B`) in `lib/prompts/advisor.ts`. Assignment random 50/50 per `analysis_id` (hash-based, deterministico, nessun cookie). Variante salvata in `analyses.metadata` JSONB.

**Misurazione**: Dopo 20+ analisi per variante, confronto `quality_scores` media e `user_rating` media. API interna (`GET /api/console/ab-results`) per dashboard ops. Winner diventa default, perdente diventa slot per nuova variante.

**Vincolo**: Solo 1 esperimento attivo alla volta. Config in `lib/prompts/advisor.ts` con flag `AB_TEST_ACTIVE = true/false`.

## Conseguenze

**Costo**: ~$0.001/analisi per il judge (Haiku). Su 1000 analisi/mese = $1/mese. Trascurabile.

**Privacy (GDPR)**: `analysis_feedback.comment` e dato personale. Richiede: (1) base giuridica = legittimo interesse (miglioramento servizio), (2) informativa aggiornata, (3) diritto di cancellazione implementato. Rating numerico anonimizzato e utilizzabile senza restrizioni.

**Schema changes**: 1 nuova tabella (`analysis_feedback`), 1 nuova colonna (`analyses.quality_scores`), 1 campo JSONB esistente esteso (`analyses.metadata` per A/B variant). Migration stimata: ~30 righe SQL.

**Rischio basso**: Ogni componente e opt-in e graceful-degrade. Senza feedback = niente few-shot. Senza judge = niente filtro quality. Senza A/B = prompt fisso (status quo).

## Piano di Implementazione

| Fase | Componente | Dept responsabili | Effort |
|------|-----------|-------------------|--------|
| 1 | User rating UI + `analysis_feedback` table | UX/UI + Ufficio Legale | 2-3h |
| 2 | LLM-as-Judge async + `quality_scores` | Architecture + Ufficio Legale | 3-4h |
| 3 | Dynamic few-shot injection | Architecture | 2h |
| 4 | A/B testing framework | Architecture + QA | 3-4h |

Totale stimato: 10-13h di sviluppo, distribuibili su 2-3 sessioni CME.
