-- Migration 050: Telegram approval requests for L3/L4 tasks
--
-- Tracks async approval requests sent to the boss via Telegram inline keyboard.
-- Each row links a company_task to a Telegram message with approve/reject buttons.
-- Status transitions: pending → approved | rejected | expired
-- Expiry: 7 days default, cleaned up by expireStaleApprovals().

CREATE TABLE IF NOT EXISTS telegram_approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES company_tasks(id) ON DELETE CASCADE,
  message_id INTEGER NOT NULL,
  approval_level TEXT NOT NULL CHECK (approval_level IN ('L1', 'L2', 'L3', 'L4')),
  requester TEXT NOT NULL DEFAULT 'cme',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  rejection_reason TEXT,
  callback_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days')
);

-- Fast lookup by task
CREATE INDEX IF NOT EXISTS idx_approval_task
  ON telegram_approval_requests(task_id);

-- Fast lookup for pending approvals (partial index)
CREATE INDEX IF NOT EXISTS idx_approval_status_pending
  ON telegram_approval_requests(status)
  WHERE status = 'pending';

-- Prevent duplicate pending approvals for the same task
CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_one_pending_per_task
  ON telegram_approval_requests(task_id)
  WHERE status = 'pending';

-- RLS: service_role only (backend manages all approval state)
ALTER TABLE telegram_approval_requests ENABLE ROW LEVEL SECURITY;

-- service_role bypasses RLS by default, no explicit policy needed.
-- Add an explicit policy for documentation clarity:
CREATE POLICY "service_role_full_access" ON telegram_approval_requests
  FOR ALL
  USING (auth.role() = 'service_role');

COMMENT ON TABLE telegram_approval_requests IS 'Async approval requests sent to boss via Telegram. One pending request per task.';
COMMENT ON COLUMN telegram_approval_requests.task_id IS 'The company_task requiring approval';
COMMENT ON COLUMN telegram_approval_requests.message_id IS 'Telegram message_id with inline keyboard buttons';
COMMENT ON COLUMN telegram_approval_requests.approval_level IS 'Decision tree level: L3=boss, L4=boss+security';
COMMENT ON COLUMN telegram_approval_requests.status IS 'pending → approved/rejected/expired';
COMMENT ON COLUMN telegram_approval_requests.callback_data IS 'Metadata stored for audit: short task ref, action taken';
COMMENT ON COLUMN telegram_approval_requests.expires_at IS 'Auto-expire after 7 days if no decision';
