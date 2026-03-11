-- Migration 024: Add 'pending_retry' to trading_signals signal_type constraint
-- Executor uses 'pending_retry' to schedule failed orders for re-execution
-- at the next pipeline cycle. The original constraint was missing this value.

ALTER TABLE trading_signals DROP CONSTRAINT IF EXISTS trading_signals_signal_type_check;

ALTER TABLE trading_signals ADD CONSTRAINT trading_signals_signal_type_check
    CHECK (signal_type IN ('scan', 'trade', 'risk_check', 'kill_switch', 'pending_retry'));
