-- ============================================================
-- Migration 031: Integration Office Tables
-- 5 tables for the Integration Office:
--   integration_credentials, integration_connections,
--   integration_sync_log, integration_field_mappings,
--   integration_credential_audit
-- ADR: ADR-integration-framework.md
-- ============================================================
-- ROLLBACK: DROP TABLE IF EXISTS integration_credential_audit CASCADE;
-- ROLLBACK: DROP TABLE IF EXISTS integration_field_mappings CASCADE;
-- ROLLBACK: DROP TABLE IF EXISTS integration_sync_log CASCADE;
-- ROLLBACK: DROP TABLE IF EXISTS integration_connections CASCADE;
-- ROLLBACK: DROP TABLE IF EXISTS integration_credentials CASCADE;
-- ROLLBACK: DROP FUNCTION IF EXISTS cleanup_expired_mappings CASCADE;
-- ROLLBACK: DROP FUNCTION IF EXISTS cleanup_old_sync_logs CASCADE;
-- ROLLBACK: DROP FUNCTION IF EXISTS cleanup_old_audit_logs CASCADE;
-- ROLLBACK: DROP FUNCTION IF EXISTS update_integration_credentials_timestamp CASCADE;
-- ROLLBACK: DROP FUNCTION IF EXISTS update_integration_connections_timestamp CASCADE;
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. INTEGRATION_CREDENTIALS
-- OAuth2 credentials storage with AES-256-GCM encryption.
-- Each user stores encrypted tokens per provider.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS integration_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    provider TEXT NOT NULL,                          -- e.g. 'fatture_in_cloud', 'google_drive', 'hubspot'
    auth_type TEXT NOT NULL
        CHECK (auth_type IN ('oauth2', 'api_key', 'basic')),

    -- AES-256-GCM encrypted data (base64 encoded)
    encrypted_data TEXT NOT NULL,                    -- AES-256-GCM ciphertext, base64
    iv TEXT NOT NULL,                                -- initialization vector, base64
    auth_tag TEXT NOT NULL,                          -- GCM authentication tag, base64

    -- OAuth2 token management
    token_expires_at TIMESTAMPTZ,                    -- for OAuth2 token refresh scheduling
    refresh_token_encrypted TEXT,                     -- encrypted refresh token
    refresh_iv TEXT,
    refresh_auth_tag TEXT,

    -- OAuth2 scopes
    scopes TEXT[],                                   -- OAuth2 scopes granted

    -- Soft delete
    revoked_at TIMESTAMPTZ,                          -- NULL = active, set = revoked

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial unique: only one active credential per user+provider
CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_credentials_user_provider_active
    ON integration_credentials (user_id, provider)
    WHERE revoked_at IS NULL;

-- RLS
ALTER TABLE integration_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_credentials_select" ON integration_credentials
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_own_credentials_insert" ON integration_credentials
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_own_credentials_update" ON integration_credentials
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "users_own_credentials_delete" ON integration_credentials
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "service_role_integration_credentials" ON integration_credentials
    FOR ALL USING (auth.role() = 'service_role');

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_integration_credentials_user_provider
    ON integration_credentials (user_id, provider)
    WHERE revoked_at IS NULL;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_integration_credentials_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER integration_credentials_updated
    BEFORE UPDATE ON integration_credentials
    FOR EACH ROW
    EXECUTE FUNCTION update_integration_credentials_timestamp();


-- ────────────────────────────────────────────────────────────
-- 2. INTEGRATION_CONNECTIONS
-- User's active connector configurations.
-- Links to credentials and tracks sync status.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS integration_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    credential_id UUID REFERENCES integration_credentials(id),
    connector_type TEXT NOT NULL,                     -- e.g. 'fatture_in_cloud', 'google_drive', 'hubspot'
    config JSONB NOT NULL DEFAULT '{}',               -- connector-specific config: folder IDs, filters, etc.
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'error', 'disconnected')),

    -- Sync tracking
    last_sync_at TIMESTAMPTZ,
    last_sync_status TEXT
        CHECK (last_sync_status IN ('success', 'partial', 'error')),
    last_sync_items INTEGER DEFAULT 0,
    last_error TEXT,
    sync_frequency TEXT NOT NULL DEFAULT 'daily'
        CHECK (sync_frequency IN ('realtime', 'hourly', 'daily', 'weekly', 'manual')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_connections_select" ON integration_connections
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_own_connections_insert" ON integration_connections
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_own_connections_update" ON integration_connections
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "users_own_connections_delete" ON integration_connections
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "service_role_integration_connections" ON integration_connections
    FOR ALL USING (auth.role() = 'service_role');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_integration_connections_user_status
    ON integration_connections (user_id, status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_integration_connections_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER integration_connections_updated
    BEFORE UPDATE ON integration_connections
    FOR EACH ROW
    EXECUTE FUNCTION update_integration_connections_timestamp();


-- ────────────────────────────────────────────────────────────
-- 3. INTEGRATION_SYNC_LOG
-- Sync history with TTL 90 days.
-- Tracks each sync run: items fetched, processed, failed.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS integration_sync_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),

    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'success', 'partial', 'error')),

    items_fetched INTEGER DEFAULT 0,
    items_processed INTEGER DEFAULT 0,
    items_failed INTEGER DEFAULT 0,
    error_details JSONB,
    duration_ms INTEGER
);

-- RLS
ALTER TABLE integration_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_sync_log_select" ON integration_sync_log
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_own_sync_log_insert" ON integration_sync_log
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_own_sync_log_update" ON integration_sync_log
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "users_own_sync_log_delete" ON integration_sync_log
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "service_role_integration_sync_log" ON integration_sync_log
    FOR ALL USING (auth.role() = 'service_role');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_integration_sync_log_connection_started
    ON integration_sync_log (connection_id, started_at DESC);


-- ────────────────────────────────────────────────────────────
-- 4. INTEGRATION_FIELD_MAPPINGS
-- Cached field mappings with TTL 30 days.
-- Supports rule-based, similarity, LLM, and user-confirmed levels.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS integration_field_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connector_type TEXT NOT NULL,
    source_field TEXT NOT NULL,
    target_field TEXT NOT NULL,
    mapping_level TEXT NOT NULL
        CHECK (mapping_level IN ('rule', 'similarity', 'llm', 'user_confirmed')),
    confidence REAL DEFAULT 1.0,
    user_id UUID REFERENCES auth.users(id),          -- NULL for global rules

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
);

-- Partial unique: one mapping per connector_type + source_field + user
CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_field_mappings_unique
    ON integration_field_mappings (connector_type, source_field, user_id);

-- RLS
ALTER TABLE integration_field_mappings ENABLE ROW LEVEL SECURITY;

-- Users can see global rules (user_id IS NULL) and their own mappings
CREATE POLICY "users_own_or_global_mappings_select" ON integration_field_mappings
    FOR SELECT USING (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "users_own_mappings_insert" ON integration_field_mappings
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_own_mappings_update" ON integration_field_mappings
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "users_own_mappings_delete" ON integration_field_mappings
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "service_role_integration_field_mappings" ON integration_field_mappings
    FOR ALL USING (auth.role() = 'service_role');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_integration_field_mappings_connector_source
    ON integration_field_mappings (connector_type, source_field);


-- ────────────────────────────────────────────────────────────
-- 5. INTEGRATION_CREDENTIAL_AUDIT
-- Audit trail for credential operations (GDPR compliance).
-- 2-year TTL for regulatory retention.
-- No FK to integration_credentials (audit survives credential deletion).
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS integration_credential_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credential_id UUID NOT NULL,                     -- references credential, but NO FK (audit survives deletion)
    user_id UUID NOT NULL,                           -- references user, but NO FK (audit survives user deletion)
    action TEXT NOT NULL
        CHECK (action IN ('create', 'access', 'refresh', 'revoke', 'rotate')),
    actor TEXT NOT NULL DEFAULT 'system',             -- 'system', 'user', 'cron', etc.
    ip_address INET,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE integration_credential_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_audit_select" ON integration_credential_audit
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_own_audit_insert" ON integration_credential_audit
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "service_role_integration_credential_audit" ON integration_credential_audit
    FOR ALL USING (auth.role() = 'service_role');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_integration_credential_audit_cred_created
    ON integration_credential_audit (credential_id, created_at DESC);


-- ────────────────────────────────────────────────────────────
-- 6. RPC CLEANUP FUNCTIONS
-- Scheduled via cron for TTL enforcement.
-- ────────────────────────────────────────────────────────────

-- 6.1 Cleanup expired field mappings (TTL 30 days)
CREATE OR REPLACE FUNCTION cleanup_expired_mappings()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    DELETE FROM integration_field_mappings
    WHERE expires_at < now();
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6.2 Cleanup old sync logs (TTL 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_sync_logs()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    DELETE FROM integration_sync_log
    WHERE started_at < now() - interval '90 days';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6.3 Cleanup old audit logs (TTL 2 years)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    DELETE FROM integration_credential_audit
    WHERE created_at < now() - interval '2 years';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
