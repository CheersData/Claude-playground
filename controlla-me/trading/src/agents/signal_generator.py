"""
Signal Generator Agent

Performs technical analysis on watchlist candidates to generate BUY/SELL signals.
Uses the shared composite-score analysis from src.analysis (single source of truth).
"""

from __future__ import annotations

from typing import Any

import pandas as pd

from ..analysis import analyze_composite, analyze_slope_volume, get_current_slope_direction, get_current_slope_info
from ..config import get_settings
from ..connectors import AlpacaClient
from ..connectors.tiingo_client import TiingoClient
from ..models.signals import Signal, SignalAction
from ..utils.db import TradingDB
from .base import BaseAgent


class SignalGenerator(BaseAgent):
    """Generates trading signals from technical analysis."""

    def __init__(self, account_type: str = "slope") -> None:
        super().__init__(name="signal_generator")
        self._alpaca = AlpacaClient(account_type=account_type)  # type: ignore[arg-type]
        self._db = TradingDB()
        cfg = get_settings()
        # Use Tiingo IEX (real-time) for market data when configured.
        # Alpaca free tier has 15-min delay; Tiingo IEX has no delay.
        if cfg.tiingo.tiingo_api_key and cfg.tiingo.use_tiingo_for_market_data:
            self._market_data = TiingoClient(cfg.tiingo.tiingo_api_key)
            self.logger.info("market_data_provider", provider="tiingo_iex_rt")
        else:
            self._market_data = self._alpaca  # type: ignore[assignment]
            self.logger.warning(
                "market_data_provider",
                provider="alpaca_delayed",
                delay_min=15,
                hint="Set TIINGO_API_KEY to get real-time IEX data",
            )
        self._settings = cfg.signal

        # ── News client (Tiingo Power plan) ─────────────────────────────────────
        # Detects breaking news before emitting entry signals.
        # Graceful degradation: if not configured or plan doesn't support it → skip.
        self._news_client = None
        self._news_settings = cfg.tiingo_news
        if cfg.tiingo.tiingo_api_key and self._news_settings.enabled:
            try:
                from ..connectors.tiingo_news import TiingoNewsClient
                self._news_client = TiingoNewsClient()
                self.logger.info("news_client_initialized", provider="tiingo_news")
            except Exception as exc:
                self.logger.warning("news_client_init_failed", error=str(exc))

    async def run(
        self,
        watchlist: list[dict] | None = None,
        timeframe: str = "1Day",
        **kwargs: Any,
    ) -> dict:
        """
        Generate signals for watchlist candidates.

        Args:
            watchlist: List of ScanResult dicts. If None, reads latest scan from DB.
            timeframe: Bar timeframe — "1Day" (default) or "1Hour" (intraday).
                       Hourly bars give real-time signals during market hours.
        """
        if watchlist is None:
            scans = self._db.get_latest_signals("scan", limit=1)
            if not scans:
                self.log_error("No scan data found")
                return {"signals": [], "error": "No scan data"}
            watchlist = scans[0].get("data", {}).get("watchlist", [])

        symbols = [c["symbol"] for c in watchlist]
        # 1Day: 1 year of history for robust indicators.
        # 1Hour: 30 days (~390 bars) — enough for RSI/MACD/BB, avoids hitting rate limits.
        days_back = 365 if timeframe == "1Day" else 30
        self.log_start(watchlist_size=len(symbols), timeframe=timeframe)

        bars = self._market_data.get_bars(symbols, timeframe=timeframe, days_back=days_back)

        signals: list[dict] = []
        for symbol, df in bars.items():
            if len(df) < 50:
                continue

            signal = self._analyze_stock(symbol, df, timeframe=timeframe)
            if signal is not None and signal.confidence >= self._settings.min_confidence:
                signals.append(signal.model_dump(mode="json"))

        # Save to DB
        signal_data = {
            "date": pd.Timestamp.now().strftime("%Y-%m-%d"),
            "signals": signals,
            "analyzed": len(bars),
            "signals_generated": len(signals),
        }
        self._db.insert_signal("trade", signal_data)

        self.log_complete(analyzed=len(bars), signals=len(signals))
        return signal_data

    def _analyze_stock(self, symbol: str, df: pd.DataFrame, **kwargs: Any) -> Signal | None:
        """Run technical analysis using the shared composite-score module."""
        s = self._settings
        timeframe = kwargs.get("timeframe", "1Day")

        result = analyze_composite(
            symbol,
            df,
            rsi_period=s.rsi_period,
            rsi_oversold=s.rsi_oversold,
            rsi_overbought=s.rsi_overbought,
            macd_fast=s.macd_fast,
            macd_slow=s.macd_slow,
            macd_signal=s.macd_signal,
            bb_period=s.bb_period,
            bb_std=s.bb_std,
            weight_rsi=s.weight_rsi,
            weight_macd=s.weight_macd,
            weight_bollinger=s.weight_bollinger,
            weight_trend=s.weight_trend,
            weight_volume=s.weight_volume,
            score_buy_threshold=s.score_buy_threshold,
            score_sell_threshold=s.score_sell_threshold,
            stop_loss_atr=2.5,
            take_profit_atr=6.0,
            timeframe=timeframe,
        )

        if result is None:
            return None

        # BUY = open long.  SHORT = open short (bearish composite score).
        # analyze_composite already computes SL/TP correctly for both directions:
        #   BUY:   SL = entry - ATR×n,  TP = entry + ATR×n
        #   SHORT: SL = entry + ATR×n,  TP = entry - ATR×n
        action = SignalAction.BUY if result["action"] == "BUY" else SignalAction.SHORT
        return Signal(
            symbol=result["symbol"],
            action=action,
            strategy="conventional",
            confidence=result["confidence"],
            score=result["score"],
            entry_price=result["entry_price"],
            stop_loss=result["stop_loss"],
            take_profit=result["take_profit"],
            rationale=result["rationale"],
        )

    def run_slope_volume(self) -> dict:
        """
        Run the slope+volume intraday strategy on all configured symbols.

        Iterates over slope_volume.symbols (default: SPY, AAPL, NVDA, TSLA),
        fetches 5-min bars from Alpaca and evaluates slope+volume entry signals.
        If the strategy is disabled (TRADING_SLOPE_ENABLED=false), returns immediately.

        Configure symbols via env: TRADING_SLOPE_SYMBOLS='["SPY","AAPL","NVDA"]'

        Returns:
            dict with keys:
                strategy (str), symbols (list[str]), timeframe (str),
                signals (list[dict]), signals_generated (int),
                symbols_scanned (int), symbols_with_signals (int).
            On error per symbol: individual error logged, continues to next symbol.
            When disabled: adds "skipped" key.
        """
        slope_cfg = get_settings().slope_volume

        if not slope_cfg.enabled:
            return {"signals": [], "skipped": "slope_volume_disabled"}

        symbols = slope_cfg.symbols
        # Compute how many bars to fetch: need enough history for both the
        # current and previous slope windows, the volume MA, and the ATR.
        n_bars = max(
            slope_cfg.lookback_bars * 2
            + slope_cfg.volume_ma_period
            + slope_cfg.atr_period
            + 10,
            60,
        )

        self.log_start(strategy="slope_volume", symbols=symbols, timeframe=slope_cfg.timeframe)

        # Fetch open positions once before the loop.
        # When slope reverses and a position is already open in the opposite direction,
        # we emit SELL (close long) or COVER (close short) — slope reversal IS the exit signal.
        try:
            open_positions = self._alpaca.get_positions()
            position_map: dict[str, dict] = {p["symbol"]: p for p in open_positions}
        except Exception as exc:
            self.log_error("positions_fetch_failed", error=str(exc))
            position_map = {}

        # Expand scan to include ALL open positions — slope reversal is the exit signal
        # for every held position, not just the configured watchlist.
        # dict.fromkeys preserves order and deduplicates.
        open_position_symbols = list(position_map.keys())
        all_symbols = list(dict.fromkeys(symbols + open_position_symbols))
        if open_position_symbols:
            new_symbols = [s for s in open_position_symbols if s not in symbols]
            if new_symbols:
                self.logger.info(
                    "slope_expanded_for_positions",
                    added=new_symbols,
                    total=len(all_symbols),
                )

        all_signals: list[dict] = []
        symbols_with_signals = 0

        inverse_etf_set = set(getattr(slope_cfg, "inverse_etf_symbols", ["SH", "PSQ", "DOG", "SPXS", "SQQQ"]))
        # Trend-following symbols: liquid instruments that trade on sustained slope
        # direction (no reversal needed) but still require volume confirmation.
        # Enables diversification beyond inverse ETFs — SPY/QQQ/NVDA etc. now generate signals.
        trend_following_set = set(getattr(
            slope_cfg, "trend_following_symbols",
            ["SPY", "QQQ", "IWM", "NVDA", "GLD", "TLT", "XLK", "XLF", "XLE", "XLV"],
        ))

        for symbol in all_symbols:
            df = self._market_data.get_latest_bars(
                symbol,
                timeframe=slope_cfg.timeframe,
                n_bars=n_bars,
            )
            if df.empty:
                self.log_error("no_data", symbol=symbol)
                continue  # skip this symbol, try next

            # --- Entry mode per asset class ---
            # Inverse ETFs (SH, PSQ, etc.): trend-continuation, volume bypassed.
            #   A sustained positive slope = market falling → inverse ETF rising = BUY.
            #   Volume bypassed: Tiingo IEX may not return volume for low-volume ETFs.
            # Trend-following (SPY, QQQ, NVDA, GLD, ...): trend-continuation, volume required.
            #   Sustained slope above threshold + volume confirmation → signal.
            #   No reversal needed — these trend for hours/days, not just at reversal points.
            # All others: reversal mode — slope must flip direction to signal entry.
            is_inverse = symbol in inverse_etf_set
            is_trend_following = (not is_inverse) and (symbol in trend_following_set)

            result = analyze_slope_volume(
                symbol,
                df,
                lookback_bars=slope_cfg.lookback_bars,
                slope_threshold_pct=slope_cfg.slope_threshold_pct,
                volume_multiplier=slope_cfg.volume_multiplier,
                volume_ma_period=slope_cfg.volume_ma_period,
                stop_loss_atr=slope_cfg.stop_loss_atr,
                take_profit_atr=slope_cfg.take_profit_atr,
                atr_period=slope_cfg.atr_period,
                market_open_utc=slope_cfg.market_open_utc,
                market_close_utc=slope_cfg.market_close_utc,
                min_bars=slope_cfg.min_bars,
                timeframe=slope_cfg.timeframe,
                require_reversal=(not is_inverse) and (not is_trend_following),
                bypass_volume_check=is_inverse,  # only inverse ETFs bypass volume
                # Wave detection: 3-factor entry
                acceleration_bars=slope_cfg.acceleration_bars,
                min_acceleration_pct=slope_cfg.min_acceleration_pct,
                volume_trend_bars=slope_cfg.volume_trend_bars,
                persistence_bars=slope_cfg.persistence_bars,
            )

            # Inverse ETFs: never SHORT. SH/PSQ are already inverse instruments —
            # shorting them = double-negative = going long on the market. Nonsensical.
            # If slope is negative (ETF falling = market rising), just skip — no trade.
            if is_inverse and result is not None and result.get("action") == "SHORT":
                result = None

            # Log slope diagnostics when no signal generated — helps tune thresholds.
            # Logged for: inverse ETFs (always), trend-following symbols (sampling only).
            log_diag = is_inverse or is_trend_following
            if result is None and log_diag:
                try:
                    slope_info = get_current_slope_info(
                        df,
                        lookback_bars=slope_cfg.lookback_bars,
                        slope_threshold_pct=slope_cfg.slope_threshold_pct,
                    )
                    reason = (
                        "slope_negative_filtered"
                        if slope_info["direction"] == "negative"
                        else "below_threshold"
                    )
                    mode = "inverse" if is_inverse else "trend_following"
                    self.logger.info(
                        "slope_no_signal",
                        symbol=symbol,
                        mode=mode,
                        slope_pct=round(slope_info["slope_pct"], 4),
                        slope_dir=slope_info["direction"],
                        angle_deg=round(slope_info["angle_deg"], 1),
                        threshold_pct=slope_cfg.slope_threshold_pct,
                        reason=reason,
                    )
                except Exception as _exc:
                    pass  # Never block the pipeline for a diagnostic log

            if result is not None:
                raw_action = result["action"]  # "BUY" or "SHORT" from slope analysis
                current_pos = position_map.get(symbol)
                pos_qty = float(current_pos.get("qty", 0)) if current_pos else 0.0

                # --- Exit logic: slope reversal closes the existing position first ---
                # Slope turned bearish (SHORT signal) but we have an open long → SELL.
                if raw_action == "SHORT" and pos_qty > 0:
                    action = SignalAction.SELL
                    # stop_loss/take_profit not used for exit orders; set to entry_price.
                    stop_loss = result["entry_price"]
                    take_profit = result["entry_price"]
                    rationale = f"[SLOPE EXIT LONG] Slope reversed bearish — closing long. {result['rationale']}"
                # Slope turned bullish (BUY signal) but we have an open short → COVER.
                elif raw_action == "BUY" and pos_qty < 0:
                    action = SignalAction.COVER
                    stop_loss = result["entry_price"]
                    take_profit = result["entry_price"]
                    rationale = f"[SLOPE EXIT SHORT] Slope reversed bullish — covering short. {result['rationale']}"
                # No conflicting position: open a new entry as usual.
                else:
                    action = SignalAction.BUY if raw_action == "BUY" else SignalAction.SHORT
                    stop_loss = result["stop_loss"]
                    take_profit = result["take_profit"]
                    rationale = result["rationale"]

                # ── News risk check (Tiingo Power plan) ──────────────────────────────
                # Check for breaking news before emitting BUY/SHORT entry signals.
                # Exit signals (SELL/COVER) are never blocked — exiting is always safe.
                news_risk = False
                news_headline = ""
                is_entry = action in (SignalAction.BUY, SignalAction.SHORT)
                if is_entry and self._news_client is not None:
                    try:
                        check_tickers = list({symbol, "SPY", "QQQ"})
                        news_risk, news_headline = self._news_client.has_breaking_news(
                            check_tickers,
                            minutes_back=self._news_settings.minutes_back,
                            high_impact_only=self._news_settings.high_impact_only,
                        )
                        if news_risk:
                            self.logger.warning(
                                "slope_signal_news_risk",
                                symbol=symbol,
                                action=action.value,
                                headline=news_headline[:100] if news_headline else "",
                                note="Signal flagged — Risk Manager will halve position size",
                            )
                    except Exception as exc:
                        self.logger.debug("news_check_skipped", error=str(exc))

                all_signals.append(
                    Signal(
                        symbol=result["symbol"],
                        action=action,
                        strategy="slope_volume",
                        confidence=result["confidence"],
                        score=result["score"],
                        entry_price=result["entry_price"],
                        stop_loss=stop_loss,
                        take_profit=take_profit,
                        rationale=rationale,
                        news_risk=news_risk,
                        news_headline=news_headline,
                    ).model_dump(mode="json")
                )
                symbols_with_signals += 1

            else:
                # No reversal signal — check if existing position has adverse slope.
                # If we're holding a long with negative slope (or short with positive),
                # exit immediately without waiting for a formal reversal.
                adverse_pos = position_map.get(symbol)
                if adverse_pos is not None:
                    adverse_qty = float(adverse_pos.get("qty", 0))
                    if adverse_qty != 0:
                        slope_info = get_current_slope_info(
                            df,
                            lookback_bars=slope_cfg.lookback_bars,
                            slope_threshold_pct=slope_cfg.slope_threshold_pct,
                        )
                        slope_dir = slope_info["direction"]
                        slope_pct_val: float = slope_info["slope_pct"]
                        angle_deg_val: float = slope_info["angle_deg"]
                        exit_action: SignalAction | None = None
                        if adverse_qty > 0 and slope_dir == "negative":
                            exit_action = SignalAction.SELL
                            exit_label = "ADVERSE EXIT LONG"
                        elif adverse_qty < 0 and slope_dir == "positive":
                            exit_action = SignalAction.COVER
                            exit_label = "ADVERSE EXIT SHORT"
                        elif adverse_qty < 0 and is_inverse:
                            # Inverse ETF held SHORT: always wrong (double-negative = long market).
                            # Force COVER immediately regardless of slope direction.
                            exit_action = SignalAction.COVER
                            exit_label = "INVERSE ETF SHORT CLEANUP"
                        else:
                            exit_label = ""

                        if exit_action is not None:
                            current_price = float(df["close"].iloc[-1])
                            # Dynamic confidence: proportional to adverse slope magnitude.
                            # Weak slope (~threshold) → 0.5, strong slope (3x+ threshold) → 0.9.
                            # Prevents cutting winners on noise while exiting quickly on strong moves.
                            _slope_magnitude = abs(slope_pct_val)
                            _slope_ratio = min(_slope_magnitude / (slope_cfg.slope_threshold_pct * 3), 1.0)
                            adverse_confidence = round(0.5 + 0.4 * _slope_ratio, 3)
                            exit_rationale = (
                                f"[SLOPE {exit_label}] slope={slope_pct_val:+.4f}%/bar "
                                f"({angle_deg_val:+.1f}°) — "
                                f"{'long' if adverse_qty > 0 else 'short'} qty={adverse_qty} "
                                f"closing to prevent further loss."
                            )
                            all_signals.append(
                                Signal(
                                    symbol=symbol,
                                    action=exit_action,
                                    strategy="slope_volume",
                                    confidence=adverse_confidence,
                                    score=slope_pct_val,  # actual slope_pct
                                    entry_price=current_price,
                                    stop_loss=current_price,
                                    take_profit=current_price,
                                    rationale=exit_rationale,
                                ).model_dump(mode="json")
                            )
                            symbols_with_signals += 1
                            self.logger.info(
                                "slope_adverse_exit",
                                symbol=symbol,
                                action=exit_action.value,
                                slope_dir=slope_dir,
                                slope_pct=slope_pct_val,
                                angle_deg=angle_deg_val,
                                pos_qty=adverse_qty,
                            )

        # ── Crypto symbols (24/7, bypass market hours) ──────────────────────────
        # BTC/ETH trade round the clock — run slope analysis even on weekends.
        # Uses get_crypto_latest() → market_open 00:00 / market_close 23:59.
        crypto_syms: list[str] = []
        if slope_cfg.crypto_enabled and slope_cfg.crypto_symbols:
            tiingo = self._market_data if hasattr(self._market_data, "get_crypto_latest") else None
            if tiingo is not None:
                _resample_map = {
                    "1Min": "1min", "1min": "1min",
                    "5Min": "5min", "5min": "5min",
                    "15Min": "15min", "1Hour": "1hour",
                }
                resample_freq = _resample_map.get(slope_cfg.timeframe, "1min")
                for crypto_sym in slope_cfg.crypto_symbols:
                    crypto_bars = tiingo.get_crypto_latest(
                        [crypto_sym], n_bars=n_bars, resample_freq=resample_freq
                    )
                    df = crypto_bars.get(crypto_sym)
                    if df is None or df.empty:
                        self.log_error("no_crypto_data", symbol=crypto_sym)
                        continue

                    from ..analysis import analyze_slope_volume as _analyze_slope
                    result = _analyze_slope(
                        crypto_sym,
                        df,
                        lookback_bars=slope_cfg.lookback_bars,
                        slope_threshold_pct=slope_cfg.slope_threshold_pct,
                        volume_multiplier=slope_cfg.volume_multiplier,
                        volume_ma_period=slope_cfg.volume_ma_period,
                        stop_loss_atr=slope_cfg.stop_loss_atr,
                        take_profit_atr=slope_cfg.take_profit_atr,
                        atr_period=slope_cfg.atr_period,
                        market_open_utc="00:00",   # crypto = 24/7, always open
                        market_close_utc="23:59",
                        min_bars=slope_cfg.min_bars,
                        timeframe=slope_cfg.timeframe,
                        require_reversal=False,    # trend continuation entry
                        bypass_volume_check=True,  # crypto volume varies by exchange
                    )

                    if result is not None and result.get("action") == "SHORT":
                        result = None  # no shorting crypto in paper account

                    if result is not None:
                        news_risk_c = False
                        news_headline_c = ""
                        if self._news_client is not None:
                            try:
                                # Check BTC/ETH news + market-wide news
                                crypto_news_tickers = ["BTC", "ETH", "BTCUSD", "ETHUSD", "SPY"]
                                news_risk_c, news_headline_c = self._news_client.has_breaking_news(
                                    crypto_news_tickers,
                                    minutes_back=self._news_settings.minutes_back,
                                    high_impact_only=self._news_settings.high_impact_only,
                                )
                            except Exception:
                                pass

                        all_signals.append(
                            Signal(
                                symbol=crypto_sym.upper(),
                                action=SignalAction.BUY,
                                strategy="crypto_slope",
                                confidence=result["confidence"],
                                score=result["score"],
                                entry_price=result["entry_price"],
                                stop_loss=result["stop_loss"],
                                take_profit=result["take_profit"],
                                rationale=f"[CRYPTO 24/7] {result['rationale']}",
                                news_risk=news_risk_c,
                                news_headline=news_headline_c,
                            ).model_dump(mode="json")
                        )
                        symbols_with_signals += 1
                        self.logger.info(
                            "crypto_slope_signal",
                            symbol=crypto_sym,
                            action="BUY",
                            confidence=round(result["confidence"], 3),
                        )
                    crypto_syms.append(crypto_sym)

        signal_data = {
            "strategy": "slope_volume",
            "symbols": all_symbols,
            "crypto_symbols": crypto_syms,
            "timeframe": slope_cfg.timeframe,
            "signals": all_signals,
            "signals_generated": len(all_signals),
            "symbols_scanned": len(all_symbols) + len(crypto_syms),
            "symbols_with_signals": symbols_with_signals,
        }
        self._db.insert_signal("trade", signal_data)
        self.log_complete(
            strategy="slope_volume",
            signals=len(all_signals),
            symbols_scanned=len(all_symbols),
        )
        return signal_data
