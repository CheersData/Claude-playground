# Signal Generator

## Ruolo

Analisi tecnica e sentiment sui candidati della watchlist per generare segnali buy/sell/hold.

## Quando gira

Daily, post-scan (dopo Market Scanner).

## Input

- Watchlist da Market Scanner (top 20-30 candidati)
- Dati OHLCV storici (60 giorni) da Alpaca
- Posizioni aperte correnti (da `portfolio_positions`)

## Logica

1. **Indicatori tecnici** per ogni candidato:
   - RSI (14 periodi) — oversold <30, overbought >70
   - MACD (12, 26, 9) — crossover signal
   - Bollinger Bands (20, 2) — squeeze e breakout
   - Volume profile — volume sopra/sotto media
2. **Pattern recognition**:
   - Supporto/resistenza (pivot points)
   - Breakout da consolidamento
   - Mean reversion dopo spike
3. **Scoring composito**:
   - `technical_score` = media pesata indicatori (0-1)
   - `confidence` = convergenza segnali (quanti indicatori concordano)
4. **Generazione segnale**:
   - BUY: technical_score > 0.7 AND confidence > 0.6
   - SELL: technical_score < 0.3 OR stop loss trigger
   - HOLD: tutto il resto

## Output

```json
{
  "date": "2026-03-01",
  "signals": [
    {
      "symbol": "AAPL",
      "action": "BUY",
      "confidence": 0.78,
      "technical_score": 0.82,
      "entry_price": 185.50,
      "stop_loss": 176.23,
      "take_profit": 203.05,
      "rationale": "MACD bullish crossover + RSI rising from 35 + volume breakout",
      "indicators": {
        "rsi": 42.3,
        "macd_signal": "bullish_crossover",
        "bollinger_position": "lower_band_bounce",
        "volume_ratio": 1.45
      }
    }
  ],
  "total_screened": 25,
  "signals_generated": 4
}
```

## Parametri configurabili

| Parametro | Default | Note |
|-----------|---------|------|
| rsi_period | 14 | Periodo RSI |
| rsi_oversold | 30 | Soglia oversold |
| rsi_overbought | 70 | Soglia overbought |
| macd_fast | 12 | MACD periodo veloce |
| macd_slow | 26 | MACD periodo lento |
| macd_signal | 9 | MACD signal line |
| min_confidence | 0.6 | Soglia minima per segnale |
| min_technical_score | 0.7 | Soglia minima per BUY |
| stop_loss_pct | 5.0 | Stop loss % dal prezzo entry |
| take_profit_pct | 10.0 | Take profit % dal prezzo entry |

## Tabella DB

Scrive in `trading_signals` con `signal_type = 'signal'`.
