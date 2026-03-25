# Politica di Model Routing per Sub-Agenti
**Dipartimento:** Protocolli | **Versione:** 1.0 | **Data:** 2026-03-25
**Proprietario:** Protocolli | **Assegnazioni concrete:** Architecture

---

## 1. PRINCIPI FONDAMENTALI

1. **Intelligenza > Velocità** — In caso di dubbio, usare il modello più capace. La qualità del lavoro ha priorità sul risparmio di tempo o costi.
2. **Prudenza come default** — Nessun downgrade senza motivazione esplicita. Il costo di un errore supera quasi sempre il costo di un modello superiore.
3. **Architecture decide** — Le assegnazioni specifiche di modello per categoria appartengono al Dipartimento Architecture. Questa policy definisce il framework; Architecture popola le assegnazioni concrete nel documento `company/architecture/designs/sub-agent-model-assignments.md`.
4. **Override sempre permesso verso l'alto** — Qualsiasi agente o operatore può escalare a un modello superiore. Non è richiesta approvazione per salire. Scendere richiede giustificazione.
5. **Audit trail** — Le scelte di modello per task complessi o strategici vanno documentate nel decision journal.

---

## 2. CATEGORIE DI TASK

### Categoria A — Esplorazione Read-Only
Attività di sola lettura sul codebase o sui file aziendali.

**Esempi:** lettura file, ricerca con grep/glob, navigazione directory, ispezione configurazioni, raccolta contesto prima di un intervento.

**Caratteristiche:** basso rischio, output non persistente, reversibile per natura.

---

### Categoria B — Analisi e Pianificazione
Attività che producono raccomandazioni, piani o valutazioni di trade-off.

**Esempi:** architect review, design di soluzioni tecniche, analisi di impatto, valutazione rischi, selezione tecnologie, pianificazione sprint.

**Caratteristiche:** output influenza decisioni future; errori di analisi hanno costi alti e ritardati.

---

### Categoria C — Implementazione
Attività che producono codice, configurazioni o modifiche persistenti al sistema.

**Esempi:** scrittura codice, refactoring, build multi-step, configurazione infrastruttura, migrazione dati, scrittura test.

**Caratteristiche:** output persistente e potenzialmente difficile da invertire; richiede comprensione contestuale profonda.

---

### Categoria D — Ragionamento Strategico
Attività che coinvolgono decisioni cross-dipartimento, coordinamento aziendale o pianificazione a lungo termine.

**Esempi:** decisioni CME, plenarie aziendali, coordinamento multi-dipartimento, definizione OKR, gestione crisi, approvazione decisioni L2/L3.

**Caratteristiche:** impatto ad ampio raggio, difficilmente reversibile, richiede il massimo livello di giudizio disponibile.

---

## 3. GOVERNANCE — COME MODIFICARE LE ASSEGNAZIONI

**Chi approva:** Il Dipartimento Architecture propone; CME approva per categorie A e B; Boss approva per categorie C e D.

**Processo di modifica:**
1. Architecture apre un task con motivazione (benchmark o segnale di qualità)
2. Test su almeno 10 task rappresentativi della categoria interessata
3. Documentazione del confronto qualità/costo nel decision journal
4. Approvazione secondo livello sopra indicato
5. Aggiornamento di `company/architecture/designs/sub-agent-model-assignments.md`

**Frequenza minima di revisione:** trimestrale (vedi Sezione 5).

---

## 4. REGOLE DI OVERRIDE

Usare **sempre un modello superiore al default** nei seguenti casi, indipendentemente dalla categoria:

| Condizione | Motivazione |
|------------|-------------|
| Codice security-sensitive (auth, CSRF, vault, RLS) | Errori in quest'area hanno impatto su tutti gli utenti |
| Task cross-dipartimento con 3+ dipendenze | Complessità coordinativa richiede capacità di ragionamento superiori |
| Modifiche a file core (`lib/tiers.ts`, `lib/models.ts`, migrazioni DB) | Rotture silenziose difficili da diagnosticare |
| Prima esecuzione di un nuovo tipo di task | Nessuna baseline di qualità disponibile |
| Task in stato di crisi o sotto pressione temporale | Il costo dell'errore è amplificato dal contesto |
| Segnale esplicito da un agente precedente ("incerto", "verificare") | Onestà dell'agente va rispettata con più capacità |

---

## 5. REVISIONE TRIMESTRALE

**Cadenza:** ogni 90 giorni. Prima revisione: 2026-06-25.

**Metriche da valutare:**
- Tasso di rework post-implementazione per categoria
- Escalation spontanee (task avviati con modello basso, poi riassegnati)
- Feedback qualitativo dai dipartimenti (Architecture, QA, Security)
- Costo totale sub-agenti vs qualità output (stimato)

**Output della revisione:** aggiornamento delle assegnazioni in `sub-agent-model-assignments.md` o conferma esplicita dello status quo con motivazione.

**Responsabile:** Dipartimento Protocolli convoca; Architecture e CME partecipano obbligatoriamente.
