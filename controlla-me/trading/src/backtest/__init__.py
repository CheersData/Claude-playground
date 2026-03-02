"""Backtesting framework — Phase 2 implementation."""

from .data_loader import DataLoader
from .engine import BacktestConfig, BacktestEngine, BacktestResult, TradeRecord
from .metrics import PerformanceMetrics, calculate_metrics
from .report import generate_report

__all__ = [
    "DataLoader",
    "BacktestConfig",
    "BacktestEngine",
    "BacktestResult",
    "TradeRecord",
    "PerformanceMetrics",
    "calculate_metrics",
    "generate_report",
]
