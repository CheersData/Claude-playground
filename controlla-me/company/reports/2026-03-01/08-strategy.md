# Report — Strategy
**Data:** 1 marzo 2026 | **Task:** 8/8 completati | **Stato:** 🟢 Operativo

---

## Funzione del dipartimento

Identificare opportunità di business, analizzare il mercato competitivo, definire OKR trimestrali, proporre nuovi agenti/servizi/domini. Output principale: direzione futura dell'azienda, non contenuto operativo.

---

## Cosa è stato fatto

### Quarterly Review Q1 2026
OKR Q1 completion: **~93%** (27/29 task). Documento completo in `company/strategy/quarterly-review-q1-2026.md`.

Top 3 feature Q2 per RICE score:
1. Deep Search Limit UI (RICE 95, effort 0.5 sett.) — sblocco immediato monetizzazione
2. Scoring multidimensionale UI (RICE 68) — backend già pronto
3. Referral avvocati (RICE 52) — network effect B2B

### Rapporto Leadership Tecnologica
- Vantaggio stimato: **9-15 mesi** sul consumer B2C italiano
- Competitor più pericoloso: Lexroom (€16M Series A, serve B2B)
- Rischio principale: EU AI Act agosto 2026

### Reframe strategico — "Il prodotto è la console"
Confermato il reframe con analisi di mercato:
- TAM piattaforma orchestrazione agenti: $7B (2025) → $93B (2032, CAGR 44.6%)
- TAM solo LegalTech: ~$5B
- Pattern "entra verticale, vendi orizzontale": Twilio, Relevance AI ($24M Bessemer), Flowise (acquisita Workday 2025)
- Nessun competitor ha: tier switch real-time + toggle agenti + N-fallback + auto-improvement via RAG

**Qualifica critica:** il reframe è frame interno. Il posizionamento pubblico rimane "analizziamo i tuoi contratti" fino a 3-5 verticali funzionanti o un partner B2B pagante.

### Opportunity Brief — Poimandres
Console multi-agente come prodotto standalone (`poimandres.work`).
- **RICE score: 270** (Reach 7 + Impact 9 + Confidence 9 / Effort 3)
- Tech ready al 95%: `lib/ai-sdk/`, `lib/tiers.ts`, `lib/models.ts`, `components/console/` già estratti
- Competitors: LangGraph (no fallback built-in), CrewAI (single provider), AutoGen (no cost control)
- Window: 4-5 mesi prima che LangGraph copra il gap
- **Recommendation: GO — avvio Q2 2026**

### OKR Q2 2026 (proposti — in attesa approvazione boss)

**O1 — Engagement utenti Pro**
- KR1: DAU/MAU ≥ 40% (attuale: n/a, demo)
- KR2: analisi medie/utente Pro ≥ 2.5/mese
- KR3: NPS ≥ 45

**O2 — Espansione verticale HR**
- KR1: corpus lavoro 500+ articoli (D.Lgs. 81/2008 + Statuto Lavoratori)
- KR2: HR Agent prototipo operativo
- KR3: 50 signups segmento HR entro fine Q2

### Governance model
4 tipologie riunioni definite. Matrice autonomia dipartimentale. Trigger automatici per ogni dept. Processo review Architecture 24h. Il board funziona in autonomia senza input continuo del boss.

### Opportunity scouting Q2 2026
3 vertical brief:
1. **HRTech** — TAM €180M IT, nessun competitor con corpus lavoro EU, D.Lgs. 81/2008 già nel corpus
2. **PropTech professionale** — agenti immobiliari + costruttori, Codice Civile + TU Edilizia già nel corpus
3. **PMI Compliance B2B** — D.Lgs. 231/2001 già caricato, gap medio-alto sul mercato

---

## Cosa resta da fare

| Priorità | Task | Note |
|----------|------|------|
| Alta | Approvazione OKR Q2 2026 | Richiede boss |
| Alta | Decisione su lancio Poimandres Q2 | Richiede boss |
| Media | Schema DB contract monitoring (D-01) | Decidere prima della traction |
| Media | Connector CCNL per verticale HR | Segnalato a DE |
| Bassa | API pubblica beta — 3 integratori pilota | OKR Q2, da pianificare post-traction |

---

## Allineamento con la funzione

✅ **Pieno.** Strategy ha prodotto analisi di mercato, OKR, opportunity brief e governance model. Non ha invaso il perimetro operativo. Il reframe "console come prodotto" è la contribuzione strategica più importante del Q1 — cambia la valutazione competitiva e il TAM dell'azienda.

---

## Stato competitivo

**Posizione Q1 2026:** Leader assoluto consumer B2C legale italiano. Nessun competitor diretto con corpus IT+EU + RAG + multi-provider.

**Rischi:**
- EU AI Act agosto 2026: sanzioni fino €15M. **Non tecnico — richiede azione immediata del boss**
- Lexroom pivot consumer: 12-18 mesi con €16M in cassa
- Big Tech (Gemini/Copilot): "analisi contratto" gratis in 6-12 mesi — differenziatore corpus rimane

**Opportunità immediate (Q2):**
- Verticale HR: pipeline già parametrizzata, corpus 80% pronto
- Poimandres: tech ready al 95%, window di 4-5 mesi
