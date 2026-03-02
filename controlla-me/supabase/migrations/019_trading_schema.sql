-- ============================================================
-- Migration 019: Trading Schema
-- Ufficio Trading — tabelle per swing trading automatizzato
-- ============================================================

-- Trading configuration (singleton, active row)
CREATE TABLE IF NOT EXISTS trading_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    active BOOLEAN NOT NULL DEFAULT true,
    mode TEXT NOT NULL DEFAULT 'paper' CHECK (mode IN ('paper', 'live', 'backtest')),
    enabled BOOLEAN NOT NULL DEFAULT true,
    -- Risk parameters (mirrored from Python config, authoritative source)
    max_daily_loss_pct NUMERIC(5,2) NOT NULL DEFAULT -2.00,
    max_weekly_loss_pct NUMERIC(5,2) NOT NULL DEFAULT -5.00,
    max_position_pct NUMERIC(5,2) NOT NULL DEFAULT 10.00,
    max_positions INTEGER NOT NULL DEFAULT 10,
    max_sector_exposure_pct NUMERIC(5,2) NOT NULL DEFAULT 30.00,
    stop_loss_pct NUMERIC(5,2) NOT NULL DEFAULT -5.00,
    -- Kill switch state
    kill_switch_active BOOLEAN NOT NULL DEFAULT false,
    kill_switch_reason TEXT,
    kill_switch_at TIMESTAMPTZ,
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure only one active config
CREATE UNIQUE INDEX IF NOT EXISTS idx_trading_config_active
    ON trading_config (active) WHERE active = true;

-- Insert default config
INSERT INTO trading_config (active, mode, enabled)
VALUES (true, 'paper', true)
ON CONFLICT DO NOTHING;

-- Trading signals (scan results, trade signals, risk checks)
CREATE TABLE IF NOT EXISTS trading_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_type TEXT NOT NULL CHECK (signal_type IN ('scan', 'trade', 'risk_check', 'kill_switch')),
    data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trading_signals_type_date
    ON trading_signals (signal_type, created_at DESC);

-- Trading orders (executed orders on Alpaca)
CREATE TABLE IF NOT EXISTS trading_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alpaca_order_id TEXT,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
    qty INTEGER NOT NULL,
    order_type TEXT NOT NULL DEFAULT 'market' CHECK (order_type IN ('market', 'limit', 'stop', 'bracket')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'filled', 'partially_filled', 'cancelled', 'rejected', 'expired')),
    limit_price NUMERIC(12,4),
    stop_price NUMERIC(12,4),
    filled_avg_price NUMERIC(12,4),
    filled_qty INTEGER,
    filled_at TIMESTAMPTZ,
    stop_loss NUMERIC(12,4),
    take_profit NUMERIC(12,4),
    commission NUMERIC(10,4) NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trading_orders_symbol ON trading_orders (symbol, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trading_orders_status ON trading_orders (status);
CREATE INDEX IF NOT EXISTS idx_trading_orders_alpaca ON trading_orders (alpaca_order_id);

-- Portfolio positions (current snapshot, upserted by Portfolio Monitor)
CREATE TABLE IF NOT EXISTS portfolio_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol TEXT NOT NULL,
    qty INTEGER NOT NULL,
    avg_entry_price NUMERIC(12,4) NOT NULL,
    current_price NUMERIC(12,4) NOT NULL,
    market_value NUMERIC(14,4) NOT NULL,
    unrealized_pnl NUMERIC(14,4) NOT NULL DEFAULT 0,
    unrealized_pnl_pct NUMERIC(8,4) NOT NULL DEFAULT 0,
    sector TEXT,
    days_held INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_portfolio_positions_symbol
    ON portfolio_positions (symbol);

-- Portfolio snapshots (daily P&L history)
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date TEXT NOT NULL,  -- YYYY-MM-DD
    portfolio_value NUMERIC(14,4) NOT NULL,
    cash NUMERIC(14,4) NOT NULL,
    positions_value NUMERIC(14,4) NOT NULL,
    daily_pnl NUMERIC(14,4) NOT NULL DEFAULT 0,
    daily_pnl_pct NUMERIC(8,4) NOT NULL DEFAULT 0,
    weekly_pnl_pct NUMERIC(8,4) NOT NULL DEFAULT 0,
    max_drawdown_pct NUMERIC(8,4) NOT NULL DEFAULT 0,
    sharpe_30d NUMERIC(8,4),
    win_rate NUMERIC(5,4),
    positions_count INTEGER NOT NULL DEFAULT 0,
    positions JSONB NOT NULL DEFAULT '[]',
    alerts JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_portfolio_snapshots_date
    ON portfolio_snapshots (date);

-- Risk events (kill switch, stop loss, warnings)
CREATE TABLE IF NOT EXISTS risk_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL CHECK (event_type IN (
        'KILL_SWITCH_DAILY', 'KILL_SWITCH_WEEKLY',
        'STOP_LOSS', 'TAKE_PROFIT',
        'WARNING', 'CONNECTION_LOST'
    )),
    severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
    symbol TEXT,
    message TEXT NOT NULL,
    portfolio_value NUMERIC(14,4),
    daily_pnl_pct NUMERIC(8,4),
    weekly_pnl_pct NUMERIC(8,4),
    action_taken TEXT,
    acknowledged BOOLEAN NOT NULL DEFAULT false,
    acknowledged_by TEXT,
    acknowledged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_risk_events_type ON risk_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_events_severity ON risk_events (severity, created_at DESC);

-- ============================================================
-- RLS Policies (trading data is system-level, not per-user)
-- Only service_role can read/write trading tables
-- ============================================================

ALTER TABLE trading_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_events ENABLE ROW LEVEL SECURITY;

-- Service role has full access (Python trading system uses service_role_key)
CREATE POLICY "service_role_trading_config" ON trading_config
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_trading_signals" ON trading_signals
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_trading_orders" ON trading_orders
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_portfolio_positions" ON portfolio_positions
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_portfolio_snapshots" ON portfolio_snapshots
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_risk_events" ON risk_events
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- Helper function: update trading_config.updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_trading_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trading_config_updated
    BEFORE UPDATE ON trading_config
    FOR EACH ROW
    EXECUTE FUNCTION update_trading_config_timestamp();

-- ============================================================
-- TTL: auto-cleanup old signals (keep 90 days)
-- ============================================================

CREATE OR REPLACE FUNCTION cleanup_old_trading_signals()
RETURNS void AS $$
BEGIN
    DELETE FROM trading_signals
    WHERE created_at < now() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;
