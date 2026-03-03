# Report — Data Engineering
**Data:** 3 marzo 2026 | **Task:** 21/21 completati | **Stato:** 🟢 Operativo

---

## Funzione del dipartimento

Costruire e mantenere la pipeline dati CONNECT→MODEL→LOAD per il corpus legislativo. Gestire le fonti normative (Normattiva + EUR-Lex), gli embedding, il vector DB (Supabase pgvector), e preparare l'infrastruttura per nuovi verticali.

---

## Aggiornamento dal 1 marzo

**Nessuna modifica operativa.** Stato invariato:
- **6110 articoli** da 13/14 fonti attive
- **Embedding 100% copertura** — Voyage AI (voyage-law-2)
- Pipeline parametrizzata per N verticali: pronta
- Verticale HR: 4 fonti configurate, pronte per load
- Cron delta update: configurato (`0 6 * * *`)

---

## Cosa resta da fare

| Priorità | Task | Stato |
|----------|------|-------|
| Alta | Caricare Statuto Lavoratori | Connector pronto — 1 comando da eseguire |
| Media | Caricare corpus HR (D.Lgs. 81/2008) | Pronto per load |
| Media | AI pass istituti giuridici su fonti mancanti | Coordinare con Ufficio Legale |
| Bassa | Connector CCNL (CNEL) | Analisi fonti necessaria |

---

## Allineamento con la funzione

✅ **Pieno.** Nessuna variazione. Pipeline pronta per nuovi verticali quando il boss approva.
