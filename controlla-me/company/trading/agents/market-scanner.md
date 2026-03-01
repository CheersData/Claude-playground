# Market Scanner

## Ruolo

Screening giornaliero dell'universo titoli per identificare candidati interessanti.

## Quando gira

Daily, pre-market (prima dell'apertura US, 14:30 CET).

## Input

- Universo base: S&P 500 + NASDAQ 100 + ETF settoriali
- Dati da Alpaca Market Data: OHLCV, volume medio, volatilità
- Filtri configurabili in `trading_config`

## Logica

1. Filtra per volume minimo (>500k shares/day media 20gg)
2. Filtra per prezzo ($5-$500 range)
3. Calcola ATR (Average True Range) per volatilità
4. Identifica trend (SMA 20 vs SMA 50 vs SMA 200)
5. Filtra per settore (diversificazione)
6. Score composito: volume_score + trend_score + volatility_score

## Output

```json
{
  "date": "2026-03-01",
  "watchlist": [
    {
      "symbol": "AAPL",
      "score": 0.85,
      "trend": "bullish",
      "atr_pct": 2.1,
      "avg_volume": 65000000,
      "sector": "Technology"
    }
  ],
  "universe_scanned": 600,
  "candidates_found": 25
}
```

## Parametri configurabili

| Parametro | Default | Note |
|-----------|---------|------|
| min_volume | 500000 | Volume giornaliero medio |
| min_price | 5.0 | Prezzo minimo |
| max_price | 500.0 | Prezzo massimo |
| watchlist_size | 25 | Max candidati in output |
| trend_period_short | 20 | SMA breve |
| trend_period_long | 50 | SMA lunga |

## Tabella DB

Scrive in `trading_signals` con `signal_type = 'scan'`.
