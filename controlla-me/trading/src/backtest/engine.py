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

from ..analysis import analyze_composite, analyze_mean_reversion_v3, analyze_slope_volume
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


class CloseReason(StrEnum):
    STOP_LOSS = "stop_loss"
    TAKE_PROFIT = "take_profit"
    SIGNAL_EXIT = "signal_exit"
    EOD_CLOSE = "eod_close"        # intraday hard close at 15:30 ET
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
    stop_loss_atr: float = 2.0  # stop loss ATR multiplier
    take_profit_atr: float = 10.0  # take profit ATR multiplier (grid search optimal: wider TP)
    trend_filter: bool = True  # require price > SMA long for BUY signals
    timeframe: str = "1Day"  # "1Day", "1Hour", or "15Min"
    strategy: str = "trend_following"  # "trend_following", "mean_reversion", "mean_reversion_v3", or "slope_volume"

    # Daily filter for mean reversion v3 (dual-timeframe)
    daily_filter_enabled: bool = True  # Require daily uptrend for MR v3 entries
    daily_sma_period: int = 20  # SMA period for daily trend filter
    daily_trend_strict: bool = True  # Strict: price > SMA. False: allow 0.5% tolerance

    # Trailing stop parameters — 4-tier system (configurable for grid search)
    # Tier 0: Move SL to entry (breakeven) after this ATR profit
    trailing_breakeven_atr: float = 1.5  # grid search optimal: don't breakeven too early
    # Tier 1: Lock small profit (entry + lock_cushion) after this ATR profit
    trailing_lock_atr: float = 1.5
    trailing_lock_cushion_atr: float = 0.5  # Cushion above entry for profit lock
    # Tier 2: Start trailing at highest_close - trail_distance after this ATR profit
    trailing_trail_threshold_atr: float = 3.5  # grid search optimal: trail later
    trailing_trail_distance_atr: float = 2.0  # grid search optimal: wider trail
    # Tier 3: Tight trail at highest_close - tight_distance after this ATR profit
    trailing_tight_threshold_atr: float = 4.0
    trailing_tight_distance_atr: float = 1.0

    # Signal exit: close positions on MACD bearish crossover
    signal_exit_enabled: bool = False  # Enable MACD bearish crossover exits

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
    highest_close: float = 0.0  # For trailing stop
    atr_at_entry: float = 0.0  # ATR when trade was opened

    def __post_init__(self) -> None:
        self.cost_basis = self.shares * self.entry_price
        self.initial_stop_loss = self.stop_loss
        self.highest_close = self.entry_price


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
    action: str  # "BUY" or "SELL"
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
            date_str = self._format_date(current_date)
            day_str = self._extract_day(current_date)

            # Step 1: Fill pending orders at this bar's open
            self._fill_pending_orders(data, current_date)

            # Step 2: Check stop-loss / take-profit on existing positions
            self._check_exits(data, current_date, date_str)

            # Step 2.3: Signal exit — MACD bearish crossover closes positions
            if self.config.signal_exit_enabled:
                self._check_signal_exits(data, current_date, date_str)

            # Step 2.5: Hard EOD close for mean reversion (no overnight holds)
            if self._is_fifteen_min and self._positions:
                self._check_eod_close(data, current_date, date_str)

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
                # Calculate ATR at entry for trailing stop
                atr_at_entry = (
                    abs(fill_price - order.stop_loss) / self.config.stop_loss_atr
                    if self.config.stop_loss_atr > 0
                    else 0
                )
                self._positions[order.symbol] = OpenPosition(
                    symbol=order.symbol,
                    shares=order.shares,
                    entry_price=fill_price,
                    entry_date=date_str,
                    stop_loss=order.stop_loss,
                    take_profit=order.take_profit,
                    signal_score=order.signal_score,
                    signal_confidence=order.signal_confidence,
                    atr_at_entry=atr_at_entry,
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
                self._record_trade(pos, fill_price, date_str, CloseReason.SIGNAL_EXIT)
                del self._positions[order.symbol]
                self._orders_filled += 1

    # ------------------------------------------------------------------
    # Exit checks (stop-loss / take-profit using intrabar OHLCV)
    # ------------------------------------------------------------------

    def _check_exits(self, data: dict[str, pd.DataFrame], current_date, date_str: str) -> None:
        """Check stop-loss, take-profit, and optional trailing stop against intrabar prices."""
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

            # Update highest close for potential trailing stop
            if close_price > pos.highest_close:
                pos.highest_close = close_price

            # 4-tier trailing stop (evaluated top-down, max() ensures monotonic)
            atr = pos.atr_at_entry
            if atr > 0:
                profit_from_entry = pos.highest_close - pos.entry_price

                # Tier 0: Breakeven — move SL to entry price
                if profit_from_entry > self.config.trailing_breakeven_atr * atr:
                    pos.stop_loss = max(pos.stop_loss, pos.entry_price)

                # Tier 1: Lock profit — move SL to entry + cushion
                if profit_from_entry > self.config.trailing_lock_atr * atr:
                    lock_stop = pos.entry_price + (atr * self.config.trailing_lock_cushion_atr)
                    pos.stop_loss = max(pos.stop_loss, lock_stop)

                # Tier 2: Trail — follow highest close at distance
                if profit_from_entry > self.config.trailing_trail_threshold_atr * atr:
                    trailing_stop = pos.highest_close - (atr * self.config.trailing_trail_distance_atr)
                    pos.stop_loss = max(pos.stop_loss, trailing_stop)

                # Tier 3: Tight trail — close trailing near take profit
                if profit_from_entry > self.config.trailing_tight_threshold_atr * atr:
                    tight_stop = pos.highest_close - (atr * self.config.trailing_tight_distance_atr)
                    pos.stop_loss = max(pos.stop_loss, tight_stop)

            # Exit checks
            if low <= pos.stop_loss:
                to_close.append((symbol, pos.stop_loss, CloseReason.STOP_LOSS))
            elif high >= pos.take_profit:
                to_close.append((symbol, pos.take_profit, CloseReason.TAKE_PROFIT))

        for symbol, exit_price, reason in to_close:
            pos = self._positions[symbol]
            proceeds = pos.shares * exit_price - (pos.shares * self.config.commission_per_share)
            self._cash += proceeds
            self._record_trade(pos, exit_price, date_str, reason)
            del self._positions[symbol]
            logger.debug(
                "position_closed",
                symbol=symbol,
                reason=reason.value,
                exit_price=round(exit_price, 2),
            )
            # 15-min mean reversion: apply per-symbol cooldown after stop loss
            # Prevents re-entering falling knives immediately after being stopped out
            if self._is_fifteen_min and reason == CloseReason.STOP_LOSS:
                cooldown_periods = self._periods.get("symbol_cooldown_bars", 13)
                self._symbol_stop_cooldown[symbol] = self._bar_count + cooldown_periods

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
        sma_medium_period = self._periods["sma_medium"]
        if self.config.trend_filter and "SPY" in data:
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
            if self.config.strategy == "mean_reversion_v3":
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
            elif self._is_five_min or self.config.strategy == "slope_volume":
                signal = analyze_stock_slope_volume(
                    symbol,
                    df_slice,
                    stop_loss_atr=self.config.stop_loss_atr,
                    take_profit_atr=self.config.take_profit_atr,
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

            # Only take BUY signals (long-only strategy for now)
            if signal.action != "BUY":
                continue

            # Position sizing: risk max_loss_per_trade_pct of portfolio
            equity = self._calculate_equity(data, current_date)
            risk_amount = equity * (self.config.max_loss_per_trade_pct / 100)
            risk_per_share = abs(signal.entry_price - signal.stop_loss)

            if risk_per_share <= 0:
                continue

            shares = int(risk_amount / risk_per_share)

            # Cap by max position size
            max_position_value = equity * (self.config.max_position_pct / 100)
            max_shares_by_value = int(max_position_value / signal.entry_price)
            shares = min(shares, max_shares_by_value)

            # Cap by available cash
            max_shares_by_cash = int(self._cash / signal.entry_price)
            shares = min(shares, max_shares_by_cash)

            if shares <= 0:
                continue

            self._pending_orders.append(
                PendingOrder(
                    symbol=symbol,
                    action=TradeAction.BUY,
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
        """Calculate total portfolio value (cash + positions at current close)."""
        positions_value = 0.0
        for symbol, pos in self._positions.items():
            if symbol in data and current_date in data[symbol].index:
                price = float(data[symbol].loc[current_date, "close"])
                positions_value += pos.shares * price
            else:
                # Use entry price as fallback
                positions_value += pos.cost_basis
        return self._cash + positions_value

    def _record_equity(
        self, date_str: str, equity: float, data: dict[str, pd.DataFrame], current_date
    ) -> None:
        """Record end-of-day equity snapshot."""
        positions_value = 0.0
        for symbol, pos in self._positions.items():
            if symbol in data and current_date in data[symbol].index:
                price = float(data[symbol].loc[current_date, "close"])
                positions_value += pos.shares * price
            else:
                positions_value += pos.cost_basis

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
        """Record a completed trade."""
        pnl = (exit_price - pos.entry_price) * pos.shares
        pnl_pct = ((exit_price - pos.entry_price) / pos.entry_price) * 100

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
                action=TradeAction.BUY,
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
        """Close all open positions."""
        for symbol in list(self._positions.keys()):
            pos = self._positions[symbol]
            if symbol in data and current_date in data[symbol].index:
                exit_price = float(data[symbol].loc[current_date, "close"])
            else:
                exit_price = pos.entry_price

            proceeds = pos.shares * exit_price
            self._cash += proceeds
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
