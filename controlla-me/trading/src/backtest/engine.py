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


def get_indicator_periods(timeframe: str = "1Day") -> dict:
    """Return indicator periods calibrated for the given timeframe."""
    if timeframe == "1Hour":
        return HOURLY_INDICATOR_PERIODS.copy()
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
    take_profit_atr: float = 4.0  # take profit ATR multiplier
    trend_filter: bool = True  # require price > SMA long for BUY signals
    timeframe: str = "1Day"  # "1Day" or "1Hour"

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

    Uses a rule-based approach: MACD crossover as primary trigger,
    with trend/RSI/volume as confirmation filters. Indicator periods
    are automatically calibrated for the given timeframe.

    Entry conditions (ALL must be true):
    1. MACD bullish crossover in last N bars (3 daily / 7 hourly)
    2. RSI between 25-65 (not overbought, room to run)
    3. Price > SMA medium (uptrend)
    4. If trend_filter: Price > SMA long
    5. Volume not declining (recent vol >= 80% of avg)

    Args:
        symbol: Stock ticker.
        df: OHLCV DataFrame.
        settings: Signal settings (indicator parameters — used as base).
        threshold: Not used for entry (rule-based), used for confidence minimum.
        stop_loss_atr: ATR multiplier for stop loss.
        take_profit_atr: ATR multiplier for take profit.
        trend_filter: If True, also require price > SMA long.
        timeframe: "1Day" or "1Hour" — determines indicator periods.

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

        # --- MACD crossover detection (primary trigger) ---
        macd = MACD(
            close,
            window_slow=periods["macd_slow"],
            window_fast=periods["macd_fast"],
            window_sign=periods["macd_signal"],
        )
        macd_series = macd.macd()
        signal_series = macd.macd_signal()

        # Check for bullish crossover in last N bars
        bullish_crossover = False
        lookback_range = periods["crossover_lookback"]
        for lookback in range(1, lookback_range + 1):
            if len(macd_series) > lookback + 1:
                prev_macd = float(macd_series.iloc[-(lookback + 1)])
                prev_signal = float(signal_series.iloc[-(lookback + 1)])
                curr_macd = float(macd_series.iloc[-lookback])
                curr_signal = float(signal_series.iloc[-lookback])

                if not np.isnan(prev_macd) and not np.isnan(curr_macd):
                    if prev_macd < prev_signal and curr_macd > curr_signal:
                        bullish_crossover = True
                        break

        if not bullish_crossover:
            return None  # No crossover — no signal

        # --- RSI confirmation (not overbought) ---
        rsi = RSIIndicator(close, window=periods["rsi_period"])
        rsi_value = float(rsi.rsi().iloc[-1])

        if np.isnan(rsi_value) or rsi_value > 65 or rsi_value < 25:
            return None  # Too overbought or too oversold (falling knife)

        # --- Trend confirmation (price > SMA medium) ---
        sma_medium = float(close.tail(periods["sma_medium"]).mean())
        if current_price < sma_medium:
            return None  # Below medium-term trend

        # --- SMA long trend filter ---
        if trend_filter and len(close) >= periods["sma_long"]:
            sma_long = float(close.tail(periods["sma_long"]).mean())
            if current_price < sma_long:
                return None  # Below long-term trend

        # --- Volume confirmation ---
        avg_vol = float(volume.tail(periods["volume_avg"]).mean())
        recent_vol_bars = max(3, int(periods["crossover_lookback"]))
        recent_vol = float(volume.tail(recent_vol_bars).mean())
        if recent_vol < avg_vol * 0.8:
            return None  # Declining volume — weak signal

        # --- Score calculation for confidence ---
        # MACD strength
        macd_val = float(macd_series.iloc[-1])
        signal_val = float(signal_series.iloc[-1])
        macd_spread = abs(macd_val - signal_val) / max(abs(signal_val), 0.01)

        # Trend strength
        trend_strength = (current_price - sma_medium) / sma_medium

        # RSI positioning (closer to 30 = more upside)
        rsi_upside = (65 - rsi_value) / 35  # 0 to 1

        # Volume ratio
        vol_ratio = recent_vol / max(avg_vol, 1)

        # Composite confidence
        score = min(
            0.3 + (macd_spread * 0.2) + (trend_strength * 2) + (rsi_upside * 0.15) + ((vol_ratio - 1) * 0.1),
            1.0,
        )
        score = max(score, 0.3)

        # ATR for stop-loss / take-profit
        tr = pd.concat([
            high - low,
            (high - close.shift(1)).abs(),
            (low - close.shift(1)).abs(),
        ], axis=1).max(axis=1)
        atr = float(tr.tail(periods["atr_period"]).mean())

        stop_loss = round(current_price - (atr * stop_loss_atr), 2)
        take_profit = round(current_price + (atr * take_profit_atr), 2)

        return SignalResult(
            symbol=symbol,
            action="BUY",
            score=round(score, 3),
            confidence=round(score, 3),
            entry_price=round(current_price, 2),
            stop_loss=stop_loss,
            take_profit=take_profit,
        )

    except Exception:
        return None


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
        self._prev_equity: float = config.initial_capital
        self._week_start_equity: float = config.initial_capital
        self._bar_count: int = 0

        # For hourly: track "day" boundaries for kill switch daily check
        self._is_hourly = config.timeframe == "1Hour"
        # Cooldown is 5 trading days = 5 * 6.5 = ~33 hourly bars
        self._cooldown_bars = 33 if self._is_hourly else 5
        # Weekly reset every 5 trading days = 5 * 6.5 = ~33 hourly bars
        self._week_bars = 33 if self._is_hourly else 5

    def run(self, data: dict[str, pd.DataFrame]) -> BacktestResult:
        """
        Run backtest on historical data.

        Args:
            data: dict[symbol, DataFrame] with OHLCV columns, DatetimeIndex.

        Returns:
            BacktestResult with trades, equity curve, and metrics inputs.
        """
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

            # Trailing stop: only after significant profit
            atr = pos.atr_at_entry
            if atr > 0:
                profit_from_entry = pos.highest_close - pos.entry_price
                # Move to breakeven after 2xATR profit
                if profit_from_entry > 2 * atr:
                    breakeven_stop = pos.entry_price + (atr * 0.25)
                    pos.stop_loss = max(pos.stop_loss, breakeven_stop)
                # Trail at highest - 2.5xATR after 3.5xATR profit
                if profit_from_entry > 3.5 * atr:
                    trailing_stop = pos.highest_close - (atr * 2.5)
                    pos.stop_loss = max(pos.stop_loss, trailing_stop)

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
            if len(self._positions) + len(self._pending_orders) >= self.config.max_positions:
                break

            # Slice data up to and including current bar (NO look-ahead)
            mask = full_df.index <= current_date
            df_slice = full_df[mask]

            if len(df_slice) < min_bars:
                continue  # Not enough history for indicators

            # Analyze stock with timeframe-calibrated indicators
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
