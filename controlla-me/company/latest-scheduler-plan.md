# Piano #3 — 03/03/2026, 12:12:50
> Status: in attesa di approvazione su Telegram

🎯 *Focus boss: Trading*

*Review ciclo #2*: 3 task completati (QA ✅, Trading ✅, Ops ✅).

Backtest 2024 eseguito su 5 ticker: WR=62.5%, PF=2.43 ottimi. Ma solo 8 trade/anno → NO-GO Sharpe=-0.98. Causa: universo troppo piccolo.

*Short selling*: già implementato nel codice (`allow_short_selling=False` nel config). Risposta alla domanda del boss: sì, il sistema supporta già vendite/short — basta abilitarlo.

*Ticker specifici*: strategia valida come universo focalizzato (es. FAANG+ETF), ma da solo non genera abbastanza segnali. Meglio universo 30-50 ticker.

*Piano #3 — 3 task trading-focused:*
• Backtest con universo S&P500 completo (50+ ticker) → target Sharpe >1.0
• Analisi short: backtest comparativo long-only vs long+short su 5 top volatile
• Monitoring: aggiungere alerting slope signals per ticker watchlist in /ops

## Task proposti (3)
- [trading] **HIGH** — Backtest universo S&P500: 50 ticker per Sharpe >1.0
- [trading] **HIGH** — Analisi short selling: backtest long+short vs long-only
- [operations] **MEDIUM** — Watchlist slope monitoring: alerting per ticker specifici in /ops