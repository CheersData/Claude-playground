# Report Strategy — 3 marzo 2026

**Leader:** strategist

---

## OKR Q2 2026 (in corso)

| Obiettivo | Metrica | Stato |
|-----------|---------|-------|
| Primo utente beta reale | 1 utente beta | 🔴 Zero — bloccante |
| Trading profittevole (paper) | Sharpe > 1.0 | 🟡 Sharpe -0.112 — grid search in corso |
| Verticale HR operativo | Corpus + agenti attivi | 🟡 Corpus parziale — task oggi |
| EU AI Act compliance | Consulente ingaggiato | 🔴 In attesa boss |

---

## POIMANDRES (standalone product)

**Concetto:** Versione standalone del corpus agent + Q&A per professionisti legali.
**RICE Score:** 270 (stimato)
**Stato:** In valutazione — approvazione boss (D-03)
**Effort:** ~2 settimane per MVP

---

## MULTI-VERTICALE — ANALISI PRIORITÀ

### Verticale Consulente del Lavoro
- **TAM:** ~200K professionisti HR/giuslavoristi in Italia
- **Corpus effort:** ~300 articoli (D.Lgs. 276, 23, 81/2015, 148/2015)
- **Agenti effort:** Solo prompt update Classifier + riconoscimento sottotipi HR
- **Gap:** Statuto Lavoratori (L.300/1970) ancora da caricare (workaround pronto)
- **Verdict:** 🟢 Alta priorità — pipeline pronta, corpus quasi completo

### Verticale Commercialista/Tax
- **TAM:** ~120K commercialisti in Italia
- **Corpus effort:** ~380 articoli (TUIR, IVA, Statuto Contribuente, D.Lgs. 231/2001)
- **Agenti effort:** Prompt Classifier per sottotipi fiscali
- **Gap:** Nessuna fonte caricata — censimento oggi
- **Verdict:** 🟡 Media priorità — effort corpus alto, ma mercato premium

### Verticale Commerciale B2B
- **TAM:** Imprese + professionisti (contratti b2b)
- **Corpus effort:** ~403 articoli (Codice Civile Libro IV + D.Lgs. 231/2002, 70/2003, 9/2024)
- **Agenti effort:** Minimal (pipeline già copre contratti generici)
- **Verdict:** 🟡 Media priorità — sovrapposto al verticale legale consumer

---

## TASK APERTI OGGI

| # | Task | Priorità |
|---|------|----------|
| 14 | Opportunity Brief: Consulente del Lavoro vs Commercialista — quale aprire prima | HIGH |

---

## SEGNALI DI MERCATO

- Concorrenti italiani: nessun player AI dedicato con corpus legislativo IT+EU integrato
- Vantaggio stimato: 9-15 mesi
- Rischio principale: player internazionale (Harvey, Lexis+) che localizza per Italia
- Finestra strategica: max 12 mesi per consolidare posizione
