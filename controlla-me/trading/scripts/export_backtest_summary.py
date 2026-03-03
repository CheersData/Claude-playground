"""
Export backtest results to CSV for external AI review.

Genera:
  1. backtest_summary.csv   — tutte le run, 1 riga per run (params + metrics + go/nogo)
  2. all_trades.csv         — tutti i trade da tutte le run, con run_id
  3. grid_summary.csv       — risultati grid search (se presenti)

Usage:
    cd trading
    python scripts/export_backtest_summary.py

Output in: trading/exports/
"""

from __future__ import annotations

import csv
import json
import os
from pathlib import Path

BACKTEST_DIR = Path(__file__).parent.parent / "backtest-results"
EXPORT_DIR = Path(__file__).parent.parent / "exports"
EXPORT_DIR.mkdir(exist_ok=True)


def load_report(run_dir: Path) -> dict | None:
    report_path = run_dir / "report.json"
    if not report_path.exists():
        return None
    try:
        return json.loads(report_path.read_text())
    except Exception as e:
        print(f"  ⚠ Skipping {run_dir.name}: {e}")
        return None


def load_trades(run_dir: Path) -> list[dict]:
    trades_path = run_dir / "trades.csv"
    if not trades_path.exists():
        return []
    trades = []
    with open(trades_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            row["run_id"] = run_dir.name
            trades.append(row)
    return trades


def flatten_run(run_id: str, report: dict) -> dict:
    cfg = report.get("config", {})
    perf = report.get("performance", {})
    trades_summary = report.get("trades", {})
    go = report.get("go_nogo", {})
    checks = go.get("checks", {})

    return {
        # Identificativo
        "run_id": run_id,
        "generated_at": report.get("generated_at", ""),
        # Config / parametri
        "start": cfg.get("start", ""),
        "end": cfg.get("end", ""),
        "initial_capital": cfg.get("initial_capital", ""),
        "slippage_bps": cfg.get("slippage_bps", ""),
        "max_positions": cfg.get("max_positions", ""),
        "max_position_pct": cfg.get("max_position_pct", ""),
        "max_loss_per_trade_pct": cfg.get("max_loss_per_trade_pct", ""),
        "daily_loss_limit_pct": cfg.get("daily_loss_limit_pct", ""),
        "weekly_loss_limit_pct": cfg.get("weekly_loss_limit_pct", ""),
        # Performance
        "total_return_pct": round(perf.get("total_return_pct", 0), 4),
        "cagr_pct": round(perf.get("cagr_pct", 0), 4),
        "annualized_volatility_pct": round(perf.get("annualized_volatility_pct", 0), 4),
        "sharpe_ratio": round(perf.get("sharpe_ratio", 0), 4),
        "sortino_ratio": round(perf.get("sortino_ratio", 0), 4),
        "max_drawdown_pct": round(perf.get("max_drawdown_pct", 0), 4),
        "max_drawdown_duration_days": perf.get("max_drawdown_duration_days", ""),
        "avg_drawdown_pct": round(perf.get("avg_drawdown_pct", 0), 4),
        # Trade stats
        "total_trades": trades_summary.get("total", ""),
        "winning_trades": trades_summary.get("winning", ""),
        "losing_trades": trades_summary.get("losing", ""),
        "win_rate_pct": round(trades_summary.get("win_rate_pct", 0), 2),
        "profit_factor": round(trades_summary.get("profit_factor", 0), 4),
        "avg_win_pct": round(trades_summary.get("avg_win_pct", 0), 4),
        "avg_loss_pct": round(trades_summary.get("avg_loss_pct", 0), 4),
        "best_trade_pct": round(trades_summary.get("best_trade_pct", 0), 4),
        "worst_trade_pct": round(trades_summary.get("worst_trade_pct", 0), 4),
        "avg_hold_days": round(trades_summary.get("avg_hold_days", 0), 2),
        "max_loss_streak": trades_summary.get("max_loss_streak", ""),
        # Go/No-Go
        "go_nogo": "PASS" if go.get("pass") else "NO-GO",
        "sharpe_pass": checks.get("sharpe", {}).get("pass", ""),
        "drawdown_pass": checks.get("max_drawdown", {}).get("pass", ""),
        "win_rate_pass": checks.get("win_rate", {}).get("pass", ""),
        "profit_factor_pass": checks.get("profit_factor", {}).get("pass", ""),
        "total_trades_pass": checks.get("total_trades", {}).get("pass", ""),
    }


def main() -> None:
    # ── 1. Separa run standard da grid search ──────────────────────────────
    all_dirs = sorted(BACKTEST_DIR.iterdir())
    standard_dirs = [d for d in all_dirs if d.is_dir() and not d.name.startswith("grid_")]
    grid_dirs = [d for d in all_dirs if d.is_dir() and d.name.startswith("grid_")]

    # ── 2. backtest_summary.csv ────────────────────────────────────────────
    summary_rows = []
    all_trades = []

    for run_dir in standard_dirs:
        report = load_report(run_dir)
        if report is None:
            continue
        summary_rows.append(flatten_run(run_dir.name, report))
        trades = load_trades(run_dir)
        all_trades.extend(trades)

    if summary_rows:
        summary_path = EXPORT_DIR / "backtest_summary.csv"
        fieldnames = list(summary_rows[0].keys())
        with open(summary_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(summary_rows)
        print(f"✅ backtest_summary.csv — {len(summary_rows)} run")

    # ── 3. all_trades.csv ──────────────────────────────────────────────────
    if all_trades:
        trades_path = EXPORT_DIR / "all_trades.csv"
        fieldnames = list(all_trades[0].keys())
        with open(trades_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(all_trades)
        print(f"✅ all_trades.csv     — {len(all_trades)} trade totali da {len(standard_dirs)} run")

    # ── 4. grid_summary.csv ────────────────────────────────────────────────
    grid_rows = []
    for grid_dir in grid_dirs:
        # Grid dirs contengono sotto-run per ogni combinazione di parametri
        for combo_dir in sorted(grid_dir.iterdir()):
            if not combo_dir.is_dir():
                continue
            report = load_report(combo_dir)
            if report is None:
                continue
            row = flatten_run(f"{grid_dir.name}/{combo_dir.name}", report)
            row["grid_name"] = grid_dir.name
            grid_rows.append(row)

    if grid_rows:
        grid_path = EXPORT_DIR / "grid_summary.csv"
        fieldnames = ["grid_name"] + [k for k in grid_rows[0].keys() if k != "grid_name"]
        with open(grid_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(grid_rows)
        print(f"✅ grid_summary.csv   — {len(grid_rows)} combinazioni da {len(grid_dirs)} grid search")

    print(f"\n📁 Export in: {EXPORT_DIR.resolve()}")
    print("\n💡 Prompt suggerito per ChatGPT / Claude:")
    print("""
Allega: backtest_summary.csv + all_trades.csv

Prompt:
"Questa è una strategia di swing trading basata su slope+volume (regressione lineare OLS
su barre da 1 minuto). Ho testato 35 configurazioni diverse. Il problema principale è che
lo Sharpe ratio è quasi sempre < 1 nonostante il return totale sia positivo.
Analizza questi dati e dimmi:
1. Perché lo Sharpe è così basso? (correlazione tra parametri e Sharpe)
2. Quali combinazioni di parametri avvicinano di più Sharpe > 1?
3. Il win_rate e profit_factor sono buoni — cosa abbassa il Sharpe?
4. Suggerisci miglioramenti alla strategia basandoti sui dati."
""")


if __name__ == "__main__":
    main()
