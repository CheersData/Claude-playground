# Trading — Confronto Modelli: Daily vs Slope+Volume (5-min)

**Autore:** CME / Trading Lead
**Data:** 2026-03-02
**Status:** Framework pronto, backtest 5-min da eseguire

---

## I due modelli a confronto

| Dimensione | Modello 1: Daily Trend-Following | Modello 2: Slope+Volume (5-min) |
|-----------|----------------------------------|---------------------------------|
| **Timeframe** | 1 giorno / bar | 5 minuti / bar |
| **Frequenza segnali** | 1 volta al giorno (pre-market) | Continua durante la sessione |
| **Universo** | S&P 500 subset + ETF (40+ simboli) | 1 singolo titolo liquido (es. SPY) |
| **Indicatori** | RSI, MACD, Bollinger, SMA, Volume | Slope regressione lineare + volume Z-score |
| **Holding period** | 3–10 giorni | Minuti / ore (intraday) |
| **Tipo di edge** | Trend-following momentum | Cambio di direzione + conferma volume |
| **Slippage atteso** | Basso (daily close) | Alto (5-min, spread + impatto) |
| **Segnale di entrata** | Score composito > 0.3 (fine giornata) | Slope supera soglia + volume > 1.5x media |
| **Segnale di uscita** | ATR trailing stop 4-tier | Inversione slope o stop fisso |
| **Capital utilizzato** | 10% max per posizione, 10 posizioni | 100% del capital su 1 posizione |
| **Drawdown risk** | Contenuto (diversificazione) | Alto se il segnale è sbagliato |

---

## Architettura tecnica

### Modello 1 — Daily (già operativo)
```
MarketScanner (pre-market)
  → SignalGenerator (composite score RSI+MACD+BB+SMA+Volume)
  → RiskManager (position sizing, kill switch)
  → Executor (bracket orders Alpaca)
  → PortfolioMonitor (trailing stop 4-tier)
```

### Modello 2 — Slope+Volume 5-min (in sviluppo)
```
WebSocket Alpaca (streaming bars 5-min)
  → SlopeVolumeAnalyzer (analisi in tempo reale)
      ├── Slope: regressione lineare su N bar (default: 5)
      ├── Volume: Z-score vs media mobile
      └── Confidenza: slope * volume_zscore
  → Filtro trend daily (SMA 20 daily — anti-fade)
  → RiskManager (stesso kill switch del Modello 1)
  → Executor (ordini immediati, bracket)
```

---

## Parametri Slope+Volume (da `settings.py`)

```python
class SlopeVolumeSettings:
    enabled: bool = False                    # attivare quando backtest OK
    timeframe: str = "5Min"
    symbol: str = "SPY"                      # singolo titolo liquido
    lookback_bars: int = 5                   # bar per regressione slope
    slope_threshold_pct: float = 0.05        # soglia min slope abs (% per bar)
    volume_zscore_threshold: float = 1.5     # volume deve essere 1.5x la media
    confidence_min: float = 0.6              # confidenza minima per entrare
    daily_trend_filter: bool = True          # richiede trend daily favorevole
```

---

## Come valutare le performance (metriche comparabili)

Per un confronto corretto bisogna usare le **stesse metriche** su **stesso periodo**.

### Metriche primarie

| Metrica | Target Modello 1 | Target Modello 2 |
|---------|-----------------|-----------------|
| Sharpe Ratio (annualizzato) | > 1.0 | > 1.5 (intraday deve compensare costi) |
| Max Drawdown | < 20% | < 10% (holding breve) |
| Win Rate | > 45% | > 55% (segnali più precisi ma più rari) |
| Avg Trade Duration | 3–7 giorni | 30min–4h |
| Profit Factor | > 1.3 | > 1.5 |
| Total Trades (6 mesi) | 50–200 | 100–500 |

### Metriche costo-adjusted

Il Modello 2 ha costi più alti per trade:
- Slippage atteso: ~8 bps (vs ~4 bps daily)
- Commissioni Alpaca: $0 (stock), ma spread bid/ask su 5-min è più ampio
- Aggiustamento: applicare slippage 8 bps nel backtest 5-min

### Come confrontare i backtest

```bash
# Modello 1 — daily baseline (già eseguito)
cd trading
python -m src.backtest run \
  --start 2025-09-01 --end 2026-03-01 \
  --timeframe 1Day \
  --strategy trend_following \
  --capital 100000

# Modello 2 — slope+volume 5-min (da eseguire)
python -m src.backtest run \
  --start 2025-09-01 --end 2026-03-01 \
  --timeframe 5Min \
  --strategy slope_volume \
  --universe SPY \
  --capital 100000 \
  --slippage 8.0
```

---

## Roadmap confronto

1. ✅ Architettura Modello 2 (slope+volume) — progettata da Architecture dept
2. ✅ `SlopeVolumeSettings` in `config/settings.py`
3. ✅ `DataLoader` esteso con supporto `5Min` (Alpaca intraday)
4. ✅ Backtest CLI aggiornato con `--timeframe 5Min --strategy slope_volume`
5. 🔄 **PROSSIMO STEP (Data Eng):** scarica dati SPY 5-min 6 mesi
   ```bash
   cd trading && python scripts/fetch_5min_data.py --symbols SPY --months 6
   ```
6. ⬜ Implementare `slope_volume` strategy in `BacktestEngine`
7. ⬜ Eseguire backtest 5-min e confrontare con baseline daily
8. ⬜ Se Sharpe > 1.5 e DD < 10%: attivare paper trading
9. ⬜ 30 giorni paper trading: confronto live vs backtest
10. ⬜ Go/No-Go decision con boss

---

## Rischi specifici Modello 2

| Rischio | Probabilità | Impatto | Mitigazione |
|---------|-------------|---------|-------------|
| Overfitting su 6 mesi SPY | Alta | Alto | Train/test split 70/30 |
| Slippage reale > stimato | Media | Medio | Stress test con 12 bps |
| Segnali troppo frequenti (overtrading) | Media | Medio | Min 15min tra segnali |
| WebSocket disconnect durante sessione | Bassa | Alto | Reconnect automatico + position monitor |
| Slope segnale falso in laterale | Alta | Medio | Daily trend filter obbligatorio |

---

## Decision Gate

Prima di abilitare Modello 2 in paper trading:

```
Backtest 5-min:
  ☐ Sharpe annualizzato > 1.5 (cost-adjusted)
  ☐ Max Drawdown < 10%
  ☐ Win rate > 52%
  ☐ Profit Factor > 1.4
  ☐ Out-of-sample period (30%) non peggiora > 30% vs training

Tutto soddisfatto? → paper trading 30 giorni
Altrimenti → aggiustare parametri (grid search su slope_threshold_pct, lookback_bars)
```

**Approvazione finale go-live: Boss (L4)**
