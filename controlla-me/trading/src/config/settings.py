"""
Central configuration for the trading system.
Reads from environment variables with sensible defaults for paper trading.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings


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
    kelly_fraction: float = Field(default=0.5, description="Half-Kelly for position sizing")

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

    model_config = {"env_prefix": "TRADING_SCANNER_", "extra": "ignore"}


class SignalSettings(BaseSettings):
    """Signal generator parameters."""

    min_confidence: float = Field(default=0.6, description="Min confidence to pass to Risk Manager")
    rsi_period: int = Field(default=14, description="RSI period")
    rsi_overbought: float = Field(default=70.0, description="RSI overbought level")
    rsi_oversold: float = Field(default=30.0, description="RSI oversold level")
    macd_fast: int = Field(default=12, description="MACD fast period")
    macd_slow: int = Field(default=26, description="MACD slow period")
    macd_signal: int = Field(default=9, description="MACD signal period")
    bb_period: int = Field(default=20, description="Bollinger Bands period")
    bb_std: float = Field(default=2.0, description="Bollinger Bands std dev")

    # Indicator weights for composite score
    weight_rsi: float = 0.15
    weight_macd: float = 0.25
    weight_bollinger: float = 0.15
    weight_trend: float = 0.25
    weight_volume: float = 0.20

    model_config = {"env_prefix": "TRADING_SIGNAL_", "extra": "ignore"}


class SupabaseSettings(BaseSettings):
    """Supabase connection (shared with the main app)."""

    url: str = Field(..., alias="NEXT_PUBLIC_SUPABASE_URL")
    service_role_key: str = Field(..., alias="SUPABASE_SERVICE_ROLE_KEY")

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
    risk: RiskSettings = Field(default_factory=RiskSettings)
    scanner: ScannerSettings = Field(default_factory=ScannerSettings)
    signal: SignalSettings = Field(default_factory=SignalSettings)
    supabase: SupabaseSettings = Field(default_factory=SupabaseSettings)

    # Optional
    fred_api_key: str | None = Field(default=None, alias="FRED_API_KEY")

    model_config = {"env_prefix": "", "extra": "ignore", "env_file": "../.env.local"}


@lru_cache
def get_settings() -> Settings:
    """Singleton settings instance, cached after first load."""
    return Settings()  # type: ignore[call-arg]
