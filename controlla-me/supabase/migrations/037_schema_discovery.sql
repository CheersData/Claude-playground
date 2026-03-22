-- ============================================================
-- Migration 037: Schema Discovery Tables
-- 3 tables for schema introspection and NL transform audit:
--   discovered_schemas, entity_mapping_configs,
--   nl_transform_executions
-- Depends on: 031 (integration_connections FK)
-- ============================================================
-- ROLLBACK: DROP TABLE IF EXISTS nl_transform_executions CASCADE;
-- ROLLBACK: DROP TABLE IF EXISTS entity_mapping_configs CASCADE;
-- ROLLBACK: DROP TABLE IF EXISTS discovered_schemas CASCADE;
-- ROLLBACK: DROP FUNCTION IF EXISTS cleanup_old_nl_transform_executions CASCADE;
-- ROLLBACK: DROP FUNCTION IF EXISTS update_discovered_schemas_timestamp CASCADE;
-- ROLLBACK: DROP FUNCTION IF EXISTS update_entity_mapping_configs_timestamp CASCADE;
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. DISCOVERED_SCHEMAS
-- Cache of API-introspected schemas per connector entity.
-- JSONB stores field catalog (name, type, required, description).
-- Avoids re-introspecting on every sync or mapping session.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS discovered_schemas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    connection_id UUID NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
    connector_type TEXT NOT NULL,                     -- e.g. 'fatture_in_cloud', 'hubspot', 'google_drive'
    entity_name TEXT NOT NULL,                        -- e.g. 'invoices', 'contacts', 'deals'

    -- Schema catalog (JSONB)
    -- Structure: { fields: SchemaField[], relationships?: EntityRelationship[] }
    -- SchemaField: { id, name, type, required?, description?, children? }
    schema_data JSONB NOT NULL DEFAULT '{}',

    record_count INTEGER,                             -- estimated records at discovery time
    api_version TEXT,                                 -- API version used for introspection

    discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),  -- cache TTL

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique: one cached schema per connection + entity
CREATE UNIQUE INDEX IF NOT EXISTS idx_discovered_schemas_connection_entity
    ON discovered_schemas (connection_id, entity_name);

-- RLS
ALTER TABLE discovered_schemas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_schemas_select" ON discovered_schemas
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_own_schemas_insert" ON discovered_schemas
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_own_schemas_update" ON discovered_schemas
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "users_own_schemas_delete" ON discovered_schemas
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "service_role_discovered_schemas" ON discovered_schemas
    FOR ALL USING (auth.role() = 'service_role');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_discovered_schemas_user_connector
    ON discovered_schemas (user_id, connector_type);

CREATE INDEX IF NOT EXISTS idx_discovered_schemas_expires
    ON discovered_schemas (expires_at)
    WHERE expires_at IS NOT NULL;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_discovered_schemas_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER discovered_schemas_updated
    BEFORE UPDATE ON discovered_schemas
    FOR EACH ROW
    EXECUTE FUNCTION update_discovered_schemas_timestamp();


-- ────────────────────────────────────────────────────────────
-- 2. ENTITY_MAPPING_CONFIGS
-- Persistent mapping configurations: source entity → target entity.
-- Stores the full mapping array (sourceField, targetField, transform,
-- confidence, mappedBy) as JSONB for flexibility.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS entity_mapping_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    connection_id UUID NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,

    source_entity TEXT NOT NULL,                      -- entity name from source (e.g. 'Invoice' in Fatture in Cloud)
    target_entity TEXT NOT NULL,                      -- target schema key (e.g. 'invoices' from target-schemas.ts)

    -- Mapping definitions (JSONB array)
    -- Each entry: { sourceField, targetField, transform, confidence, mappedBy }
    -- mappedBy: 'rule' | 'similarity' | 'llm' | 'user_confirmed'
    -- transform: 'direct' | 'normalize_email' | 'normalize_cf' | 'iso_date' | 'custom' | etc.
    mappings JSONB NOT NULL DEFAULT '[]',

    version INTEGER NOT NULL DEFAULT 1,               -- mapping evolution tracking
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'draft', 'archived')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique: one active mapping config per connection + source_entity + target_entity
CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_mapping_configs_active
    ON entity_mapping_configs (connection_id, source_entity, target_entity)
    WHERE status = 'active';

-- RLS
ALTER TABLE entity_mapping_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_mapping_configs_select" ON entity_mapping_configs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_own_mapping_configs_insert" ON entity_mapping_configs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_own_mapping_configs_update" ON entity_mapping_configs
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "users_own_mapping_configs_delete" ON entity_mapping_configs
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "service_role_entity_mapping_configs" ON entity_mapping_configs
    FOR ALL USING (auth.role() = 'service_role');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_entity_mapping_configs_user
    ON entity_mapping_configs (user_id);

CREATE INDEX IF NOT EXISTS idx_entity_mapping_configs_connection
    ON entity_mapping_configs (connection_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_entity_mapping_configs_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    NEW.version = OLD.version + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER entity_mapping_configs_updated
    BEFORE UPDATE ON entity_mapping_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_entity_mapping_configs_timestamp();


-- ────────────────────────────────────────────────────────────
-- 3. NL_TRANSFORM_EXECUTIONS
-- Audit trail for Natural Language → code transform executions.
-- Tracks when an NL expression is compiled to executable transform code.
-- TTL: 90 days (cleanup via RPC).
-- No FK to entity_mapping_configs (audit survives mapping deletion).
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS nl_transform_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    connection_id UUID,                               -- NULL-able: references connection for context
    mapping_config_id UUID,                           -- NULL-able: no FK, audit survives mapping deletion

    -- NL → code transform
    nl_expression TEXT NOT NULL,                      -- natural language input (e.g. "converti data da DD/MM/YYYY a ISO")
    generated_code TEXT NOT NULL,                     -- generated transform code/expression
    transform_type TEXT NOT NULL DEFAULT 'custom'
        CHECK (transform_type IN ('custom', 'format', 'concat', 'split', 'rename', 'filter', 'aggregate')),

    -- Execution context
    model_used TEXT,                                  -- AI model that generated the code (e.g. 'gemini-2.5-flash')
    source_field TEXT,                                -- field being transformed
    target_field TEXT,                                -- target field

    -- Validation
    input_sample JSONB,                               -- sample input data for debugging
    output_sample JSONB,                              -- sample output data
    success BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT,
    execution_time_ms INTEGER,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE nl_transform_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_nl_transforms_select" ON nl_transform_executions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_own_nl_transforms_insert" ON nl_transform_executions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_own_nl_transforms_delete" ON nl_transform_executions
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "service_role_nl_transform_executions" ON nl_transform_executions
    FOR ALL USING (auth.role() = 'service_role');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_nl_transform_executions_user_created
    ON nl_transform_executions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nl_transform_executions_connection
    ON nl_transform_executions (connection_id)
    WHERE connection_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nl_transform_executions_mapping
    ON nl_transform_executions (mapping_config_id)
    WHERE mapping_config_id IS NOT NULL;


-- ────────────────────────────────────────────────────────────
-- 4. RPC CLEANUP FUNCTION
-- TTL 90 days for nl_transform_executions.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION cleanup_old_nl_transform_executions()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    DELETE FROM nl_transform_executions
    WHERE created_at < now() - INTERVAL '90 days';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
