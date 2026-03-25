-- Migration: 055_middleware_configs.sql
-- Programmable API Middleware - Config-driven endpoint engine

-- ─── Config table ───
CREATE TABLE IF NOT EXISTS middleware_configs (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    slug            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    version         TEXT NOT NULL DEFAULT '1.0.0',
    enabled         BOOLEAN NOT NULL DEFAULT true,
    created_by      UUID REFERENCES auth.users(id),
    owner_id        UUID REFERENCES auth.users(id),
    config          JSONB NOT NULL,
    endpoint_path   TEXT NOT NULL,
    endpoint_method TEXT NOT NULL DEFAULT 'POST',
    target_base_url TEXT,
    tags            TEXT[] DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT valid_method CHECK (endpoint_method IN ('GET','POST','PUT','PATCH','DELETE')),
    CONSTRAINT valid_config CHECK (jsonb_typeof(config) = 'object'),
    CONSTRAINT unique_endpoint UNIQUE (endpoint_path, endpoint_method)
);

CREATE INDEX IF NOT EXISTS idx_middleware_configs_path ON middleware_configs (endpoint_path, endpoint_method) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_middleware_configs_slug ON middleware_configs (slug);
CREATE INDEX IF NOT EXISTS idx_middleware_configs_tags ON middleware_configs USING GIN (tags);

-- ─── Execution log ───
CREATE TABLE IF NOT EXISTS middleware_execution_log (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    config_id       UUID NOT NULL REFERENCES middleware_configs(id) ON DELETE CASCADE,
    config_slug     TEXT NOT NULL,
    request_method  TEXT NOT NULL,
    request_path    TEXT NOT NULL,
    request_body    JSONB,
    request_ip      TEXT,
    user_id         UUID REFERENCES auth.users(id),
    validation_ok   BOOLEAN NOT NULL DEFAULT false,
    validation_errors JSONB,
    target_url      TEXT,
    target_method   TEXT,
    target_body     JSONB,
    target_status   INT,
    target_response JSONB,
    target_duration_ms INT,
    status          TEXT NOT NULL DEFAULT 'pending',
    error_message   TEXT,
    response_data   JSONB,
    attempt         INT NOT NULL DEFAULT 1,
    retried_from    UUID REFERENCES middleware_execution_log(id),
    started_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
    completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mw_exec_log_config ON middleware_execution_log (config_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_mw_exec_log_status ON middleware_execution_log (status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_mw_exec_log_ttl ON middleware_execution_log (started_at);

-- ─── RLS ───
ALTER TABLE middleware_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE middleware_execution_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mw_configs_owner_full" ON middleware_configs
    FOR ALL USING (auth.uid() = owner_id);
CREATE POLICY "mw_configs_read_enabled" ON middleware_configs
    FOR SELECT USING (enabled = true);

CREATE POLICY "mw_exec_log_owner" ON middleware_execution_log
    FOR ALL USING (
        user_id = auth.uid() OR
        config_id IN (SELECT id FROM middleware_configs WHERE owner_id = auth.uid())
    );

-- Service role bypass implicit (Supabase service_role bypasses RLS)

-- ─── Updated_at trigger ───
CREATE OR REPLACE FUNCTION update_middleware_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_middleware_configs_updated_at
    BEFORE UPDATE ON middleware_configs
    FOR EACH ROW EXECUTE FUNCTION update_middleware_configs_updated_at();
