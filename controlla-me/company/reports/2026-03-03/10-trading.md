# Report — Ufficio Trading
**Data:** 3 marzo 2026 | **Fase:** Paper Trading | **Stato:** 🟡 In corso

---

## Funzione dell'ufficio

Trading automatizzato su azioni US e ETF via Alpaca per garantire sostenibilità finanziaria a Controlla.me. Ogni euro generato dal trading è un euro che non serve chiedere agli utenti.

---

## Stato deployment

| Fase | Stato | Data | Note |
|------|-------|------|------|
| 1. Fondamenta | ✅ Completata | Feb 2026 | Codebase Python, Alpaca client, schema DB, 5 agenti |
| 2. Backtest | ✅ Eseguito | Feb-Mar 2026 | Sul PC Windows del boss — risultati non nel repo |
| 3. Paper Trading | 🔄 In corso | Mar 2026 | Attivo su Alpaca paper account |
| 4. Go Live | ⏳ In attesa | TBD | 30 giorni paper + boss approval + kill switch test |

---

## Architettura codebase (nel repo)

### Pipeline 5 agenti

```
[1] MarketScanner → Filtra universo titoli (volume, volatilità, trend)
[2] SignalGenerator → Analisi tecnica + confidence score
[3] RiskManager → Validazione vs portfolio + limiti rischio
[4] Executor → Ordini su Alpaca (market/limit)
[5] PortfolioMonitor → Stop loss, take profit, P&L report
```

### Stack
- **Linguaggio:** Python 3.11+
- **Broker:** Alpaca Markets (paper, poi live)
- **Database:** Supabase (schema `trading_*` — migrazione 019)
- **Scheduler:** Windows Task Scheduler — 09:00 ET (pipeline) + 16:30 ET (report)
- **Risk controls:** Kill switch (-2% daily, -5% weekly), stop loss -5%, max 10 posizioni, max 10% portfolio per posizione

### File principali

| File | Funzione |
|------|----------|
| `trading/src/agents/market_scanner.py` | Screening giornaliero |
| `trading/src/agents/signal_generator.py` | Generazione segnali |
| `trading/src/agents/risk_manager.py` | Validazione rischio |
| `trading/src/agents/executor.py` | Esecuzione ordini |
| `trading/src/agents/portfolio_monitor.py` | Monitoring posizioni |
| `trading/src/backtest/engine.py` | Motore backtest |
| `trading/src/clients/alpaca_client.py` | Client Alpaca |
| `trading/src/clients/supabase_client.py` | Client Supabase |
| `trading/src/config/settings.py` | Configurazione Pydantic |
| `trading/src/scheduler.py` | Scheduler DST-aware |
| `trading/AVVIA_SCHEDULER.bat` | Launcher Windows |
| `trading/scheduler_task.xml` | Task Scheduler XML |

---

## Infrastruttura di esecuzione

**Ambiente:** PC Windows personale del boss (`C:\Users\crist\Claude-playground\controlla-me\trading\`)

**Requisiti verificati dal boss:**
- [x] Python 3.11+ installato
- [x] Dipendenze installate (`pip install -e .`)
- [x] `.env.local` con API keys Alpaca configurato
- [x] Scheduler Windows attivo
- [x] Backtest eseguito
- [x] Paper trading attivo su Alpaca

**Non verificabile da questo ambiente:**
- Risultati backtest (Sharpe, drawdown, equity curve)
- Ordini paper eseguiti su Alpaca
- Log di esecuzione scheduler
- Stato migrazione 019 su Supabase live

---

## Risk management — parametri attivi

| Parametro | Valore | Enforcement |
|-----------|--------|-------------|
| Max daily loss | -2% portfolio | Kill switch automatico |
| Max weekly loss | -5% portfolio | Kill switch automatico |
| Max position size | 10% portfolio | Pre-trade check |
| Max positions | 10 simultanee | Pre-trade check |
| Stop loss | -5% per posizione | Automatico |
| Paper trading | 30 giorni minimi | Prima del go-live |

---

## Criteri go/no-go per Go Live (Fase 4)

Da `runbooks/go-live.md`:
1. ✅ Paper trading completato (in corso — 30 giorni minimi)
2. ⏳ Risultati consistenti con backtest
3. ⏳ Nessun bug critico in 30 giorni
4. ⏳ Kill switch testato in paper
5. ⏳ Boss approva esplicitamente il passaggio a live
6. ⏳ Capitale allocato

---

## Cosa resta da fare

| Priorità | Task | Owner | Note |
|----------|------|-------|------|
| Alta | Completare 30 giorni paper trading | Trading/Boss | Criterio go-live |
| Alta | Committare summary backtest nel repo | Boss/CME | Tracciabilità |
| Alta | Verificare migrazione 019 su Supabase | Boss/CME | Tabelle trading_* |
| Media | Export P&L settimanale in repo | Boss | Audit trail |
| Media | Testare kill switch in paper | Trading | Criterio go-live |
| Media | Backup API keys in secret manager | Boss | Security R-05 |
| Bassa | Setup pytest per test automatici Python | CME | QA non copre Python |

---

## Allineamento con la funzione

🟡 **In fase di validazione.** L'ufficio ha completato la fase di setup e ha iniziato la fase operativa di paper trading. Il codice è completo e ben strutturato. La validazione vera arriverà con i risultati dei 30 giorni di paper trading.

---

## KPI da tracciare (quando dati disponibili)

| KPI | Target | Fonte |
|-----|--------|-------|
| Sharpe Ratio | > 1.0 | Backtest + paper |
| Max Drawdown | < 15% | Backtest + paper |
| Win Rate | > 50% | Paper trading |
| P&L mensile | > 0 | Paper trading |
| Kill switch triggers | 0 (ideale) | Paper trading |
| Ordini eseguiti/giorno | 0-3 (swing) | Alpaca dashboard |
