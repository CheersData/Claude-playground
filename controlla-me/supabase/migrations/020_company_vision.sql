-- Migration 020: Company Vision/Mission + Scheduler Plans
-- Provides persistent storage for company vision, mission, and plan approval tracking.

-- ─────────────────────────────────────────────────────────────────
-- 1. Company Vision/Mission — singleton table, boss writes here
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_vision (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vision TEXT NOT NULL DEFAULT '',
    mission TEXT NOT NULL DEFAULT '',
    priorities JSONB NOT NULL DEFAULT '[]'::jsonb,  -- current strategic priorities
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT NOT NULL DEFAULT 'boss'          -- who last edited
);

-- Insert singleton row
INSERT INTO company_vision (vision, mission, priorities) VALUES (
    'Diventare la piattaforma di riferimento per l''analisi legale AI in Italia, rendendo la comprensione dei contratti accessibile a tutti.',
    'Costruire team di agenti AI specializzati che generano valore reale: analisi legale per gli utenti, trading per la sostenibilità finanziaria.',
    '["Paper trading 30 giorni", "Ottimizzazione strategia trading", "Espansione verticale HR", "Acquisizione primi utenti paganti"]'::jsonb
) ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────
-- 2. Scheduler Plans — audit trail of generated/approved plans
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scheduler_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_date DATE NOT NULL DEFAULT CURRENT_DATE,
    plan_number INT NOT NULL DEFAULT 1,                 -- plan iteration for the day
    status TEXT NOT NULL DEFAULT 'pending'               -- pending, approved, modified, cancelled
        CHECK (status IN ('pending', 'approved', 'modified', 'cancelled')),
    plan_content JSONB NOT NULL DEFAULT '{}'::jsonb,     -- the plan (tasks, departments, priorities)
    vision_snapshot TEXT,                                 -- vision at time of plan generation
    mission_snapshot TEXT,                                -- mission at time of plan generation
    recommendations JSONB DEFAULT '[]'::jsonb,           -- recommendations from previous plan
    boss_feedback TEXT,                                   -- feedback if modified/cancelled
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for quick lookup of latest plan
CREATE INDEX IF NOT EXISTS idx_scheduler_plans_date ON scheduler_plans(plan_date DESC, plan_number DESC);

-- ─────────────────────────────────────────────────────────────────
-- 3. Decision Audit Log — tracks all protocol routing decisions
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS decision_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id TEXT,                                        -- related task ID (from company-tasks)
    request_summary TEXT NOT NULL,                       -- what was requested
    decision_tree TEXT,                                  -- which YAML tree was used
    routing_type TEXT NOT NULL DEFAULT 'operativo'       -- operativo, strategico, critico
        CHECK (routing_type IN ('operativo', 'strategico', 'critico')),
    approval_level TEXT NOT NULL DEFAULT 'L1'            -- L1, L2, L3, L4
        CHECK (approval_level IN ('L1', 'L2', 'L3', 'L4')),
    departments_consulted JSONB DEFAULT '[]'::jsonb,     -- which depts were asked
    decision TEXT,                                        -- final decision (approved/rejected/modified)
    decided_by TEXT NOT NULL DEFAULT 'cme',              -- who decided
    rationale TEXT,                                       -- why this decision
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TTL: keep 6 months of audit log
CREATE INDEX IF NOT EXISTS idx_decision_audit_created ON decision_audit_log(created_at DESC);

-- ─────────────────────────────────────────────────────────────────
-- 4. RLS — service_role only (company internal, not user-facing)
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE company_vision ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduler_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_audit_log ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "service_role_company_vision" ON company_vision
    FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_scheduler_plans" ON scheduler_plans
    FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_decision_audit" ON decision_audit_log
    FOR ALL USING (auth.role() = 'service_role');
