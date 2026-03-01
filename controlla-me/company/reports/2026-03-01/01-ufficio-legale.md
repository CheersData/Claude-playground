# Report — Ufficio Legale
**Data:** 1 marzo 2026 | **Task:** 5/5 completati | **Stato:** 🟢 Operativo

---

## Funzione del dipartimento

Gestire i 7 agenti runtime della pipeline analisi legale: classifier, analyzer, investigator, advisor, corpus-agent, question-prep, leader. Responsabile della qualità normativa degli output, della coerenza dei prompt, e del comportamento degli agenti sotto stress.

---

## Cosa è stato fatto

### Session Leader Agent con memoria di sessione
Il Leader Agent è stato completamente riscritto da stateless a context-aware. Mantiene la storia della conversazione (max 10 turni, 5 inviati al server), permette follow-up context-aware nella console. Implementato: `ConversationTurn` type in `lib/types.ts`, history passata via FormData all'API, accumulo in `app/console/page.tsx`. Aggiunto abort handler, retry handler, queue, timeout 5 minuti.

### Revisione qualità prompt — tutti e 7 gli agenti
Review sistematica post-aggiornamento catene di fallback. Risultati:
- **Classifier**: ottimo — schema preciso, REGOLE CRITICHE ben definite
- **Analyzer**: ottimo — framework normativo robusto, punto di vista parte debole enforced
- **Investigator**: buono — web search guidato, istituti giuridici corretti
- **Advisor**: buono — TONO tassativo aggiunto, limiti output enforced (max 3 rischi, max 3 azioni)
- **Discrepanza trovata e corretta**: ARCHITECTURE.md documentava 4 score obsoleti vs 3 score reali del prompt advisor. Corretta in CLAUDE.md.

### Fix documentazione scoring multidimensionale
Schema scores corretto da 4 campi obsoleti (`contractEquity`, `legalCoherence`, `practicalCompliance`, `completeness`) a 3 campi reali (`legalCompliance`, `contractBalance`, `industryPractice`). Scala calibrata documentata (9-10 = conforme, 1-2 = violazioni gravi).

### Spot-check istituti a campione
Verifica AI-assistita della correttezza delle assegnazioni di istituti giuridici agli articoli del corpus.
- 54.5% articoli hanno istituti (3329/6110)
- Gap concentrato su fonti connector (c.p., c.p.c., Cod.Consumo)
- Cross-ref istituti giuridici correlati: OK

---

## Cosa resta da fare

| Priorità | Task | Note |
|----------|------|------|
| Media | Completare copertura istituti giuridici sulle fonti mancanti | AI pass su c.p., c.p.c., Cod.Consumo |
| Media | Prompt agenti verticale HR | Quando il corpus HR è caricato |
| Bassa | UI scoring multidimensionale | Backend pronto (3 score), frontend mostra solo fairnessScore |

---

## Allineamento con la funzione

✅ **Pieno.** Il dipartimento copre esattamente il suo perimetro: qualità agenti, coerenza normativa, prompt engineering. Nessuna deriva di scope. La session memory è un'estensione naturale del leader agent.

---

## Stato competitivo

**Differenziatore chiave:** il punto di vista della parte debole (consumatore/inquilino/lavoratore) non è replicabile senza riscrivere i prompt da zero. Nessun competitor consumer italiano ha questa prospettiva esplicita. Gli agenti are not just technical — hanno un'identità editoriale specifica e difendibile.

**Gap residuo:** copertura istituti al 54.5% riduce la precisione del RAG. Con un AI pass dedicato si arriva all'80%+ in 1-2 giorni.
