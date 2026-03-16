-- ============================================================
-- Migration 036: Consolidate Credential Vault
--
-- Eliminates the redundant integration_credentials table (migration 031)
-- in favor of credential_vault (migration 030, pgcrypto RPC).
--
-- Rationale:
--   - credential_vault (030) uses pgcrypto pgp_sym_encrypt server-side:
--     encryption key never leaves PostgreSQL function context (SECURITY DEFINER).
--   - integration_credentials (031) uses application-layer AES-256-GCM:
--     encryption/decryption happens in Node.js, key transits to the app.
--   - All production API routes already use credential_vault (lib/credential-vault.ts).
--   - integration_credentials is unused: the code referencing it
--     (lib/staff/credential-vault/index.ts) has a column name mismatch
--     (uses "integration_id" but schema has "provider") confirming it was
--     never actively used against the real DB.
--
-- Changes:
--   1. Drop credential_id FK column from integration_connections
--   2. Drop integration_credentials table + trigger + function
--   3. Drop redundant connector_field_mappings (030) —
--      integration_field_mappings (031) is the canonical table (richer schema)
--   4. Update cleanup_integration_data() to reflect dropped tables
--   5. Add scopes column to credential_vault (feature from 031 worth keeping)
--
-- ADR: ADR-003 Credential Vault (confirmed pgcrypto as canonical approach)
-- ============================================================
-- ROLLBACK: ALTER TABLE integration_connections ADD COLUMN credential_id UUID;
-- ROLLBACK: -- Re-run migration 031 to recreate integration_credentials
-- ROLLBACK: -- Re-run migration 030 connector_field_mappings section
-- ROLLBACK: ALTER TABLE credential_vault DROP COLUMN IF EXISTS scopes;
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. Remove FK from integration_connections → integration_credentials
--
-- The connection now resolves credentials via (user_id, connector_type)
-- against credential_vault. No direct FK needed.
-- ────────────────────────────────────────────────────────────

ALTER TABLE integration_connections DROP COLUMN IF EXISTS credential_id;


-- ────────────────────────────────────────────────────────────
-- 2. Drop integration_credentials (031) — redundant with credential_vault (030)
-- ────────────────────────────────────────────────────────────

-- Drop trigger first (CASCADE on table would do it, but explicit is clearer)
DROP TRIGGER IF EXISTS integration_credentials_updated ON integration_credentials;
DROP FUNCTION IF EXISTS update_integration_credentials_timestamp();

-- Drop the table (CASCADE drops RLS policies and indexes)
DROP TABLE IF EXISTS integration_credentials CASCADE;


-- ────────────────────────────────────────────────────────────
-- 3. Drop connector_field_mappings (030) — redundant with integration_field_mappings (031)
--
-- integration_field_mappings has:
--   - Per-user mappings (user_id column)
--   - 4 mapping levels (rule, similarity, llm, user_confirmed) vs 3
--   - TTL with expires_at
--   - Already used by the Integration Office
-- ────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS connector_field_mappings_updated ON connector_field_mappings;
DROP FUNCTION IF EXISTS update_connector_field_mappings_timestamp();
DROP TABLE IF EXISTS connector_field_mappings CASCADE;


-- ────────────────────────────────────────────────────────────
-- 4. Add scopes column to credential_vault
--
-- OAuth2 scopes tracking was a useful feature from integration_credentials.
-- Adding it to credential_vault enables scope-aware token management.
-- ────────────────────────────────────────────────────────────

ALTER TABLE credential_vault ADD COLUMN IF NOT EXISTS scopes TEXT[];


-- ────────────────────────────────────────────────────────────
-- 5. Update cleanup_integration_data()
--
-- Remove references to dropped connector_field_mappings.
-- Add cleanup for integration_field_mappings (the canonical table from 031).
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION cleanup_integration_data()
RETURNS JSONB AS $$
DECLARE
    v_revoked_credentials INT;
    v_expired_mappings INT;
BEGIN
    -- Hard delete credentials revoked more than 30 days ago (GDPR)
    DELETE FROM credential_vault
    WHERE revoked_at IS NOT NULL AND revoked_at < now() - INTERVAL '30 days';
    GET DIAGNOSTICS v_revoked_credentials = ROW_COUNT;

    -- Remove expired integration_field_mappings (canonical table from 031, TTL 30 days)
    DELETE FROM integration_field_mappings
    WHERE expires_at < now();
    GET DIAGNOSTICS v_expired_mappings = ROW_COUNT;

    RETURN jsonb_build_object(
        'revoked_credentials_removed', v_revoked_credentials,
        'expired_mappings_removed', v_expired_mappings
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
