# Runbook: Quotazioni Alpaca H24 — Spiegazione

## Perché i titoli si muovono fuori orario di borsa

### Risposta breve
Alpaca non ferma il data feed alla chiusura del NYSE (22:00 CET). Mostra quotazioni **extended hours** + i mercati internazionali influenzano i prezzi anche di notte.

---

## 1. Extended Hours Trading (orari reali)

| Sessione | Orario ET | Orario CET | Note |
|----------|-----------|------------|------|
| Pre-market | 04:00–09:30 | 10:00–15:30 | Volumi bassi, spread ampi |
| Mercato regolare | 09:30–16:00 | 15:30–22:00 | Orario ufficiale NYSE/NASDAQ |
| After-hours | 16:00–20:00 | 22:00–02:00 | Volumi bassi, spread ampi |
| Overnight (chiuso) | 20:00–04:00 | 02:00–10:00 | Nessun trade, ma quotazioni possono muoversi |

**Alpaca paper trading**: replica i dati di mercato reali inclusi pre-market e after-hours.

---

## 2. Perché i prezzi cambiano anche quando il mercato è "chiuso"

### 2a. Order book residuale
Market makers (Virtu, Citadel) mantengono quote bid/ask attive anche after-hours per alcuni titoli. Il "last price" che Alpaca mostra aggiorna alla minima transazione.

### 2b. Futures overnight
I futures S&P 500 (ES, /MES) tradano 23/6. Quando cambiano di notte — ad es. per notizie macro, geopolitica, dati economici da Asia/Europa — influenzano le aspettative di prezzo dei sottostanti al prossimo open.

### 2c. Notizie post-mercato (earnings, FDA, M&A)
Le aziende pubblicano earnings dopo le 16:00 ET. Il prezzo viene aggiustato in after-hours e rimane a quel livello fino al pre-market.

### 2d. Crypto e ADR
Alpaca offre anche trading crypto (24/7) e alcuni ADR che reflettono mercati europei aperti durante la nostra notte.

---

## 3. Impatto sul nostro sistema di trading

### Cosa fare e NON fare fuori orario

| Azione | Orario Regolare | Extended Hours | Overnight |
|--------|----------------|----------------|-----------|
| Generare segnali | ✅ Sì | ⚠️ Solo con flag esplicito | ❌ No |
| Eseguire ordini bracket | ✅ Sì | ⚠️ Rischio spread ampi | ❌ No |
| Aggiornare trailing stops | ✅ Sì | ✅ Sì (monitora fill) | ❌ No |
| Portfolio Monitor | ✅ Sì (ogni 5 min) | ✅ Sì (ridotta freq) | ❌ No |
| Market Scanner | ✅ Pre-market (09:00 ET) | ❌ No | ❌ No |

### Il nostro scheduler è già corretto
Il file `trading/src/scheduler.py` esegue solo a orari specifici:
- 09:00 ET → pipeline completa (ancora pre-market → dati stabili)
- 09:30–16:00 ET → intraday ogni ora
- 16:30 ET → daily report

**Non c'è bisogno di modificare nulla.** Il movimento dei prezzi H24 che vedi in Alpaca è corretto e atteso.

---

## 4. Come leggere le quotazioni in paper trading

```
Alpaca GET /v2/stocks/{symbol}/quotes/latest
→ "t": timestamp → controlla sempre l'ora
→ "bp"/"ap": bid/ask price → ampi after-hours = normale
→ "bp_s"/"ap_s": bid/ask size → molto bassi after-hours = normale
```

Se vedi movimenti grandi overnight su un titolo in portafoglio, controlla:
1. Notizie earnings/FDA su Bloomberg/Seeking Alpha
2. Futures ES/NQ su TradingView
3. Non è un bug del sistema — è il mercato che prezza informazioni nuove

---

## 5. Nota DST (ora legale USA)

**2a domenica di marzo → 1a domenica di novembre:** cambia a EDT (UTC-4).
Aggiorna `ET_OFFSET_HOURS = -4` in `trading/src/scheduler.py`.

Attuale configurazione: `-5` (EST, valida ora — siamo a marzo 2026 quindi **siamo probabilmente già in EDT, verificare**).
