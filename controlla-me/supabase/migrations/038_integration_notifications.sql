-- ============================================================
-- Migration 038: Integration Notifications
-- User-facing notification system for auto-analysis results
-- and other integration events.
--
-- Used by: auto-analyzer.ts (creates notifications after analysis)
--          /api/notifications (polled by UI for display)
-- ============================================================
-- ROLLBACK: DROP TABLE IF EXISTS integration_notifications CASCADE;
-- ROLLBACK: DROP FUNCTION IF EXISTS cleanup_old_notifications CASCADE;
-- ROLLBACK: DROP FUNCTION IF EXISTS mark_notifications_read CASCADE;
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. INTEGRATION_NOTIFICATIONS
-- Per-user notifications for sync events and auto-analysis.
-- UI polls GET /api/notifications for unread notifications.
-- TTL: 90 days (same as sync_log).
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS integration_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Notification classification
    type TEXT NOT NULL
        CHECK (type IN (
            'auto_analysis_complete',   -- Document analyzed automatically
            'auto_analysis_failed',     -- Document analysis failed
            'sync_complete',            -- Sync run completed
            'sync_error',               -- Sync run failed
            'credential_expiring',      -- OAuth2 token expiring soon
            'credential_expired'        -- OAuth2 token expired
        )),

    -- Display content
    title TEXT NOT NULL,                            -- Short title (e.g. "Analisi completata: contratto.pdf")
    message TEXT NOT NULL,                          -- Summary text for display
    severity TEXT NOT NULL DEFAULT 'info'
        CHECK (severity IN ('info', 'warning', 'error')),

    -- Structured data (analysis results, connector info, etc.)
    data JSONB NOT NULL DEFAULT '{}',
    -- Expected data shape for auto_analysis_complete:
    -- {
    --   "analysisId": "uuid",          -- ID in analyses table
    --   "sessionId": "hash-random",    -- analysis session ID
    --   "connectorId": "hubspot",
    --   "documentName": "contratto.pdf",
    --   "overallRisk": "high",
    --   "fairnessScore": 4.2,
    --   "clauseCount": 8,
    --   "criticalCount": 2,
    --   "highCount": 3,
    --   "needsLawyer": true
    -- }

    -- Read status
    read_at TIMESTAMPTZ,                            -- NULL = unread, set = read

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: users see only their own notifications
ALTER TABLE integration_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_notifications_select" ON integration_notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_own_notifications_update" ON integration_notifications
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "users_own_notifications_delete" ON integration_notifications
    FOR DELETE USING (auth.uid() = user_id);

-- Service role has full access (auto-analyzer creates notifications)
CREATE POLICY "service_role_notifications" ON integration_notifications
    FOR ALL USING (auth.role() = 'service_role');

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON integration_notifications (user_id, created_at DESC)
    WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
    ON integration_notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_type
    ON integration_notifications (type);


-- ────────────────────────────────────────────────────────────
-- 2. RPC: mark_notifications_read
-- Batch mark notifications as read.
-- Accepts an array of notification IDs.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION mark_notifications_read(
    p_user_id UUID,
    p_notification_ids UUID[]
) RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE integration_notifications
    SET read_at = now()
    WHERE user_id = p_user_id
      AND id = ANY(p_notification_ids)
      AND read_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ────────────────────────────────────────────────────────────
-- 3. RPC: cleanup_old_notifications
-- Removes notifications older than retention period (default 90 days).
-- Intended for cron / scheduled invocation.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION cleanup_old_notifications(
    p_retention_days INTEGER DEFAULT 90
) RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    DELETE FROM integration_notifications
    WHERE created_at < now() - (p_retention_days || ' days')::INTERVAL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
