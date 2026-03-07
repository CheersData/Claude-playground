"""
Shared signal analysis — single source of truth for both live pipeline and backtest.

IMPORTANT: This module is the canonical implementation of composite-score signal
generation. Both SignalGenerator (live) and BacktestEngine (backtest) MUST use
these functions. Any change here affects both.

History:
  - v1-v2: Separate implementations in signal_generator.py and engine.py (diverged)
  - v3: Unified into this module to ensure backtest == live
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from ta.momentum import RSIIndicator
from ta.trend import MACD
from ta.volatility import BollingerBands


def analyze_composite(
    symbol: str,
    df: pd.DataFrame,
    *,
    # Signal settings
    rsi_period: int = 14,
    rsi_oversold: float = 30.0,
    rsi_overbought: float = 70.0,
    macd_fast: int = 12,
    macd_slow: int = 26,
    macd_signal: int = 9,
    bb_period: int = 20,
    bb_std: float = 2.0,
    # Weights
    weight_rsi: float = 0.15,
    weight_macd: float = 0.25,
    weight_bollinger: float = 0.15,
    weight_trend: float = 0.25,
    weight_volume: float = 0.20,
    # Thresholds
    score_buy_threshold: float = 0.3,
    score_sell_threshold: float = -0.5,
    # Stop loss / Take profit
    stop_loss_atr: float = 2.5,
    take_profit_atr: float = 6.0,
    atr_period: int = 14,
    # Filters
    trend_filter: bool = True,
    require_macd_crossover: bool = False,
    macd_crossover_lookback: int = 3,
    timeframe: str = "1Day",
    min_bars: int = 50,
) -> dict[str, Any] | None:
    """
    Composite-score signal analysis — shared between live and backtest.

    Computes a weighted composite score from RSI, MACD, Bollinger Bands,
    trend (SMA), and volume indicators. Generates BUY/SELL signals when
    the score exceeds configurable thresholds.

    Returns a plain dict with signal data, or None if no signal.
    The caller is responsible for wrapping into their model type.

    Returns dict keys:
        symbol, action ("BUY"/"SELL"), score, confidence,
        entry_price, stop_loss, take_profit, rationale,
        indicators (dict with raw indicator values for debugging)
    """
    try:
        close = df["close"]
        high = df["high"]
        low = df["low"]
        volume = df["volume"]
        current_price = float(close.iloc[-1])

        if len(df) < min_bars:
            return None

        # --- Trend filter ---
        # Daily: SMA200 structural uptrend filter
        # Hourly: SMA50 short-term trend filter (200 hourly bars ≈ 30 days ≠ SMA200 daily)
        if trend_filter:
            if timeframe == "1Day" and len(close) >= 200:
                sma_trend = float(close.tail(200).mean())
                if current_price < sma_trend:
                    return None
            elif timeframe == "1Hour" and len(close) >= 50:
                sma_trend = float(close.tail(50).mean())
                if current_price < sma_trend:
                    return None

        # --- Volume (computed early for hard gate filters) ---
        avg_vol_20 = float(volume.tail(20).mean())
        recent_vol = float(volume.tail(3).mean())
        vol_ratio = recent_vol / max(avg_vol_20, 1)

        # --- RSI ---
        rsi = RSIIndicator(close, window=rsi_period)
        rsi_series = rsi.rsi()
        rsi_value = float(rsi_series.iloc[-1])
        rsi_prev_value = float(rsi_series.iloc[-2])

        if np.isnan(rsi_value):
            return None

        # RSI momentum confirmation: RSI must be turning UP when oversold.
        rsi_rising = rsi_value > rsi_prev_value

        if rsi_value < rsi_oversold:
            rsi_score = 0.8 if rsi_rising else 0.2
        elif rsi_value > rsi_overbought:
            rsi_score = -0.8
        else:
            rsi_score = (50 - rsi_value) / 50 * 0.5  # Linear scale

        # --- MACD ---
        macd_ind = MACD(
            close,
            window_slow=macd_slow,
            window_fast=macd_fast,
            window_sign=macd_signal,
        )
        macd_line = macd_ind.macd().iloc[-1]
        signal_line = macd_ind.macd_signal().iloc[-1]
        macd_prev = macd_ind.macd().iloc[-2]
        signal_prev = macd_ind.macd_signal().iloc[-2]

        if np.isnan(macd_line) or np.isnan(signal_line):
            return None

        # Crossover detection — check last N bars for crossover
        bullish_crossover = False
        bearish_crossover = False
        macd_series = macd_ind.macd()
        signal_series = macd_ind.macd_signal()

        for lookback in range(1, macd_crossover_lookback + 1):
            if len(macd_series) > lookback + 1:
                prev_m = float(macd_series.iloc[-(lookback + 1)])
                prev_s = float(signal_series.iloc[-(lookback + 1)])
                curr_m = float(macd_series.iloc[-lookback])
                curr_s = float(signal_series.iloc[-lookback])
                if not np.isnan(prev_m) and not np.isnan(curr_m):
                    if prev_m < prev_s and curr_m > curr_s:
                        bullish_crossover = True
                    elif prev_m > prev_s and curr_m < curr_s:
                        bearish_crossover = True

        # Hard gate mode: when require_macd_crossover=True, apply strict entry filters
        # matching the validated backtest approach (AND logic, not weighted OR).
        if require_macd_crossover:
            if not bullish_crossover and not bearish_crossover:
                return None  # No crossover — no entry
            # RSI must be 25-65 (not overbought, not falling knife)
            if rsi_value > 65 or rsi_value < 25:
                return None
            # Price must be above SMA50 (medium-term uptrend)
            sma_50_filter = float(close.tail(50).mean()) if len(close) >= 50 else 0
            if sma_50_filter > 0 and current_price < sma_50_filter:
                return None
            # Volume must not be declining (>= 80% of 20-bar average)
            if vol_ratio < 0.8:
                return None

        if bullish_crossover:
            macd_score = 0.9  # Bullish crossover
        elif bearish_crossover:
            macd_score = -0.9  # Bearish crossover
        else:
            macd_score = 0.3 if macd_line > signal_line else -0.3

        # --- Bollinger Bands ---
        bb = BollingerBands(close, window=bb_period, window_dev=bb_std)
        bb_upper = float(bb.bollinger_hband().iloc[-1])
        bb_lower = float(bb.bollinger_lband().iloc[-1])
        bb_mid = float(bb.bollinger_mavg().iloc[-1])

        if current_price <= bb_lower:
            bb_score = 0.7
        elif current_price >= bb_upper:
            bb_score = -0.7
        else:
            bb_range = bb_upper - bb_lower
            bb_score = (bb_mid - current_price) / bb_range if bb_range > 0 else 0.0

        # --- Trend (SMA) ---
        sma_20 = float(close.tail(20).mean())
        sma_50 = float(close.tail(50).mean()) if len(close) >= 50 else sma_20

        if current_price > sma_20 > sma_50:
            trend_score = 0.8  # Strong uptrend
        elif current_price > sma_20:
            trend_score = 0.4  # Moderate uptrend
        elif current_price < sma_20 < sma_50:
            trend_score = -0.8  # Strong downtrend
        else:
            trend_score = -0.3  # Weak

        # --- Volume score (vol_ratio already computed above) ---
        if vol_ratio > 1.5:
            vol_score = 0.6
        elif vol_ratio > 1.0:
            vol_score = 0.3
        else:
            vol_score = -0.2

        # --- Composite Score ---
        score = (
            rsi_score * weight_rsi
            + macd_score * weight_macd
            + bb_score * weight_bollinger
            + trend_score * weight_trend
            + vol_score * weight_volume
        )

        # Determine action
        if require_macd_crossover:
            # Hard gate mode: all filters already passed above.
            # MACD crossover + RSI 25-65 + price > SMA50 + volume OK = guaranteed entry.
            # Score is used only for confidence (position sizing quality).
            if bullish_crossover:
                action = "BUY"
            elif bearish_crossover:
                action = "SELL"
            else:
                return None
            confidence = max(min(abs(score), 1.0), 0.3)
        else:
            # Soft mode: composite score determines entry (used by live intraday pipeline)
            if score > score_buy_threshold:
                action = "BUY"
            elif score < score_sell_threshold:
                action = "SELL"
            else:
                return None  # HOLD
            confidence = min(abs(score), 1.0)

        # ATR for stop loss / take profit
        atr = calculate_atr(high, low, close, period=atr_period)

        if action == "BUY":
            entry_price = current_price
            stop_loss = round(entry_price - (atr * stop_loss_atr), 2)
            take_profit = round(entry_price + (atr * take_profit_atr), 2)
        else:
            entry_price = current_price
            stop_loss = round(entry_price + (atr * stop_loss_atr), 2)
            take_profit = round(entry_price - (atr * take_profit_atr), 2)

        # Rationale
        rationale = build_rationale(rsi_value, macd_score, bb_score, trend_score, vol_ratio)

        return {
            "symbol": symbol,
            "action": action,
            "score": round(score, 3),
            "confidence": round(confidence, 3),
            "entry_price": round(entry_price, 2),
            "stop_loss": stop_loss,
            "take_profit": take_profit,
            "rationale": rationale,
            "atr": round(atr, 4),
            "indicators": {
                "rsi": round(rsi_value, 1),
                "rsi_score": round(rsi_score, 3),
                "macd_score": round(macd_score, 3),
                "bb_score": round(bb_score, 3),
                "trend_score": round(trend_score, 3),
                "vol_score": round(vol_score, 3),
                "vol_ratio": round(vol_ratio, 2),
            },
        }

    except Exception:
        return None


def calculate_atr(
    high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14
) -> float:
    """Calculate Average True Range."""
    tr = pd.concat(
        [
            high - low,
            (high - close.shift(1)).abs(),
            (low - close.shift(1)).abs(),
        ],
        axis=1,
    ).max(axis=1)
    return float(tr.tail(period).mean())


def analyze_mean_reversion_v3(
    symbol: str,
    df_intraday: pd.DataFrame,
    df_daily: pd.DataFrame | None = None,
    *,
    # RSI / BB / volume intraday params
    rsi_period: int = 14,
    rsi_entry: float = 28.0,
    bb_period: int = 20,
    bb_std: float = 2.0,
    volume_avg: int = 20,
    volume_mult: float = 1.5,
    atr_period: int = 14,
    # Stop loss / take profit
    stop_loss_atr: float = 1.0,
    take_profit_atr: float = 1.5,
    # Daily filter — the core v3 addition
    daily_filter_enabled: bool = True,
    daily_sma_period: int = 20,
    daily_trend_strict: bool = True,
    # Signal quality
    min_confidence: float = 0.4,
    min_rr: float = 1.0,
    # Time filter (UTC hours)
    time_filter_start_utc: int = 14,
    time_filter_end_utc: int = 20,
    min_bars: int = 60,
) -> dict[str, Any] | None:
    """
    Mean Reversion v3 — dual-timeframe daily filter.

    The critical improvement over v2: before generating a 15-min mean reversion
    signal, we check the DAILY timeframe to ensure the broader trend is bullish.
    This eliminates "falling knife" trades during multi-day selloffs.

    v2 problem: RSI(14) < 28 + BB lower band on 15-min → buy even during daily
    downtrends → 39.6% win rate, Sharpe -69.

    v3 fix: Add daily SMA(20) filter. Only enter mean reversion trades when the
    daily close is ABOVE the daily SMA(20), confirming an uptrend context.

    Args:
        symbol: Ticker.
        df_intraday: 15-min OHLCV bars (DatetimeIndex, tz-aware).
        df_daily: Daily OHLCV bars (DatetimeIndex). If None, daily filter skipped.
        daily_filter_enabled: If True and df_daily provided, reject signals
            when daily close < daily SMA(daily_sma_period).
        daily_sma_period: SMA period for daily trend detection.
        daily_trend_strict: If True, require price > SMA. If False, allow
            price within 0.5% below SMA (near-trend).

    Returns:
        dict with signal data or None.
    """
    try:
        close = df_intraday["close"]
        high = df_intraday["high"]
        low = df_intraday["low"]
        volume = df_intraday["volume"]
        current_price = float(close.iloc[-1])

        if len(df_intraday) < min_bars:
            return None

        # ── DAILY TREND FILTER (v3 core) ──────────────────────────────
        daily_regime = "unknown"
        if daily_filter_enabled and df_daily is not None and len(df_daily) >= daily_sma_period:
            daily_close = float(df_daily["close"].iloc[-1])
            daily_sma = float(df_daily["close"].tail(daily_sma_period).mean())

            if daily_trend_strict:
                if daily_close < daily_sma:
                    return None  # Daily downtrend → reject signal
                daily_regime = "bullish"
            else:
                # Relaxed: allow within 0.5% below SMA
                tolerance = daily_sma * 0.005
                if daily_close < (daily_sma - tolerance):
                    return None
                daily_regime = "bullish" if daily_close >= daily_sma else "near_bullish"

        # ── TIME FILTER ───────────────────────────────────────────────
        last_ts = df_intraday.index[-1]
        if hasattr(last_ts, "hour"):
            try:
                ts_utc = (
                    last_ts.tz_convert("UTC")
                    if getattr(last_ts, "tzinfo", None) is not None
                    else last_ts
                )
                utc_hour = ts_utc.hour
                if utc_hour < time_filter_start_utc or utc_hour >= time_filter_end_utc:
                    return None
            except Exception:
                pass

        # ── RSI: must be oversold ─────────────────────────────────────
        rsi_indicator = RSIIndicator(close, window=rsi_period)
        rsi_series = rsi_indicator.rsi()
        rsi_value = float(rsi_series.iloc[-1])
        if np.isnan(rsi_value) or rsi_value >= rsi_entry:
            return None

        # ── Bollinger Bands: price must touch or breach lower band ────
        bb = BollingerBands(close, window=bb_period, window_dev=bb_std)
        bb_lower = float(bb.bollinger_lband().iloc[-1])
        bb_mid = float(bb.bollinger_mavg().iloc[-1])
        if np.isnan(bb_lower) or np.isnan(bb_mid):
            return None
        if current_price > bb_lower * 1.002:
            return None

        # ── Volume spike confirmation ─────────────────────────────────
        avg_vol = float(volume.tail(volume_avg).mean())
        current_bar_vol = float(volume.iloc[-1])
        if current_bar_vol < avg_vol * volume_mult:
            return None

        # ── ATR ───────────────────────────────────────────────────────
        tr = pd.concat([
            high - low,
            (high - close.shift(1)).abs(),
            (low - close.shift(1)).abs(),
        ], axis=1).max(axis=1)
        atr = float(tr.tail(atr_period).mean())
        if atr <= 0 or np.isnan(atr):
            return None

        # ── Stop loss / Take profit ───────────────────────────────────
        stop_loss = round(current_price - (atr * stop_loss_atr), 2)

        bb_gain_pct = (bb_mid - current_price) / current_price
        if bb_gain_pct >= 0.003:
            take_profit = round(bb_mid, 2)
        else:
            take_profit = round(current_price + (atr * take_profit_atr), 2)

        # ── Minimum R:R ───────────────────────────────────────────────
        reward = take_profit - current_price
        risk = current_price - stop_loss
        if risk <= 0 or reward <= 0 or reward / risk < min_rr:
            return None

        # ── Confidence scoring ────────────────────────────────────────
        bb_depth = max((bb_lower - current_price) / max(atr, 0.01), 0.0)
        rsi_depth = (rsi_entry - rsi_value) / rsi_entry
        vol_ratio = current_bar_vol / max(avg_vol, 1)

        # v3 bonus: daily trend confirmation boosts confidence
        daily_bonus = 0.1 if daily_regime == "bullish" else 0.0

        confidence = min(
            0.4
            + (bb_depth * 0.2)
            + (rsi_depth * 0.25)
            + min((vol_ratio - volume_mult) * 0.1, 0.15)
            + daily_bonus,
            1.0,
        )
        confidence = max(confidence, 0.4)

        if confidence < min_confidence:
            return None

        return {
            "symbol": symbol,
            "action": "BUY",
            "score": round(confidence, 3),
            "confidence": round(confidence, 3),
            "entry_price": round(current_price, 2),
            "stop_loss": stop_loss,
            "take_profit": take_profit,
            "atr": round(atr, 4),
            "daily_regime": daily_regime,
            "indicators": {
                "rsi": round(rsi_value, 1),
                "bb_lower": round(bb_lower, 2),
                "bb_mid": round(bb_mid, 2),
                "vol_ratio": round(vol_ratio, 2),
                "daily_regime": daily_regime,
            },
        }

    except Exception:
        return None


def analyze_slope_volume(
    symbol: str,
    df: pd.DataFrame,
    *,
    lookback_bars: int = 5,
    slope_threshold_pct: float = 0.05,
    volume_multiplier: float = 1.5,
    volume_ma_period: int = 20,
    stop_loss_atr: float = 1.5,
    take_profit_atr: float = 3.0,
    atr_period: int = 14,
    market_open_utc: str = "14:30",
    market_close_utc: str = "20:00",
    min_bars: int = 30,
    timeframe: str = "5Min",
    require_reversal: bool = True,
    bypass_volume_check: bool = False,
    # --- Wave detection: 3-factor entry gate ---
    acceleration_bars: int = 5,
    min_acceleration_pct: float = 0.002,
    volume_trend_bars: int = 5,
    persistence_bars: int = 5,
    # --- Contrarian mode: fade the wave ---
    contrarian: bool = False,
    # --- Anticipatory mode: enter on deceleration (wave losing steam) ---
    anticipatory: bool = False,
) -> dict[str, Any] | None:
    """
    Wave-detection intraday signal analysis (3-factor entry).

    Detects real market waves by requiring THREE simultaneous confirmations:

    1. ANGLE (slope + acceleration): the slope must be significant AND growing
       in magnitude — the wave is accelerating, not decelerating.
    2. VOLUME (growing volume): volume must be trending UP over the last N bars,
       not just above average on a single bar. Real moves attract growing interest.
    3. PERSISTENCE: the slope must have been in the same direction for M
       consecutive bars. This filters out noise oscillations that flip every minute.

    All 3 must be true simultaneously for entry. This eliminates the vast majority
    of noise-driven signals that plagued the original single-threshold approach.

    Args:
        symbol: Ticker symbol (e.g. "SPY").
        df: OHLCV DataFrame with DatetimeIndex (tz-aware preferred) or
            a "timestamp" column. Must have columns: open, high, low, close, volume.
        lookback_bars: Number of bars for OLS slope regression window.
        slope_threshold_pct: Minimum absolute slope in % of price per bar to trigger.
        volume_multiplier: Minimum volume ratio vs MA (existing baseline check).
        volume_ma_period: Period for volume moving average.
        stop_loss_atr: Stop loss distance in ATR units.
        take_profit_atr: Take profit distance in ATR units.
        atr_period: Period for ATR calculation.
        market_open_utc: Only generate signals after this UTC time (HH:MM).
        market_close_utc: Only generate signals before this UTC time (HH:MM).
        min_bars: Minimum bars required in df before generating any signal.
        timeframe: Bar timeframe string, informational (e.g. "1Min").
        require_reversal: If True, require slope to have been in the opposite direction
            before the persistence window (confirms a reversal preceded the wave).
            If False, only the 3 factors are checked (trend-continuation mode).
        bypass_volume_check: If True, skip volume gates entirely (for instruments
            where the data provider doesn't return reliable volume).
        acceleration_bars: How many bars back to measure slope change (acceleration).
        min_acceleration_pct: Min slope increase (% per bar) over acceleration window.
        volume_trend_bars: Bars for volume OLS trend regression (must be growing).
        persistence_bars: Min consecutive bars with slope in the same direction.

    Returns:
        dict with signal data (symbol, action, score, confidence, entry_price,
        stop_loss, take_profit, rationale, indicators) or None if no signal.
    """
    import datetime as dt
    from numpy.lib.stride_tricks import sliding_window_view

    try:
        if len(df) < min_bars:
            return None

        close = df["close"]
        high = df["high"]
        low = df["low"]
        volume = df["volume"]
        current_price = float(close.iloc[-1])

        # --- Time filter (optional) ---
        open_h, open_m = map(int, market_open_utc.split(":"))
        close_h, close_m = map(int, market_close_utc.split(":"))
        _always_on = (open_h == 0 and open_m == 0 and close_h == 23 and close_m == 59)

        if not _always_on:
            if isinstance(df.index, pd.DatetimeIndex):
                last_ts = df.index[-1]
            else:
                last_ts = pd.Timestamp(df["timestamp"].iloc[-1])

            if getattr(last_ts, "tzinfo", None) is not None:
                last_ts_utc = last_ts.tz_convert("UTC")
            else:
                last_ts_utc = last_ts

            bar_time = last_ts_utc.time() if hasattr(last_ts_utc, "time") else None
            if bar_time is not None:
                open_time = dt.time(open_h, open_m)
                close_time = dt.time(close_h, close_m)
                if not (open_time <= bar_time <= close_time):
                    return None

        # --- ATR ---
        tr = pd.concat([
            high - low,
            (high - close.shift(1)).abs(),
            (low - close.shift(1)).abs(),
        ], axis=1).max(axis=1)
        atr = float(tr.tail(atr_period).mean())
        if atr <= 0 or np.isnan(atr):
            return None

        # --- Vectorized rolling slopes ---
        # Compute OLS slope for every overlapping window of `lookback_bars` in one pass.
        # This gives us the slope at every bar position — needed for acceleration
        # and persistence checks without repeated per-bar computation.
        total_needed = lookback_bars + max(acceleration_bars, persistence_bars)
        if len(close) < total_needed:
            return None

        close_arr = close.values.astype(float)
        windows = sliding_window_view(close_arr, lookback_bars)
        # windows shape: (n - lookback_bars + 1, lookback_bars)

        x = np.arange(lookback_bars, dtype=float)
        x_mean = x.mean()
        x_dev = x - x_mean
        x_var = float(np.sum(x_dev ** 2))
        if x_var == 0:
            return None

        y_means = windows.mean(axis=1)
        cov = np.sum((windows - y_means[:, np.newaxis]) * x_dev, axis=1)
        slopes_raw = cov / x_var

        # Normalize each slope as % of price at the end of that window
        prices_at_end = close_arr[lookback_bars - 1:]
        safe_prices = np.where(prices_at_end > 0, prices_at_end, 1.0)
        slope_pcts = (slopes_raw / safe_prices) * 100

        current_slope = float(slope_pcts[-1])

        # ===================================================================
        # CRITERION 1: ANGLE — slope significant AND accelerating
        # ===================================================================
        slope_significant = abs(current_slope) >= slope_threshold_pct

        # Acceleration: how much the slope changed over the last `acceleration_bars`.
        # Positive acceleration = slope growing in the current direction.
        if len(slope_pcts) > acceleration_bars:
            prev_slope = float(slope_pcts[-(acceleration_bars + 1)])
            acceleration = current_slope - prev_slope
        else:
            acceleration = 0.0

        if anticipatory:
            # Anticipatory mode: detect DECELERATION (wave losing steam).
            # Slope is still in one direction but acceleration is OPPOSITE = slowing down.
            if current_slope > 0:
                # Wave up decelerating: acceleration is negative (slope shrinking)
                acceleration_ok = acceleration <= -min_acceleration_pct
            elif current_slope < 0:
                # Wave down decelerating: acceleration is positive (slope becoming less negative)
                acceleration_ok = acceleration >= min_acceleration_pct
            else:
                acceleration_ok = False
        else:
            if current_slope > 0:
                # BUY candidate: slope positive AND growing (acceleration positive)
                acceleration_ok = acceleration >= min_acceleration_pct
            elif current_slope < 0:
                # SHORT candidate: slope negative AND getting more negative
                acceleration_ok = acceleration <= -min_acceleration_pct
            else:
                acceleration_ok = False

        # ===================================================================
        # CRITERION 2: VOLUME — trending UP (not just a single bar spike)
        # ===================================================================
        vol_arr = volume.values.astype(float)
        avg_volume = float(volume.tail(volume_ma_period).mean())
        last_volume = float(volume.iloc[-1])
        vol_ratio = last_volume / max(avg_volume, 1)
        volume_above_avg = vol_ratio >= volume_multiplier

        # Volume trend: OLS regression on volume over last N bars
        volume_growing = True  # default if bypassed or insufficient data
        if not bypass_volume_check and avg_volume > 0 and len(vol_arr) >= volume_trend_bars:
            vol_recent = vol_arr[-volume_trend_bars:]
            vx = np.arange(volume_trend_bars, dtype=float)
            vx_mean = vx.mean()
            vx_dev = vx - vx_mean
            vx_var = float(np.sum(vx_dev ** 2))
            if vx_var > 0:
                vy_mean = float(vol_recent.mean())
                vol_cov = float(np.sum(vx_dev * (vol_recent - vy_mean)))
                vol_slope = vol_cov / vx_var
                volume_growing = vol_slope > 0

        if bypass_volume_check or avg_volume == 0:
            volume_ok = True  # skip both checks
        else:
            volume_ok = volume_above_avg and volume_growing

        # ===================================================================
        # CRITERION 3: PERSISTENCE — slope same direction for M consecutive bars
        # ===================================================================
        persistent_count = 0
        n_slopes = len(slope_pcts)
        for i in range(min(persistence_bars, n_slopes)):
            s = float(slope_pcts[-(i + 1)])
            if current_slope > 0 and s > 0:
                persistent_count += 1
            elif current_slope < 0 and s < 0:
                persistent_count += 1
            else:
                break  # direction changed — consecutive streak broken
        # Anticipatory mode: lower persistence threshold (wave just needs to exist,
        # not be fully confirmed — we're catching it as it weakens).
        effective_persistence = max(3, persistence_bars // 2) if anticipatory else persistence_bars
        persistence_ok = persistent_count >= effective_persistence

        # ===================================================================
        # ENTRY DECISION — all 3 criteria must pass
        # ===================================================================
        if require_reversal:
            # Reversal mode: additionally confirm that slope was in the opposite
            # direction just before the persistence window started. This means a
            # reversal happened at the beginning of the persistent wave.
            reversal_idx = persistence_bars + 1  # how far back to check
            if n_slopes > reversal_idx:
                prior_slope = float(slope_pcts[-(reversal_idx)])
                if current_slope > 0:
                    reversal_ok = prior_slope <= 0
                else:
                    reversal_ok = prior_slope >= 0
            else:
                reversal_ok = False
            has_signal = (
                slope_significant
                and acceleration_ok
                and volume_ok
                and persistence_ok
                and reversal_ok
            )
        else:
            # Trend-continuation mode: 3 factors only, no reversal needed.
            has_signal = (
                slope_significant
                and acceleration_ok
                and volume_ok
                and persistence_ok
            )

        action = "BUY" if current_slope > 0 else "SHORT"

        if not has_signal:
            return None

        # --- Contrarian / Anticipatory: fade the wave ---
        # Contrarian: wave confirmed (3-factor) but we bet it's exhausted → invert.
        # Anticipatory: wave is decelerating → enter against it early.
        # Both modes invert the action.
        if contrarian or anticipatory:
            action = "SHORT" if action == "BUY" else "BUY"

        # --- Price levels ---
        _min_sl = 0.02
        if action == "BUY":
            stop_loss = current_price - max(stop_loss_atr * atr, _min_sl)
            take_profit = current_price + (take_profit_atr * atr)
        else:
            stop_loss = current_price + max(stop_loss_atr * atr, _min_sl)
            take_profit = current_price - (take_profit_atr * atr)

        # --- Confidence: weighted across all 3 factors ---
        slope_score = min(abs(current_slope) / (slope_threshold_pct * 3), 1.0)
        accel_score = min(abs(acceleration) / (min_acceleration_pct * 3), 1.0)
        if not bypass_volume_check and avg_volume > 0:
            v_score = min(max(vol_ratio - 1, 0) / max(volume_multiplier, 0.01), 1.0)
        else:
            v_score = 0.5
        persist_score = min(persistent_count / max(persistence_bars * 1.5, 1), 1.0)

        confidence = round(
            0.35 + 0.2 * slope_score + 0.2 * accel_score + 0.15 * v_score + 0.1 * persist_score,
            3,
        )
        confidence = max(0.5, min(confidence, 1.0))

        # --- Rationale ---
        vol_note = "bypassed" if (bypass_volume_check or avg_volume == 0) else (
            f"{'UP' if volume_growing else 'DOWN'} trend, {vol_ratio:.1f}x avg"
        )
        mode_tag = "ANTIC" if anticipatory else ("FADE" if contrarian else "WAVE")
        rationale = (
            f"{mode_tag} {action}: slope {current_slope:.4f}%/bar (>{slope_threshold_pct}%), "
            f"accel {'+' if acceleration >= 0 else ''}{acceleration:.4f}%/bar "
            f"(min {'+' if current_slope > 0 else '-'}{min_acceleration_pct}%), "
            f"vol {vol_note}, "
            f"persistent {persistent_count}/{persistence_bars} bars. "
            f"ATR {atr:.4f}, SL {stop_loss:.4f}, TP {take_profit:.4f}."
        )

        return {
            "symbol": symbol,
            "action": action,
            "score": round(current_slope, 4),
            "confidence": confidence,
            "entry_price": round(current_price, 4),
            "stop_loss": round(stop_loss, 4),
            "take_profit": round(take_profit, 4),
            "rationale": rationale,
            "indicators": {
                "slope_pct": round(current_slope, 4),
                "slope_prev_pct": round(prev_slope if len(slope_pcts) > acceleration_bars else 0.0, 4),
                "acceleration_pct": round(acceleration, 4),
                "slope_angle": round(float(np.degrees(np.arctan(current_slope))), 1),
                "vol_ratio": round(vol_ratio, 2),
                "volume_growing": bool(volume_growing) if not bypass_volume_check else True,
                "persistent_bars": persistent_count,
                "atr": round(atr, 4),
                "lookback_bars": lookback_bars,
            },
        }

    except Exception as exc:
        import structlog as _sl
        _sl.get_logger().warning("analyze_slope_volume_error", symbol=symbol, error=str(exc))
        return None


def get_current_slope_direction(
    df: pd.DataFrame,
    *,
    lookback_bars: int = 5,
    slope_threshold_pct: float = 0.05,
) -> str:
    """
    Returns the current slope direction for an open position exit check.

    Used by SignalGenerator to detect adverse slope on existing positions,
    even when no reversal (entry) signal is generated by analyze_slope_volume.

    Returns:
        "positive" – slope is above +threshold (bullish momentum).
        "negative" – slope is below -threshold (bearish momentum).
        "flat"     – slope is within ±threshold (no clear direction).
    """
    try:
        close = df["close"]
        if len(close) < lookback_bars:
            return "flat"
        current_price = float(close.iloc[-1])
        if current_price <= 0:
            return "flat"

        y = close.tail(lookback_bars).values
        x = np.arange(len(y), dtype=float)
        x_mean, y_mean = x.mean(), y.mean()
        denom = float(np.sum((x - x_mean) ** 2))
        if denom == 0:
            return "flat"
        slope_raw = float(np.sum((x - x_mean) * (y - y_mean)) / denom)
        slope_pct = (slope_raw / current_price) * 100

        if slope_pct > slope_threshold_pct:
            return "positive"
        elif slope_pct < -slope_threshold_pct:
            return "negative"
        return "flat"
    except Exception:
        return "flat"


def get_current_slope_info(
    df: pd.DataFrame,
    *,
    lookback_bars: int = 5,
    slope_threshold_pct: float = 0.05,
    acceleration_bars: int = 5,
) -> dict:
    """
    Returns current slope direction, magnitude, and acceleration.

    Used by SignalGenerator for diagnostics and adverse-exit decisions.

    Returns dict with:
        direction: "positive" | "negative" | "flat"
        slope_pct: float  (OLS slope normalized as % of price per bar)
        angle_deg: float  (atan(slope_pct) in degrees — visual representation)
        acceleration_pct: float  (change in slope over acceleration_bars)
        accelerating: bool  (slope is growing in the direction of the trend)
    """
    _flat = {"direction": "flat", "slope_pct": 0.0, "angle_deg": 0.0,
             "acceleration_pct": 0.0, "accelerating": False}
    try:
        close = df["close"]
        if len(close) < lookback_bars:
            return _flat
        current_price = float(close.iloc[-1])
        if current_price <= 0:
            return _flat

        # Helper: compute OLS slope on a window
        def _ols_slope_pct(arr: np.ndarray) -> float:
            x = np.arange(len(arr), dtype=float)
            x_mean = x.mean()
            denom = float(np.sum((x - x_mean) ** 2))
            if denom == 0:
                return 0.0
            y_mean = arr.mean()
            slope_raw = float(np.sum((x - x_mean) * (arr - y_mean)) / denom)
            return (slope_raw / current_price) * 100

        slope_pct = _ols_slope_pct(close.tail(lookback_bars).values)
        angle_deg = float(np.degrees(np.arctan(slope_pct)))

        # Acceleration
        acceleration_pct = 0.0
        accelerating = False
        if len(close) >= lookback_bars + acceleration_bars:
            prev_end = len(close) - acceleration_bars
            prev_start = prev_end - lookback_bars
            prev_slope = _ols_slope_pct(close.iloc[prev_start:prev_end].values)
            acceleration_pct = slope_pct - prev_slope
            if slope_pct > 0:
                accelerating = acceleration_pct > 0
            elif slope_pct < 0:
                accelerating = acceleration_pct < 0

        if slope_pct > slope_threshold_pct:
            direction = "positive"
        elif slope_pct < -slope_threshold_pct:
            direction = "negative"
        else:
            direction = "flat"

        return {
            "direction": direction,
            "slope_pct": round(slope_pct, 4),
            "angle_deg": round(angle_deg, 1),
            "acceleration_pct": round(acceleration_pct, 4),
            "accelerating": accelerating,
        }
    except Exception:
        return _flat


def build_rationale(
    rsi: float,
    macd_score: float,
    bb_score: float,
    trend_score: float,
    vol_ratio: float,
) -> str:
    """Build human-readable rationale for the signal."""
    parts: list[str] = []

    if rsi < 30:
        parts.append(f"RSI oversold ({rsi:.0f})")
    elif rsi > 70:
        parts.append(f"RSI overbought ({rsi:.0f})")

    if abs(macd_score) > 0.5:
        direction = "bullish" if macd_score > 0 else "bearish"
        parts.append(f"MACD {direction} crossover")

    if abs(bb_score) > 0.3:
        position = "lower band" if bb_score > 0 else "upper band"
        parts.append(f"near Bollinger {position}")

    if abs(trend_score) > 0.5:
        trend = "uptrend" if trend_score > 0 else "downtrend"
        parts.append(f"strong {trend}")

    if vol_ratio > 1.5:
        parts.append(f"volume surge {vol_ratio:.1f}x")

    return " + ".join(parts) if parts else "Composite signal"


# ---------------------------------------------------------------------------
# Noise Boundary Momentum (Zarattini-Aziz-Barbon 2024)
# ---------------------------------------------------------------------------


def precompute_noise_boundaries(
    df: pd.DataFrame,
    lookback_days: int = 14,
    band_mult: float = 1.0,
    trade_freq_bars: int = 6,
    atr_period: int = 14,
) -> pd.DataFrame:
    """
    Precompute noise boundaries for the Zarattini-Aziz-Barbon (2024) strategy.

    For each bar, computes:
    - UB: upper noise boundary = max(day_open, prev_close) × (1 + band_mult × sigma_open)
    - LB: lower noise boundary = min(day_open, prev_close) × (1 - band_mult × sigma_open)
    - vwap: intraday VWAP (resets daily)
    - sigma_open: 14-day rolling mean of move_open at the same bar-of-day, lagged by 1
    - nb_signal: +1 (long), -1 (short), 0 (inside noise zone)
    - is_checkpoint: True at trade_freq_bars intervals (30-min checkpoints on 5Min bars)
    - atr: Average True Range

    No look-ahead bias: sigma_open only uses data from previous days.

    Reference: "Beat the Market: An Effective Intraday Momentum Strategy for S&P500 ETF (SPY)"
    """
    result = df.copy()

    # --- Date and bar-of-day ---
    result["_date"] = result.index.date
    result["bar_of_day"] = result.groupby("_date").cumcount()

    # --- Day open (first bar's open each day) ---
    day_opens = result.groupby("_date")["open"].first()
    result["_day_open"] = result["_date"].map(day_opens)

    # --- Previous day's close (last bar's close of prior day) ---
    day_closes = result.groupby("_date")["close"].last()
    prev_closes = day_closes.shift(1)
    result["_prev_close"] = result["_date"].map(prev_closes)

    # --- move_open = abs(close / day_open - 1) ---
    result["_move_open"] = (result["close"] / result["_day_open"] - 1).abs()

    # --- sigma_open: rolling 14-day mean per bar-of-day, lagged by 1 day ---
    result["sigma_open"] = result.groupby("bar_of_day")["_move_open"].transform(
        lambda g: g.rolling(window=lookback_days, min_periods=max(lookback_days - 1, 1)).mean().shift(1)
    )

    # --- Upper / Lower boundaries ---
    ref_high = np.maximum(
        result["_day_open"],
        result["_prev_close"].fillna(result["_day_open"]),
    )
    ref_low = np.minimum(
        result["_day_open"],
        result["_prev_close"].fillna(result["_day_open"]),
    )
    result["UB"] = ref_high * (1 + band_mult * result["sigma_open"])
    result["LB"] = ref_low * (1 - band_mult * result["sigma_open"])

    # --- VWAP (intraday, resets daily) ---
    hlc3 = (result["high"] + result["low"] + result["close"]) / 3
    result["_vol_price"] = result["volume"] * hlc3
    result["_cum_vol"] = result.groupby("_date")["volume"].cumsum()
    result["_cum_vol_price"] = result.groupby("_date")["_vol_price"].cumsum()
    result["vwap"] = result["_cum_vol_price"] / result["_cum_vol"].replace(0, np.nan)

    # --- ATR ---
    tr = pd.concat(
        [
            result["high"] - result["low"],
            (result["high"] - result["close"].shift(1)).abs(),
            (result["low"] - result["close"].shift(1)).abs(),
        ],
        axis=1,
    ).max(axis=1)
    result["atr"] = tr.rolling(window=atr_period).mean()

    # --- Checkpoint flag (30-min intervals) ---
    # Skip bar 0 (market just opened, no VWAP data)
    result["is_checkpoint"] = (result["bar_of_day"] > 0) & (
        result["bar_of_day"] % trade_freq_bars == 0
    )

    # --- Vectorized NB signal ---
    mask_valid = result["UB"].notna() & result["LB"].notna() & result["vwap"].notna()
    mask_long = mask_valid & (result["close"] > result["UB"]) & (result["close"] > result["vwap"])
    mask_short = mask_valid & (result["close"] < result["LB"]) & (result["close"] < result["vwap"])
    result["nb_signal"] = 0
    result.loc[mask_long, "nb_signal"] = 1
    result.loc[mask_short, "nb_signal"] = -1

    # --- Realized volatility (20-day rolling, annualized) ---
    # Used for volatility-targeted position sizing (Zarattini paper: target 15% annual vol)
    daily_close = result.groupby("_date")["close"].last()
    daily_returns = daily_close.pct_change()
    rolling_vol = daily_returns.rolling(window=20, min_periods=10).std() * np.sqrt(252)
    result["realized_vol"] = result["_date"].map(rolling_vol)

    # --- Cleanup temp columns ---
    result.drop(
        columns=[c for c in result.columns if c.startswith("_")],
        inplace=True,
    )

    return result


def evaluate_noise_boundary_signal(
    close: float, ub: float, lb: float, vwap: float
) -> int:
    """
    Evaluate a single noise boundary signal.

    Returns:
        +1 = LONG  (close > UB and close > VWAP — breakout above noise zone)
        -1 = SHORT (close < LB and close < VWAP — breakdown below noise zone)
         0 = no signal (inside noise zone)
    """
    if np.isnan(ub) or np.isnan(lb) or np.isnan(vwap):
        return 0
    if close > ub and close > vwap:
        return 1
    elif close < lb and close < vwap:
        return -1
    return 0
