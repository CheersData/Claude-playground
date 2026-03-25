-- Migration 049: Push notification subscriptions
--
-- Stores Web Push API subscriptions (VAPID-based, not Firebase).
-- Each row = one browser subscription for one device.
-- user_id is nullable to allow anonymous subscriptions.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  keys_p256dh TEXT NOT NULL,
  keys_auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ DEFAULT now(),

  -- Each endpoint is globally unique (one browser = one subscription)
  CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint)
);

-- Index for looking up subscriptions by user
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON push_subscriptions(user_id)
  WHERE user_id IS NOT NULL;

-- RLS: service_role has full access.
-- Authenticated users can read/delete their own subscriptions.
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Service role bypass (used by server-side push-notifications.ts)
-- No policy needed — service_role bypasses RLS by default.

-- Users can see their own subscriptions
CREATE POLICY push_sub_select_own ON push_subscriptions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can insert subscriptions linked to themselves
CREATE POLICY push_sub_insert_own ON push_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- Users can delete their own subscriptions
CREATE POLICY push_sub_delete_own ON push_subscriptions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- TTL cleanup: subscriptions not used in 90 days are stale.
-- Run periodically: DELETE FROM push_subscriptions WHERE last_used_at < now() - interval '90 days';

COMMENT ON TABLE push_subscriptions IS 'Web Push API subscriptions (VAPID). One row per browser/device.';
COMMENT ON COLUMN push_subscriptions.endpoint IS 'Push service URL (unique per browser subscription)';
COMMENT ON COLUMN push_subscriptions.keys_p256dh IS 'P-256 Diffie-Hellman public key (base64url)';
COMMENT ON COLUMN push_subscriptions.keys_auth IS 'Authentication secret (base64url)';
COMMENT ON COLUMN push_subscriptions.last_used_at IS 'Last time a notification was sent to this subscription';
