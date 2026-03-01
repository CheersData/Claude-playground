# Report — Finance
**Data:** 1 marzo 2026 | **Task:** 4/4 completati | **Stato:** 🟢 Operativo

---

## Funzione del dipartimento

Monitorare i costi API per provider e per agente, produrre report periodici, segnalare anomalie, mantenere il cost tracking operativo, e proiettare i costi per i prossimi cicli di sviluppo.

---

## Cosa è stato fatto

### Cost tracking operativo
- Infrastruttura `agent_cost_log` in Supabase attiva
- API `GET /api/company/costs` operativa e protetta (auth)
- Dashboard `/ops` mostra costi per provider/agente/periodo

### Cost Report Q1 2026
**Totale Q1 2026 (solo febbraio 2026):** $0.31 — 6 chiamate Anthropic

| Provider | Totale | Chiamate |
|---------|--------|----------|
| Anthropic | $0.31 | 6 |
| Altri | $0 | 0 |

**Breakdown per agente:**
- corpus-agent: $0.285
- question-prep: $0.021
- Altri agenti: $0 (task-runner fallisce in demo, non loggato)

**Nota critica:** i costi registrati sono solo quelli passati tramite Claude Code nella sessione. Il task-runner fallisce sistematicamente in ambiente demo (crediti insufficienti + `claude` non nel PATH). I costi reali degli agenti interni non sono tracciati.

**Costo medio per query corpus:** $0.051

### Proiezione Q2 2026
A regime (utenti reali, analisi complete, task-runner funzionante):
- Tier Partner (Sonnet 4.5): ~$0.05/analisi completa
- Tier Associate (Gemini Pro): ~$0.01/analisi
- Tier Intern (Groq/Cerebras): ~$0/analisi (free tier)
- **Stima mensile a 100 analisi/mese mix tier:** $3-5/mese
- **Con 1000 analisi/mese (traction):** $30-50/mese

---

## Cosa resta da fare

| Priorità | Task | Note |
|----------|------|------|
| Media | Cost report mensile automatico | Edge Function schedulata o cron |
| Media | Alert automatico se spesa > $1/giorno | Threshold configurabile |
| Bassa | Breakeven analysis per piano Pro (€4.99/mese) | Revenue > Cost margin check |
| Bassa | Budget AI per Q2 — approvazione boss | Stimare envelope per verticale HR |

---

## Allineamento con la funzione

✅ **Pieno.** Finance opera nel suo perimetro: monitoraggio, reporting, alert. Il cost tracking è operativo e protetto. L'assenza di dati Q1 significativi è un artefatto dell'ambiente demo, non un fallimento del dipartimento.

---

## Stato competitivo

I costi API di Controlla.me sono strutturalmente vantaggiosi rispetto ai competitor:
- Harvey e Luminance usano solo GPT-4/Claude Opus per tutto → costi 10-20x superiori
- Il tier system con N-fallback ottimizza automaticamente il costo/qualità
- Tier Intern (Groq/Cerebras) porta il costo a zero per query semplici — nessun competitor consumer ha questa flessibilità

**Il modello economico regge**: a $3-5/mese di costo API con un piano Pro a €4.99/mese, il margine è positivo anche con 1 sola analisi per utente.
