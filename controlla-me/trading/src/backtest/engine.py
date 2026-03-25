"""
Backtest Engine — Bar-by-bar simulation with NO look-ahead bias.

Signal on bar T -> fill on bar T+1 open + slippage.
Supports both daily and hourly timeframes with calibrated indicator periods.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from enum import StrEnum

import numpy as np
import pandas as pd
import structlog
from pydantic import BaseModel, Field
from ta.momentum import RSIIndicator
from ta.trend import MACD
from ta.volatility import BollingerBands

from ..analysis import (
    analyze_composite,
    analyze_mean_reversion_v3,
    analyze_slope_volume,
    precompute_noise_boundaries,
)
from ..config.settings import RiskSettings, SignalSettings

logger = structlog.get_logger()

# Hours per trading day (US markets: 9:30-16:00 = 6.5h)
HOURS_PER_DAY = 6.5


# ---------------------------------------------------------------------------
# Timeframe-aware indicator settings
# ---------------------------------------------------------------------------

# Daily settings (standard)
DAILY_INDICATOR_PERIODS = {
    "rsi_period": 14,
    "macd_fast": 12,
    "macd_slow": 26,
    "macd_signal": 9,
    "sma_short": 20,
    "sma_medium": 50,
    "sma_long": 200,
    "volume_avg": 20,
    "atr_period": 14,
    "crossover_lookback": 3,
    "min_bars": 50,
    "warmup_bars": 60,
}

# Hourly settings (daily × 6.5, rounded)
HOURLY_INDICATOR_PERIODS = {
    "rsi_period": 91,       # 14 × 6.5
    "macd_fast": 78,        # 12 × 6.5
    "macd_slow": 169,       # 26 × 6.5
    "macd_signal": 59,      # 9 × 6.5
    "sma_short": 130,       # 20 × 6.5
    "sma_medium": 325,      # 50 × 6.5
    "sma_long": 1300,       # 200 × 6.5
    "volume_avg": 130,      # 20 × 6.5
    "atr_period": 91,       # 14 × 6.5
    "crossover_lookback": 7,  # ~1 day of hourly bars
    "min_bars": 325,        # Need SMA medium history
    "warmup_bars": 390,     # 60 days × 6.5 hours
}

# 5-Minute settings — slope+volume intraday strategy on SPY
# 1 trading day = 78 bars (9:30–16:00, 390 min / 5 min)
# Scaling note: indicator periods are NOT simply daily×78; for fast intraday
# signals we keep RSI/ATR at 14 bars (70 minutes) and scale only trend SMAs.
FIVEMIN_INDICATOR_PERIODS = {
    "rsi_period": 14,        # 14 bars × 5 min = 70 minutes — short-term momentum
    "macd_fast": 8,          # Faster MACD for intraday responsiveness
    "macd_slow": 21,
    "macd_signal": 5,
    "sma_short": 10,         # 10 bars = 50 minutes
    "sma_medium": 26,        # 26 bars = 130 minutes (~2h)
    "sma_long": 78,          # 78 bars ≈ 1 full trading day
    "volume_avg": 20,        # 20-bar volume baseline (100 minutes)
    "atr_period": 14,        # 70-minute ATR
    "crossover_lookback": 2,
    "min_bars": 30,          # Minimum bars before generating any signal
    "warmup_bars": 40,       # ~3h 20min of 5-min bars (warm-up buffer)
}

# 15-minute settings — intraday mean reversion on sector ETFs
# 1 trading day = 26 bars (9:30–16:00, 390 min / 15 min)
FIFTEEN_MIN_INDICATOR_PERIODS = {
    "rsi_period": 14,        # 14 bars × 15 min = 3.5 h — short-term momentum
    "macd_fast": 8,          # not primary trigger for MR, kept for compat
    "macd_slow": 21,
    "macd_signal": 5,
    "bb_period": 20,         # 20 bars × 15 min ≈ 5 h — intraday Bollinger
    "bb_std": 2.0,
    "sma_short": 20,         # ≈ 5 h
    "sma_medium": 52,        # ≈ 2 trading days
    "sma_long": 104,         # ≈ 4 trading days
    "volume_avg": 20,        # 20-bar volume baseline
    "atr_period": 14,        # 3.5 h ATR
    "crossover_lookback": 2,
    "min_bars": 60,          # need warmup for BB (20) + RSI (14) + buffer
    "warmup_bars": 104,      # 4 trading days
    # Mean reversion thresholds
    "rsi_entry": 28,         # enter when RSI < this (deeply oversold — fewer, better signals)
    "rsi_exit": 55,          # exit when RSI > this (mean-reverting up)
    "volume_mult": 1.5,      # require volume spike: recent bar > avg × mult
    "symbol_cooldown_bars": 13,  # bars to skip after stop loss (3.25 h — avoid falling knife)
}


def get_indicator_periods(timeframe: str = "1Day") -> dict:
    """Return indicator periods calibrated for the given timeframe."""
    if timeframe == "1Hour":
        return HOURLY_INDICATOR_PERIODS.copy()
    if timeframe == "15Min":
        return FIFTEEN_MIN_INDICATOR_PERIODS.copy()
    if timeframe == "5Min":
        return FIVEMIN_INDICATOR_PERIODS.copy()
    return DAILY_INDICATOR_PERIODS.copy()


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class TradeAction(StrEnum):
    BUY = "BUY"
    SELL = "SELL"
    SHORT = "SHORT"
    COVER = "COVER"


class CloseReason(StrEnum):
    STOP_LOSS = "stop_loss"
    TAKE_PROFIT = "take_profit"
    SIGNAL_EXIT = "signal_exit"
    SLOPE_EXIT = "slope_exit"              # slope reversal (long held, slope turned negative)
    ADVERSE_SLOPE_EXIT = "adverse_slope_exit"  # adverse slope without formal reversal
    NB_EXIT = "nb_exit"                  # noise boundary signal changed at checkpoint
    VWAP_EXIT = "vwap_exit"              # price crossed VWAP (Maroy 2025 profit-taking)
    EOD_CLOSE = "eod_close"              # intraday hard close at 15:30 ET
    END_OF_BACKTEST = "end_of_backtest"
    KILL_SWITCH = "kill_switch"


class BacktestConfig(BaseModel):
    """Configuration for a backtest run."""

    start: date
    end: date
    initial_capital: float = 100_000.0
    slippage_bps: float = 4.0  # basis points
    commission_per_share: float = 0.0  # Alpaca is commission-free
    max_positions: int = 10
    max_position_pct: float = 10.0  # % of portfolio
    max_loss_per_trade_pct: float = 1.0  # % of portfolio risked per trade
    daily_loss_limit_pct: float = -2.0  # kill switch
    weekly_loss_limit_pct: float = -5.0  # kill switch
    warmup_bars: int | None = None  # Auto-calculated from timeframe if None
    train_test_split: float | None = None  # e.g. 0.7 for 70/30
    signal_threshold: float = 0.3  # composite score threshold for BUY/SELL
    stop_loss_atr: float = 2.0  # stop loss ATR multiplier (Cycle 4 winner: 2.0 — balanced SL, was 1.5 in Cycle 4 grid default)
    take_profit_atr: float = 4.0  # take profit ATR multiplier (Cycle 4 winner: 4.0 — reachable TP, was 6.0 in Cycle 3)
    trend_filter: bool = True  # require price > SMA long for BUY signals
    timeframe: str = "1Day"  # "1Day", "1Hour", or "15Min"
    strategy: str = "trend_following"  # "trend_following", "mean_reversion", "mean_reversion_v3", "slope_volume", or "noise_boundary"

    # Daily filter for mean reversion v3 (dual-timeframe)
    daily_filter_enabled: bool = True  # Require daily uptrend for MR v3 entries
    daily_sma_period: int = 20  # SMA period for daily trend filter
    daily_trend_strict: bool = True  # Strict: price > SMA. False: allow 0.5% tolerance

    # Trailing stop parameters — 4-tier system (configurable for grid search)
    # Tier 0: Move SL to entry (breakeven) after this ATR profit
    trailing_breakeven_atr: float = 1.5  # Cycle 4 winner: 1.5 — don't breakeven too early
    # Tier 1: Lock small profit (entry + lock_cushion) after this ATR profit
    trailing_lock_atr: float = 1.5
    trailing_lock_cushion_atr: float = 0.5  # Cushion above entry for profit lock
    # Tier 2: Start trailing at highest_close - trail_distance after this ATR profit
    trailing_trail_threshold_atr: float = 3.5  # Cycle 4 winner: trail later
    trailing_trail_distance_atr: float = 2.0  # Cycle 4 winner: wider trail
    # Tier 3: Tight trail at highest_close - tight_distance after this ATR profit
    trailing_tight_threshold_atr: float = 4.0
    trailing_tight_distance_atr: float = 1.0

    # Signal exit: close positions on MACD bearish crossover
    signal_exit_enabled: bool = True  # Enable MACD bearish crossover exits (Cycle 4 winner: enabled)

    # Slope exit: close positions when slope turns adverse (for slope_volume strategy)
    # Mirrors the live exit logic in signal_generator.py (slope reversal + adverse exit)
    slope_exit_enabled: bool = True  # Auto-enabled for slope_volume strategy
    slope_exit_lookback_bars: int = 5  # OLS regression lookback (same as entry)
    slope_exit_threshold_pct: float = 0.01  # Minimum slope to be considered significant

    # Slope entry parameters (passed through to analyze_slope_volume)
    slope_lookback_bars: int = 10  # OLS regression lookback for entry signal
    slope_threshold_pct: float = 0.01  # Min slope % to trigger entry
    slope_volume_multiplier: float = 1.5  # Volume vs MA ratio for confirmation
    slope_volume_ma_period: int = 20  # MA period for volume baseline

    # Wave detection: 3-factor entry gate for slope_volume strategy
    slope_acceleration_bars: int = 5  # Bars back to measure slope acceleration
    slope_min_acceleration_pct: float = 0.01  # Min slope growth % for entry (tightened from 0.002)
    slope_volume_trend_bars: int = 5  # Bars for volume trend regression
    slope_persistence_bars: int = 8  # Consecutive bars with same slope direction (tightened from 5)
    slope_contrarian: bool = False  # Fade the wave: invert BUY↔SHORT after 3-factor confirmation
    slope_anticipatory: bool = False  # Enter on wave deceleration (early mean-reversion)

    # Noise Boundary Momentum params (Zarattini-Aziz-Barbon 2024)
    nb_band_mult: float = 1.0  # Noise boundary width multiplier (1.0 = paper default)
    nb_lookback_days: int = 14  # Rolling window for sigma_open (trading days)
    nb_trade_freq_bars: int = 6  # Signal evaluation interval in bars (6 × 5min = 30min)
    nb_safety_sl_atr: float = 3.0  # Wide crash-protection SL (primary exit is signal change)
    nb_last_entry_utc: int = 19  # Last UTC hour for new NB entries (19 = 3PM ET, avoids late EOD closes)

    # NB Enhancement 1: Volatility-targeted sizing (paper uses ~15% target annual vol)
    nb_vol_sizing: bool = False  # Enable vol-targeted position sizing
    nb_vol_target_pct: float = 15.0  # Target annualized volatility (%)
    nb_vol_max_leverage: float = 4.0  # Cap leverage to prevent extreme sizing

    # NB Enhancement 2: VIX regime filter (momentum when VIX > threshold, skip when VIX < threshold)
    nb_vix_filter: bool = False  # Enable VIX regime filtering
    nb_vix_threshold: float = 20.0  # VIX threshold: trade momentum above, skip entries below

    # NB Enhancement 3: VWAP-based exit (Maroy 2025 improvement — profit-taking on VWAP cross)
    nb_vwap_exit: bool = False  # Enable VWAP exit for NB positions

    # NB Enhancement 4: VWAP trailing stop (Maroy 2025 — replaces nb_exit with dynamic trailing)
    # Long: trailing_stop = max(VWAP, UB). Short: trailing_stop = min(VWAP, LB).
    # This lets winners run and only exits when price reverts to VWAP/boundary.
    nb_vwap_trailing: bool = False  # Enable VWAP trailing stop (replaces nb_exit)

    # NB Enhancement 5: Minimum hold time (bars) — suppress exits before min_hold elapses
    nb_min_hold_bars: int = 0  # 0 = disabled. 12 = 60min on 5Min bars. Prevents premature exits.

    # Signal settings (override defaults if needed)
    signal: SignalSettings = Field(default_factory=SignalSettings)
    risk: RiskSettings = Field(default_factory=RiskSettings)

    model_config = {"arbitrary_types_allowed": True}

    def effective_warmup_bars(self) -> int:
        """Return warmup bars, auto-calculated from timeframe if not set."""
        if self.warmup_bars is not None:
            return self.warmup_bars
        periods = get_indicator_periods(self.timeframe)
        return periods["warmup_bars"]


class TradeRecord(BaseModel):
    """Record of a completed trade."""

    symbol: str
    action: TradeAction
    entry_date: str
    entry_price: float
    exit_date: str
    exit_price: float
    shares: int
    pnl: float
    pnl_pct: float
    hold_days: int
    close_reason: CloseReason
    stop_loss: float
    take_profit: float
    signal_score: float
    signal_confidence: float


@dataclass
class OpenPosition:
    """Tracks an open position during simulation."""

    symbol: str
    shares: int
    entry_price: float
    entry_date: str
    stop_loss: float
    take_profit: float
    signal_score: float
    signal_confidence: float
    cost_basis: float = 0.0
    initial_stop_loss: float = 0.0
    highest_close: float = 0.0  # For long trailing stop (tracks max)
    lowest_close: float = 0.0   # For short trailing stop (tracks min)
    atr_at_entry: float = 0.0  # ATR when trade was opened
    direction: int = 1  # +1 long, -1 short
    entry_bar_idx: int = 0  # bar index when position was opened (for min hold time)

    def __post_init__(self) -> None:
        self.cost_basis = self.shares * self.entry_price
        self.initial_stop_loss = self.stop_loss
        self.highest_close = self.entry_price
        self.lowest_close = self.entry_price


@dataclass
class PendingOrder:
    """Order queued for next bar execution."""

    symbol: str
    action: TradeAction
    shares: int
    stop_loss: float
    take_profit: float
    signal_score: float
    signal_confidence: float
    close_reason: CloseReason = CloseReason.SIGNAL_EXIT  # reason for exit orders


class BacktestResult(BaseModel):
    """Complete result of a backtest run."""

    config: BacktestConfig
    trades: list[TradeRecord]
    equity_curve: list[dict]  # [{date, equity, cash, positions_value, drawdown_pct}]
    daily_returns: list[float]
    total_bars: int
    signals_generated: int
    orders_filled: int
    kill_switch_triggered: bool = False
    kill_switch_date: str | None = None

    model_config = {"arbitrary_types_allowed": True}


# ---------------------------------------------------------------------------
# Signal Analysis — timeframe-aware indicators
# ---------------------------------------------------------------------------

@dataclass
class SignalResult:
    """Lightweight signal result for backtesting."""

    symbol: str
    action: str  # "BUY", "SELL", or "SHORT"
    score: float
    confidence: float
    entry_price: float
    stop_loss: float
    take_profit: float


def analyze_stock(
    symbol: str,
    df: pd.DataFrame,
    settings: SignalSettings,
    threshold: float = 0.3,
    stop_loss_atr: float = 2.0,
    take_profit_atr: float = 4.0,
    trend_filter: bool = True,
    timeframe: str = "1Day",
) -> SignalResult | None:
    """
    Run technical analysis on a single stock.

    v3: Uses the shared composite-score analysis from src.analysis.
    This ensures backtest and live pipeline use IDENTICAL signal logic.

    Args:
        symbol: Stock ticker.
        df: OHLCV DataFrame.
        settings: Signal settings (indicator parameters).
        threshold: Score threshold for BUY signal.
        stop_loss_atr: ATR multiplier for stop loss.
        take_profit_atr: ATR multiplier for take profit.
        trend_filter: If True, apply SMA trend filter.
        timeframe: "1Day" or "1Hour".

    Returns:
        SignalResult or None if no signal.
    """
    result = analyze_composite(
        symbol,
        df,
        rsi_period=settings.rsi_period,
        rsi_oversold=settings.rsi_oversold,
        rsi_overbought=settings.rsi_overbought,
        macd_fast=settings.macd_fast,
        macd_slow=settings.macd_slow,
        macd_signal=settings.macd_signal,
        bb_period=settings.bb_period,
        bb_std=settings.bb_std,
        weight_rsi=settings.weight_rsi,
        weight_macd=settings.weight_macd,
        weight_bollinger=settings.weight_bollinger,
        weight_trend=settings.weight_trend,
        weight_volume=settings.weight_volume,
        score_buy_threshold=threshold,
        score_sell_threshold=-0.5,
        stop_loss_atr=stop_loss_atr,
        take_profit_atr=take_profit_atr,
        trend_filter=trend_filter,
        require_macd_crossover=True,  # Hard gate: only enter on MACD crossover
        macd_crossover_lookback=3,
        timeframe=timeframe,
    )

    if result is None:
        return None

    return SignalResult(
        symbol=result["symbol"],
        action=result["action"],
        score=result["score"],
        confidence=result["confidence"],
        entry_price=result["entry_price"],
        stop_loss=result["stop_loss"],
        take_profit=result["take_profit"],
    )


def analyze_stock_slope_volume(
    symbol: str,
    df: pd.DataFrame,
    lookback_bars: int = 5,
    slope_threshold_pct: float = 0.05,
    volume_multiplier: float = 1.5,
    volume_ma_period: int = 20,
    stop_loss_atr: float = 1.5,
    take_profit_atr: float = 3.0,
    atr_period: int = 14,
    # Wave detection: 3-factor entry gate
    acceleration_bars: int = 5,
    min_acceleration_pct: float = 0.002,
    volume_trend_bars: int = 5,
    persistence_bars: int = 5,
    # Contrarian: fade the wave
    contrarian: bool = False,
    # Anticipatory: enter on wave deceleration
    anticipatory: bool = False,
) -> SignalResult | None:
    """
    Wrapper around analyze_slope_volume() that returns a SignalResult.

    Bridges the live-trading dict output to the backtesting SignalResult dataclass.
    Market-hours filter is disabled (backtest data is already market-hours only).
    """
    result = analyze_slope_volume(
        symbol,
        df,
        lookback_bars=lookback_bars,
        slope_threshold_pct=slope_threshold_pct,
        volume_multiplier=volume_multiplier,
        volume_ma_period=volume_ma_period,
        stop_loss_atr=stop_loss_atr,
        take_profit_atr=take_profit_atr,
        atr_period=atr_period,
        # Disable time-of-day filter in backtest — data is already market-hours only
        market_open_utc="00:00",
        market_close_utc="23:59",
        timeframe="5Min",
        # Trend-continuation mode for backtest (no reversal needed, 3-factor gate)
        require_reversal=False,
        # Wave detection params
        acceleration_bars=acceleration_bars,
        min_acceleration_pct=min_acceleration_pct,
        volume_trend_bars=volume_trend_bars,
        persistence_bars=persistence_bars,
        # Contrarian / Anticipatory mode
        contrarian=contrarian,
        anticipatory=anticipatory,
    )
    if result is None:
        return None
    return SignalResult(
        symbol=result["symbol"],
        action=result["action"],
        score=result["score"],
        confidence=result["confidence"],
        entry_price=result["entry_price"],
        stop_loss=result["stop_loss"],
        take_profit=result["take_profit"],
    )


def analyze_stock_mean_reversion(
    symbol: str,
    df: pd.DataFrame,
    settings: SignalSettings,
    threshold: float = 0.4,
    stop_loss_atr: float = 1.0,
    take_profit_atr: float = 1.5,
    trend_filter: bool = False,  # ignored — mean reversion is direction-neutral
    timeframe: str = "15Min",
) -> SignalResult | None:
    """
    Intraday mean reversion signal on 15-minute bars (sector ETFs).

    Entry conditions (ALL must be true):
    1. RSI(14) < 35 (oversold — intraday dip)
    2. Price <= lower Bollinger Band (20, 2σ)
    3. Volume on current bar > 1.5x 20-bar average (volume spike)
    4. Time filter: 10:30-15:00 ET (UTC 14-19h) — avoids opening noise and EOD risk

    Exit:
    - TP: middle Bollinger Band (mean reversion target = SMA 20)
    - SL: entry - ATR × stop_loss_atr (tight downside protection)
    - Hard EOD close at 15:30 ET handled by engine, not here

    Args:
        symbol: ETF ticker.
        df: OHLCV DataFrame with DatetimeIndex.
        settings: Signal settings (kept for interface compatibility, not used).
        threshold: Minimum confidence score to generate signal.
        stop_loss_atr: ATR multiplier for stop loss (default 1.0 = tight).
        take_profit_atr: Backup TP multiplier if BB mid is too close.
        trend_filter: Ignored for mean reversion.
        timeframe: Must be "15Min".

    Returns:
        SignalResult or None if no signal.
    """
    try:
        periods = get_indicator_periods(timeframe)

        close = df["close"]
        high = df["high"]
        low = df["low"]
        volume = df["volume"]
        current_price = float(close.iloc[-1])

        if len(df) < periods["min_bars"]:
            return None

        # --- Time filter: allow 10:30-15:00 ET only ---
        # Alpaca timestamps are UTC-aware. 10:30 ET = 14:30 UTC (EDT) or 15:30 UTC (EST)
        # 15:00 ET = 19:00 UTC (EDT) or 20:00 UTC (EST)
        # Conservative range: UTC 14-19 (safe for both EDT and EST)
        last_ts = df.index[-1]
        if hasattr(last_ts, "hour"):
            try:
                ts_utc = (
                    last_ts.tz_convert("UTC")
                    if getattr(last_ts, "tzinfo", None) is not None
                    else last_ts
                )
                utc_hour = ts_utc.hour
                if utc_hour < 14 or utc_hour >= 20:
                    return None  # Outside allowed trading window
            except Exception:
                pass  # If timezone handling fails, don't filter

        # --- RSI: must be oversold ---
        rsi_indicator = RSIIndicator(close, window=periods["rsi_period"])
        rsi_series = rsi_indicator.rsi()
        rsi_value = float(rsi_series.iloc[-1])
        if np.isnan(rsi_value) or rsi_value >= periods["rsi_entry"]:
            return None  # Not oversold enough

        # --- Bollinger Bands: price must touch or breach lower band ---
        bb = BollingerBands(close, window=periods["bb_period"], window_dev=periods["bb_std"])
        bb_lower = float(bb.bollinger_lband().iloc[-1])
        bb_mid = float(bb.bollinger_mavg().iloc[-1])
        if np.isnan(bb_lower) or np.isnan(bb_mid):
            return None
        # Allow a small tolerance (0.2%) above lower band
        if current_price > bb_lower * 1.002:
            return None

        # --- Volume spike confirmation ---
        avg_vol = float(volume.tail(periods["volume_avg"]).mean())
        current_bar_vol = float(volume.iloc[-1])
        if current_bar_vol < avg_vol * periods["volume_mult"]:
            return None  # No volume confirmation

        # --- ATR for stop loss ---
        tr = pd.concat([
            high - low,
            (high - close.shift(1)).abs(),
            (low - close.shift(1)).abs(),
        ], axis=1).max(axis=1)
        atr = float(tr.tail(periods["atr_period"]).mean())
        if atr <= 0 or np.isnan(atr):
            return None

        # --- Stop loss: ATR-based below entry ---
        stop_loss = round(current_price - (atr * stop_loss_atr), 2)

        # --- Take profit: BB middle band (mean reversion to SMA20) ---
        bb_gain_pct = (bb_mid - current_price) / current_price
        if bb_gain_pct >= 0.003:  # at least 0.3% to TP target
            take_profit = round(bb_mid, 2)
        else:
            take_profit = round(current_price + (atr * take_profit_atr), 2)

        # Minimum R:R = 1.0
        reward = take_profit - current_price
        risk = current_price - stop_loss
        if risk <= 0 or reward <= 0 or reward / risk < 1.0:
            return None

        # --- Confidence: depth below lower band + RSI depth + volume spike ---
        bb_depth = max((bb_lower - current_price) / max(atr, 0.01), 0.0)
        rsi_depth = (periods["rsi_entry"] - rsi_value) / periods["rsi_entry"]  # 0-1
        vol_ratio = current_bar_vol / max(avg_vol, 1)
        confidence = min(
            0.4
            + (bb_depth * 0.2)
            + (rsi_depth * 0.25)
            + min((vol_ratio - periods["volume_mult"]) * 0.1, 0.15),
            1.0,
        )
        confidence = max(confidence, 0.4)

        if confidence < threshold:
            return None

        return SignalResult(
            symbol=symbol,
            action="BUY",
            score=round(confidence, 3),
            confidence=round(confidence, 3),
            entry_price=round(current_price, 2),
            stop_loss=stop_loss,
            take_profit=take_profit,
        )

    except Exception:
        return None


def analyze_stock_mean_reversion_v3(
    symbol: str,
    df_intraday: pd.DataFrame,
    df_daily: pd.DataFrame | None,
    settings: SignalSettings,
    config: BacktestConfig,
) -> SignalResult | None:
    """
    Mean Reversion v3 wrapper for backtest engine.

    Uses the shared analyze_mean_reversion_v3 from src.analysis, passing
    the daily data slice for the corresponding trading day.

    Args:
        symbol: Ticker.
        df_intraday: 15-min bars sliced up to current bar (no look-ahead).
        df_daily: Daily bars sliced up to the trading day of current bar.
        settings: Signal settings.
        config: Backtest config with daily filter params.

    Returns:
        SignalResult or None.
    """
    periods = get_indicator_periods("15Min")

    result = analyze_mean_reversion_v3(
        symbol,
        df_intraday,
        df_daily,
        rsi_period=periods["rsi_period"],
        rsi_entry=periods["rsi_entry"],
        bb_period=periods["bb_period"],
        bb_std=periods["bb_std"],
        volume_avg=periods["volume_avg"],
        volume_mult=periods["volume_mult"],
        atr_period=periods["atr_period"],
        stop_loss_atr=config.stop_loss_atr,
        take_profit_atr=config.take_profit_atr,
        daily_filter_enabled=config.daily_filter_enabled,
        daily_sma_period=config.daily_sma_period,
        daily_trend_strict=config.daily_trend_strict,
        min_confidence=config.signal_threshold,
        min_bars=periods["min_bars"],
    )

    if result is None:
        return None

    return SignalResult(
        symbol=result["symbol"],
        action=result["action"],
        score=result["score"],
        confidence=result["confidence"],
        entry_price=result["entry_price"],
        stop_loss=result["stop_loss"],
        take_profit=result["take_profit"],
    )


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

class BacktestEngine:
    """Bar-by-bar backtesting engine with realistic simulation."""

    def __init__(self, config: BacktestConfig) -> None:
        self.config = config
        self._periods = get_indicator_periods(config.timeframe)
        self._positions: dict[str, OpenPosition] = {}
        self._pending_orders: list[PendingOrder] = []
        self._cash: float = config.initial_capital
        self._trades: list[TradeRecord] = []
        self._equity_curve: list[dict] = []
        self._daily_returns: list[float] = []
        self._signals_generated: int = 0
        self._orders_filled: int = 0
        self._kill_switch: bool = False
        self._kill_switch_date: str | None = None
        self._kill_switch_count: int = 0
        self._cooldown_until: int = 0  # bar_idx to resume trading after kill switch
        # Per-symbol cooldown after stop loss (15-min mean reversion only)
        self._symbol_stop_cooldown: dict[str, int] = {}
        self._prev_equity: float = config.initial_capital
        self._week_start_equity: float = config.initial_capital
        self._bar_count: int = 0

        # Precomputed noise boundary data (populated in run() for noise_boundary strategy)
        self._nb_data: dict[str, pd.DataFrame] = {}

        # VIX daily data for regime filtering (populated in run() if nb_vix_filter=True)
        self._vix_data: pd.DataFrame | None = None

        # Current bar index (used for min hold time tracking)
        self._current_bar_idx: int = 0

        # Intraday flags
        self._is_hourly = config.timeframe == "1Hour"
        self._is_fifteen_min = config.timeframe == "15Min"
        self._is_five_min = config.timeframe == "5Min"
        # 15-min: 26 bars/day × 5 days = 130 bars/week
        # 5-min:  78 bars/day × 5 days = 390 bars/week
        # Hourly: 6.5 bars/day × 5 days = ~33 bars/week
        if self._is_fifteen_min:
            self._cooldown_bars = 130   # 5 trading days
            self._week_bars = 130
        elif self._is_five_min:
            self._cooldown_bars = 390   # 5 trading days
            self._week_bars = 390
        elif self._is_hourly:
            self._cooldown_bars = 33
            self._week_bars = 33
        else:
            self._cooldown_bars = 5
            self._week_bars = 5

    def run(
        self,
        data: dict[str, pd.DataFrame],
        daily_data: dict[str, pd.DataFrame] | None = None,
    ) -> BacktestResult:
        """
        Run backtest on historical data.

        Args:
            data: dict[symbol, DataFrame] with OHLCV columns, DatetimeIndex.
            daily_data: Optional daily bars for dual-timeframe strategies (v3).

        Returns:
            BacktestResult with trades, equity curve, and metrics inputs.
        """
        self._daily_data = daily_data  # Store for use in _generate_signals

        # Precompute noise boundaries if using noise_boundary strategy
        if self.config.strategy == "noise_boundary":
            logger.info("precomputing_noise_boundaries", symbols=len(data))
            for symbol, df in data.items():
                self._nb_data[symbol] = precompute_noise_boundaries(
                    df,
                    lookback_days=self.config.nb_lookback_days,
                    band_mult=self.config.nb_band_mult,
                    trade_freq_bars=self.config.nb_trade_freq_bars,
                )
            logger.info("noise_boundaries_ready", symbols=len(self._nb_data))

        # Load VIX data for regime filtering (noise_boundary + nb_vix_filter)
        if self.config.strategy == "noise_boundary" and self.config.nb_vix_filter:
            self._load_vix_data()

        # Build aligned date index (union of all trading timestamps)
        all_dates = set()
        for df in data.values():
            all_dates.update(df.index)
        dates = sorted(all_dates)

        if not dates:
            logger.error("no_data_for_backtest")
            return self._build_result(0)

        # Optional train/test split
        if self.config.train_test_split:
            split_idx = int(len(dates) * self.config.train_test_split)
            train_dates = dates[:split_idx]
            test_dates = dates[split_idx:]
            logger.info(
                "train_test_split",
                train_bars=len(train_dates),
                test_bars=len(test_dates),
                split_date=str(dates[split_idx]),
            )
            # Run on test set only (train is warmup + parameter fitting)
            dates = test_dates

        total_bars = len(dates)
        warmup = self.config.effective_warmup_bars()

        logger.info(
            "backtest_start",
            start=str(dates[0]),
            end=str(dates[-1]),
            total_bars=total_bars,
            symbols=len(data),
            capital=self.config.initial_capital,
            timeframe=self.config.timeframe,
            warmup_bars=warmup,
        )

        # Track previous day for daily return calculation in hourly mode
        prev_day: str | None = None

        for bar_idx, current_date in enumerate(dates):
            self._current_bar_idx = bar_idx
            date_str = self._format_date(current_date)
            day_str = self._extract_day(current_date)

            # Step 1: Fill pending orders at this bar's open
            self._fill_pending_orders(data, current_date)

            # Step 2: Check stop-loss / take-profit on existing positions
            self._check_exits(data, current_date, date_str)

            # Step 2.2: Slope exit — close on adverse slope (slope_volume strategy only)
            if self.config.strategy == "slope_volume" and self.config.slope_exit_enabled:
                self._check_slope_exits(data, current_date, date_str)

            # Step 2.3: Signal exit — MACD bearish crossover closes positions
            if self.config.signal_exit_enabled:
                self._check_signal_exits(data, current_date, date_str)

            # Step 2.5: Hard EOD close for intraday strategies (no overnight holds)
            if (self._is_fifteen_min or self.config.strategy == "noise_boundary") and self._positions:
                self._check_eod_close(data, current_date, date_str)

            # Step 2.6: NB exit — close positions when signal changes at checkpoint
            if self.config.strategy == "noise_boundary" and self._positions:
                self._check_nb_exits(data, current_date, date_str)

            # Step 2.7: VWAP exit — profit-taking when price crosses VWAP (Maroy 2025)
            if self.config.strategy == "noise_boundary" and self.config.nb_vwap_exit and self._positions:
                self._check_vwap_exits(data, current_date, date_str)

            # Step 3: Check kill switch (daily/weekly loss limits)
            equity = self._calculate_equity(data, current_date)
            self._check_kill_switch(equity, date_str, bar_idx)
            if self._kill_switch:
                # Close all positions but DON'T stop the backtest — cooldown period
                self._close_all_positions(data, current_date, date_str, CloseReason.KILL_SWITCH)
                self._kill_switch = False  # Reset after closing positions
                self._cooldown_until = bar_idx + self._cooldown_bars
                self._kill_switch_count += 1

            # Step 4: Generate signals (only after warmup and not in cooldown)
            if bar_idx >= warmup and bar_idx >= self._cooldown_until:
                self._generate_signals(data, current_date, dates, bar_idx)

            # Step 5: Record equity
            equity = self._calculate_equity(data, current_date)

            # For hourly: only record equity curve at end of day (last bar of the day)
            # For daily: record every bar
            is_day_end = True
            if self._is_hourly:
                # Check if next bar is a different day
                next_idx = bar_idx + 1
                if next_idx < len(dates):
                    next_day = self._extract_day(dates[next_idx])
                    is_day_end = next_day != day_str

            if is_day_end:
                self._record_equity(day_str, equity, data, current_date)

            # Track returns per bar (for Sharpe calculation)
            if self._prev_equity > 0:
                bar_ret = (equity - self._prev_equity) / self._prev_equity
                self._daily_returns.append(bar_ret)
            self._prev_equity = equity

            # Weekly reset
            self._bar_count += 1
            if self._bar_count % self._week_bars == 0:
                self._week_start_equity = equity

        # Close remaining positions at end
        if self._positions:
            last_date = dates[-1]
            last_date_str = self._format_date(last_date)
            self._close_all_positions(data, last_date, last_date_str, CloseReason.END_OF_BACKTEST)

        final_eq = self._calculate_equity(data, dates[-1]) if dates else self._cash
        logger.info(
            "backtest_complete",
            trades=len(self._trades),
            final_equity=round(final_eq, 2),
            kill_switches=self._kill_switch_count,
            timeframe=self.config.timeframe,
        )

        return self._build_result(total_bars)

    # ------------------------------------------------------------------
    # Date helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _format_date(ts) -> str:
        """Format a timestamp to string."""
        if hasattr(ts, "strftime"):
            return ts.strftime("%Y-%m-%d %H:%M") if hasattr(ts, "hour") and ts.hour > 0 else ts.strftime("%Y-%m-%d")
        return str(ts)

    @staticmethod
    def _extract_day(ts) -> str:
        """Extract just the date part from a timestamp."""
        if hasattr(ts, "date"):
            return str(ts.date())
        return str(ts)[:10]

    # ------------------------------------------------------------------
    # Order filling
    # ------------------------------------------------------------------

    def _fill_pending_orders(self, data: dict[str, pd.DataFrame], current_date) -> None:
        """Fill pending orders at this bar's open + slippage."""
        orders_to_fill = self._pending_orders[:]
        self._pending_orders.clear()

        for order in orders_to_fill:
            if order.symbol not in data:
                continue

            df = data[order.symbol]
            if current_date not in df.index:
                continue

            bar = df.loc[current_date]
            open_price = float(bar["open"])

            # Apply slippage
            slippage = open_price * (self.config.slippage_bps / 10_000)
            if order.action == TradeAction.BUY:
                fill_price = open_price + slippage
            else:
                fill_price = open_price - slippage

            # Check if we can afford it / have the position
            if order.action == TradeAction.BUY:
                cost = order.shares * fill_price + (order.shares * self.config.commission_per_share)
                if cost > self._cash:
                    # Reduce shares to fit budget
                    order.shares = int(self._cash / (fill_price + self.config.commission_per_share))
                    if order.shares <= 0:
                        continue
                    cost = order.shares * fill_price + (order.shares * self.config.commission_per_share)

                if order.symbol in self._positions:
                    continue  # Already have a position

                self._cash -= cost
                date_str = self._format_date(current_date)
                # Recalculate SL/TP from ACTUAL fill price (not signal bar close).
                # Extract ATR from original signal's SL/TP spread, then anchor to fill.
                _sl_atr = self.config.stop_loss_atr
                _tp_atr = self.config.take_profit_atr
                if (_sl_atr + _tp_atr) > 0:
                    atr_at_entry = (order.take_profit - order.stop_loss) / (_sl_atr + _tp_atr)
                else:
                    atr_at_entry = 0
                recalc_sl = fill_price - max(_sl_atr * atr_at_entry, 0.02)
                recalc_tp = fill_price + (_tp_atr * atr_at_entry)
                self._positions[order.symbol] = OpenPosition(
                    symbol=order.symbol,
                    shares=order.shares,
                    entry_price=fill_price,
                    entry_date=date_str,
                    stop_loss=recalc_sl,
                    take_profit=recalc_tp,
                    signal_score=order.signal_score,
                    signal_confidence=order.signal_confidence,
                    atr_at_entry=atr_at_entry,
                    entry_bar_idx=self._current_bar_idx,
                )
                self._orders_filled += 1
                logger.debug(
                    "order_filled",
                    symbol=order.symbol,
                    action="BUY",
                    shares=order.shares,
                    price=round(fill_price, 2),
                )

            elif order.action == TradeAction.SELL:
                if order.symbol not in self._positions:
                    continue
                pos = self._positions[order.symbol]
                proceeds = pos.shares * fill_price - (pos.shares * self.config.commission_per_share)
                self._cash += proceeds
                date_str = self._format_date(current_date)
                self._record_trade(pos, fill_price, date_str, order.close_reason)
                del self._positions[order.symbol]
                self._orders_filled += 1

            elif order.action == TradeAction.SHORT:
                if order.symbol in self._positions:
                    continue  # Already have a position (long or short)

                # Short sell: receive cash from selling borrowed shares
                proceeds = order.shares * fill_price - (order.shares * self.config.commission_per_share)
                self._cash += proceeds
                date_str = self._format_date(current_date)
                # Recalculate SL/TP from fill price for SHORT (SL above, TP below)
                _sl_atr = self.config.stop_loss_atr
                _tp_atr = self.config.take_profit_atr
                if (_sl_atr + _tp_atr) > 0:
                    atr_at_entry = (order.stop_loss - order.take_profit) / (_sl_atr + _tp_atr)
                else:
                    atr_at_entry = 0
                recalc_sl = fill_price + max(_sl_atr * atr_at_entry, 0.02)
                recalc_tp = fill_price - (_tp_atr * atr_at_entry)
                self._positions[order.symbol] = OpenPosition(
                    symbol=order.symbol,
                    shares=order.shares,
                    entry_price=fill_price,
                    entry_date=date_str,
                    stop_loss=recalc_sl,
                    take_profit=recalc_tp,
                    signal_score=order.signal_score,
                    signal_confidence=order.signal_confidence,
                    atr_at_entry=atr_at_entry,
                    direction=-1,
                    entry_bar_idx=self._current_bar_idx,
                )
                self._orders_filled += 1
                logger.debug(
                    "order_filled",
                    symbol=order.symbol,
                    action="SHORT",
                    shares=order.shares,
                    price=round(fill_price, 2),
                )

            elif order.action == TradeAction.COVER:
                if order.symbol not in self._positions:
                    continue
                pos = self._positions[order.symbol]
                if pos.direction != -1:
                    continue  # Not a short position
                # Cover: buy back shares to close short
                cost = pos.shares * fill_price + (pos.shares * self.config.commission_per_share)
                self._cash -= cost
                date_str = self._format_date(current_date)
                self._record_trade(pos, fill_price, date_str, order.close_reason)
                del self._positions[order.symbol]
                self._orders_filled += 1

    # ------------------------------------------------------------------
    # Exit checks (stop-loss / take-profit using intrabar OHLCV)
    # ------------------------------------------------------------------

    def _check_exits(self, data: dict[str, pd.DataFrame], current_date, date_str: str) -> None:
        """Check stop-loss, take-profit, and optional trailing stop against intrabar prices.

        Handles both long (+1) and short (-1) positions with inverted SL/TP logic:
        - Long: SL hit when low <= stop_loss, TP hit when high >= take_profit
        - Short: SL hit when high >= stop_loss, TP hit when low <= take_profit
        """
        to_close: list[tuple[str, float, CloseReason]] = []

        for symbol, pos in self._positions.items():
            if symbol not in data:
                continue
            df = data[symbol]
            if current_date not in df.index:
                continue

            bar = df.loc[current_date]
            low = float(bar["low"])
            high = float(bar["high"])
            close_price = float(bar["close"])

            atr = pos.atr_at_entry

            if pos.direction == 1:
                # --- LONG trailing stop ---
                if close_price > pos.highest_close:
                    pos.highest_close = close_price

                if atr > 0:
                    profit_from_entry = pos.highest_close - pos.entry_price

                    if profit_from_entry > self.config.trailing_breakeven_atr * atr:
                        pos.stop_loss = max(pos.stop_loss, pos.entry_price)
                    if profit_from_entry > self.config.trailing_lock_atr * atr:
                        lock_stop = pos.entry_price + (atr * self.config.trailing_lock_cushion_atr)
                        pos.stop_loss = max(pos.stop_loss, lock_stop)
                    if profit_from_entry > self.config.trailing_trail_threshold_atr * atr:
                        trailing_stop = pos.highest_close - (atr * self.config.trailing_trail_distance_atr)
                        pos.stop_loss = max(pos.stop_loss, trailing_stop)
                    if profit_from_entry > self.config.trailing_tight_threshold_atr * atr:
                        tight_stop = pos.highest_close - (atr * self.config.trailing_tight_distance_atr)
                        pos.stop_loss = max(pos.stop_loss, tight_stop)

                # Long exit checks
                if low <= pos.stop_loss:
                    to_close.append((symbol, pos.stop_loss, CloseReason.STOP_LOSS))
                elif high >= pos.take_profit:
                    to_close.append((symbol, pos.take_profit, CloseReason.TAKE_PROFIT))

            else:
                # --- SHORT trailing stop ---
                # For shorts, track lowest close and move SL downward (min, not max)
                if close_price < pos.lowest_close:
                    pos.lowest_close = close_price

                if atr > 0:
                    profit_from_entry = pos.entry_price - pos.lowest_close

                    # Tier 0: Breakeven — move SL down to entry price
                    if profit_from_entry > self.config.trailing_breakeven_atr * atr:
                        pos.stop_loss = min(pos.stop_loss, pos.entry_price)
                    # Tier 1: Lock profit — SL below entry
                    if profit_from_entry > self.config.trailing_lock_atr * atr:
                        lock_stop = pos.entry_price - (atr * self.config.trailing_lock_cushion_atr)
                        pos.stop_loss = min(pos.stop_loss, lock_stop)
                    # Tier 2: Trail — follow lowest close upward at distance
                    if profit_from_entry > self.config.trailing_trail_threshold_atr * atr:
                        trailing_stop = pos.lowest_close + (atr * self.config.trailing_trail_distance_atr)
                        pos.stop_loss = min(pos.stop_loss, trailing_stop)
                    # Tier 3: Tight trail
                    if profit_from_entry > self.config.trailing_tight_threshold_atr * atr:
                        tight_stop = pos.lowest_close + (atr * self.config.trailing_tight_distance_atr)
                        pos.stop_loss = min(pos.stop_loss, tight_stop)

                # Short exit checks (inverted: SL above entry, TP below entry)
                if high >= pos.stop_loss:
                    to_close.append((symbol, pos.stop_loss, CloseReason.STOP_LOSS))
                elif low <= pos.take_profit:
                    to_close.append((symbol, pos.take_profit, CloseReason.TAKE_PROFIT))

        for symbol, exit_price, reason in to_close:
            pos = self._positions[symbol]
            commission = pos.shares * self.config.commission_per_share
            if pos.direction == 1:
                # Close long: sell shares → receive cash
                self._cash += pos.shares * exit_price - commission
            else:
                # Close short: buy back shares → spend cash
                self._cash -= pos.shares * exit_price + commission
            self._record_trade(pos, exit_price, date_str, reason)
            del self._positions[symbol]
            logger.debug(
                "position_closed",
                symbol=symbol,
                reason=reason.value,
                direction=pos.direction,
                exit_price=round(exit_price, 2),
            )
            # 15-min mean reversion: apply per-symbol cooldown after stop loss
            if self._is_fifteen_min and reason == CloseReason.STOP_LOSS:
                cooldown_periods = self._periods.get("symbol_cooldown_bars", 13)
                self._symbol_stop_cooldown[symbol] = self._bar_count + cooldown_periods

    # ------------------------------------------------------------------
    # Slope exit (mirrors live signal_generator.py slope reversal + adverse exit)
    # ------------------------------------------------------------------

    def _check_slope_exits(
        self, data: dict[str, pd.DataFrame], current_date, date_str: str
    ) -> None:
        """Check slope direction for open positions — close on adverse slope.

        Mirrors the live exit logic from signal_generator.py:
        Long positions:
          1. Slope reversal: positive → negative → SELL (SLOPE_EXIT)
          2. Adverse slope: negative without reversal → SELL (ADVERSE_SLOPE_EXIT)
        Short positions:
          1. Slope reversal: negative → positive → COVER (SLOPE_EXIT)
          2. Adverse slope: positive without reversal → COVER (ADVERSE_SLOPE_EXIT)
        """
        if not self.config.slope_exit_enabled or not self._positions:
            return

        lookback = self.config.slope_exit_lookback_bars
        threshold = self.config.slope_exit_threshold_pct

        to_exit: list[tuple[str, TradeAction, CloseReason]] = []

        for symbol, pos in self._positions.items():
            if symbol not in data:
                continue
            df = data[symbol]
            mask = df.index <= current_date
            df_slice = df[mask]

            if len(df_slice) < lookback * 2:
                continue

            close = df_slice["close"]
            current_price = float(close.iloc[-1])
            if current_price <= 0:
                continue

            # Current slope (OLS linear regression — same math as analyze_slope_volume)
            y_curr = close.tail(lookback).values
            x_curr = np.arange(len(y_curr), dtype=float)
            x_mean_c, y_mean_c = x_curr.mean(), y_curr.mean()
            denom_c = float(np.sum((x_curr - x_mean_c) ** 2))
            if denom_c == 0:
                continue
            slope_raw = float(
                np.sum((x_curr - x_mean_c) * (y_curr - y_mean_c)) / denom_c
            )
            slope_pct = (slope_raw / current_price) * 100

            # Previous slope (for reversal detection)
            y_prev = close.iloc[-(lookback * 2):-lookback].values
            x_prev = np.arange(len(y_prev), dtype=float)
            x_mean_p, y_mean_p = x_prev.mean(), y_prev.mean()
            denom_p = float(np.sum((x_prev - x_mean_p) ** 2))
            if denom_p == 0:
                continue
            slope_prev_raw = float(
                np.sum((x_prev - x_mean_p) * (y_prev - y_mean_p)) / denom_p
            )
            slope_prev_pct = (slope_prev_raw / current_price) * 100

            if pos.direction == 1:
                # Long position: exit if slope is adverse (negative)
                if slope_prev_pct > 0 and slope_pct < -threshold:
                    to_exit.append((symbol, TradeAction.SELL, CloseReason.SLOPE_EXIT))
                elif slope_pct < -threshold:
                    to_exit.append((symbol, TradeAction.SELL, CloseReason.ADVERSE_SLOPE_EXIT))
            else:
                # Short position: exit if slope is adverse (positive)
                if slope_prev_pct < 0 and slope_pct > threshold:
                    to_exit.append((symbol, TradeAction.COVER, CloseReason.SLOPE_EXIT))
                elif slope_pct > threshold:
                    to_exit.append((symbol, TradeAction.COVER, CloseReason.ADVERSE_SLOPE_EXIT))

        # Queue exit orders (filled next bar at open)
        for symbol, action, reason in to_exit:
            pos = self._positions[symbol]
            self._pending_orders.append(
                PendingOrder(
                    symbol=symbol,
                    action=action,
                    shares=pos.shares,
                    stop_loss=0,
                    take_profit=0,
                    signal_score=0,
                    signal_confidence=0,
                    close_reason=reason,
                )
            )
            logger.debug(
                "slope_exit_queued",
                symbol=symbol,
                action=action.value,
                reason=reason.value,
                direction=pos.direction,
                date=date_str,
            )

    # ------------------------------------------------------------------
    # Signal exit (MACD bearish crossover on open positions)
    # ------------------------------------------------------------------

    def _check_signal_exits(
        self, data: dict[str, pd.DataFrame], current_date, date_str: str
    ) -> None:
        """Queue SELL orders for positions where MACD has bearish crossover.

        Only active when config.signal_exit_enabled is True.
        Uses the same MACD parameters as entry signals for consistency.
        """
        if not self.config.signal_exit_enabled or not self._positions:
            return

        to_sell: list[str] = []

        for symbol, pos in self._positions.items():
            if symbol not in data:
                continue
            df = data[symbol]
            mask = df.index <= current_date
            df_slice = df[mask]

            min_bars = self._periods["min_bars"]
            if len(df_slice) < min_bars:
                continue

            try:
                close = df_slice["close"]

                # MACD bearish crossover detection
                macd_ind = MACD(
                    close,
                    window_slow=self._periods["macd_slow"],
                    window_fast=self._periods["macd_fast"],
                    window_sign=self._periods["macd_signal"],
                )
                macd_series = macd_ind.macd()
                signal_series = macd_ind.macd_signal()

                if len(macd_series) < 3:
                    continue

                # Check bearish crossover in last 2 bars
                lookback = self._periods.get("crossover_lookback", 3)
                for lb in range(1, min(lookback + 1, len(macd_series))):
                    prev_macd = float(macd_series.iloc[-(lb + 1)])
                    prev_signal = float(signal_series.iloc[-(lb + 1)])
                    curr_macd = float(macd_series.iloc[-lb])
                    curr_signal = float(signal_series.iloc[-lb])

                    if np.isnan(prev_macd) or np.isnan(curr_macd):
                        continue

                    # Bearish crossover: MACD was above signal, now below
                    if prev_macd > prev_signal and curr_macd < curr_signal:
                        to_sell.append(symbol)
                        break
            except Exception:
                continue

        # Queue SELL orders (will be filled next bar at open)
        for symbol in to_sell:
            pos = self._positions[symbol]
            self._pending_orders.append(
                PendingOrder(
                    symbol=symbol,
                    action=TradeAction.SELL,
                    shares=pos.shares,
                    stop_loss=0,
                    take_profit=0,
                    signal_score=0,
                    signal_confidence=0,
                )
            )
            logger.debug("signal_exit_queued", symbol=symbol, date=date_str)

    # ------------------------------------------------------------------
    # Signal generation
    # ------------------------------------------------------------------

    def _generate_signals(
        self, data: dict[str, pd.DataFrame], current_date, dates: list, bar_idx: int
    ) -> None:
        """Generate signals using data up to current_date (no look-ahead)."""
        if len(self._positions) >= self.config.max_positions:
            return  # At capacity

        # Macro filter: skip if SPY is below its SMA medium
        # (disabled for noise_boundary — NB can go short in downtrends)
        sma_medium_period = self._periods["sma_medium"]
        if self.config.trend_filter and self.config.strategy != "noise_boundary" and "SPY" in data:
            spy_df = data["SPY"]
            spy_mask = spy_df.index <= current_date
            spy_slice = spy_df[spy_mask]
            if len(spy_slice) >= sma_medium_period:
                spy_price = float(spy_slice["close"].iloc[-1])
                spy_sma = float(spy_slice["close"].tail(sma_medium_period).mean())
                if spy_price < spy_sma:
                    return  # Market in downtrend — sit out

        min_bars = self._periods["min_bars"]

        for symbol, full_df in data.items():
            if symbol in self._positions:
                continue  # Already have a position
            # 15-min: respect per-symbol stop-loss cooldown (avoid falling knives)
            if self._is_fifteen_min and self._bar_count < self._symbol_stop_cooldown.get(symbol, 0):
                continue
            if len(self._positions) + len(self._pending_orders) >= self.config.max_positions:
                break

            # Slice data up to and including current bar (NO look-ahead)
            mask = full_df.index <= current_date
            df_slice = full_df[mask]

            if len(df_slice) < min_bars:
                continue  # Not enough history for indicators

            # Analyze stock — route to appropriate strategy
            if self.config.strategy == "noise_boundary":
                # NB VIX regime filter: skip entries when VIX < threshold (low vol = no momentum edge)
                if self.config.nb_vix_filter:
                    vix_val = self._get_vix_for_date(current_date)
                    if vix_val is not None and vix_val < self.config.nb_vix_threshold:
                        continue  # Low vol regime — skip momentum entries

                # NB time filter: only trade during regular market hours
                # US market: 9:30-16:00 ET = 14:30-21:00 UTC (EST) / 13:30-20:00 (EDT)
                # Conservative: 14:00 to nb_last_entry_utc (default 19 = 3PM ET)
                # This avoids late entries that get force-closed at EOD (20:00 UTC)
                try:
                    _ts = (
                        current_date.tz_convert("UTC")
                        if getattr(current_date, "tzinfo", None) is not None
                        else current_date
                    )
                    if hasattr(_ts, "hour") and (
                        _ts.hour >= self.config.nb_last_entry_utc or _ts.hour < 14
                    ):
                        continue  # Outside entry window
                except Exception:
                    pass

                # Noise Boundary Momentum: only check at 30-min checkpoints
                nb_df = self._nb_data.get(symbol)
                if nb_df is None or current_date not in nb_df.index:
                    continue
                nb_row = nb_df.loc[current_date]
                if isinstance(nb_row, pd.DataFrame):
                    nb_row = nb_row.iloc[0]
                if not bool(nb_row.get("is_checkpoint", False)):
                    continue

                nb_sig = int(nb_row.get("nb_signal", 0))
                if nb_sig == 0:
                    continue

                close_price = float(nb_row["close"])
                atr_val = float(nb_row.get("atr", 0))
                if atr_val <= 0 or np.isnan(atr_val):
                    continue

                safety_sl = self.config.nb_safety_sl_atr
                if nb_sig == 1:
                    action_str = "BUY"
                    sl = close_price - safety_sl * atr_val
                    tp = close_price + 100 * atr_val  # effectively no TP
                else:
                    action_str = "SHORT"
                    sl = close_price + safety_sl * atr_val
                    tp = close_price - 100 * atr_val

                signal = SignalResult(
                    symbol=symbol,
                    action=action_str,
                    score=0.7,
                    confidence=0.7,
                    entry_price=close_price,
                    stop_loss=round(sl, 4),
                    take_profit=round(tp, 4),
                )

            elif self.config.strategy == "mean_reversion_v3":
                # v3: dual-timeframe — slice daily data up to current date
                daily_slice = None
                if self._daily_data and symbol in self._daily_data:
                    daily_df = self._daily_data[symbol]
                    # For 15-min bars, get the corresponding daily date
                    current_day = current_date.date() if hasattr(current_date, "date") else current_date
                    # Slice daily data up to the current trading day (no look-ahead)
                    # Handle tz-aware vs tz-naive comparison safely
                    try:
                        ts_day = pd.Timestamp(current_day)
                        if daily_df.index.tz is not None:
                            ts_day = ts_day.tz_localize(daily_df.index.tz)
                        daily_mask = daily_df.index.normalize() <= ts_day
                        daily_slice = daily_df[daily_mask]
                        if len(daily_slice) == 0:
                            daily_slice = None
                    except Exception:
                        daily_slice = None

                signal = analyze_stock_mean_reversion_v3(
                    symbol,
                    df_slice,
                    daily_slice,
                    self.config.signal,
                    self.config,
                )
            elif self.config.strategy == "slope_volume":
                # True slope+volume strategy: wave-detection via analyze_slope_volume()
                # from analysis.py (OLS regression, 3-factor entry gate).
                # Previously _is_five_min routed here even for non-slope strategies.
                signal = analyze_stock_slope_volume(
                    symbol,
                    df_slice,
                    lookback_bars=self.config.slope_lookback_bars,
                    slope_threshold_pct=self.config.slope_threshold_pct,
                    volume_multiplier=self.config.slope_volume_multiplier,
                    volume_ma_period=self.config.slope_volume_ma_period,
                    stop_loss_atr=self.config.stop_loss_atr,
                    take_profit_atr=self.config.take_profit_atr,
                    acceleration_bars=self.config.slope_acceleration_bars,
                    min_acceleration_pct=self.config.slope_min_acceleration_pct,
                    volume_trend_bars=self.config.slope_volume_trend_bars,
                    persistence_bars=self.config.slope_persistence_bars,
                    contrarian=self.config.slope_contrarian,
                    anticipatory=self.config.slope_anticipatory,
                )
            elif self._is_fifteen_min or self.config.strategy == "mean_reversion":
                signal = analyze_stock_mean_reversion(
                    symbol,
                    df_slice,
                    self.config.signal,
                    threshold=self.config.signal_threshold,
                    stop_loss_atr=self.config.stop_loss_atr,
                    take_profit_atr=self.config.take_profit_atr,
                    trend_filter=self.config.trend_filter,
                    timeframe=self.config.timeframe,
                )
            else:
                signal = analyze_stock(
                    symbol,
                    df_slice,
                    self.config.signal,
                    threshold=self.config.signal_threshold,
                    stop_loss_atr=self.config.stop_loss_atr,
                    take_profit_atr=self.config.take_profit_atr,
                    trend_filter=self.config.trend_filter,
                    timeframe=self.config.timeframe,
                )

            if signal is None:
                continue

            self._signals_generated += 1

            # Determine trade action from signal
            # Bidirectional strategies: slope_volume + noise_boundary can go long and short
            is_bidirectional = self.config.strategy in ("slope_volume", "noise_boundary")
            if signal.action == "BUY":
                trade_action = TradeAction.BUY
            elif signal.action == "SHORT" and is_bidirectional:
                trade_action = TradeAction.SHORT
            else:
                continue  # Non-bidirectional strategies: long-only

            # Position sizing
            equity = self._calculate_equity(data, current_date)
            max_position_value = equity * (self.config.max_position_pct / 100)

            if self.config.strategy == "noise_boundary":
                if self.config.nb_vol_sizing:
                    # Volatility-targeted sizing (Zarattini paper: target 15% annual vol)
                    # leverage = target_vol / realized_vol, capped at max_leverage
                    nb_df = self._nb_data.get(signal.symbol)
                    realized_vol = None
                    if nb_df is not None and current_date in nb_df.index:
                        rv_row = nb_df.loc[current_date]
                        if isinstance(rv_row, pd.DataFrame):
                            rv_row = rv_row.iloc[0]
                        rv = rv_row.get("realized_vol", None)
                        if rv is not None and not np.isnan(rv) and rv > 0.01:
                            realized_vol = rv
                    if realized_vol is not None:
                        target_vol = self.config.nb_vol_target_pct / 100.0  # e.g. 0.15
                        leverage = min(target_vol / realized_vol, self.config.nb_vol_max_leverage)
                        vol_target_value = equity * leverage
                        shares = int(vol_target_value / signal.entry_price)
                    else:
                        # Fallback: fixed allocation if no vol data yet
                        shares = int(max_position_value / signal.entry_price)
                else:
                    # NB: fixed allocation (wide SL is crash protection, not risk control)
                    shares = int(max_position_value / signal.entry_price)
            else:
                # Other strategies: risk-based sizing from SL distance
                risk_amount = equity * (self.config.max_loss_per_trade_pct / 100)
                risk_per_share = abs(signal.entry_price - signal.stop_loss)
                if risk_per_share <= 0:
                    continue
                shares = int(risk_amount / risk_per_share)
                max_shares_by_value = int(max_position_value / signal.entry_price)
                shares = min(shares, max_shares_by_value)

            # Cap by available cash (for both longs and shorts — margin requirement)
            max_shares_by_cash = int(self._cash / signal.entry_price)
            shares = min(shares, max_shares_by_cash)

            if shares <= 0:
                continue

            self._pending_orders.append(
                PendingOrder(
                    symbol=symbol,
                    action=trade_action,
                    shares=shares,
                    stop_loss=signal.stop_loss,
                    take_profit=signal.take_profit,
                    signal_score=signal.score,
                    signal_confidence=signal.confidence,
                )
            )

    # ------------------------------------------------------------------
    # EOD hard close (15-min mean reversion — no overnight holds)
    # ------------------------------------------------------------------

    def _check_eod_close(self, data: dict[str, pd.DataFrame], current_date, date_str: str) -> None:
        """Close all positions at 15:30 ET (intraday mean reversion only).

        15:30 ET in UTC:
        - EDT (UTC-4): 19:30 UTC  → hour == 19 and minute >= 30
        - EST (UTC-5): 20:30 UTC  → hour == 20 and minute >= 30
        We use hour >= 20 UTC as a safe conservative threshold that works for
        EST. In EDT the close fires at 16:00 ET instead of 15:30 ET, which is
        still inside market hours and avoids any overnight gap risk.
        """
        if not self._positions:
            return
        try:
            ts_utc = (
                current_date.tz_convert("UTC")
                if getattr(current_date, "tzinfo", None) is not None
                else current_date
            )
            if ts_utc.hour < 20:
                return  # Not yet EOD threshold
        except Exception:
            return  # Cannot determine time — skip

        logger.debug(
            "eod_hard_close",
            date=date_str,
            positions=len(self._positions),
        )
        self._close_all_positions(data, current_date, date_str, CloseReason.EOD_CLOSE)

    # ------------------------------------------------------------------
    # Noise Boundary exits (signal change at checkpoint)
    # ------------------------------------------------------------------

    def _check_nb_exits(
        self, data: dict[str, pd.DataFrame], current_date, date_str: str
    ) -> None:
        """Exit NB positions using one of two modes:

        Mode 1 (default): Signal change at checkpoint — exit when nb_signal flips.
        Mode 2 (nb_vwap_trailing=True): VWAP trailing stop (Maroy 2025) —
            Long trailing_stop = max(VWAP, UB). Exit when close < trailing_stop.
            Short trailing_stop = min(VWAP, LB). Exit when close > trailing_stop.
            This lets winners run and only exits when price reverts to mean.

        Both modes respect nb_min_hold_bars (minimum hold time before any exit).
        """
        if not self._positions:
            return
        # NB time filter: skip outside market hours (EOD close handles those)
        try:
            _ts = (
                current_date.tz_convert("UTC")
                if getattr(current_date, "tzinfo", None) is not None
                else current_date
            )
            if hasattr(_ts, "hour") and (_ts.hour >= 20 or _ts.hour < 14):
                return
        except Exception:
            pass

        to_exit: list[tuple[str, TradeAction, CloseReason]] = []
        min_hold = self.config.nb_min_hold_bars

        for symbol, pos in self._positions.items():
            # Minimum hold time check
            bars_held = self._current_bar_idx - pos.entry_bar_idx
            if min_hold > 0 and bars_held < min_hold:
                continue  # Too early to exit

            nb_df = self._nb_data.get(symbol)
            if nb_df is None or current_date not in nb_df.index:
                continue

            nb_row = nb_df.loc[current_date]
            if isinstance(nb_row, pd.DataFrame):
                nb_row = nb_row.iloc[0]

            if self.config.nb_vwap_trailing:
                # --- Mode 2: VWAP trailing stop (Maroy 2025) ---
                # Check EVERY bar (not just checkpoints) for tighter risk control
                close = float(nb_row.get("close", 0))
                vwap = float(nb_row.get("vwap", 0))
                ub = float(nb_row.get("UB", 0))
                lb = float(nb_row.get("LB", 0))

                if close <= 0 or vwap <= 0:
                    continue

                if pos.direction == 1:  # Long
                    # Trailing stop = max(VWAP, UB) — the tighter of the two
                    trailing_stop = max(vwap, ub) if ub > 0 else vwap
                    if close < trailing_stop:
                        to_exit.append((symbol, TradeAction.SELL, CloseReason.VWAP_EXIT))
                elif pos.direction == -1:  # Short
                    # Trailing stop = min(VWAP, LB) — the tighter of the two
                    trailing_stop = min(vwap, lb) if lb > 0 else vwap
                    if close > trailing_stop:
                        to_exit.append((symbol, TradeAction.COVER, CloseReason.VWAP_EXIT))
            else:
                # --- Mode 1: Signal change at checkpoint (original) ---
                if not bool(nb_row.get("is_checkpoint", False)):
                    continue

                nb_sig = int(nb_row.get("nb_signal", 0))

                if pos.direction == 1 and nb_sig != 1:
                    to_exit.append((symbol, TradeAction.SELL, CloseReason.NB_EXIT))
                elif pos.direction == -1 and nb_sig != -1:
                    to_exit.append((symbol, TradeAction.COVER, CloseReason.NB_EXIT))

        for symbol, action, reason in to_exit:
            pos = self._positions[symbol]
            self._pending_orders.append(
                PendingOrder(
                    symbol=symbol,
                    action=action,
                    shares=pos.shares,
                    stop_loss=0,
                    take_profit=0,
                    signal_score=0,
                    signal_confidence=0,
                    close_reason=reason,
                )
            )
            logger.debug(
                "nb_exit_queued",
                symbol=symbol,
                action=action.value,
                reason=reason.value,
                date=date_str,
            )

    # ------------------------------------------------------------------
    # VIX data loading and regime check
    # ------------------------------------------------------------------

    def _load_vix_data(self) -> None:
        """Load daily VIX data via yfinance for regime filtering."""
        try:
            import yfinance as yf
        except ImportError:
            logger.warning("yfinance_not_installed", msg="VIX filter disabled — pip install yfinance")
            self.config.nb_vix_filter = False
            return

        try:
            start_str = str(self.config.start)
            end_str = str(self.config.end)
            ticker = yf.Ticker("^VIX")
            df = ticker.history(start=start_str, end=end_str, interval="1d", auto_adjust=True)
            if df is not None and len(df) > 0:
                df.columns = [c.lower() for c in df.columns]
                df.index.name = "timestamp"
                self._vix_data = df
                logger.info("vix_data_loaded", bars=len(df), start=start_str, end=end_str)
            else:
                logger.warning("vix_data_empty", msg="VIX filter disabled")
                self.config.nb_vix_filter = False
        except Exception as e:
            logger.error("vix_download_error", error=str(e), msg="VIX filter disabled")
            self.config.nb_vix_filter = False

    def _get_vix_for_date(self, current_date) -> float | None:
        """Get the VIX close value for a given date (maps intraday bars to daily VIX)."""
        if self._vix_data is None or self._vix_data.empty:
            return None
        try:
            day = current_date.date() if hasattr(current_date, "date") else current_date
            ts_day = pd.Timestamp(day)
            if self._vix_data.index.tz is not None:
                ts_day = ts_day.tz_localize(self._vix_data.index.tz)
            # Find the most recent VIX value on or before this date (no look-ahead)
            mask = self._vix_data.index.normalize() <= ts_day
            if mask.any():
                return float(self._vix_data.loc[mask, "close"].iloc[-1])
        except Exception:
            pass
        return None

    # ------------------------------------------------------------------
    # VWAP-based exit (Maroy 2025 improvement)
    # ------------------------------------------------------------------

    def _check_vwap_exits(
        self, data: dict[str, pd.DataFrame], current_date, date_str: str
    ) -> None:
        """Exit NB positions when price crosses VWAP (profit-taking).

        Long: exit if price drops below VWAP (move has reverted to mean)
        Short: exit if price rises above VWAP (move has reverted to mean)
        Only exits positions that are in PROFIT (don't use VWAP to cut losses early).
        """
        if not self._positions:
            return

        to_exit: list[tuple[str, TradeAction]] = []

        for symbol, pos in self._positions.items():
            nb_df = self._nb_data.get(symbol)
            if nb_df is None or current_date not in nb_df.index:
                continue

            nb_row = nb_df.loc[current_date]
            if isinstance(nb_row, pd.DataFrame):
                nb_row = nb_row.iloc[0]

            vwap = float(nb_row.get("vwap", 0))
            close = float(nb_row.get("close", 0))
            if vwap <= 0 or close <= 0:
                continue

            # Only take profit via VWAP — position must be in profit
            if pos.direction == 1:  # Long
                if close > pos.entry_price and close < vwap:
                    # Price was above entry (in profit) but dropped below VWAP — take profit
                    to_exit.append((symbol, TradeAction.SELL))
            elif pos.direction == -1:  # Short
                if close < pos.entry_price and close > vwap:
                    # Price was below entry (in profit) but rose above VWAP — take profit
                    to_exit.append((symbol, TradeAction.COVER))

        for symbol, action in to_exit:
            pos = self._positions[symbol]
            self._pending_orders.append(
                PendingOrder(
                    symbol=symbol,
                    action=action,
                    shares=pos.shares,
                    stop_loss=0,
                    take_profit=0,
                    signal_score=0,
                    signal_confidence=0,
                    close_reason=CloseReason.VWAP_EXIT,
                )
            )
            logger.debug(
                "vwap_exit_queued",
                symbol=symbol,
                action=action.value,
                date=date_str,
            )

    # ------------------------------------------------------------------
    # Kill switch
    # ------------------------------------------------------------------

    def _check_kill_switch(self, equity: float, date_str: str, bar_idx: int) -> None:
        """Check daily and weekly loss limits."""
        # Skip if in cooldown period
        if bar_idx < self._cooldown_until:
            return

        # Daily loss check
        if self._prev_equity > 0:
            daily_pnl_pct = ((equity - self._prev_equity) / self._prev_equity) * 100
            if daily_pnl_pct <= self.config.daily_loss_limit_pct:
                logger.warning(
                    "kill_switch_daily",
                    daily_pnl_pct=round(daily_pnl_pct, 2),
                    limit=self.config.daily_loss_limit_pct,
                    date=date_str,
                    count=self._kill_switch_count + 1,
                )
                self._kill_switch = True
                self._kill_switch_date = date_str
                return

        # Weekly loss check
        if self._week_start_equity > 0:
            weekly_pnl_pct = ((equity - self._week_start_equity) / self._week_start_equity) * 100
            if weekly_pnl_pct <= self.config.weekly_loss_limit_pct:
                logger.warning(
                    "kill_switch_weekly",
                    weekly_pnl_pct=round(weekly_pnl_pct, 2),
                    limit=self.config.weekly_loss_limit_pct,
                    date=date_str,
                    count=self._kill_switch_count + 1,
                )
                self._kill_switch = True
                self._kill_switch_date = date_str

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _calculate_equity(self, data: dict[str, pd.DataFrame], current_date) -> float:
        """Calculate total portfolio value (cash + long positions - short liabilities)."""
        positions_value = 0.0
        for symbol, pos in self._positions.items():
            if symbol in data and current_date in data[symbol].index:
                price = float(data[symbol].loc[current_date, "close"])
                # Long: +shares × price. Short: -shares × price (liability).
                positions_value += pos.direction * pos.shares * price
            else:
                # Fallback: use entry price (net zero for equity impact)
                positions_value += pos.direction * pos.cost_basis
        return self._cash + positions_value

    def _record_equity(
        self, date_str: str, equity: float, data: dict[str, pd.DataFrame], current_date
    ) -> None:
        """Record end-of-day equity snapshot."""
        positions_value = 0.0
        for symbol, pos in self._positions.items():
            if symbol in data and current_date in data[symbol].index:
                price = float(data[symbol].loc[current_date, "close"])
                positions_value += pos.direction * pos.shares * price
            else:
                positions_value += pos.direction * pos.cost_basis

        peak = max(e["equity"] for e in self._equity_curve) if self._equity_curve else equity
        peak = max(peak, equity)
        drawdown_pct = ((equity - peak) / peak) * 100 if peak > 0 else 0.0

        self._equity_curve.append({
            "date": date_str,
            "equity": round(equity, 2),
            "cash": round(self._cash, 2),
            "positions_value": round(positions_value, 2),
            "drawdown_pct": round(drawdown_pct, 2),
            "positions_count": len(self._positions),
        })

    def _record_trade(
        self, pos: OpenPosition, exit_price: float, exit_date: str, reason: CloseReason
    ) -> None:
        """Record a completed trade. Handles both long and short P&L."""
        if pos.direction == 1:
            pnl = (exit_price - pos.entry_price) * pos.shares
        else:
            pnl = (pos.entry_price - exit_price) * pos.shares
        pnl_pct = (pnl / (pos.entry_price * pos.shares)) * 100 if pos.entry_price > 0 else 0.0

        # Calculate hold days from date strings
        try:
            entry_d = date.fromisoformat(pos.entry_date[:10])
            exit_d = date.fromisoformat(exit_date[:10])
            hold_days = (exit_d - entry_d).days
        except (ValueError, TypeError):
            hold_days = 0

        self._trades.append(
            TradeRecord(
                symbol=pos.symbol,
                action=TradeAction.BUY if pos.direction == 1 else TradeAction.SHORT,
                entry_date=pos.entry_date,
                entry_price=round(pos.entry_price, 2),
                exit_date=exit_date,
                exit_price=round(exit_price, 2),
                shares=pos.shares,
                pnl=round(pnl, 2),
                pnl_pct=round(pnl_pct, 2),
                hold_days=hold_days,
                close_reason=reason,
                stop_loss=pos.stop_loss,
                take_profit=pos.take_profit,
                signal_score=pos.signal_score,
                signal_confidence=pos.signal_confidence,
            )
        )

    def _close_all_positions(
        self, data: dict[str, pd.DataFrame], current_date, date_str: str, reason: CloseReason
    ) -> None:
        """Close all open positions (both long and short)."""
        for symbol in list(self._positions.keys()):
            pos = self._positions[symbol]
            if symbol in data and current_date in data[symbol].index:
                exit_price = float(data[symbol].loc[current_date, "close"])
            else:
                exit_price = pos.entry_price

            if pos.direction == 1:
                # Close long: sell shares → receive cash
                self._cash += pos.shares * exit_price
            else:
                # Close short: buy back shares → spend cash
                self._cash -= pos.shares * exit_price
            self._record_trade(pos, exit_price, date_str, reason)
            del self._positions[symbol]

    def _build_result(self, total_bars: int) -> BacktestResult:
        """Build final result object."""
        return BacktestResult(
            config=self.config,
            trades=self._trades,
            equity_curve=self._equity_curve,
            daily_returns=self._daily_returns,
            total_bars=total_bars,
            signals_generated=self._signals_generated,
            orders_filled=self._orders_filled,
            kill_switch_triggered=self._kill_switch_count > 0,
            kill_switch_date=self._kill_switch_date,
        )
