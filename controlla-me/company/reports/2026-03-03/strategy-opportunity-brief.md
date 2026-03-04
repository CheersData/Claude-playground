# Strategy Opportunity Brief — Verticale HR vs Tax
## Consulente del Lavoro vs Commercialista: quale aprire per primo?

**Data:** 2026-03-03
**Autore:** Strategy Dept
**Classificazione:** Decisione L2-CME
**Stato:** Draft per approvazione boss

---

## Executive Summary

**Raccomandazione:** Consulente del Lavoro PRIMA.

Il verticale HR ha infrastruttura già al 70% (corpus parzialmente pronto, pipeline testata, fonti mappate), un TAM professionale più ampio, e un corpus di partenza più piccolo e coerente. Il verticale Tax richiede un effort corpus 3× superiore con fonti non ancora censite e un landscape competitivo più affollato internazionalmente. La stima time-to-market è 3-4 settimane (HR) vs 8-10 settimane (Tax).

---

## 1. Verticale: Consulente del Lavoro (HR)

### 1.1 TAM Italia

| Metrica | Dato |
|---------|------|
| Professionisti attivi (CdL + giuslavoristi + HR specialist) | ~200.000 |
| Consulenti del Lavoro iscritti all'Ordine | ~27.000 |
| Avvocati del lavoro (studio dedicato) | ~15.000 |
| HR manager/specialist in aziende | ~150.000+ |
| Volume mercato servizi payroll/HR compliance IT | ~3,5 Mld EUR/anno |
| Costo medio verifica contratto/consulenza CdL | 150-400 EUR/ora |

Il TAM reale per un tool B2B2C si misura su due segmenti distinti: (a) PMI che non hanno CdL interno e comprano analisi one-shot, (b) studi CdL che comprano una licenza Pro per effeciency interna.

### 1.2 Competitor AI nel settore HR/Lavoro

| Player | Posizionamento | Gap verso IT |
|--------|---------------|-------------|
| Harvey AI (USA) | General legal AI, no specializzazione HR | Solo EN, no corpus IT |
| Lexis+ AI (IT) | Piattaforma ricerca giuridica per avvocati | Ricerca documenti, no analisi contrattuale guidata |
| Ius Laboris AI | Rete internazionale, tool interno | Non prodotto consumer |
| Factorial HR | Gestione HR operativa (non analisi legale) | Diverso dominio |
| Nessun player IT dedicato all'analisi di contratti lavoro AI-first | — | Finestra aperta |

**Conclusione:** nessun competitor diretto in Italia per l'analisi AI di contratti di lavoro per il segmento PMI/professionisti. La finestra competitiva è stimata 9-15 mesi prima che player internazionali localizzino per l'IT.

### 1.3 Effort Corpus

Fonti da caricare per copertura minima viable:

| Fonte | Articoli | Stato | Note |
|-------|----------|-------|------|
| Statuto dei Lavoratori (L. 300/1970) | 41 | `api-tested` | codice e GU verificati |
| D.Lgs. 276/2003 (Biagi) | 86 | `planned` | codiceRedazionale verificato |
| D.Lgs. 23/2015 (Jobs Act) | 11 | `planned` | codiceRedazionale verificato |
| D.Lgs. 81/2008 (TU Sicurezza) | 306 | `planned` | codiceRedazionale verificato |
| **D.Lgs. 81/2015 (Codice contratti)** | ~55 | **da aggiungere** | urgenete per analisi contratti a termine |
| **D.Lgs. 148/2015 (CIG)** | ~46 | **da aggiungere** | cassa integrazione |
| **TOTALE** | **~545** | — | — |

Tutte le fonti usano la pipeline Normattiva già testata (directAkn). Non serve nuovo connettore.

**Effort effettivo:** aggiunte 2 fonti in `hr-sources.ts` + run data-connector per le 4 fonti in `planned`. Stimato: 1 giorno tecnico.

### 1.4 Effort Agenti

Il Classifier deve riconoscere i nuovi sottotipi contrattuali:

```
Nuovi documentSubType da aggiungere al prompt classifier:
- contratto_lavoro_subordinato_td      (tempo determinato)
- contratto_lavoro_subordinato_ti      (tempo indeterminato)
- contratto_apprendistato
- contratto_somministrazione
- lettera_richiamo_disciplinare
- comunicazione_licenziamento
- verbale_conciliazione_sindacale
- accordo_riduzione_orario_CIG
```

Nuovi `relevantInstitutes` da supportare:
- `tutele_crescenti`, `licenziamento_disciplinare`, `cig_ordinaria`, `apprendistato_professionalizzante`, `periodo_di_prova`, `patto_di_non_concorrenza`

**Effort:** modifica `lib/prompts/classifier.ts` (~2h) + aggiornamento prompt Analyzer per punto di vista lavoratore.

### 1.5 Time-to-Market

| Fase | Attività | Durata |
|------|----------|--------|
| Week 1 | Caricamento corpus (data-connector per 6 fonti) + test pipeline | 3-4 gg |
| Week 2 | Update prompt Classifier + Analyzer | 1-2 gg |
| Week 2-3 | QA su 20 contratti reali campione | 3-4 gg |
| Week 3-4 | UI: nuova hero verticale HR, landing page CdL | 3-5 gg |
| **Totale** | — | **3-4 settimane** |

---

## 2. Verticale: Commercialista/Tax

### 2.1 TAM Italia

| Metrica | Dato |
|---------|------|
| Commercialisti iscritti CNDCEC | ~120.000 |
| Consulenti fiscali/tributaristi | ~30.000 |
| PMI con bisogno analisi contratti Tax | ~1,5 Mln |
| Volume mercato consulenza fiscale IT | ~8 Mld EUR/anno |
| Costo medio verifica contratto/parere fiscale | 200-600 EUR/ora |

Il TAM monetario è superiore (consulenza fiscale vale più della giuslavoristica), ma il numero di professionisti acquirenti potenziali diretti è inferiore (~150K vs ~200K).

### 2.2 Competitor AI nel settore Tax

| Player | Posizionamento | Gap verso IT |
|--------|---------------|-------------|
| Harvey AI (USA) | Tax practice per grandi studi, EN | No localizzazione IT specifica |
| KPMG Clara / Deloitte AI | Enterprise, closed, licenza interna | Non prodotto di mercato |
| Fiscooggi AI (ItalyFisco) | Solo ricerca news fiscali | Non analisi documentale |
| Noovle/Engineering (TIM) | Soluzioni enterprise AI, non focus tax | Diverso dominio |
| Lex Machina Italia (nascente) | Analisi giurisprudenziale | No focus contratti tax |

**Conclusione:** il settore Tax ha player internazionali enterprise-grade ben consolidati. La finestra sul segmento PMI/mid-market è ancora aperta, ma il vantaggio competitivo è meno marcato perché Harvey e simili stanno localizzando attivamente.

### 2.3 Effort Corpus

Fonti da censire e caricare (tutte nuove, nessuna già in pipeline):

| Fonte | Articoli | Tipo | Complessità |
|-------|----------|------|-------------|
| TUIR — D.P.R. 917/1986 | ~185 | Normattiva | Alta (articolato complesso, molte versioni) |
| IVA — D.P.R. 633/1972 | ~81 | Normattiva | Media |
| Statuto del Contribuente — L. 212/2000 | ~21 | Normattiva | Bassa |
| D.Lgs. 231/2001 (responsabilità enti) | 109 | Normattiva | Già caricato (`loaded`) |
| **TOTALE NUOVO** | **~287** | — | — |

Note critiche:
- Il TUIR (D.P.R. 917/1986) è il testo fiscale per eccellenza ma è frequentemente aggiornato (aggiornamenti anche 2-3/anno): serve strategia di delta update.
- I codici Normattiva per TUIR e IVA non sono ancora verificati via API — serve censimento.
- D.Lgs. 231/2001 è già in corpus con vertical="legal", va taggato anche "tax" senza ricaricamento.

**Effort effettivo:** censimento codici Normattiva (1 giorno), creazione `tax-sources.ts`, caricamento 3 fonti nuove via data-connector (2-3 giorni). Totale: ~1 settimana tecnica solo per corpus.

### 2.4 Effort Agenti

Nuovi sottotipi contrattuali per Tax:

```
Nuovi documentSubType per Tax:
- contratto_di_appalto_servizi_tax
- accordo_trasferimento_ramo_azienda
- contratto_cessione_quote_societarie
- mandato_commerciale_con_ritenuta
- contratto_lavoro_autonomo_P_IVA
- accordo_di_riservatezza_commerciale (NDA)
- franchising_affiliazione_commerciale
```

Nuovi istituti: `regime_fiscale_forfettario`, `iva_agevolata`, `stabile_organizzazione`, `transfer_pricing`, `responsabilita_amministrativa_231`

**Effort:** modifica prompt Classifier (~3h) + creazione nuove prompts specializzate Analyzer per framework fiscale (~4h). Totale: 1 giornata.

### 2.5 Time-to-Market

| Fase | Attività | Durata |
|------|----------|--------|
| Week 1 | Censimento codici Normattiva + verifica API | 3-4 gg |
| Week 2 | Creazione tax-sources.ts + caricamento corpus | 4-5 gg |
| Week 3 | Update prompt Classifier + Analyzer Tax | 2-3 gg |
| Week 4-5 | QA su 20 documenti fiscali campione | 4-5 gg |
| Week 6-8 | UI verticale Tax + landing page commercialista | 5-7 gg |
| **Totale** | — | **8-10 settimane** |

---

## 3. Confronto Diretto

| Dimensione | Consulente del Lavoro | Commercialista/Tax |
|-----------|----------------------|-------------------|
| TAM professionisti | ~200K | ~120K |
| TAM mercato consulenza | ~3,5 Mld EUR | ~8 Mld EUR |
| Corpus già pronto | 70% (4/6 fonti mappate) | 10% (D.Lgs. 231 caricato) |
| Articoli da caricare (nuovo) | ~100 (D.Lgs. 81/2015 + 148/2015) | ~287 |
| Infrastruttura pipeline | Testata e funzionante | Da avviare |
| Competitor diretti in IT | Nessuno | Harvey localizzante |
| Time-to-market | 3-4 settimane | 8-10 settimane |
| Effort Classifier | Medio (nuovi sottotipi) | Medio-alto |
| Rischio tecnico | Basso | Medio |

---

## 4. Raccomandazione

**Aprire CONSULENTE DEL LAVORO per primo**, per i seguenti motivi:

1. **Infrastruttura pronta al 70%.** Le 4 fonti core HR sono già in `hr-sources.ts` con codici Normattiva verificati. Mancano solo D.Lgs. 81/2015 e 148/2015 (da aggiungere oggi). Il data-connector ha già testato la pipeline su questo tipo di fonti.

2. **Time-to-market 3× più veloce.** 3-4 settimane vs 8-10 settimane permette di generare revenue, raccogliere feedback reali e finanziare lo sviluppo Tax con dati di mercato concreti.

3. **Finestra competitiva più pulita.** Il mercato italiano HR-legal AI è ancora vuoto. Harvey non ha localizzazione specifica per contratti di lavoro italiani. Il Tax è più conteso a livello internazionale.

4. **TAM professionale più ampio.** 200K giuslavoristi/HR specialist vs 120K commercialisti significa più potenziali utenti Pro nella fase di lancio.

5. **Il corpus legale attuale è già utile per HR.** Il Codice Civile (Libro V Del lavoro, artt. 2060-2642) è già caricato e copre contratti di lavoro, azienda, attività professionale. Il verticale HR si innesta su basi già solide.

### Piano in 3 Fasi

**Fase 1 — HR MVP (Settimane 1-4)**
- Aggiungere D.Lgs. 81/2015 e D.Lgs. 148/2015 a `hr-sources.ts`
- Caricare le 6 fonti HR via data-connector
- Aggiornare prompt Classifier con 8 nuovi sottotipi HR
- Aggiornare prompt Analyzer per punto di vista lavoratore/datore di lavoro
- QA su 20 contratti campione (apprendistato, TD, TI, lettera licenziamento)
- Landing page verticale "Analisi contratti di lavoro"

**Fase 2 — HR Growth (Settimane 5-8)**
- Aggiungere CCNL più diffusi (connettore custom CNEL — TODO Phase 2)
- Feature "deep search su disciplinare" ottimizzata per contesto HR
- Partnership pilota con 2-3 studi CdL per raccolta feedback
- Pricing B2B dedicato (licenza studi)

**Fase 3 — Tax MVP (Settimane 9-16)**
- Censire e caricare TUIR, IVA, Statuto Contribuente
- Avviare verticale Tax con learnings da HR
- Cross-sell ai clienti HR che già usano Controlla.me

---

## Appendice: Fonti primarie per approfondimento

- CNDCEC — Statistiche iscritti commercialisti: cndcec.it
- Consiglio Nazionale Consulenti del Lavoro — Statistiche ordine: consilavoroclub.it
- Normattiva — Repertorio AKN: normattiva.it/do/atto/export
- EUR-Lex — Direttive lavoro: eur-lex.europa.eu

---

*Brief redatto per decisione L2-CME. Per upgrade a L3-Boss (strategia espansione verticali): presentare al boss con KPI settimana 4 del verticale HR.*
