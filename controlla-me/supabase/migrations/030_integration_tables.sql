-- ============================================================
-- Migration 030: Integration Tables
-- credential_vault, connector_field_mappings, crm_records
-- ADR: ADR-integration-framework.md (ADR-1, ADR-2, ADR-3)
-- Security: integration-security-design.md
-- ============================================================
-- ROLLBACK: DROP TABLE IF EXISTS crm_records CASCADE;
-- ROLLBACK: DROP TABLE IF EXISTS connector_field_mappings CASCADE;
-- ROLLBACK: DROP TABLE IF EXISTS credential_vault CASCADE;
-- ROLLBACK: DROP FUNCTION IF EXISTS vault_store CASCADE;
-- ROLLBACK: DROP FUNCTION IF EXISTS vault_retrieve CASCADE;
-- ROLLBACK: DROP FUNCTION IF EXISTS vault_refresh CASCADE;
-- ROLLBACK: DROP FUNCTION IF EXISTS update_credential_vault_timestamp CASCADE;
-- ROLLBACK: DROP FUNCTION IF EXISTS update_connector_field_mappings_timestamp CASCADE;
-- ROLLBACK: DROP FUNCTION IF EXISTS update_crm_records_timestamp CASCADE;
-- ============================================================

-- Enable pgcrypto for symmetric encryption (pgp_sym_encrypt / pgp_sym_decrypt)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ────────────────────────────────────────────────────────────
-- 1. CREDENTIAL VAULT
-- Stores encrypted credentials per user per connector.
-- Uses pgcrypto pgp_sym_encrypt for encryption at rest.
-- Encryption key is VAULT_ENCRYPTION_KEY env var (never stored in DB).
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS credential_vault (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    connector_source TEXT NOT NULL,            -- e.g. 'stripe', 'hubspot', 'google-drive', 'salesforce'
    credential_type TEXT NOT NULL              -- 'api_key', 'oauth2_token', 'basic_auth'
        CHECK (credential_type IN ('api_key', 'oauth2_token', 'basic_auth')),

    -- Encrypted credentials (pgcrypto pgp_sym_encrypt)
    -- Contains JSON: { apiKey, accessToken, refreshToken, clientId, ... }
    encrypted_data BYTEA NOT NULL,

    -- Non-sensitive metadata (queryable without decrypt)
    metadata JSONB DEFAULT '{}',              -- scopes, provider_user_id, label, etc.
    expires_at TIMESTAMPTZ,                   -- access token expiry (NULL = no expiry, e.g. API key)
    last_used_at TIMESTAMPTZ,                 -- audit: last time credential was read
    last_refreshed_at TIMESTAMPTZ,            -- audit: last OAuth2 token refresh
    revoked_at TIMESTAMPTZ,                   -- soft delete: revocation timestamp (NULL = active)

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(user_id, connector_source, credential_type)
);

-- RLS: every user sees only their own credentials
ALTER TABLE credential_vault ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_credentials_select" ON credential_vault
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_own_credentials_insert" ON credential_vault
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_own_credentials_update" ON credential_vault
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "users_own_credentials_delete" ON credential_vault
    FOR DELETE USING (auth.uid() = user_id);

-- Service role has full access (pipeline, admin operations, cron cleanup)
CREATE POLICY "service_role_credential_vault" ON credential_vault
    FOR ALL USING (auth.role() = 'service_role');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vault_user_connector
    ON credential_vault (user_id, connector_source)
    WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vault_connector_source
    ON credential_vault (connector_source);

CREATE INDEX IF NOT EXISTS idx_vault_expires
    ON credential_vault (expires_at)
    WHERE revoked_at IS NULL AND expires_at IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 1.1 RPC: vault_store
-- Encrypts and upserts a credential. SECURITY DEFINER ensures
-- the encryption key never transits to the client.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION vault_store(
    p_user_id UUID,
    p_connector_source TEXT,
    p_credential_type TEXT,
    p_data TEXT,                    -- JSON plaintext: { "accessToken": "...", "refreshToken": "..." }
    p_encryption_key TEXT,         -- AES-256 key from VAULT_ENCRYPTION_KEY env var
    p_metadata JSONB DEFAULT '{}',
    p_expires_at TIMESTAMPTZ DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO credential_vault (
        user_id, connector_source, credential_type, encrypted_data,
        metadata, expires_at
    ) VALUES (
        p_user_id,
        p_connector_source,
        p_credential_type,
        pgp_sym_encrypt(p_data, p_encryption_key),
        p_metadata,
        p_expires_at
    )
    ON CONFLICT (user_id, connector_source, credential_type)
    DO UPDATE SET
        encrypted_data = pgp_sym_encrypt(p_data, p_encryption_key),
        metadata = p_metadata,
        expires_at = p_expires_at,
        updated_at = now(),
        revoked_at = NULL  -- reactivate if previously revoked
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────
-- 1.2 RPC: vault_retrieve
-- Decrypts and returns a credential. Updates last_used_at for audit.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION vault_retrieve(
    p_user_id UUID,
    p_connector_source TEXT,
    p_encryption_key TEXT
) RETURNS TEXT AS $$
DECLARE
    v_data TEXT;
    v_id UUID;
BEGIN
    SELECT id, pgp_sym_decrypt(encrypted_data, p_encryption_key)
    INTO v_id, v_data
    FROM credential_vault
    WHERE user_id = p_user_id
      AND connector_source = p_connector_source
      AND revoked_at IS NULL
    ORDER BY updated_at DESC
    LIMIT 1;

    -- Update last_used_at for audit trail
    IF v_id IS NOT NULL THEN
        UPDATE credential_vault SET last_used_at = now() WHERE id = v_id;
    END IF;

    RETURN v_data;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────
-- 1.3 RPC: vault_refresh
-- Updates encrypted token data after OAuth2 refresh.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION vault_refresh(
    p_user_id UUID,
    p_connector_source TEXT,
    p_new_data TEXT,
    p_encryption_key TEXT,
    p_new_expires_at TIMESTAMPTZ DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE credential_vault
    SET encrypted_data = pgp_sym_encrypt(p_new_data, p_encryption_key),
        expires_at = p_new_expires_at,
        last_refreshed_at = now(),
        updated_at = now()
    WHERE user_id = p_user_id
      AND connector_source = p_connector_source
      AND revoked_at IS NULL;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────
-- 2. CONNECTOR FIELD MAPPINGS
-- Cache for field mapping results (rule-based + LLM).
-- Infrastructure table: only service_role access.
-- ADR-2: AI Mapping Hybrid.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS connector_field_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connector_source TEXT NOT NULL,            -- e.g. 'salesforce_accounts', 'hubspot_contacts'
    source_field TEXT NOT NULL,                -- e.g. 'Account.CustomField__c'
    target_field TEXT NOT NULL,                -- e.g. 'custom_notes'
    mapping_type TEXT NOT NULL DEFAULT 'rule'  -- 'rule' | 'llm' | 'manual'
        CHECK (mapping_type IN ('rule', 'llm', 'manual')),
    transform TEXT NOT NULL DEFAULT 'direct',  -- 'direct' | 'iso_date' | 'number' | 'json' | 'skip'
    confidence REAL,                           -- 1.0 = rule-based, <1.0 = LLM confidence score
    cached_until TIMESTAMPTZ,                  -- TTL: 30 days for LLM mappings, NULL for rule-based

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(connector_source, source_field, target_field)
);

-- RLS: infrastructure table, only service_role
ALTER TABLE connector_field_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_field_mappings" ON connector_field_mappings
    FOR ALL USING (auth.role() = 'service_role');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_field_mappings_connector_source
    ON connector_field_mappings (connector_source);

CREATE INDEX IF NOT EXISTS idx_field_mappings_cached_until
    ON connector_field_mappings (cached_until)
    WHERE cached_until IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 3. CRM RECORDS
-- Stores raw and mapped data from business connectors.
-- Per-user isolation via RLS.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    connector_source TEXT NOT NULL,            -- e.g. 'salesforce', 'hubspot', 'sap-b1'
    object_type TEXT NOT NULL,                 -- 'contact', 'company', 'deal', 'invoice', etc.
    external_id TEXT NOT NULL,                 -- ID from the source system

    -- Data
    data JSONB NOT NULL,                       -- raw data from source system
    mapped_fields JSONB DEFAULT '{}',          -- normalized/mapped fields (via rule + LLM mapping)

    -- Sync metadata
    synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(user_id, connector_source, object_type, external_id)
);

-- RLS: users see only their own records
ALTER TABLE crm_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_crm_records_select" ON crm_records
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_own_crm_records_insert" ON crm_records
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_own_crm_records_update" ON crm_records
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "users_own_crm_records_delete" ON crm_records
    FOR DELETE USING (auth.uid() = user_id);

-- Service role has full access (pipeline sync)
CREATE POLICY "service_role_crm_records" ON crm_records
    FOR ALL USING (auth.role() = 'service_role');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_crm_records_user_connector
    ON crm_records (user_id, connector_source);

CREATE INDEX IF NOT EXISTS idx_crm_records_object_type
    ON crm_records (object_type);

CREATE INDEX IF NOT EXISTS idx_crm_records_synced_at
    ON crm_records (synced_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_records_external_id
    ON crm_records (connector_source, external_id);

-- ────────────────────────────────────────────────────────────
-- 4. UPDATED_AT TRIGGERS
-- Auto-update updated_at on row modification for all 3 tables.
-- ────────────────────────────────────────────────────────────

-- 4.1 credential_vault
CREATE OR REPLACE FUNCTION update_credential_vault_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER credential_vault_updated
    BEFORE UPDATE ON credential_vault
    FOR EACH ROW
    EXECUTE FUNCTION update_credential_vault_timestamp();

-- 4.2 connector_field_mappings
CREATE OR REPLACE FUNCTION update_connector_field_mappings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER connector_field_mappings_updated
    BEFORE UPDATE ON connector_field_mappings
    FOR EACH ROW
    EXECUTE FUNCTION update_connector_field_mappings_timestamp();

-- 4.3 crm_records
CREATE OR REPLACE FUNCTION update_crm_records_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER crm_records_updated
    BEFORE UPDATE ON crm_records
    FOR EACH ROW
    EXECUTE FUNCTION update_crm_records_timestamp();

-- ────────────────────────────────────────────────────────────
-- 5. CLEANUP FUNCTION
-- Removes expired LLM mappings and revoked credentials past GDPR TTL.
-- Intended for cron / scheduled invocation.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION cleanup_integration_data()
RETURNS JSONB AS $$
DECLARE
    v_expired_mappings INT;
    v_revoked_credentials INT;
BEGIN
    -- Remove expired LLM field mappings (cached_until past)
    DELETE FROM connector_field_mappings
    WHERE cached_until IS NOT NULL AND cached_until < now();
    GET DIAGNOSTICS v_expired_mappings = ROW_COUNT;

    -- Hard delete credentials revoked more than 30 days ago (GDPR)
    DELETE FROM credential_vault
    WHERE revoked_at IS NOT NULL AND revoked_at < now() - INTERVAL '30 days';
    GET DIAGNOSTICS v_revoked_credentials = ROW_COUNT;

    RETURN jsonb_build_object(
        'expired_mappings_removed', v_expired_mappings,
        'revoked_credentials_removed', v_revoked_credentials
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
