-- ============================================================
-- Migration 021: Trailing Stop State
-- ============================================================
-- Tracks per-position trailing stop state for dynamic stop loss management.
-- 4-tier system matching backtest engine (breakeven → lock → trail → tight trail).
-- Part of: Trading Pipeline Enhancement (trailing stop in live)
-- Depends on: 019 (trading schema)
-- ============================================================

CREATE TABLE IF NOT EXISTS trailing_stop_state (
    symbol TEXT PRIMARY KEY,
    entry_price NUMERIC(12,4) NOT NULL,
    atr_at_entry NUMERIC(12,4) NOT NULL,
    highest_close NUMERIC(12,4) NOT NULL,
    current_stop_price NUMERIC(12,4) NOT NULL,
    original_stop_price NUMERIC(12,4) NOT NULL,
    stop_order_id TEXT,              -- Alpaca order ID for the stop loss leg
    take_profit_price NUMERIC(12,4),
    tier_reached INTEGER NOT NULL DEFAULT 0,  -- 0=none, 1=breakeven, 2=lock, 3=trail, 4=tight
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: only service_role (Python trading system)
ALTER TABLE trailing_stop_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_trailing_stop" ON trailing_stop_state
    FOR ALL USING (auth.role() = 'service_role');

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_trailing_stop_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trailing_stop_updated_at
    BEFORE UPDATE ON trailing_stop_state
    FOR EACH ROW
    EXECUTE FUNCTION update_trailing_stop_timestamp();
