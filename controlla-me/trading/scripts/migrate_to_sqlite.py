"""
Migrate trading data from Supabase to local SQLite.

Exports trading_orders and trading_signals from Supabase into
trading/data/backtest.db for local analysis. After migration,
these rows can be deleted from Supabase to free egress bandwidth.

Usage:
    cd trading
    python scripts/migrate_to_sqlite.py                    # export only
    python scripts/migrate_to_sqlite.py --delete-after     # export + delete from Supabase
    python scripts/migrate_to_sqlite.py --dry-run          # show counts, no changes

Requires:
    NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Add trading/ to path so we can import src.*
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import structlog
from dotenv import load_dotenv

# Load env before any settings import
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env.local", override=False)

structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.dev.ConsoleRenderer(colors=True),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
)

logger = structlog.get_logger()


def fetch_all_paginated(client, table: str, page_size: int = 1000) -> list[dict]:
    """Fetch all rows from a Supabase table using offset pagination."""
    all_rows: list[dict] = []
    offset = 0

    while True:
        result = (
            client.table(table)
            .select("*")
            .order("created_at", desc=False)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows = result.data or []
        if not rows:
            break
        all_rows.extend(rows)
        offset += len(rows)
        if len(rows) < page_size:
            break

    return all_rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate trading data from Supabase to SQLite")
    parser.add_argument(
        "--delete-after",
        action="store_true",
        help="Delete migrated rows from Supabase after successful export",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show row counts without making any changes",
    )
    parser.add_argument(
        "--db-path",
        type=str,
        default=None,
        help="Custom SQLite DB path (default: trading/data/backtest.db)",
    )
    args = parser.parse_args()

    # Import Supabase client
    try:
        from src.utils.db import get_supabase
    except Exception as e:
        print(f"Error: Cannot connect to Supabase: {e}")
        print("Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local")
        sys.exit(1)

    supabase = get_supabase()

    # Fetch counts first
    print("\n" + "=" * 60)
    print("  SUPABASE -> SQLite MIGRATION")
    print("=" * 60)

    # Fetch all data
    print("\nFetching trading_signals from Supabase...")
    signals = fetch_all_paginated(supabase, "trading_signals")
    print(f"  Found {len(signals)} signals")

    print("Fetching trading_orders from Supabase...")
    orders = fetch_all_paginated(supabase, "trading_orders")
    print(f"  Found {len(orders)} orders")

    if args.dry_run:
        print("\n[DRY RUN] No changes made.")
        print(f"  Would migrate: {len(signals)} signals + {len(orders)} orders")
        return

    if not signals and not orders:
        print("\nNothing to migrate.")
        return

    # Import local DB
    from src.utils.db_local import LocalDB

    db_path = Path(args.db_path) if args.db_path else None
    local_db = LocalDB(db_path) if db_path else LocalDB()

    # Insert into SQLite
    print(f"\nInserting into SQLite ({local_db._db_path})...")

    if signals:
        inserted_signals = local_db.insert_signals_batch(signals)
        print(f"  Signals inserted: {inserted_signals}")

    if orders:
        inserted_orders = local_db.insert_orders_batch(orders)
        print(f"  Orders inserted: {inserted_orders}")

    # Show stats
    stats = local_db.stats()
    print(f"\nSQLite stats after migration:")
    for table, count in stats.items():
        print(f"  {table}: {count} rows")

    # Delete from Supabase if requested
    if args.delete_after:
        print("\nDeleting migrated data from Supabase...")

        if signals:
            signal_ids = [s["id"] for s in signals if s.get("id")]
            # Delete in batches of 100
            deleted_signals = 0
            for i in range(0, len(signal_ids), 100):
                batch = signal_ids[i : i + 100]
                for sid in batch:
                    supabase.table("trading_signals").delete().eq("id", sid).execute()
                deleted_signals += len(batch)
            print(f"  Deleted {deleted_signals} signals from Supabase")

        if orders:
            order_ids = [o["id"] for o in orders if o.get("id")]
            deleted_orders = 0
            for i in range(0, len(order_ids), 100):
                batch = order_ids[i : i + 100]
                for oid in batch:
                    supabase.table("trading_orders").delete().eq("id", oid).execute()
                deleted_orders += len(batch)
            print(f"  Deleted {deleted_orders} orders from Supabase")

        print("\nSupabase cleanup complete.")

    print("\nMigration complete.")
    print(f"SQLite DB: {local_db._db_path}")
    print()


if __name__ == "__main__":
    main()
