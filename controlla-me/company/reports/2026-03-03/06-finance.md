# Report — Finance
**Data:** 3 marzo 2026 | **Task:** 4/4 completati | **Stato:** 🟢 Operativo

---

## Funzione del dipartimento

Monitorare i costi API per provider e per agente, produrre report periodici, segnalare anomalie, e proiettare i costi.

---

## Aggiornamento dal 1 marzo

**Nessuna modifica al cost tracking legale.** Il report Q1 2026 resta invariato ($0.31, 6 chiamate Anthropic).

### Nuovo: Trading come revenue stream

Con l'attivazione del paper trading su Alpaca, Finance ha un nuovo perimetro da monitorare:

| Voce | Stato | Note |
|------|-------|------|
| Costi API Alpaca | $0 (paper) | Commission-free, data feed incluso nel piano base |
| P&L paper trading | Non tracciato in repo | Risultati sul PC del boss e/o dashboard Alpaca |
| Costi infrastruttura trading | $0 | Gira su PC personale, nessun costo cloud |

**Quando il trading andrà live:** Finance dovrà tracciare P&L giornaliero, commissioni (se presenti), e allocazione capitale. Le tabelle Supabase (`portfolio_snapshots`, `trading_orders`) sono progettate per questo — devono essere attivate con la migrazione 019.

---

## Cosa resta da fare

| Priorità | Task | Note |
|----------|------|------|
| Media | Cost report mensile automatico | Edge Function schedulata |
| Media | Definire KPI finanziari trading | P&L, Sharpe, drawdown |
| Media | Integrare P&L trading nel dashboard `/ops` | Quando migrazione 019 è attiva |
| Bassa | Breakeven analysis piano Pro (€4.99/mese) | Revenue > Cost check |

---

## Allineamento con la funzione

✅ **Pieno.** Il perimetro si allarga con il trading. Finance è pronto a monitorare — serve che i dati arrivino in Supabase.
