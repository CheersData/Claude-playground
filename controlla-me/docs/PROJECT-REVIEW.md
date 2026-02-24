# Project Review — controlla.me

> Valutazione tecnica, potenziale di mercato e monetizzazione.
> Data: 2026-02-24

---

## Architettura tecnica: 8/10

L'architettura multi-agente a 4 fasi con RAG e ben pensata:

- **Pipeline sequenziale**: Classifier (Haiku) -> Analyzer (Sonnet) -> Investigator (Sonnet + web search) -> Advisor (Sonnet). Ogni agente arricchisce il contesto per il successivo.
- **RAG a 3 layer** con Voyage AI `voyage-law-2` (embedding specifico per testi legali). Il sistema "impara" da ogni analisi completata (`legal_knowledge`) — potenziale effetto flywheel.
- **Streaming SSE** per UX real-time, caching SHA256 per ripresa sessioni, retry 60s su rate limit.
- **Stack moderno**: Next.js 16, React 19, Tailwind 4, TypeScript strict.

---

## Potenziale: alto, con caveat

### Punti di forza

1. **Mercato italiano sottopresidiato** — Il LegalTech in Italia e indietro rispetto a US/UK. Pochi competitor diretti per analisi AI di contratti in italiano.
2. **Problema reale** — La gente firma contratti che non capisce (affitto, lavoro, acquisti).
3. **Approccio "linguaggio da bar"** — Tradurre il legalese in linguaggio comprensibile e il vero valore.
4. **Knowledge base che cresce** — Ogni analisi alimenta il vector DB. Effetto flywheel.

### Rischi concreti

1. **Responsabilita legale** — Dare "consigli legali" via AI in Italia e un campo minato. Serve parere legale e disclaimer blindato.
2. **Costo unitario per analisi** — ~85s di API Claude per analisi. Costo stimato €0.05-0.15 per analisi in API calls.
3. **Affidabilita output** — Claude puo allucinare su riferimenti normativi. In ambito legale anche errori piccoli possono essere gravi.

---

## Monetizzazione: 5/10 — da ripensare

### Modello attuale

| Piano | Prezzo | Analisi |
|-------|--------|---------|
| Free | €0 | 3/mese |
| Pro | €4.99/mese | illimitate |
| Single | €0.99 | 1 analisi |

### Problemi

1. **€4.99/mese e troppo poco** — Un tool legale vale di piu. Consumatori pagherebbero €9.99-14.99. Professionisti pagherebbero €29-49/mese.
2. **"Illimitato" a €4.99 e pericoloso** — Un power user a 50 analisi/mese costa €2.50-7.50 in API. Non scala. Meglio Pro a €9.99 con 20 analisi/mese.
3. **Manca il B2B** — Agenzie immobiliari, PMI senza ufficio legale, commercialisti, piccoli studi legali.
4. **Referral avvocati** — Commissione per lead qualificati. Modello marketplace gia previsto nel DB.

### Pricing suggerito

| Piano | Prezzo | Target |
|-------|--------|--------|
| Free | €0 | 2 analisi/mese, prova |
| Single | €3.99 | Pay-per-use consumatore |
| Pro | €14.99/mese | Consumatore frequente, 15 analisi/mese |
| Business | €39.99/mese | PMI, agenzie, studi, 50 analisi/mese |
| Enterprise | Custom | Volumi, API, white-label |

---

## Interesse di mercato

### B2C: 6.5/10

- Mercato grande ma disperso. 2-3 contratti importanti/anno per persona.
- Pay-per-use funziona meglio del subscription per consumatori.
- Canale: SEO ("contratto affitto clausole ingiuste"), social media.

### B2B: 8/10

- Willingness-to-pay molto superiore.
- Italia: ~60.000 agenzie immobiliari, ~120.000 PMI senza legale interno, ~240.000 studi professionali.
- Subscription €29-49/mese funziona.
- Canale: LinkedIn, associazioni di categoria, demo dirette.

### Nicchie verticali consigliate per il lancio

1. **Immobiliare** — Contratti di locazione e compravendita (volume alto, ripetitivo)
2. **HR / Lavoro** — Contratti di assunzione, NDA, patti di non concorrenza
3. **Freelance / P.IVA** — Contratti di collaborazione, lettere d'incarico

---

## Feature critiche per il go-to-market

Ordine di priorita dalle feature incomplete:

1. **Corpus legislativo** — RAG vuoto = Analyzer lavora alla cieca
2. **Dashboard reale** — Mock data, senza storico gli utenti non tornano
3. **OCR** — Molti contratti sono PDF scansionati
4. **UI scoring multidimensionale** — 4 score calcolati, solo 1 mostrato
5. **Deep search limits** — Free tier senza limiti reali e un buco

---

## Verdetto

| Dimensione | Voto |
|-----------|------|
| Architettura tecnica | 8/10 |
| UX/UI | 7.5/10 |
| Monetizzazione | 5/10 |
| Market fit B2C | 6.5/10 |
| Market fit B2B | 8/10 |
| Competitivita | 7/10 |
| Go-to-market readiness | 5/10 |

**Conclusione**: Basi tecniche solide, problema reale, potenziale specialmente nel B2B italiano. Serve repricing, completamento feature critiche, e focus su una nicchia verticale (es. immobiliare) per il lancio.
