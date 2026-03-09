# QA FAIL Analysis — 2026-03-09

## Summary

- **SEARCH_MISS**: 3 tests (TC23, TC27, TC69)
- **RETRIEVAL_FAIL**: 3 tests (TC34, TC52, TC59)
- **LLM_QUALITY**: 6 tests (TC33, TC39, TC41, TC48, TC56, TC70)
- **SCOPE_LIMIT**: 1 test (TC45)
- **MIXED**: 3 tests (TC22, TC43, TC61)

Total: 16 FAILs analyzed.

### Root cause distribution

| Root cause | Count | % | Actionable fix |
|------------|-------|---|---------------|
| LLM_QUALITY | 6 | 37.5% | Prompt engineering, reasoning examples |
| SEARCH_MISS | 3 | 18.8% | Load missing sources (L. 392/1978, DPR 602/73, D.Lgs. 149/2022) |
| RETRIEVAL_FAIL | 3 | 18.8% | Improve question-prep query formulation |
| MIXED | 3 | 18.8% | Combination of above |
| SCOPE_LIMIT | 1 | 6.3% | Requires jurisprudence DB (out of scope for now) |

---

## Detail per test case

### TC22 — Condanna superiore al richiesto (ultra petita)
**Root cause**: MIXED (SEARCH_MISS + LLM_QUALITY)
**Expected**: La sentenza e nulla per violazione del principio di corrispondenza tra chiesto e pronunciato (art. 112 c.p.c.). Va impugnata.
**Got**: Il giudice puo condannare a importo superiore. Cita art. 1226 e 2056 c.c. (norme sulla valutazione equitativa del danno). Non menziona ultra petita ne art. 112 c.p.c.
**Why failed**: Doppio fallimento. (1) Il c.p.c. e nel corpus (loaded), ma art. 112 specificamente non e stato recuperato -- questo e RETRIEVAL_FAIL perche l'articolo esiste. (2) Il LLM ha dato una risposta sostanzialmente errata -- ha detto che il giudice "puo" condannare a piu del richiesto, quando in realta e una violazione processuale. L'LLM non ha applicato il principio processuale corretto nemmeno senza gli articoli.
**Fix**:
- Retrieval: question-prep deve riformulare "condannato a pagare piu del chiesto" -> "ultra petita art. 112 c.p.c. principio corrispondenza chiesto pronunciato"
- LLM: aggiungere nel prompt del corpus-agent che quando una domanda riguarda procedure giudiziarie/sentenze, deve prioritizzare norme processuali (c.p.c.) su quelle sostanziali (c.c.)

---

### TC23 — Termine deposito documenti in udienza (riforma Cartabia)
**Root cause**: SEARCH_MISS
**Expected**: Con la riforma Cartabia (D.Lgs. 149/2022), art. 171-ter c.p.c. regola i termini. L'art. 183 (vecchio rito) non si applica piu.
**Got**: L'agente non ha trovato nulla di pertinente. Cita genericamente art. 378 c.p.c. (memorie in Cassazione, non pertinente).
**Why failed**: Il D.Lgs. 149/2022 (Riforma Cartabia) NON e nel corpus. Art. 171-ter c.p.c. potrebbe non esistere nel testo vigente caricato se il corpus c.p.c. non e stato aggiornato alla riforma Cartabia 2023. Anche se il c.p.c. e "loaded", il testo potrebbe essere pre-riforma. La domanda richiede conoscenza della riforma processuale piu recente.
**Fix**:
- Verificare se il c.p.c. nel corpus contiene art. 171-ter (introdotto dalla Cartabia, vigente dal 28/02/2023). Se no, ricaricare il c.p.c. con testo aggiornato
- Alternativa: caricare D.Lgs. 149/2022 come fonte separata
- Question-prep deve riconoscere domande su procedura recente e inserire "riforma Cartabia" o "D.Lgs. 149/2022" nelle query

---

### TC27 — Pignoramento prima casa da creditore privato
**Root cause**: SEARCH_MISS
**Expected**: L'impignorabilita della prima casa vale SOLO per Agenzia Entrate Riscossione (art. 76 DPR 602/1973). I creditori privati possono pignorare senza limiti.
**Got**: Cita art. 514, 515, 545 c.p.c. (cose impignorabili e limiti stipendio). Non menziona art. 76 DPR 602/73 ne la distinzione creditore pubblico/privato. Risposta fuorviante.
**Why failed**: Il DPR 602/1973 (Riscossione) NON e nel corpus. Questa e la norma chiave che introduce l'eccezione per la prima casa, ma solo per Agenzia Entrate Riscossione. Senza questa norma nel corpus, e impossibile dare la risposta corretta.
**Fix**:
- Caricare DPR 602/1973 nel corpus (o almeno gli articoli 76-77 sulla riscossione immobiliare)
- Fonte: Normattiva, urn:nir:stato:decreto.del.presidente.della.repubblica:1973-09-29;602

---

### TC33 — Licenziamento per giusta causa durante malattia
**Root cause**: LLM_QUALITY
**Expected**: Il periodo di comporto (art. 2110) protegge SOLO dal licenziamento ordinario. NON protegge dal licenziamento per giusta causa (art. 2119). Se c'e giusta causa vera, il licenziamento e valido anche durante la malattia.
**Got**: L'agente ha effettivamente citato sia art. 2110 che art. 2119 e anche art. 3 Jobs Act e art. 18 Statuto Lavoratori. Ma non ha dato una risposta chiara: ha detto "non specifica se il licenziamento per giusta causa durante la malattia sia valido" e ha rinviato all'avvocato.
**Why failed**: Gli articoli sono stati trovati (retrieval OK, prep score 15/30 = parziale). Il problema e puramente LLM: il modello aveva le norme davanti ma non ha saputo combinarle per dare la risposta definitiva. Art. 2119 e chiarissimo: il recesso per giusta causa e sempre possibile. L'LLM ha preferito una risposta "sicura" e vaga invece di un'affermazione netta.
**Fix**:
- Prompt corpus-agent: aggiungere istruzione "Quando hai le norme pertinenti, dai una risposta DEFINITIVA. Non rinviare all'avvocato se la risposta e chiara dalla norma."
- Aggiungere nel prompt: "Art. 2119 c.c. (giusta causa) prevale su art. 2110 (comporto): la giusta causa consente il recesso in qualsiasi momento, incluso durante la malattia."
- Considerare few-shot examples nel prompt per domande su rapporti tra norme

---

### TC34 — Testamento a favore della badante, diritti dei figli
**Root cause**: RETRIEVAL_FAIL
**Expected**: I figli sono legittimari (art. 536 c.c.) con quota riservata. Il testamento non e nullo ma riducibile (art. 553-554 c.c.). Azione di riduzione entro 10 anni.
**Got**: L'agente dice "non contiene gli articoli direttamente pertinenti". Cita art. 537, 538, 565 c.c. come "potenzialmente pertinenti" ma dice che non li ha nel contesto. Non menziona azione di riduzione.
**Why failed**: Art. 536, 553, 554 c.c. sono nel corpus (Codice Civile loaded con 4271 articoli). L'agente ha trovato art. 537 e 538 (vicinissimi a 536) ma non li ha usati correttamente. Il retrieval ha parzialmente funzionato ma non ha catturato il cluster completo degli articoli sulla successione necessaria e l'azione di riduzione. La query di ricerca probabilmente non includeva "azione di riduzione" o "legittimari".
**Fix**:
- Question-prep: "padre lascia tutto alla badante" -> "successione necessaria legittimari quota riserva azione riduzione art. 536 553 554 c.c."
- Retrieval: usare query multiple (una per "legittimari" e una per "azione di riduzione") per catturare il cluster completo

---

### TC39 — Clausola risolutiva espressa vs condizione risolutiva
**Root cause**: LLM_QUALITY
**Expected**: La formulazione e ambigua. L'agente DEVE segnalare l'ambiguita, distinguere art. 1456 (clausola risolutiva espressa, richiede dichiarazione) da art. 1353 (condizione risolutiva, opera automaticamente), e chiedere il testo completo.
**Got**: L'agente ha trovato art. 1456 (search score 12/30 = parziale). Ha dato una risposta netta "e una clausola risolutiva espressa" senza segnalare ambiguita ne citare art. 1353 ne chiedere il testo completo.
**Why failed**: L'agente ha trovato almeno art. 1456 (retrieval parzialmente OK). Il problema e che l'LLM non ha riconosciuto l'ambiguita nella formulazione della clausola e non ha applicato il ragionamento critico richiesto. Non ha cercato/citato art. 1353 come alternativa interpretativa.
**Fix**:
- Prompt corpus-agent: aggiungere regola "Se una domanda presenta una clausola contrattuale ambigua, DEVI segnalare l'ambiguita e presentare TUTTE le interpretazioni possibili con i rispettivi articoli. Non dare una risposta univoca senza aver escluso le alternative."
- Question-prep: generare query multipla per istituti alternativi

---

### TC41 — Avvocato ha perso la causa, posso chiedergli i danni
**Root cause**: LLM_QUALITY
**Expected**: L'avvocato ha obbligazione di MEZZI (non risultato). Perdere non e inadempimento. Serve provare: violazione diligenza professionale (art. 1176 co.2) E nesso causale.
**Got**: Ha citato art. 2236 c.c. (prestazioni di speciale difficolta), dice che "non e direttamente applicabile". Non afferma chiaramente la distinzione mezzi/risultato. Non cita art. 1176 co.2. Score 57 = borderline FAIL.
**Why failed**: Art. 1176 e 2236 sono entrambi nel corpus (Codice Civile). L'agente ha trovato 2236 (parzialmente pertinente) ma non il 1176 co.2 che e il cuore della risposta. Il problema principale e LLM: anche con art. 2236 sottomano, il modello non ha saputo costruire il ragionamento giuridico corretto (mezzi vs risultato, nesso causale, onere della prova).
**Fix**:
- Prompt: aggiungere istruzione "Per domande sulla responsabilita professionale (avvocati, notai, medici), cita SEMPRE art. 1176 co.2 c.c. (diligenza qualificata) come norma cardine, prima di qualsiasi altra norma."
- Retrieval: question-prep deve generare "obbligazione di mezzi responsabilita professionale art. 1176 diligenza qualificata"

---

### TC43 — Clausola costruttore modifica unilaterale materiali/progetto
**Root cause**: MIXED (RETRIEVAL_FAIL + LLM_QUALITY)
**Expected**: La clausola e NULLA perche vessatoria ai sensi dell'art. 33 co.2 lett.m D.Lgs. 206/2005 (Codice del Consumo).
**Got**: L'agente ha cercato nel Codice del Consumo ma non ha trovato art. 33 co.2 lett.m. Ha menzionato art. 1659-1660 c.c. (variazioni nell'appalto) come "non direttamente applicabili". Non ha qualificato la clausola come vessatoria.
**Why failed**: Il Codice del Consumo e nel corpus (loaded). Art. 33 dovrebbe essere presente. Il retrieval ha fallito nel trovare l'articolo specifico (lett.m riguarda le modifiche unilaterali). Inoltre, l'LLM non ha fatto il collegamento logico: clausola unilaterale in rapporto B2C = vessatoria per definizione.
**Fix**:
- Retrieval: question-prep deve tradurre "costruttore modifica materiali senza consenso" -> "clausola vessatoria modifica unilaterale prestazione art. 33 codice consumo"
- Verifica: controllare che art. 33 del Codice del Consumo sia effettivamente nel corpus con il testo completo (incluso comma 2 lettere a-t)
- LLM: nel prompt, aggiungere regola "Quando un consumatore chiede di una clausola che attribuisce al professionista il potere di modificare unilateralmente le condizioni, valuta SEMPRE la vessatorieta ai sensi del Codice del Consumo."

---

### TC45 — Notaio non ha verificato ipoteca, posso chiedergli i danni
**Root cause**: SCOPE_LIMIT
**Expected**: Si, il notaio e responsabile. Obbligo professionale di visure ipotecarie. Viola diligenza qualificata (art. 1176 co.2 c.c.). Cassazione 2020/24048 conferma. Prescrizione 10 anni.
**Got**: "Non contiene gli articoli direttamente pertinenti". Non cita art. 1176. Rinvia all'avvocato.
**Why failed**: Art. 1176 c.c. e nel corpus. Tuttavia, la risposta completa richiede Cassazione 2020/24048 e la giurisprudenza consolidata sull'obbligo notarile di visure. Nessun corpus legislativo puro puo coprire questo: serve un database giurisprudenziale. Il retrieval ha fallito anche su art. 1176 (che e generico e difficile da collegare a "notaio + ipoteca" via embedding), ma il blocco principale e la mancanza di giurisprudenza.
**Fix**:
- Breve termine: migliorare question-prep per generare "responsabilita notaio obbligo visure ipotecarie diligenza qualificata art. 1176"
- Medio termine: aggiungere un layer di knowledge base con principi giurisprudenziali consolidati (non sentenze intere, ma massime)
- Lungo termine: integrare database giurisprudenziale (ItalGiure, DeJure)

---

### TC48 — Registrazione di nascosto conversazione con il capo
**Root cause**: LLM_QUALITY
**Expected**: Se eri PRESENTE alla conversazione (partecipante), registrarla e LECITA e utilizzabile come prova. Se non eri presente (terzo), e reato (art. 617 c.p.). La distinzione e fondamentale.
**Got**: Cita art. 617-bis e 617-ter c.p. (intercettazioni), dice che "riguardano la sfera penale". Non distingue tra partecipante e terzo. Risposta generica, rinvia all'avvocato.
**Why failed**: Art. 617 e nel corpus (Codice Penale loaded). L'agente ha trovato gli articoli pertinenti (617-bis, 617-ter). Il fallimento e puramente LLM: il modello aveva le norme ma non ha applicato la distinzione giurisprudenziale fondamentale tra "registrazione di un partecipante" (lecita) e "intercettazione di un terzo" (reato). Questa distinzione e codificata nel testo stesso dell'art. 617 ("chiunque fraudolentemente prende cognizione di comunicazioni... a lui non dirette").
**Fix**:
- Prompt corpus-agent: aggiungere regola "Quando l'art. 617 c.p. e pertinente, distingui SEMPRE tra: (a) registrazione effettuata da un partecipante alla conversazione = lecita, (b) intercettazione da parte di terzo non presente = reato."
- Knowledge base: aggiungere massima giurisprudenziale consolidata sulla liceita della registrazione del partecipante

---

### TC52 — Prestito verbale di 5000 euro, come recuperare
**Root cause**: RETRIEVAL_FAIL
**Expected**: Il prestito verbale e valido (nessuna forma scritta richiesta per il mutuo). MA: la prova testimoniale e limitata per importi > 2.58 euro (art. 2721 c.c.). SMS/WhatsApp possono valere come prova scritta.
**Got**: Risposta completamente fuori tema. Cita art. 2033 (indebito oggettivo), 2034 (obbligazioni naturali), 2041 (arricchimento senza causa), 2035, 2940. NON cita art. 2721 ne la disciplina del mutuo.
**Why failed**: Art. 2721 c.c. e nel corpus (Codice Civile). Il retrieval ha fallito completamente: ha recuperato articoli sull'indebito e arricchimento senza causa invece di quelli sulle prove e sul mutuo. La query di ricerca ha probabilmente puntato su "prestito" -> "pagamento indebito" invece di "mutuo forma prova testimoniale". Il question-prep non ha riformulato correttamente.
**Fix**:
- Question-prep critico: "prestito verbale 5000 euro recupero" -> "mutuo forma libera prova testimoniale limite art. 2721 c.c. pagamento contratto"
- Retrieval: la query deve cercare in DUE direzioni: (1) mutuo/contratto (sostanza) e (2) prove/limiti testimoniali (processo)

---

### TC56 — Padre non paga mantenimento figli
**Root cause**: LLM_QUALITY
**Expected**: Due strade parallele: penale (art. 570-bis c.p., D.Lgs. 21/2018 -- fino a 1 anno reclusione) e civile (esecuzione forzata: pignoramento stipendio/conto). Percorribili contemporaneamente.
**Got**: Risposta parziale. Copre bene il lato civile (richiesta formale, tribunale, esecuzione forzata, pignoramento). Cita art. 315-bis, 316-bis, 337-ter c.c. Ma manca completamente il lato penale: non menziona art. 570-bis c.p.
**Why failed**: Art. 570-bis c.p. e nel corpus (Codice Penale loaded). Il retrieval ha trovato le norme civilistiche ma non quelle penalistiche. Il question-prep non ha generato una query che coprisse entrambi i rami (civile + penale). L'LLM, con i soli articoli civilistici, ha dato una risposta ragionevole ma incompleta. Il fallimento principale e LLM_QUALITY perche un buon modello dovrebbe sapere che il mancato mantenimento ha anche risvolti penali e cercare/segnalare questa dimensione.
**Fix**:
- Question-prep: "padre non paga mantenimento" -> due query: "obbligo mantenimento figli artt. 315-bis 316-bis c.c." E "violazione obblighi assistenza familiare art. 570-bis c.p. reato"
- Prompt corpus-agent: "Per domande su inadempimenti familiari (mantenimento, alimenti), valuta SEMPRE sia il profilo civile che quello penale."

---

### TC59 — Debitore vuole pagare in dollari, devo accettare euro?
**Root cause**: RETRIEVAL_FAIL
**Expected**: Art. 1277 c.c. (regola generale: obbligazioni in moneta estera si estinguono con euro al cambio). Art. 1278-1279 (eccezione: clausola "effettivo" = solo nella valuta pattuita).
**Got**: Ha trovato art. 1278 c.c. e art. 126-octies TUB. Ma NON ha trovato art. 1277 c.c. (la norma cardine). La risposta e confusa e non da la regola generale chiara.
**Why failed**: Art. 1277, 1278, 1279 c.c. sono tutti nel corpus. Il retrieval ha trovato 1278 ma mancato 1277, che e l'articolo immediatamente precedente e la regola generale. Questo suggerisce che la ricerca semantica ha trovato un match parziale ("moneta non avente corso legale" in art. 1278) ma non ha recuperato il cluster completo 1277-1279. E un classico caso di retrieval che trova l'eccezione ma non la regola.
**Fix**:
- Retrieval: quando si trova un articolo, recuperare anche gli articoli adiacenti (+/- 2 nella stessa sezione) per catturare il contesto normativo completo
- Question-prep: "pagare in dollari euro" -> "obbligazioni pecuniarie valuta estera corso legale artt. 1277 1278 1279 c.c."

---

### TC61 — Immobile asta giudiziaria con abusi edilizi
**Root cause**: MIXED (SEARCH_MISS + LLM_QUALITY)
**Expected**: La vendita forzata (asta) non garantisce conformita urbanistica. Art. 46 DPR 380/2001 si applica diversamente nelle vendite forzate. Gli abusi restano a carico dell'acquirente.
**Got**: Menziona art. 31 TU Edilizia (sanzioni abusi) e art. 586 c.p.c. (trasferimento bene espropriato), ma non art. 46 DPR 380/2001. Non chiarisce che il tribunale non garantisce.
**Why failed**: Art. 46 DPR 380/2001 DOVREBBE essere nel corpus (TU Edilizia loaded). Ma la query non l'ha recuperato. Inoltre, la risposta completa richiede conoscenza della giurisprudenza sulla distinzione vendita forzata/volontaria, che e fuori dal corpus normativo puro. Doppio problema: (1) retrieval ha mancato art. 46 nonostante sia nel corpus, (2) l'LLM non ha saputo combinare le norme trovate per dare una risposta chiara.
**Fix**:
- Retrieval: question-prep deve generare "vendita forzata asta giudiziaria conformita urbanistica art. 46 DPR 380 testo unico edilizia"
- Verificare che art. 46 DPR 380/2001 sia nel corpus con testo completo
- Prompt: "Per domande su aste giudiziarie, distingui SEMPRE tra vendita volontaria e vendita forzata. Le garanzie sono diverse."

---

### TC69 — Morte inquilino, il contratto di locazione si estingue?
**Root cause**: SEARCH_MISS
**Expected**: Il contratto NON si estingue. Art. 6 L. 392/1978 (equo canone): hanno diritto di succedere nel contratto il coniuge, gli eredi e i parenti conviventi.
**Got**: Cita art. 1614 c.c. (recesso eredi dall'affitto) e art. 1627 c.c. (morte affittuario fondi rustici). NON cita art. 6 L. 392/1978. Risposta errata sulla norma applicabile.
**Why failed**: L. 392/1978 (equo canone) e nello stato "planned" -- NON e nel corpus. L'articolo 6 che regola la successione nel contratto di locazione abitativa non esiste nel DB. L'agente ha ripiegato sulle norme generali del Codice Civile (art. 1614) che sono parzialmente pertinenti ma non specifiche per le locazioni abitative.
**Fix**:
- PRIORITARIO: caricare L. 392/1978 nel corpus. E gia definita in corpus-sources.ts come "planned" con tutti i parametri connector pronti. Solo da eseguire il caricamento.
- Questa fonte copre anche altri possibili test case su locazioni abitative (rinnovo, disdetta, sublocazione, ecc.)

---

### TC70 — Testamento olografo con data incompleta (solo anno)
**Root cause**: LLM_QUALITY
**Expected**: Il testamento con data incompleta e ANNULLABILE (art. 606 co.2 c.c.), NON nullo. Se non impugnato entro 5 anni dall'apertura della successione, diventa definitivamente valido. Sezioni Unite 2015/15295 confermano.
**Got**: Ha trovato art. 602 c.c. (requisiti testamento olografo) e art. 606 c.c. (nullita). Ma ha sbagliato la qualificazione giuridica: dice "non e valido" (=nullo) quando in realta e solo annullabile. Non menziona co.2 di art. 606 ne il termine di 5 anni.
**Why failed**: Il retrieval ha funzionato bene: ha trovato sia art. 602 che art. 606 c.c. Il fallimento e puramente LLM. Art. 606 c.c. ha DUE commi: co.1 = nullita (mancanza autografia/sottoscrizione), co.2 = annullabilita (altri difetti di forma, inclusa data incompleta). Il modello ha letto l'articolo ma non ha distinto tra i due commi, applicando erroneamente la nullita (co.1) invece dell'annullabilita (co.2).
**Fix**:
- Prompt corpus-agent: "Quando citi un articolo con piu commi, analizza OGNI comma separatamente e indica quale si applica al caso specifico."
- Knowledge base: aggiungere massima SU 2015/15295 "La data incompleta del testamento olografo non ne determina la nullita ma solo l'annullabilita ex art. 606 co.2 c.c."

---

## Cross-cutting patterns

### Pattern 1: Question-prep troppo generico (7 test)
TC22, TC34, TC43, TC48, TC52, TC56, TC59 -- il question-prep non traduce la domanda colloquiale in query giuridiche sufficientemente precise. La riformulazione manca di istituti giuridici specifici e numeri di articolo.

**Fix sistemico**: Dare al question-prep un dizionario di "trigger words" -> istituti giuridici. Es:
- "condannato a pagare piu" -> "ultra petita art. 112 c.p.c."
- "prestito verbale" -> "mutuo forma libera prova testimoniale art. 2721"
- "badante eredita" -> "legittimari quota riserva azione riduzione"

### Pattern 2: LLM troppo cauto / rinvio all'avvocato (5 test)
TC33, TC41, TC43, TC45, TC48 -- l'agente ha le norme pertinenti (o parzialmente pertinenti) ma preferisce dire "consulta un avvocato" invece di dare una risposta netta. Questo e un problema di prompt: l'agente deve dare risposte definitive quando le norme lo consentono.

**Fix sistemico**: Aggiungere nel prompt del corpus-agent:
- "Quando le norme nel contesto forniscono una risposta chiara, DEVI darla in modo netto. Il rinvio all'avvocato e appropriato SOLO quando la risposta dipende da fatti del caso specifico che non conosci, NON quando le norme sono chiare."

### Pattern 3: Fonti mancanti nel corpus (3 test)
TC23 (D.Lgs. 149/2022 Cartabia), TC27 (DPR 602/73 Riscossione), TC69 (L. 392/1978 Equo canone) -- la risposta corretta richiede norme che non sono nel corpus.

**Fix sistemico**: Prioritizzare il caricamento di:
1. **L. 392/1978** (equo canone) -- gia "planned" con connector pronto
2. **DPR 602/1973** (riscossione) -- da aggiungere a corpus-sources.ts
3. **D.Lgs. 149/2022** (riforma Cartabia) -- oppure ricaricare c.p.c. con testo vigente post-riforma

### Pattern 4: Retrieval non cattura cluster di articoli adiacenti (3 test)
TC34 (art. 536-554), TC52 (art. 2721), TC59 (art. 1277-1279) -- il retrieval trova un articolo nel vicinato ma manca l'articolo chiave. La ricerca semantica per singolo embedding non cattura il "cluster normativo" di articoli collegati.

**Fix sistemico**: Implementare "cluster retrieval": quando si trova un articolo, recuperare automaticamente gli articoli adiacenti nella stessa sezione/capo (window di +/- 2-3 articoli).

---

## Priority actions (ordered by impact)

1. **[PROMPT]** Riscrivere prompt corpus-agent: risposte nette, no rinvii generici, analisi per comma, segnalazione ambiguita (copre 6 LLM_QUALITY)
2. **[PROMPT]** Potenziare question-prep con dizionario trigger -> istituti giuridici (copre 7 test)
3. **[DATA]** Caricare L. 392/1978 (gia planned, copre TC69 + futuri test locazioni)
4. **[DATA]** Aggiungere DPR 602/1973 riscossione (copre TC27)
5. **[DATA]** Verificare/aggiornare c.p.c. post-riforma Cartabia (copre TC23)
6. **[RETRIEVAL]** Implementare cluster retrieval (+/- N articoli adiacenti) (copre TC34, TC52, TC59)
7. **[KNOWLEDGE]** Aggiungere massime giurisprudenziali consolidate nella knowledge base (copre TC45, TC48, TC70)
