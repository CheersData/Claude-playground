-- Migration 038: Webhook events idempotency table + sync retry columns
--
-- Supports:
-- 1. webhook_events: Idempotent webhook processing (dedup by webhook_id)
-- 2. integration_connections: New columns for sync scheduler retry logic
--
-- Run on Supabase SQL Editor after migration 037.

-- ─── 1. Webhook Events Table ───
-- Stores received webhook events for idempotency and audit.
-- The webhook_id is unique — duplicate webhooks are rejected before processing.
-- TTL: 90 days (cleanup via periodic DELETE WHERE received_at < now() - interval '90 days')

CREATE TABLE IF NOT EXISTS webhook_events (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_id      text NOT NULL UNIQUE,           -- Provider-specific event ID for dedup
  connector_id    text NOT NULL,                   -- e.g. "hubspot", "fatture-in-cloud"
  connection_id   uuid REFERENCES integration_connections(id) ON DELETE SET NULL,
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'processing'
                  CHECK (status IN ('processing', 'processed', 'error', 'no_connection', 'duplicate')),
  payload         jsonb DEFAULT '{}'::jsonb,       -- Raw webhook payload (for debugging)
  error_message   text,                            -- Error message if processing failed
  sync_result     jsonb,                           -- Summary of sync triggered by this webhook
  received_at     timestamptz NOT NULL DEFAULT now(),
  processed_at    timestamptz,                     -- When processing completed
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Index for idempotency lookups (primary dedup mechanism)
CREATE INDEX IF NOT EXISTS idx_webhook_events_webhook_id
  ON webhook_events(webhook_id);

-- Index for listing events by connector + time (dashboard/audit)
CREATE INDEX IF NOT EXISTS idx_webhook_events_connector_time
  ON webhook_events(connector_id, received_at DESC);

-- Index for listing events by connection (per-user view)
CREATE INDEX IF NOT EXISTS idx_webhook_events_connection
  ON webhook_events(connection_id, received_at DESC)
  WHERE connection_id IS NOT NULL;

-- TTL cleanup index (for periodic purge of old events)
CREATE INDEX IF NOT EXISTS idx_webhook_events_ttl
  ON webhook_events(received_at)
  WHERE received_at < now() - interval '90 days';

-- RLS: service_role only (webhook processing is server-to-server)
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- No user-facing policies — only service_role can read/write webhook_events.
-- This is intentional: webhook events are internal infrastructure.

-- ─── 2. Integration Connections: Retry Columns ───
-- Add columns for the sync scheduler's exponential backoff.

-- consecutive_failures: tracks how many sync attempts have failed in a row.
-- Reset to 0 on successful sync. Used for backoff calculation.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'integration_connections'
    AND column_name = 'consecutive_failures'
  ) THEN
    ALTER TABLE integration_connections
      ADD COLUMN consecutive_failures integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- poll_interval_minutes: per-connection override of the default poll interval.
-- NULL = use connector default (15min for google-drive, 30min for others).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'integration_connections'
    AND column_name = 'poll_interval_minutes'
  ) THEN
    ALTER TABLE integration_connections
      ADD COLUMN poll_interval_minutes integer;
  END IF;
END $$;

-- Allow "error_retry" as a valid status (connection failed but will be retried)
-- The CHECK constraint on status may need updating. If the column has a CHECK,
-- we need to drop and recreate it. If it doesn't, this is a no-op.
-- Safe approach: add the value to the enum if it exists, otherwise skip.
DO $$
BEGIN
  -- Try to add error_retry to the check constraint
  -- If integration_connections.status has a CHECK constraint, update it.
  -- If not, this is harmless.
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name LIKE '%integration_connections_status%'
  ) THEN
    ALTER TABLE integration_connections DROP CONSTRAINT IF EXISTS integration_connections_status_check;
    ALTER TABLE integration_connections ADD CONSTRAINT integration_connections_status_check
      CHECK (status IN ('active', 'inactive', 'disconnected', 'error', 'error_retry', 'pending', 'syncing'));
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- Constraint doesn't exist or can't be modified — status is likely text without CHECK
    NULL;
END $$;

-- Index for scheduler queries: find connections due for sync
CREATE INDEX IF NOT EXISTS idx_integration_connections_scheduler
  ON integration_connections(connector_type, status, last_sync_at)
  WHERE status IN ('active', 'error_retry');

-- ─── 3. Cleanup function for old webhook events (TTL 90 days) ───

CREATE OR REPLACE FUNCTION cleanup_old_webhook_events()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM webhook_events
  WHERE received_at < now() - interval '90 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Grant execute to service_role only
REVOKE ALL ON FUNCTION cleanup_old_webhook_events() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cleanup_old_webhook_events() TO service_role;

COMMENT ON TABLE webhook_events IS
  'Stores received webhook events for idempotency and audit. TTL: 90 days.';
COMMENT ON COLUMN webhook_events.webhook_id IS
  'Provider-specific unique event ID. Used for dedup — duplicate webhooks are rejected.';
COMMENT ON COLUMN integration_connections.consecutive_failures IS
  'Number of consecutive sync failures. Reset to 0 on success. Used for exponential backoff.';
COMMENT ON COLUMN integration_connections.poll_interval_minutes IS
  'Per-connection poll interval override (minutes). NULL = use connector default.';
