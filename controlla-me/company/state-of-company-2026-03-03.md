# State of the Company — Controlla.me
**Data:** 3 marzo 2026
**Prodotto da:** CME con input di Strategy, Marketing, Architecture, Security, Trading
**Classificazione:** INTERNO — MANAGEMENT

---

## 0. AGGIORNAMENTO PRINCIPALE — UFFICIO TRADING OPERATIVO

> *"Il trading gira sul mio PC personale. Backtest fatto, paper trading attivo su Alpaca."*
> — Boss, 3 marzo 2026

### Stato Trading

L'Ufficio Trading ha completato la **Fase 1 (Fondamenta)** ed è entrato in **Fase 2+3** simultaneamente:

| Fase | Stato | Note |
|------|-------|------|
| 1. Fondamenta | ✅ Completata | Infrastruttura Python, connessione Alpaca, schema DB, pipeline 5 agenti |
| 2. Backtest | ✅ Eseguito | Sul PC Windows del boss — risultati non ancora committati nel repo |
| 3. Paper Trading | 🔄 In corso | Attivo su Alpaca paper — 30 giorni minimi prima di go-live |
| 4. Go Live | ⏳ In attesa | Richiede: 30 giorni paper OK + approvazione boss + kill switch testato |

**Ambiente di esecuzione:** PC Windows personale del boss (`C:\Users\crist\Claude-playground\...`). Lo scheduler Windows (`AVVIA_SCHEDULER.bat` + `scheduler_task.xml`) esegue la pipeline giornaliera alle 09:00 ET e il report alle 16:30 ET.

**Codebase nel repo:** completa e professionale — 5 agenti Python (MarketScanner, SignalGenerator, RiskManager, Executor, PortfolioMonitor), backtest framework, Alpaca client, Supabase DB layer, risk controls (kill switch, stop loss, position limits).

### Azioni richieste per il repo

| # | Azione | Perché |
|---|--------|--------|
| T-01 | Committare un summary dei risultati backtest | Tracciabilità — al momento zero evidenza nel repo |
| T-02 | Confermare che la migrazione 019 è applicata su Supabase | Le tabelle `trading_*` devono esistere per i log |
| T-03 | Verificare sul dashboard Alpaca gli ordini paper effettivi | Conferma che la pipeline esegue correttamente |

---

## 1. REFRAME STRATEGICO — CONFERMATO

> *"La parte giuridica è solo un prototipo. Il prodotto è la console."*
> — Boss, 1 marzo 2026

Il reframe strategico del 1 marzo resta valido. L'aggiunta del Trading rafforza il frame: la console orchestra non solo agenti legali, ma anche agenti di trading — dimostrando che la piattaforma è effettivamente multi-dominio.

### Piattaforma madre: 2 verticali attivi

| Verticale | Stato | Agenti | Pipeline |
|-----------|-------|--------|----------|
| **Legale** | 🟢 Operativo | 7 agenti (classifier → advisor) | Document → Classification → RAG → Analysis → Advice |
| **Trading** | 🟡 Paper Trading | 5 agenti (scanner → monitor) | Scan → Signal → Risk → Execute → Monitor |
| HR (prossimo) | ⏳ Corpus pronto | 0 agenti dedicati | Pipeline parametrizzata pronta |

---

## 2. LEADERSHIP POSITION — AGGIORNAMENTO

### Dove siamo vs il mercato

| Segmento | Player principali | Noi |
|----------|------------------|-----|
| Enterprise B2B globale | Harvey ($1B+), Luminance, Lawgeex | Fuori target |
| PMI e professionisti IT | Lexroom (€16.2M Series A, set 2025), LexDo | Mercato adiacente |
| **Consumer B2C italiano** | **Nessuno** | **Noi, da soli** |
| **Trading automatizzato** | QuantConnect, Alpaca community | **Noi, per autosufficienza** |

**Aggiornamento competitivo dal 1 marzo:**
- Posizione invariata: leader consumer B2C legale italiano
- Vantaggio stimato: 9-15 mesi (invariato)
- EU AI Act deadline: **4.5 mesi** (agosto 2026) — urgenza crescente
- Trading: non è un prodotto commerciale — è un ufficio revenue per sostenibilità finanziaria

### Rischi principali alla leadership

| Rischio | Orizzonte | Gravità | Aggiornamento |
|---------|-----------|---------|---------------|
| **EU AI Act** — deadline agosto 2026 | **4.5 mesi** | 🔴 Critico | ⚠️ Nessuna azione presa dal 1 marzo |
| **Lexroom pivot consumer** — €16M in cassa | 12-18 mesi | 🟠 Alto | Invariato |
| **Big Tech** — "analisi contratto" gratis | 6-12 mesi | 🟡 Medio | Invariato |
| **Corpus stale** — normativa cambia | Ora | 🟡 Medio | Delta update cron configurato |

---

## 3. TECHNICAL DEBT REGISTER — AGGIORNAMENTO

### Debiti critici (invariati dal 1 marzo)

| # | Problema | Stato | Note |
|---|----------|-------|------|
| **T-01** | Cache su filesystem → rotta in multi-istanza Vercel | 🔴 Aperto | Nessun progresso |
| **T-02** | Rate limiting in-memory non distribuito | 🔴 Aperto | Nessun progresso |
| **T-03** | Dashboard usa mock data | 🔴 Aperto | Nessun progresso |
| **T-04** | Statuto dei Lavoratori assente dal corpus | 🟡 Pronto | Connector pronto — manca 1 comando |
| **T-05** | Investigator non passa per agent-runner | 🔴 Aperto | Nessun progresso |

### Debiti medi (invariati)

| # | Problema | Stato |
|---|----------|-------|
| T-06 | Tier in-memory: si resetta ad ogni cold start | 🔴 Aperto |
| T-07 | Schema DB senza indici | 🔴 Aperto |
| T-08 | CCNL non presenti nel corpus | 🔴 Aperto |

**Nota:** nessun tech debt è stato risolto tra il 1 e il 3 marzo. L'attenzione è stata sul setup del trading.

---

## 4. SECURITY RISK REGISTER — AGGIORNAMENTO

### Stato rischi (dal 1 marzo — invariati)

| # | Rischio | Gravità | Azioni prese |
|---|---------|---------|-------------|
| R-01 | EU AI Act | 🔴 Critico | ❌ Nessuna — consulente non ingaggiato |
| R-02 | Data breach cache filesystem | 🟠 Alto | ❌ Nessuna — cache non migrata |
| R-03 | Data leakage provider AI | 🟠 Alto | ✅ DeepSeek rimosso — DPA non firmato |
| R-04 | Governance sicurezza assente | 🟠 Alto | ✅ Console auth HMAC-SHA256 implementata |

### Nuovo: rischio trading

| # | Rischio | Gravità | Note |
|---|---------|---------|------|
| R-05 | API keys Alpaca sul PC personale senza backup | 🟡 Medio | Se il PC si rompe, il trading si ferma |
| R-06 | Risultati backtest/paper non versionati | 🟡 Medio | Nessuna tracciabilità — impossibile audit |

---

## 5. GOVERNANCE CHARTER — CONFERMATO

La governance charter del 1 marzo resta valida. L'Ufficio Trading opera sotto la stessa matrice di autonomia con una precisazione:

**Trading — autonomia e escalation:**
- **Decide autonomamente:** esecuzione pipeline daily, paper trading, report P&L
- **Deve escalare al boss:** passaggio da paper a live, allocazione capitale, modifica parametri risk management

---

## 6. CONSOLE — VALUTAZIONE (INVARIATA)

**Stato:** BETA CHIUSA — 30% di un prodotto serio. Nessun progresso dalla valutazione del 1 marzo.

---

## 7. BOARD COMPLESSIVO — 3 MARZO 2026

### Sintesi dipartimentale

| Dipartimento | Stato | Aggiornamento dal 1 marzo |
|-------------|-------|--------------------------|
| Ufficio Legale | 🟢 Operativo | Invariato |
| Data Engineering | 🟢 Operativo | Invariato |
| Quality Assurance | 🟡 Attenzione | Invariato — 9 test fail, 12 ESLint errori |
| Architecture | 🟢 Operativo | Invariato |
| Security | 🟢 Operativo | Invariato — DPA e consulente EU AI Act ancora in attesa |
| Finance | 🟢 Operativo | Invariato |
| Operations | 🟢 Operativo | Invariato |
| Strategy | 🟢 Operativo | Invariato — OKR Q2 in attesa approvazione |
| Marketing | 🟢 Operativo | Invariato — contenuti pronti, non pubblicati |
| **Trading** | 🟡 Paper Trading | **NUOVO** — Fase 3 attiva su Alpaca, PC personale boss |

**Board complessivo:** 126/128 task completati (invariato) + Trading operativo su infrastruttura esterna.

---

## 8. NEXT ACTIONS — AGGIORNAMENTO

### Azioni urgenti (dal 1 marzo — NON ancora eseguite)

| # | Azione | Owner | Deadline originale | Stato |
|---|--------|-------|-------------------|-------|
| **A-01** | ~~Rimuovere DeepSeek~~ | Architecture | Settimana 1 marzo | ✅ Completata |
| **A-02** | Migrare cache filesystem → Supabase | Architecture | Entro 2 settimane | 🔴 Non iniziata |
| **A-03** | Rate limiting Redis/Vercel KV | Architecture | Entro 2 settimane | 🔴 Non iniziata |
| **A-04** | Dashboard reale Supabase | Architecture | Entro 2 settimane | 🔴 Non iniziata |
| **A-05** | Ingaggiare consulente EU AI Act | CME/Boss | Entro 1 settimana | 🔴 Non iniziata |

### Nuove azioni (3 marzo)

| # | Azione | Owner | Deadline | Note |
|---|--------|-------|----------|------|
| **A-06** | Committare summary backtest nel repo | Boss/CME | Questa settimana | Tracciabilità risultati |
| **A-07** | Verificare migrazione 019 su Supabase live | Boss/CME | Questa settimana | Tabelle trading_* |
| **A-08** | Screenshot/export ordini paper Alpaca | Boss | Questa settimana | Evidenza paper trading attivo |
| **A-09** | Firmare DPA provider AI | Boss | Urgente | Bloccante per lancio PMI |

---

*Documento prodotto il 3 marzo 2026. Prossima revisione: Weekly Review — mercoledì 5 marzo 2026.*
