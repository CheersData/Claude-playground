"""
Local SQLite database for backtest results and historical trading data.

Replaces Supabase for all backtest-related storage:
- Backtest runs (config, metrics, go/no-go)
- Backtest trades (per-trade records linked to runs)
- Historical trading signals (migrated from Supabase)
- Historical trading orders (migrated from Supabase)

This reduces Supabase egress bandwidth by keeping backtest and
historical analysis data fully local.

Usage:
    from src.utils.db_local import LocalDB

    db = LocalDB()  # uses default path: trading/data/backtest.db
    run_id = db.insert_backtest_run(config_dict, metrics_dict, go_nogo_dict)
    db.insert_backtest_trades(run_id, trades_list)

The live pipeline (pipeline.py, scheduler.py) continues to use
Supabase via db.py — this module is backtest-only.
"""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Generator

import structlog

logger = structlog.get_logger()

DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "backtest.db"


class LocalDB:
    """SQLite adapter for backtest results and historical trading data."""

    def __init__(self, db_path: Path | str = DEFAULT_DB_PATH) -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    @contextmanager
    def _connect(self) -> Generator[sqlite3.Connection, None, None]:
        """Context manager for SQLite connections with WAL mode."""
        conn = sqlite3.connect(str(self._db_path))
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _init_schema(self) -> None:
        """Create tables if they don't exist."""
        with self._connect() as conn:
            conn.executescript(_SCHEMA_SQL)
        logger.debug("local_db_initialized", path=str(self._db_path))

    # ─── Backtest Runs ────────────────────────────────────────────

    def insert_backtest_run(
        self,
        config: dict[str, Any],
        metrics: dict[str, Any],
        go_nogo: dict[str, Any],
    ) -> int:
        """Insert a backtest run and return its rowid."""
        with self._connect() as conn:
            cursor = conn.execute(
                """
                INSERT INTO backtest_runs (
                    created_at, strategy, timeframe, start_date, end_date,
                    initial_capital, config_json, metrics_json, go_nogo_json,
                    sharpe_ratio, total_return_pct, max_drawdown_pct,
                    win_rate_pct, profit_factor, total_trades, verdict
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    datetime.utcnow().isoformat(),
                    config.get("strategy", "trend_following"),
                    config.get("timeframe", "1Day"),
                    config.get("start", ""),
                    config.get("end", ""),
                    config.get("initial_capital", 100_000),
                    json.dumps(config),
                    json.dumps(metrics),
                    json.dumps(go_nogo),
                    metrics.get("sharpe_ratio", 0.0),
                    metrics.get("total_return_pct", 0.0),
                    metrics.get("max_drawdown_pct", 0.0),
                    metrics.get("win_rate_pct", 0.0),
                    metrics.get("profit_factor", 0.0),
                    metrics.get("total_trades", 0),
                    go_nogo.get("verdict", ""),
                ),
            )
            run_id = cursor.lastrowid
            assert run_id is not None
            logger.info("backtest_run_inserted", run_id=run_id, strategy=config.get("strategy"))
            return run_id

    def insert_backtest_trades(self, run_id: int, trades: list[dict[str, Any]]) -> int:
        """Insert trades for a backtest run. Returns count inserted."""
        if not trades:
            return 0
        with self._connect() as conn:
            conn.executemany(
                """
                INSERT INTO backtest_trades (
                    run_id, symbol, action, entry_date, entry_price,
                    exit_date, exit_price, shares, pnl, pnl_pct,
                    hold_days, close_reason, stop_loss, take_profit,
                    signal_score, signal_confidence
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        run_id,
                        t.get("symbol", ""),
                        t.get("action", ""),
                        t.get("entry_date", ""),
                        t.get("entry_price", 0.0),
                        t.get("exit_date", ""),
                        t.get("exit_price", 0.0),
                        t.get("shares", 0),
                        t.get("pnl", 0.0),
                        t.get("pnl_pct", 0.0),
                        t.get("hold_days", 0),
                        t.get("close_reason", ""),
                        t.get("stop_loss", 0.0),
                        t.get("take_profit", 0.0),
                        t.get("signal_score", 0.0),
                        t.get("signal_confidence", 0.0),
                    )
                    for t in trades
                ],
            )
        logger.info("backtest_trades_inserted", run_id=run_id, count=len(trades))
        return len(trades)

    def get_backtest_runs(
        self,
        strategy: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """Get recent backtest runs, optionally filtered by strategy."""
        with self._connect() as conn:
            if strategy:
                rows = conn.execute(
                    """
                    SELECT * FROM backtest_runs
                    WHERE strategy = ?
                    ORDER BY created_at DESC LIMIT ?
                    """,
                    (strategy, limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT * FROM backtest_runs
                    ORDER BY created_at DESC LIMIT ?
                    """,
                    (limit,),
                ).fetchall()
            return [dict(r) for r in rows]

    def get_backtest_trades(self, run_id: int) -> list[dict[str, Any]]:
        """Get all trades for a backtest run."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM backtest_trades WHERE run_id = ? ORDER BY entry_date",
                (run_id,),
            ).fetchall()
            return [dict(r) for r in rows]

    # ─── Historical Trading Signals (migrated from Supabase) ─────

    def insert_signal(self, signal_type: str, data: dict[str, Any], created_at: str | None = None) -> int:
        """Insert a historical trading signal."""
        with self._connect() as conn:
            cursor = conn.execute(
                """
                INSERT INTO trading_signals (signal_type, data_json, created_at)
                VALUES (?, ?, ?)
                """,
                (
                    signal_type,
                    json.dumps(data),
                    created_at or datetime.utcnow().isoformat(),
                ),
            )
            return cursor.lastrowid or 0

    def insert_signals_batch(self, signals: list[dict[str, Any]]) -> int:
        """Bulk insert signals (for migration). Returns count inserted."""
        if not signals:
            return 0
        with self._connect() as conn:
            conn.executemany(
                """
                INSERT OR IGNORE INTO trading_signals (supabase_id, signal_type, data_json, created_at)
                VALUES (?, ?, ?, ?)
                """,
                [
                    (
                        s.get("id", ""),
                        s.get("signal_type", ""),
                        json.dumps(s.get("data", {})),
                        s.get("created_at", datetime.utcnow().isoformat()),
                    )
                    for s in signals
                ],
            )
        logger.info("signals_batch_inserted", count=len(signals))
        return len(signals)

    def get_signals(self, signal_type: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
        """Get historical signals, optionally filtered by type."""
        with self._connect() as conn:
            if signal_type:
                rows = conn.execute(
                    """
                    SELECT * FROM trading_signals
                    WHERE signal_type = ?
                    ORDER BY created_at DESC LIMIT ?
                    """,
                    (signal_type, limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM trading_signals ORDER BY created_at DESC LIMIT ?",
                    (limit,),
                ).fetchall()
            result = []
            for r in rows:
                d = dict(r)
                d["data"] = json.loads(d.pop("data_json", "{}"))
                result.append(d)
            return result

    # ─── Historical Trading Orders (migrated from Supabase) ──────

    def insert_order(self, order_data: dict[str, Any]) -> int:
        """Insert a historical trading order."""
        with self._connect() as conn:
            cursor = conn.execute(
                """
                INSERT INTO trading_orders (
                    supabase_id, alpaca_order_id, symbol, side, qty,
                    order_type, status, limit_price, stop_price,
                    filled_avg_price, filled_qty, filled_at,
                    stop_loss, take_profit, commission, error_message, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    order_data.get("id", ""),
                    order_data.get("alpaca_order_id", ""),
                    order_data.get("symbol", ""),
                    order_data.get("side", ""),
                    order_data.get("qty", 0),
                    order_data.get("order_type", "market"),
                    order_data.get("status", "pending"),
                    order_data.get("limit_price"),
                    order_data.get("stop_price"),
                    order_data.get("filled_avg_price"),
                    order_data.get("filled_qty"),
                    order_data.get("filled_at"),
                    order_data.get("stop_loss"),
                    order_data.get("take_profit"),
                    order_data.get("commission", 0),
                    order_data.get("error_message"),
                    order_data.get("created_at", datetime.utcnow().isoformat()),
                ),
            )
            return cursor.lastrowid or 0

    def insert_orders_batch(self, orders: list[dict[str, Any]]) -> int:
        """Bulk insert orders (for migration). Returns count inserted."""
        if not orders:
            return 0
        with self._connect() as conn:
            conn.executemany(
                """
                INSERT OR IGNORE INTO trading_orders (
                    supabase_id, alpaca_order_id, symbol, side, qty,
                    order_type, status, limit_price, stop_price,
                    filled_avg_price, filled_qty, filled_at,
                    stop_loss, take_profit, commission, error_message, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        o.get("id", ""),
                        o.get("alpaca_order_id", ""),
                        o.get("symbol", ""),
                        o.get("side", ""),
                        o.get("qty", 0),
                        o.get("order_type", "market"),
                        o.get("status", "pending"),
                        o.get("limit_price"),
                        o.get("stop_price"),
                        o.get("filled_avg_price"),
                        o.get("filled_qty"),
                        o.get("filled_at"),
                        o.get("stop_loss"),
                        o.get("take_profit"),
                        o.get("commission", 0),
                        o.get("error_message"),
                        o.get("created_at", datetime.utcnow().isoformat()),
                    )
                    for o in orders
                ],
            )
        logger.info("orders_batch_inserted", count=len(orders))
        return len(orders)

    def get_orders(self, symbol: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
        """Get historical orders, optionally filtered by symbol."""
        with self._connect() as conn:
            if symbol:
                rows = conn.execute(
                    """
                    SELECT * FROM trading_orders
                    WHERE symbol = ?
                    ORDER BY created_at DESC LIMIT ?
                    """,
                    (symbol, limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM trading_orders ORDER BY created_at DESC LIMIT ?",
                    (limit,),
                ).fetchall()
            return [dict(r) for r in rows]

    # ─── Stats ────────────────────────────────────────────────────

    def stats(self) -> dict[str, int]:
        """Return row counts for all tables."""
        with self._connect() as conn:
            counts = {}
            for table in ("backtest_runs", "backtest_trades", "trading_signals", "trading_orders"):
                row = conn.execute(f"SELECT COUNT(*) as cnt FROM {table}").fetchone()  # noqa: S608
                counts[table] = row["cnt"] if row else 0
            return counts


# ─── Schema ──────────────────────────────────────────────────────

_SCHEMA_SQL = """
-- Backtest runs: one row per backtest execution
CREATE TABLE IF NOT EXISTS backtest_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    strategy TEXT NOT NULL DEFAULT 'trend_following',
    timeframe TEXT NOT NULL DEFAULT '1Day',
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    initial_capital REAL NOT NULL DEFAULT 100000.0,
    config_json TEXT NOT NULL DEFAULT '{}',
    metrics_json TEXT NOT NULL DEFAULT '{}',
    go_nogo_json TEXT NOT NULL DEFAULT '{}',
    -- Denormalized for fast queries/sorting
    sharpe_ratio REAL NOT NULL DEFAULT 0.0,
    total_return_pct REAL NOT NULL DEFAULT 0.0,
    max_drawdown_pct REAL NOT NULL DEFAULT 0.0,
    win_rate_pct REAL NOT NULL DEFAULT 0.0,
    profit_factor REAL NOT NULL DEFAULT 0.0,
    total_trades INTEGER NOT NULL DEFAULT 0,
    verdict TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_bt_runs_strategy ON backtest_runs (strategy);
CREATE INDEX IF NOT EXISTS idx_bt_runs_sharpe ON backtest_runs (sharpe_ratio DESC);
CREATE INDEX IF NOT EXISTS idx_bt_runs_created ON backtest_runs (created_at DESC);

-- Backtest trades: individual trades linked to a run
CREATE TABLE IF NOT EXISTS backtest_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES backtest_runs(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    action TEXT NOT NULL,
    entry_date TEXT NOT NULL,
    entry_price REAL NOT NULL,
    exit_date TEXT NOT NULL,
    exit_price REAL NOT NULL,
    shares INTEGER NOT NULL,
    pnl REAL NOT NULL DEFAULT 0.0,
    pnl_pct REAL NOT NULL DEFAULT 0.0,
    hold_days INTEGER NOT NULL DEFAULT 0,
    close_reason TEXT NOT NULL DEFAULT '',
    stop_loss REAL NOT NULL DEFAULT 0.0,
    take_profit REAL NOT NULL DEFAULT 0.0,
    signal_score REAL NOT NULL DEFAULT 0.0,
    signal_confidence REAL NOT NULL DEFAULT 0.0
);

CREATE INDEX IF NOT EXISTS idx_bt_trades_run ON backtest_trades (run_id);
CREATE INDEX IF NOT EXISTS idx_bt_trades_symbol ON backtest_trades (symbol);

-- Historical trading signals (migrated from Supabase trading_signals)
CREATE TABLE IF NOT EXISTS trading_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supabase_id TEXT UNIQUE,
    signal_type TEXT NOT NULL,
    data_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_signals_type ON trading_signals (signal_type, created_at DESC);

-- Historical trading orders (migrated from Supabase trading_orders)
CREATE TABLE IF NOT EXISTS trading_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supabase_id TEXT UNIQUE,
    alpaca_order_id TEXT,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    qty INTEGER NOT NULL,
    order_type TEXT NOT NULL DEFAULT 'market',
    status TEXT NOT NULL DEFAULT 'pending',
    limit_price REAL,
    stop_price REAL,
    filled_avg_price REAL,
    filled_qty INTEGER,
    filled_at TEXT,
    stop_loss REAL,
    take_profit REAL,
    commission REAL NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_symbol ON trading_orders (symbol, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON trading_orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_alpaca ON trading_orders (alpaca_order_id);
"""
