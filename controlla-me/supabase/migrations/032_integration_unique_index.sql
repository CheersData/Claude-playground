-- Migration 032: Unique index for integration_connections upsert
-- Prevents duplicate active connections for the same user+connector pair

CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_connections_user_connector_active
  ON integration_connections (user_id, connector_type)
  WHERE status != 'disconnected';
