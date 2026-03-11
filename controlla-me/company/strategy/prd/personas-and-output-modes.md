# PRD: Personas e Modalita Output

**Autore:** Strategy Department
**Task:** #b250dcf0 (child di #594 "Implementare tre modalita output per persona nel frontend")
**Stato:** Draft
**Data:** 2026-03-09

---

## 1. Contesto

Controlla.me analizza documenti legali con 4 agenti AI e produce un output unico (stile "amico che spiega", zero legalese). Questo approccio one-size-fits-all limita il valore percepito da utenti con competenze diverse. Un consumatore vuole sapere "devo preoccuparmi?", un professionista HR vuole una checklist di compliance, un avvocato vuole il dettaglio normativo strutturato.

### Obiettivo

Definire **3 personas** e **3 modalita di output** per adattare la presentazione dei risultati dell'analisi al livello di competenza e alle esigenze dell'utente, senza modificare la pipeline agenti sottostante.

### Vincolo architetturale

La pipeline (Classifier -> Analyzer -> Investigator -> Advisor) resta identica. Le modalita output agiscono sulla **presentazione** del risultato dell'Advisor e sulla **profondita di dettaglio** mostrata. L'`AdvisorResult` (in `lib/types.ts`) contiene gia tutti i campi necessari; la differenza e nella selezione, formattazione e linguaggio del rendering.

---

## 2. Personas

### 2.1 Cittadino (Consumer / Parte Debole)

| Attributo | Valore |
|-----------|--------|
| **Chi e** | Consumatore, inquilino, lavoratore dipendente, privato cittadino |
| **Competenza legale** | Nessuna o minima |
| **Domanda tipica** | "Devo preoccuparmi?" / "Posso firmare?" |
| **Cosa cerca** | Rassicurazione o allarme chiaro, azioni concrete, linguaggio semplice |
| **Tolleranza complessita** | Molto bassa: max 3 punti, frasi da 10 parole, nessun riferimento normativo diretto |
| **Contesto d'uso** | Contratto d'affitto, acquisto casa, contratto telefonico, contratto di lavoro da firmare |
| **Dispositivo tipico** | Mobile (60%+), sessioni brevi (<3 minuti) |

**Job-to-be-done:** "Dimmi in 30 secondi se questo documento e OK o se devo farmi aiutare."

### 2.2 Professionista (HR, Compliance, Agente Immobiliare, Commercialista)

| Attributo | Valore |
|-----------|--------|
| **Chi e** | HR manager, compliance officer, agente immobiliare, consulente fiscale, amministratore di condominio |
| **Competenza legale** | Intermedia: conosce la normativa di settore, non e giurista |
| **Domanda tipica** | "Il contratto e conforme?" / "Cosa manca rispetto alla normativa?" |
| **Cosa cerca** | Checklist di conformita, elementi mancanti, confronto con standard di settore, scoring dettagliato |
| **Tolleranza complessita** | Media: accetta riferimenti normativi se contestualizzati, vuole struttura chiara |
| **Contesto d'uso** | Verifica contratti di lavoro per HR, compliance CCNL, due diligence immobiliare, contratti B2B |
| **Dispositivo tipico** | Desktop (70%+), sessioni lunghe (5-15 minuti), spesso confronta piu documenti |

**Job-to-be-done:** "Dammi una checklist strutturata per capire se siamo conformi e cosa sistemare."

### 2.3 Legale (Avvocato, Praticante, Giurista d'impresa)

| Attributo | Valore |
|-----------|--------|
| **Chi e** | Avvocato, praticante legale, giurista d'impresa, notaio, magistrato |
| **Competenza legale** | Alta: vuole i dettagli tecnici, le fonti, la giurisprudenza |
| **Domanda tipica** | "Quali sono le vulnerabilita giuridiche?" / "Ci sono precedenti rilevanti?" |
| **Cosa cerca** | Analisi tecnica completa, citazioni normative e giurisprudenziali, clausole originali, scoring multidimensionale |
| **Tolleranza complessita** | Alta: preferisce il dettaglio completo, si irrita se mancano le fonti |
| **Contesto d'uso** | Revisione contratti per clienti, pareri legali, contenzioso, redazione atti |
| **Dispositivo tipico** | Desktop (90%+), sessioni lunghe (15-30 minuti), esporta/stampa risultati |

**Job-to-be-done:** "Dammi tutti i dati tecnici per costruire il mio parere professionale."

---

## 3. Modalita Output

### 3.1 Semplice (default per Cittadino)

**Principio:** Rispondi come a un amico. Zero legalese.

| Elemento | Comportamento |
|----------|--------------|
| **Summary** | 2-3 frasi discorsive, linguaggio colloquiale |
| **Fairness Score** | Cerchio grande con colore (verde/giallo/rosso) + label testuale ("Tutto OK" / "Qualche problema" / "Attenzione seria") |
| **Scores dettagliati** | Nascosti. Solo fairnessScore globale |
| **Risks** | Max 3, titolo + 1 frase di spiegazione. Nessun riferimento normativo visibile |
| **Actions** | Max 3, imperative semplici ("Chiedi che venga aggiunto...", "Non firmare prima di...") |
| **Deadlines** | Solo se presenti, formato "Entro il [data]: [cosa fare]" |
| **needsLawyer** | Banner prominente se true: "Per questa situazione ti consigliamo di parlare con un avvocato specializzato in [X]" |
| **Clausole originali** | Nascoste (collassate). Clic per espandere |
| **Investigation findings** | Nascosti completamente |
| **Layout** | Card singola, scroll verticale, mobile-first |
| **Export** | Nessuno (o screenshot) |

### 3.2 Dettagliato (default per Professionista)

**Principio:** Strutturato e azionabile. Riferimenti normativi contestualizzati.

| Elemento | Comportamento |
|----------|--------------|
| **Summary** | 3-5 frasi con struttura "Tipo documento > Problema principale > Valutazione" |
| **Fairness Score** | Cerchio + breakdown 4 dimensioni (contractEquity, legalCoherence, practicalCompliance, completeness) con label e barra |
| **Scores dettagliati** | Visibili con spiegazione contestuale ("6.2/10 — sotto la media di mercato per questo tipo di contratto") |
| **Risks** | Max 3, titolo + spiegazione + riferimento normativo inline ("Art. 1341 c.c. richiede doppia firma") |
| **Missing Elements** | Sezione dedicata con importanza (alta/media/bassa) e spiegazione |
| **Actions** | Max 3, con rationale e priorita numerata |
| **Deadlines** | Timeline visuale |
| **needsLawyer** | Banner + specializzazione suggerita + motivazione |
| **Clausole originali** | Visibili, evidenziate con colore per riskLevel |
| **Investigation findings** | Riassunti per clausola (senza citazioni complete) |
| **Layout** | Due colonne su desktop: risultati a sinistra, dettagli clausola a destra |
| **Export** | PDF report formale (futuro) |

### 3.3 Professionale (default per Legale)

**Principio:** Tutto il dato tecnico. Nessuna semplificazione.

| Elemento | Comportamento |
|----------|--------------|
| **Summary** | Sintesi tecnica: tipo, giurisdizione, normativa applicabile, giudizio complessivo |
| **Fairness Score** | Breakdown 4 dimensioni con punteggio numerico esatto + trend rispetto ad analisi simili (se disponibili dal knowledge base) |
| **Scores dettagliati** | Tutti visibili con spiegazione tecnica e confronto con standard (dati RAG) |
| **Classification** | Sezione dedicata: tipo, sotto-tipo, istituti giuridici, leggi applicabili, focus areas |
| **Risks** | Tutti (non solo max 3), con: testo clausola originale, violazione potenziale, base normativa, sentenza citata, standard di mercato |
| **Missing Elements** | Elenco completo con riferimento normativo per ciascuno |
| **Actions** | Tutte, ordinate per priorita con rationale tecnico |
| **Deadlines** | Timeline con base normativa (es. "Art. 1454 c.c. — diffida ad adempiere: minimo 15 giorni") |
| **Investigation findings** | Completi: leggi citate con testo, sentenze con massima, opinione legale dell'Investigator |
| **needsLawyer** | Informativo, non allarmista. Suggerimento specializzazione come dato |
| **Clausole originali** | Sempre visibili, con markup rischio e annotazioni |
| **Layout** | Layout ampio, tab per sezione (Classificazione / Analisi / Investigazione / Consiglio), stile "parere legale" |
| **Export** | PDF strutturato con intestazione studio, export DOCX, copia testo tecnico |

---

## 4. Mappatura Persona -> Modalita

| Persona | Modalita default | Puo cambiare? | Switch suggerito |
|---------|-----------------|---------------|-----------------|
| Cittadino | Semplice | Si, verso Dettagliato | "Vuoi vedere piu dettagli?" toggle nel ResultsView |
| Professionista | Dettagliato | Si, verso Semplice o Professionale | Selector a 3 opzioni nel header risultati |
| Legale | Professionale | Si, verso Dettagliato | Selector a 3 opzioni |

### Selezione della persona

**Opzione A (consigliata per MVP):** Selector esplicito pre-analisi

L'utente sceglie il proprio profilo prima di caricare il documento. 3 card nel upload section:
- "Sono un cittadino" (icona persona, default selezionato)
- "Sono un professionista" (icona valigetta)
- "Sono un legale" (icona bilancia)

La scelta viene passata come parametro `persona` nel body di `/api/analyze`.

**Opzione B (futuro):** Auto-detect dalla registrazione

- Utente free/single -> Cittadino (default)
- Utente pro -> Professionista (default, cambiabile)
- Utente console -> Legale (default, cambiabile)

**Opzione C (futuro avanzato):** Auto-detect dal documento

Il Classifier identifica il contesto (es. contratto B2B -> suggerisce modalita Professionale).

---

## 5. Impatto su Componenti Esistenti

### Componenti da modificare

| Componente | Modifica |
|-----------|---------|
| `HomePageClient.tsx` | Aggiungere persona selector nel upload section (pre-analisi) |
| `components/ResultsView.tsx` | Rendering condizionale basato su `outputMode` |
| `components/FairnessScore.tsx` | 3 varianti: cerchio semplice / breakdown / breakdown+trend |
| `components/RiskCard.tsx` | 3 varianti di dettaglio |
| `components/workspace/LegalWorkspaceShell.tsx` | Layout adattivo (1 colonna vs 2 colonne vs tabs) |
| `app/api/analyze/route.ts` | Passare `persona` al frontend (non modifica pipeline agenti) |

### Nessuna modifica richiesta

| Componente | Motivo |
|-----------|--------|
| `lib/agents/*` | La pipeline non cambia |
| `lib/prompts/*` | I prompt non cambiano |
| `lib/types.ts` | `AdvisorResult` contiene gia tutti i campi; aggiungere solo `OutputMode` type |
| `/api/analyze` backend | La pipeline resta identica, solo il campo persona viene propagato |

### Type da aggiungere (in `lib/types.ts`)

```typescript
export type UserPersona = "cittadino" | "professionista" | "legale";
export type OutputMode = "semplice" | "dettagliato" | "professionale";

/** Mappatura default persona -> output mode */
export const PERSONA_DEFAULT_MODE: Record<UserPersona, OutputMode> = {
  cittadino: "semplice",
  professionista: "dettagliato",
  legale: "professionale",
};
```

---

## 6. UX Flow

```
1. Utente arriva sulla homepage
2. Scorre fino alla upload section
3. NUOVO: 3 card persona ("Chi sei?") — default: Cittadino
4. Carica documento + (opzionale) contesto testuale
5. Pipeline analisi (identica, ~60-90s)
6. Risultati presentati nella modalita corrispondente alla persona
7. Toggle per cambiare modalita (switch in alto a destra nei risultati)
8. (Futuro) Salvataggio preferenza nel profilo utente
```

---

## 7. Metriche di Successo

| Metrica | Baseline | Target |
|---------|----------|--------|
| Tempo medio sulla pagina risultati | Da misurare | +30% per Professionista e Legale |
| % utenti che cambiano modalita | n/a | <15% (indica che il default e giusto) |
| Tasso di conversione a Pro | Da misurare | +20% (Professionista/Legale vedono piu valore) |
| needsLawyer click-through | Da misurare | +25% per Cittadino (banner piu prominente) |

---

## 8. Priorita e Fasi di Implementazione

### Fase 1 — MVP (effort: 2-3 giorni)

1. Aggiungere type `UserPersona` + `OutputMode` in `lib/types.ts`
2. Persona selector (3 card) nel upload section di `HomePageClient.tsx`
3. Rendering condizionale in `ResultsView.tsx` con 3 varianti di dettaglio
4. `FairnessScore.tsx` con prop `mode` per i 3 livelli

### Fase 2 — Polish (effort: 1-2 giorni)

5. Layout 2 colonne per modalita Dettagliato
6. Layout a tab per modalita Professionale
7. Toggle switch nei risultati per cambiare modalita on-the-fly

### Fase 3 — Evoluzione (effort: TBD)

8. Salvataggio preferenza persona nel profilo utente (Supabase)
9. Export PDF/DOCX per modalita Professionale
10. Auto-detect persona dal piano utente

---

## 9. Rischi e Mitigazioni

| Rischio | Impatto | Mitigazione |
|---------|---------|------------|
| Utente sceglie persona sbagliata | Risultati percepiti come troppo semplici o troppo complessi | Toggle sempre visibile per cambiare modalita |
| Aumento complessita frontend | Manutenzione 3 varianti di rendering | Componenti condizionali con prop `mode`, non 3 componenti separati |
| Modalita Professionale mostra dati che non esistono per certi documenti | Sezioni vuote | Gestire gracefully: nascondere sezioni senza dati anziche mostrare "N/A" |
| Confusione terminologica (italiano) | Utente non capisce "Professionista" | Usare sottotitoli esplicativi: "HR, compliance, agenti immobiliari" |

---

## 10. Open Questions

1. **Lingua dei risultati per modalita Professionale:** restare in italiano o offrire opzione bilingue IT/EN per contesti internazionali?
2. **Pricing per modalita:** la modalita Professionale giustifica un tier separato (es. "Enterprise") o resta inclusa in Pro?
3. **Verticali (HR, Tax, Medical):** ogni verticale avra le stesse 3 modalita? O alcune personas non si applicano (es. Cittadino non usa il verticale Tax)?
