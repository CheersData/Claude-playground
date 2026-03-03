# Report — Operations
**Data:** 3 marzo 2026 | **Task:** 5/5 completati | **Stato:** 🟢 Operativo

---

## Funzione del dipartimento

Monitorare la salute del sistema: agenti runtime, pipeline analisi, corpus legislativo, database, trading. Dashboard operativa `/ops`.

---

## Aggiornamento dal 1 marzo

**Nessuna modifica alla dashboard o monitoring legale.** Health check invariato.

### Nuovo: Trading nel perimetro Operations

| Componente | Stato | Note |
|-----------|-------|------|
| Pipeline trading (5 agenti Python) | 🟡 Attivo su PC boss | Non monitorabile da questo ambiente |
| Scheduler Windows | 🟡 Attivo su PC boss | Task Scheduler 09:00 ET + 16:30 ET |
| Alpaca paper account | 🟡 Attivo | Verificabile su dashboard Alpaca |
| Tabelle Supabase trading_* | ⚠️ Non verificato | Migrazione 019 da confermare |

**Nota:** il trading gira su infrastruttura esterna (PC Windows boss). Operations non può monitorare direttamente. Si raccomanda:
1. Screenshot periodici del dashboard Alpaca
2. Export P&L settimanale committato nel repo
3. Alert email da Alpaca per ordini eseguiti

---

## Cosa resta da fare

| Priorità | Task | Note |
|----------|------|------|
| Alta | Verificare migrazione 019 su Supabase | Tabelle trading necessarie |
| Alta | Caricare Statuto Lavoratori | 1 comando — coordinare con DE |
| Media | Integrare status trading in dashboard `/ops` | Quando dati Supabase disponibili |
| Media | Monitorare legal_knowledge (0 entries) | Si popola con analisi reali |
| Bassa | Metriche uptime agenti | Non implementate |

---

## Allineamento con la funzione

✅ **Pieno.** Il perimetro si estende al trading. Operations segnala l'impossibilità di monitorare direttamente infrastruttura esterna.
