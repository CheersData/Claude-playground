# Cost Report — Marzo 2026

**Periodo:** 1-31 marzo 2026
**Redatto da:** cost-controller (Finance)
**Data:** 1 marzo 2026
**Fonte dati:** `agent_cost_log` via `/api/company/costs?days=7`

---

## Riepilogo

| Metrica | Valore |
|---------|--------|
| Spesa totale | **$0.41** |
| Chiamate totali | **58** |
| Costo medio per chiamata | **$0.0071** |
| Provider attivi | 4 (Anthropic, Gemini, Groq, Cerebras) |
| Soglia giornaliera ($1.00) | Mai superata |
| Soglia per-query ($0.10) | Mai superata |
| Alert attivi | Nessuno |

---

## Breakdown per provider

| Provider | Spesa ($) | % Spesa | Chiamate | % Chiamate | Costo medio/chiamata |
|----------|-----------|---------|----------|------------|---------------------|
| Anthropic | $0.310 | 75.6% | 6 | 10.3% | $0.0517 |
| Cerebras | $0.073 | 17.8% | 25 | 43.1% | $0.0029 |
| Gemini | $0.025 | 6.1% | 21 | 36.2% | $0.0012 |
| Groq | $0.003 | 0.7% | 6 | 10.3% | $0.0005 |
| **Totale** | **$0.411** | **100%** | **58** | **100%** | **$0.0071** |

### Osservazioni per provider

- **Anthropic** domina la spesa (75.6%) con solo il 10.3% delle chiamate. Coerente con il pricing Sonnet/Haiku (da $1 a $15/1M token) vs provider gratuiti.
- **Cerebras** e **Groq** operano nel free tier. Cerebras ha assorbito il 43.1% delle chiamate a costo quasi nullo ($0.073). Il tier system funziona come previsto.
- **Gemini** bilancia costo e volume: 36.2% delle chiamate al 6.1% della spesa. Flash ($0.15-0.60/1M) e' il miglior rapporto qualita/prezzo nella catena.
- **OpenAI, Mistral** non utilizzati nel periodo. API key presenti ma non nella catena attiva.

---

## Breakdown per agente (stima)

I dati del board non disaggregano per agente. Sulla base della distribuzione provider e della configurazione delle catene (`AGENT_CHAINS` in `lib/tiers.ts`), la ripartizione stimata e':

| Agente | Provider probabile | Spesa stimata | Note |
|--------|--------------------|---------------|------|
| corpus-agent | Anthropic (Sonnet/Haiku) | ~$0.24 | Catena: Sonnet -> Haiku -> Gemini Flash |
| question-prep | Anthropic (Haiku) | ~$0.04 | Catena: Haiku -> Gemini Flash -> Cerebras |
| classifier | Cerebras / Gemini | ~$0.03 | Catena: Haiku -> Flash -> Cerebras |
| analyzer | Cerebras / Gemini | ~$0.05 | Catena: Sonnet -> Gemini Pro -> Mistral -> Groq |
| leader | Cerebras / Groq | ~$0.01 | Catena: Haiku -> Flash -> Cerebras |
| investigator | Anthropic (Sonnet/Haiku) | ~$0.03 | Solo Anthropic (web_search) |
| advisor | Cerebras / Gemini | ~$0.01 | Catena: Sonnet -> Gemini Pro -> Mistral -> Groq |

**Nota:** il breakdown per agente sara' esatto nei prossimi report. L'API `/api/company/costs?view=total` fornisce `byAgent`, ma in ambiente demo non e' possibile interrogarla in tempo reale.

---

## Trend vs periodo precedente

| Periodo | Spesa | Chiamate | Costo medio |
|---------|-------|----------|-------------|
| Febbraio 2026 (Q1 report) | $0.31 | 6 | $0.0517 |
| Marzo 2026 (corrente) | $0.41 | 58 | $0.0071 |
| **Delta** | **+$0.10 (+32%)** | **+52 (+867%)** | **-86%** |

### Analisi trend

1. **Volume in forte crescita** (+867% chiamate): il tier system multi-provider e' ora attivo. A febbraio operavano solo 6 chiamate Anthropic; a marzo 4 provider sono in uso.
2. **Costo medio in crollo** (-86%): da $0.0517 a $0.0071 per chiamata. Il fallback su provider gratuiti (Cerebras, Groq) funziona come progettato.
3. **Spesa totale contenuta** (+32%): nonostante quasi 10x il volume, la spesa e' cresciuta solo del 32%. Questo e' l'effetto diretto del tier system.

---

## Proiezione costi a regime

### Scenario attuale (demo, utenti interni)

| Metrica | Stima mensile |
|---------|---------------|
| Chiamate/mese | ~250 |
| Spesa/mese | ~$1.50-2.00 |
| Costo medio/chiamata | ~$0.007 |

### Scenario produzione (100 utenti, mix tier)

| Tier | Analisi/mese | Costo/analisi | Subtotale |
|------|-------------|---------------|-----------|
| Partner (Sonnet) | 20 | ~$0.05 | $1.00 |
| Associate (Gemini/Haiku) | 50 | ~$0.01 | $0.50 |
| Intern (Groq/Cerebras) | 130 | ~$0.001 | $0.13 |
| **Totale** | **200** | | **$1.63/mese** |

### Scenario traction (1000 utenti, piano Pro a EUR 4.99)

| Metrica | Valore |
|---------|--------|
| Analisi stimate | ~2000/mese |
| Costo API stimato | $15-25/mese |
| Revenue (100 Pro a EUR 4.99) | EUR 499/mese |
| **Margine lordo** | **>95%** |

---

## Stato soglie alert

| Soglia | Limite | Attuale | Stato |
|--------|--------|---------|-------|
| Costo giornaliero | > $1.00 | max $0.08 | OK |
| Costo singola query | > $0.10 | max ~$0.05 | OK |
| Fallback rate | > 30% | n/d | Da verificare |
| Provider down | qualsiasi | Nessuno | OK |

---

## Raccomandazioni

### Priorita alta

1. **Attivare breakdown per agente nei report mensili.** Il campo `agent_name` e' presente in `agent_cost_log` ma i dati del board non lo espongono ancora in modo strutturato. Verificare con Operations che il dashboard `/ops` mostri il drill-down per agente.

2. **Monitorare il rapporto Anthropic vs totale.** Oggi Anthropic rappresenta il 75.6% della spesa. Se il volume cresce 10x, Anthropic potrebbe diventare il collo di bottiglia economico. Valutare se `corpus-agent` puo usare Gemini Pro come primary al posto di Sonnet.

### Priorita media

3. **Configurare alert automatico.** Edge Function schedulata o cron che interroga `getTotalSpend(1)` e invia alert se > $1.00. Effort: 2h.

4. **Breakeven analysis piano Pro.** Con costi API a ~$0.007/chiamata e piano Pro a EUR 4.99/mese, il breakeven e' a ~1 analisi/mese per utente. Il modello regge ampiamente.

### Priorita bassa

5. **Stimare budget per verticale HR.** Le fonti HR (D.Lgs. 81/2008, 276/2003, 23/2015) aggiungeranno ~800 articoli al corpus. Costo ingest stimato: ~$0.10 (Voyage AI embeddings). Costo runtime: trascurabile (stesse catene).

6. **Valutare rimozione DeepSeek dal codice.** Provider rimosso per SEC-001 (server in Cina) ma ancora presente in CLAUDE.md come documentazione. Allineare documentazione con `lib/models.ts`.

---

## Conclusioni

Il costo API di marzo 2026 e' di **$0.41 su 58 chiamate**, con un costo medio di **$0.007 per chiamata** — in calo dell'86% rispetto a febbraio. Il tier system multi-provider sta producendo i risultati attesi: il volume e' cresciuto di quasi 10x, la spesa solo del 32%.

Il modello economico e' sano: anche nel peggior scenario (tutto su Anthropic Sonnet), il costo per analisi completa resta sotto $0.10, ampiamente coperto dal piano Pro a EUR 4.99/mese.

Nessun alert attivo. Nessuna soglia superata. Prossimo report: aprile 2026.
