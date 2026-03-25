"""
Central configuration for the trading system.
Reads from environment variables with sensible defaults for paper trading.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings

# ---------------------------------------------------------------------------
# Sector map: symbol → sector label
# Used by RiskManager to enforce max_sector_exposure_pct.
# Alpaca positions do not carry sector metadata, so we maintain this map
# centrally. Add new symbols here as the watchlist evolves.
# ---------------------------------------------------------------------------
SECTOR_MAP: dict[str, str] = {
    # Technology
    "NVDA": "Technology",
    "CSCO": "Technology",
    "AMZN": "Technology",
    "AAPL": "Technology",
    "MSFT": "Technology",
    "GOOGL": "Technology",
    "META": "Technology",
    "TSLA": "Technology",
    "ARKK": "Technology",
    "QQQ": "Technology",
    "XLK": "Technology",
    # Healthcare
    "UNH": "Healthcare",
    "XLV": "Healthcare",
    "JNJ": "Healthcare",
    # Financials
    "XLF": "Financials",
    "JPM": "Financials",
    "BAC": "Financials",
    # Energy / Commodity
    "XLE": "Energy",
    "XOM": "Energy",
    "CVX": "Energy",
    "USO": "Energy",   # Oil ETF
    "DBA": "Energy",   # Agriculture ETF — food inflation (mapped to Energy/Commodity bucket)
    # Consumer Staples
    "XLP": "ConsumerStaples",
    "WMT": "ConsumerStaples",
    "PG": "ConsumerStaples",
    # Utilities
    "XLU": "Utilities",
    # Real Estate
    "XLRE": "RealEstate",
    # Materials
    "XLB": "Materials",
    # Industrials
    "XLI": "Industrials",
    # Macro Hedge / Bonds
    "GLD": "Macro",
    "TLT": "Macro",
    "SHY": "Macro",
    "GDX": "Macro",
    # Broad market
    "IWM": "Broad",
    "SPY": "Broad",
    "DIA": "Broad",
    # Inverse ETFs
    "SH": "Inverse",
    "PSQ": "Inverse",
    "DOG": "Inverse",
}

# Load .env.local from project root (controlla-me/) before any settings class is
# instantiated. Needed because sub-settings classes (AlpacaSettings, SupabaseSettings)
# are created via default_factory and don't inherit env_file from the parent Settings.
# override=False: actual env vars take precedence over the file.
_ENV_FILE = Path(__file__).parents[3] / ".env.local"
load_dotenv(_ENV_FILE, override=False)


class AlpacaSettings(BaseSettings):
    """Alpaca broker configuration."""

    api_key: str = Field(..., alias="ALPACA_API_KEY")
    secret_key: str = Field(..., alias="ALPACA_SECRET_KEY")
    base_url: str = Field(
        default="https://paper-api.alpaca.markets",
        alias="ALPACA_BASE_URL",
    )

    @property
    def is_paper(self) -> bool:
        return "paper" in self.base_url

    model_config = {"env_prefix": "", "extra": "ignore"}


class AlpacaConventionalSettings(BaseSettings):
    """Alpaca conventional (daily strategy) account credentials."""

    api_key: str = Field(default="", alias="ALPACA_CONV_API_KEY")
    secret_key: str = Field(default="", alias="ALPACA_CONV_SECRET_KEY")
    base_url: str = Field(default="https://paper-api.alpaca.markets", alias="ALPACA_CONV_BASE_URL")

    @property
    def is_paper(self) -> bool:
        return "paper" in self.base_url

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key and self.secret_key)

    model_config = {"env_prefix": "", "extra": "ignore"}


class AlpacaCryptoSettings(BaseSettings):
    """Alpaca crypto (24/7) account credentials — dedicated to BTC/ETH slope strategy."""

    api_key: str = Field(default="", alias="ALPACA_CRYPTO_API_KEY")
    secret_key: str = Field(default="", alias="ALPACA_CRYPTO_SECRET_KEY")
    base_url: str = Field(default="https://paper-api.alpaca.markets", alias="ALPACA_CRYPTO_BASE_URL")

    @property
    def is_paper(self) -> bool:
        return "paper" in self.base_url

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key and self.secret_key)

    model_config = {"env_prefix": "", "extra": "ignore"}


class RiskSettings(BaseSettings):
    """Risk management parameters — NON-NEGOTIABLE limits."""

    max_daily_loss_pct: float = Field(default=-2.0, description="Max daily loss %")
    max_weekly_loss_pct: float = Field(default=-5.0, description="Max weekly loss %")
    max_position_pct: float = Field(default=10.0, description="Max single position % of portfolio")
    max_positions: int = Field(default=10, description="Max simultaneous positions")
    max_sector_exposure_pct: float = Field(default=30.0, description="Max sector exposure %")
    stop_loss_pct: float = Field(default=-5.0, description="Stop loss % per position")
    min_risk_reward: float = Field(default=2.0, description="Minimum risk/reward ratio")
    max_correlation: float = Field(default=0.7, description="Max correlation between positions")
    max_directional_exposure_pct: float = Field(default=60.0, description="Max portfolio % exposed in one direction (long or short) — prevents directional overconcentration")
    kelly_fraction: float = Field(default=0.5, description="Half-Kelly for position sizing")

    # Short selling — enabled for bidirectional slope strategy (paper account supports shorts natively)
    allow_short_selling: bool = Field(default=True, description="Enable SHORT/COVER signals — bidirectional momentum strategy")
    max_short_exposure_pct: float = Field(default=30.0, description="Max total short exposure % of portfolio")
    max_short_position_pct: float = Field(default=7.0, description="Max single short position % — bidirectional strategy, symmetric with long")

    # Trailing stop parameters — 4-tier system (matching backtest engine.py)
    trailing_enabled: bool = Field(default=True, description="Enable 4-tier trailing stop")
    trailing_breakeven_atr: float = Field(default=1.5, description="Move SL to entry after this ATR profit — Tier 0 (Cycle 4 winner: 1.5)")
    trailing_lock_atr: float = Field(default=1.5, description="Lock profit after this ATR profit")
    trailing_lock_cushion_atr: float = Field(default=0.5, description="Cushion above entry for profit lock")
    trailing_trail_threshold_atr: float = Field(default=3.5, description="Start trailing after this ATR profit (Cycle 4 winner: 3.5)")
    trailing_trail_distance_atr: float = Field(default=2.0, description="Trail distance in ATR (Cycle 4 winner: 2.0)")
    trailing_tight_threshold_atr: float = Field(default=4.0, description="Tight trail after this ATR profit")
    trailing_tight_distance_atr: float = Field(default=1.0, description="Tight trail distance in ATR")

    model_config = {"env_prefix": "TRADING_RISK_", "extra": "ignore"}


class ScannerSettings(BaseSettings):
    """Market scanner parameters."""

    min_volume: int = Field(default=500_000, description="Min avg daily volume")
    min_price: float = Field(default=5.0, description="Min stock price")
    max_price: float = Field(default=500.0, description="Max stock price")
    watchlist_size: int = Field(default=25, description="Max watchlist candidates")
    trend_period_short: int = Field(default=20, description="Short SMA period")
    trend_period_medium: int = Field(default=50, description="Medium SMA period")
    trend_period_long: int = Field(default=200, description="Long SMA period")
    min_hedge_slots: int = Field(
        default=3,
        description="Minimum watchlist slots reserved for decorrelated instruments",
    )
    hedge_symbols: list[str] = Field(
        default=["GLD", "TLT", "SHY", "SH", "PSQ", "XLU", "XLP"],
        description="Pool of hedge/defensive instruments to guarantee in watchlist",
    )

    model_config = {"env_prefix": "TRADING_SCANNER_", "extra": "ignore"}


class SignalSettings(BaseSettings):
    """Signal generator parameters."""

    min_confidence: float = Field(default=0.3, description="Min confidence to pass to Risk Manager (aligned with score_buy_threshold)")
    rsi_period: int = Field(default=14, description="RSI period")
    rsi_overbought: float = Field(default=70.0, description="RSI overbought level")
    rsi_oversold: float = Field(default=30.0, description="RSI oversold level")
    macd_fast: int = Field(default=12, description="MACD fast period")
    macd_slow: int = Field(default=26, description="MACD slow period")
    macd_signal: int = Field(default=9, description="MACD signal period")
    bb_period: int = Field(default=20, description="Bollinger Bands period")
    bb_std: float = Field(default=2.0, description="Bollinger Bands std dev")

    # Score thresholds — composite score required to generate a signal.
    # 0.5 = very selective (few signals), 0.3 = moderate (paper trading data collection)
    score_buy_threshold: float = Field(default=0.3, description="Composite score above this = BUY")
    score_sell_threshold: float = Field(default=-0.5, description="Composite score below this = SELL")

    # Indicator weights for composite score
    weight_rsi: float = 0.15
    weight_macd: float = 0.25
    weight_bollinger: float = 0.15
    weight_trend: float = 0.25
    weight_volume: float = 0.20

    model_config = {"env_prefix": "TRADING_SIGNAL_", "extra": "ignore"}


class SlopeVolumeSettings(BaseSettings):
    """Slope+Volume intraday strategy parameters (1-min bars, multi-ticker)."""

    enabled: bool = Field(default=True, description="Enable slope+volume strategy")
    symbols: list[str] = Field(
        default=[
            # --- Broad market (benchmark + size factor) ---
            "SPY",   # S&P 500
            "QQQ",   # Nasdaq 100 (tech-heavy)
            "IWM",   # Russell 2000 (small cap — risk appetite indicator)
            # --- Sector ETFs (11 settori GICS completi) ---
            "XLK",   # Technology — growth sectors
            "XLF",   # Financials — rates & credit cycle
            "XLE",   # Energy — commodity cycle
            "XLV",   # Healthcare — defensive, non-cyclical
            "XLI",   # Industrials — economic cycle
            "XLU",   # Utilities — safe haven, dividend yield
            "XLP",   # Consumer Staples — recession-resistant
            "XLRE",  # Real Estate — rate-sensitive, dividend yield
            "XLB",   # Materials — commodity/industrial cycle
            # --- Macro hedges ---
            "GLD",   # Gold — safe haven / inflation hedge
            "TLT",   # 20Y Treasury — rates / flight-to-quality indicator
            "SHY",   # 1-3Y Treasury — short-duration rates indicator
            # --- Commodity ---
            "USO",   # Oil — energy/macro cycle
            "DBA",   # Agriculture — food inflation hedge
            # --- Inverse ETFs (profit from market decline) ---
            "SH",    # ProShares Short S&P 500 (1× inverse SPY)
            "PSQ",   # ProShares Short QQQ (1× inverse QQQ)
            # --- Alpha / high-beta ---
            "NVDA",  # High-beta semiconductor — AI cycle indicator
        ],
        description=(
            "Target symbols (env: TRADING_SLOPE_SYMBOLS as JSON array). "
            "Full sector rotation coverage: SPY/QQQ/IWM=broad market, "
            "XLK/XLF/XLE/XLV/XLI/XLU/XLP/XLRE/XLB=11 GICS sectors (completi), "
            "GLD/TLT/SHY=macro hedges, USO/DBA=commodity, "
            "SH/PSQ=inverse ETFs, NVDA=alpha/high-beta. "
            "All US-listed — trade during US market hours (+ pre/after market)."
        ),
    )
    timeframe: str = Field(default="1Min", description="Bar timeframe — 1Min + scheduler every 1min = each run sees a fresh closed bar. Tiingo IEX RT: 0 delay. Total latency ~1-2s from bar close.")
    lookback_bars: int = Field(default=10, description="Bars for slope regression (10 × 1min = 10min window, was 25min at 5Min)")
    slope_threshold_pct: float = Field(default=0.01, description="Min abs slope % per bar to trigger — 0.01% calibrated for 1Min bars (5Min bars move ~5× per bar: 0.0155% avg, 0.02 was still too high)")
    volume_multiplier: float = Field(default=1.3, description="Volume must be > N*MA to confirm (1.3x = momentum confirmation, monitor and tune per market)")
    volume_ma_period: int = Field(default=20, description="Volume moving average period (20 × 1min = 20min)")
    stop_loss_atr: float = Field(default=2.0, description="Stop loss in ATR units (Cycle 4 winner: 2.0)")
    take_profit_atr: float = Field(default=4.0, description="Take profit in ATR units (Cycle 4 winner: 4.0)")
    atr_period: int = Field(default=14, description="ATR calculation period (14 × 1min = 14min)")
    # --- Wave detection: 3-factor entry (angle acceleration + volume trend + persistence) ---
    acceleration_bars: int = Field(default=5, description="Bars back to measure slope acceleration. Slope must be growing in the direction of the trade.")
    min_acceleration_pct: float = Field(default=0.002, description="Min slope increase % per step for entry. Higher = stricter (fewer but stronger signals).")
    volume_trend_bars: int = Field(default=5, description="Bars for volume trend OLS regression. Volume must be GROWING (positive slope), not just high on a single bar.")
    persistence_bars: int = Field(default=5, description="Min consecutive bars with slope in the same direction. Filters out noise that flips every 1-2 bars.")
    market_open_utc: str = Field(default="14:30", description="Market open UTC — NYSE regular hours: 09:30 ET = 14:30 UTC (EST). Signals blocked outside this window.")
    market_close_utc: str = Field(default="21:00", description="Market close UTC — NYSE regular hours: 16:00 ET = 21:00 UTC (EST). Update to 13:30/20:00 when EDT (summer) is active.")
    max_trades_per_day: int = Field(default=3, description="Max trades per day (kill switch protection)")
    min_bars: int = Field(default=60, description="Min bars needed before generating signals (60 × 1min = 60min = 1h history, was 150min at 5Min)")
    inverse_etf_symbols: list[str] = Field(
        default=["SH", "PSQ", "DOG", "SPXS", "SQQQ"],
        description=(
            "Inverse ETFs — use trend-continuation entry (require_reversal=False, bypass_volume_check=True). "
            "These rise when the market falls, so a sustained positive slope is already the entry signal. "
            "No prior negative slope needed. Volume bypassed because Tiingo IEX may not return volume for low-volume ETFs."
        ),
    )
    trend_following_symbols: list[str] = Field(
        default=["SPY", "QQQ", "IWM", "NVDA", "GLD", "TLT", "XLK", "XLF", "XLE", "XLV"],
        description=(
            "Liquid, trending instruments that use trend-continuation entry (require_reversal=False) "
            "but still require volume confirmation (bypass_volume_check=False, unlike inverse ETFs). "
            "A sustained positive or negative slope is enough to signal — no prior reversal needed. "
            "Enables signal generation across the full watchlist, not only inverse ETFs. "
            "Configure via TRADING_SLOPE_TREND_FOLLOWING_SYMBOLS (JSON array)."
        ),
    )
    crypto_enabled: bool = Field(
        default=True,
        alias="TRADING_SLOPE_CRYPTO_ENABLED",
        description="Enable crypto pairs (BTC/ETH) in slope strategy — trades 24/7 including weekends",
    )
    crypto_symbols: list[str] = Field(
        default=["btcusd", "ethusd"],
        alias="TRADING_SLOPE_CRYPTO_SYMBOLS",
        description=(
            "Crypto pairs for 24/7 slope trading (Tiingo format: btcusd, ethusd). "
            "Market hours restriction is bypassed — crypto trades on weekends. "
            "Alpaca paper account supports crypto trading natively."
        ),
    )

    model_config = {"env_prefix": "TRADING_SLOPE_", "extra": "ignore"}


class TelegramSettings(BaseSettings):
    """Telegram notification toggles.

    Per-trade notifications are disabled by default (boss directive: no spam).
    Kill switch alerts and daily reports remain always-on.
    Set TELEGRAM_NOTIFY_TRADES=true to re-enable per-trade messages.
    """

    notify_trades: bool = Field(
        default=False,
        alias="TELEGRAM_NOTIFY_TRADES",
        description="Send Telegram message for each executed trade. Default False (boss: no spam).",
    )

    model_config = {"env_prefix": "", "extra": "ignore"}


class SupabaseSettings(BaseSettings):
    """Supabase connection (shared with the main app)."""

    url: str = Field(..., alias="NEXT_PUBLIC_SUPABASE_URL")
    service_role_key: str = Field(..., alias="SUPABASE_SERVICE_ROLE_KEY")

    model_config = {"env_prefix": "", "extra": "ignore"}


class TiingoSettings(BaseSettings):
    """Tiingo market data configuration.

    Tiingo IEX provides real-time data (no delay) on the free tier.
    Alpaca free tier has 15-minute delay for market data.
    Set use_tiingo_for_market_data=True (default) to use Tiingo instead.

    Rate limits:
        Free tier: 50 req/hour — INSUFFICIENTE per uso intraday (9 sym × 12 cicli/h = 108 req/h).
        Piano Power/Enterprise ($10-30/mese): limiti molto più alti (5000+ req/h).
        Configurare requests_per_hour=50 solo se si usa il free tier (accetta latenza >72s).
    """

    tiingo_api_key: str | None = Field(default=None, alias="TIINGO_API_KEY")
    use_tiingo_for_market_data: bool = Field(
        default=True,
        alias="USE_TIINGO_FOR_MARKET_DATA",
        description="Use Tiingo IEX real-time data instead of Alpaca (which has 15min delay on free tier)",
    )
    requests_per_hour: int = Field(
        default=5000,
        alias="TIINGO_REQUESTS_PER_HOUR",
        description=(
            "Rate limit piano paid. Free=50 (impraticabile per intraday: 3600/50=72s tra req). "
            "Piano Power/Enterprise ($10-30/mese): 5000+ req/h → 0.72s tra req. "
            "Imposta a 50 solo se usi il free tier e accetti latenza alta."
        ),
    )

    model_config = {"env_prefix": "", "extra": "ignore"}


class TiingoNewsSettings(BaseSettings):
    """Tiingo News API configuration (Power plan feature)."""

    enabled: bool = Field(
        default=True,
        alias="TIINGO_NEWS_ENABLED",
        description="Enable Tiingo News API check before slope signals (Power plan required)",
    )
    minutes_back: float = Field(
        default=30.0,
        alias="TIINGO_NEWS_MINUTES_BACK",
        description="Lookback window in minutes for breaking news detection",
    )
    high_impact_only: bool = Field(
        default=True,
        alias="TIINGO_NEWS_HIGH_IMPACT_ONLY",
        description="If True, only flag high-impact news (Fed, tariffs, crashes). False = any news.",
    )

    model_config = {"env_prefix": "", "extra": "ignore"}


class Settings(BaseSettings):
    """Root settings — aggregates all sub-configs."""

    mode: Literal["paper", "live", "backtest"] = Field(
        default="paper",
        alias="TRADING_MODE",
    )
    enabled: bool = Field(default=True, alias="TRADING_ENABLED")
    log_level: str = Field(default="INFO", alias="TRADING_LOG_LEVEL")

    # Sub-configs
    alpaca: AlpacaSettings = Field(default_factory=AlpacaSettings)
    alpaca_conventional: AlpacaConventionalSettings = Field(default_factory=AlpacaConventionalSettings)
    alpaca_crypto: AlpacaCryptoSettings = Field(default_factory=AlpacaCryptoSettings)
    risk: RiskSettings = Field(default_factory=RiskSettings)
    scanner: ScannerSettings = Field(default_factory=ScannerSettings)
    signal: SignalSettings = Field(default_factory=SignalSettings)
    slope_volume: SlopeVolumeSettings = Field(default_factory=SlopeVolumeSettings)
    supabase: SupabaseSettings = Field(default_factory=SupabaseSettings)
    tiingo: TiingoSettings = Field(default_factory=TiingoSettings)
    tiingo_news: TiingoNewsSettings = Field(default_factory=TiingoNewsSettings)
    telegram: TelegramSettings = Field(default_factory=TelegramSettings)

    # Optional (kept for backward compat — canonical location is tiingo.tiingo_api_key)
    fred_api_key: str | None = Field(default=None, alias="FRED_API_KEY")

    model_config = {"env_prefix": "", "extra": "ignore", "env_file": "../.env.local"}


@lru_cache
def get_settings() -> Settings:
    """Singleton settings instance, cached after first load."""
    return Settings()  # type: ignore[call-arg]
