-- ============================================================
-- Migration 040: Forma Mentis — Unified Company Intelligence Architecture
-- ADR: company/architecture/adr/ADR-forma-mentis.md
--
-- 6 tables across 4 layers:
--   Layer 1 MEMORIA:     company_sessions, department_memory, company_knowledge
--   Layer 3 COSCIENZA:   company_goals, daemon_reports
--   Layer 4 RIFLESSIONE: decision_journal
--
-- Plus 4 RPC functions for semantic search (match_company_knowledge,
-- match_department_memory, match_company_sessions, match_decisions).
--
-- All tables: RLS enabled, service_role policy, HNSW indexes on vector columns.
-- Depends on: 003 (pgvector extension), 013 (company_tasks FK)
-- ============================================================


-- ═══════════════════════════════════════════════════════════════
-- Layer 1: MEMORIA — Persistent Cross-Session Memory
-- ═══════════════════════════════════════════════════════════════

-- ─── 1.1 Table: company_sessions ───
-- Structured summary of every Claude Code session (interactive, console, daemon, task-runner).
-- Written at session end or periodically during long sessions.

create table public.company_sessions (
  id uuid primary key default gen_random_uuid(),

  -- Session identity
  session_type text not null,                -- 'interactive' | 'console' | 'task-runner' | 'daemon'
  department text,                           -- nullable (CME sessions span departments)
  task_id uuid references company_tasks(id) on delete set null,  -- task being worked on (if any)

  -- Who and when
  started_by text not null,                  -- 'boss' | 'cme' | 'daemon' | agent name
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_ms int,

  -- Session content
  summary text not null,                     -- 2-5 sentence natural language summary
  key_decisions jsonb default '[]',          -- [{decision, rationale, department, impact}]
  files_modified text[] default '{}',        -- absolute paths of files changed
  tasks_created uuid[] default '{}',         -- task IDs created during session
  tasks_completed uuid[] default '{}',       -- task IDs completed during session
  errors_encountered jsonb default '[]',     -- [{error, context, resolution}]

  -- Embedding for semantic search
  embedding vector(1024),                    -- Voyage AI embedding of summary + key decisions

  -- Metadata
  metadata jsonb default '{}',              -- extensible: git_branch, commit_hash, etc.

  created_at timestamptz default now()
);

-- Indexes
create index idx_company_sessions_dept on company_sessions(department);
create index idx_company_sessions_type on company_sessions(session_type);
create index idx_company_sessions_started on company_sessions(started_at desc);
create index idx_company_sessions_task on company_sessions(task_id);
create index idx_company_sessions_embedding on company_sessions
  using hnsw (embedding vector_cosine_ops);

-- RLS: service_role only (company internal)
alter table company_sessions enable row level security;
create policy "Service role manages company sessions" on company_sessions
  for all using (true);


-- ─── 1.2 Table: department_memory ───
-- Per-department key-value persistent memory. Survives across sessions.
-- Unlike company_sessions (append-only), this table is actively managed
-- (entries are created, updated, expired via TTL/confidence decay).

create table public.department_memory (
  id uuid primary key default gen_random_uuid(),

  department text not null,                  -- 'architecture' | 'trading' | etc.
  category text not null,                    -- 'fact' | 'learning' | 'warning' | 'preference' | 'context'
  key text not null,                         -- human-readable key: 'normattiva_zip_failure_pattern'
  content text not null,                     -- the actual memory content
  confidence float default 1.0,             -- 0.0-1.0 (decays over time if not reinforced)
  source_session_id uuid references company_sessions(id) on delete set null,
  source_task_id uuid references company_tasks(id) on delete set null,

  -- Lifecycle
  times_accessed int default 0,
  last_accessed_at timestamptz,
  expires_at timestamptz,                    -- null = never expires
  is_active boolean default true,

  -- Embedding for semantic retrieval
  embedding vector(1024),

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- Unique per department + key (upsert pattern)
  unique(department, key)
);

create index idx_dept_memory_dept on department_memory(department);
create index idx_dept_memory_category on department_memory(category);
create index idx_dept_memory_active on department_memory(is_active) where is_active = true;
create index idx_dept_memory_embedding on department_memory
  using hnsw (embedding vector_cosine_ops);

alter table department_memory enable row level security;
create policy "Service role manages department memory" on department_memory
  for all using (true);


-- ─── 1.3 Table: company_knowledge ───
-- Company-wide operational intelligence (patterns, decisions, best practices,
-- incidents, metrics). Same embedding pattern as legal_knowledge but for
-- company operations. Uses Voyage AI embeddings and HNSW index.

create table public.company_knowledge (
  id uuid primary key default gen_random_uuid(),

  category text not null,                    -- 'pattern' | 'decision' | 'best_practice' | 'incident' | 'metric'
  title text not null,
  content text not null,
  departments text[] default '{}',           -- which departments this applies to (empty = all)

  -- Source tracking
  source_session_id uuid references company_sessions(id) on delete set null,
  source_task_id uuid references company_tasks(id) on delete set null,
  source_decision_id uuid,                   -- FK to decision_journal (added as deferred FK below)

  -- RAG
  embedding vector(1024),
  times_referenced int default 1,

  -- Metadata
  metadata jsonb default '{}',
  is_active boolean default true,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_company_knowledge_category on company_knowledge(category);
create index idx_company_knowledge_depts on company_knowledge using gin(departments);
create index idx_company_knowledge_embedding on company_knowledge
  using hnsw (embedding vector_cosine_ops);

alter table company_knowledge enable row level security;
create policy "Service role manages company knowledge" on company_knowledge
  for all using (true);


-- ═══════════════════════════════════════════════════════════════
-- Layer 3: COSCIENZA — Goal Monitoring and Self-Awareness
-- ═══════════════════════════════════════════════════════════════

-- ─── 3.1 Table: company_goals ───
-- Metric-based goal tracking. Each goal has a target value, current value,
-- value history, deadline, and escalation actions when behind.

create table public.company_goals (
  id uuid primary key default gen_random_uuid(),

  -- Goal definition
  title text not null,                       -- 'Sharpe ratio > 1.0 in backtest'
  description text,                          -- longer explanation
  metric text not null,                      -- 'sharpe_ratio' | 'test_pass_rate' | 'corpus_articles_count'
  target_value float not null,               -- 1.0 | 100.0 | 6000
  current_value float default 0,
  unit text default '',                      -- '%' | 'ratio' | 'count' | 'USD'

  -- Ownership
  department text not null,                  -- which dept owns this goal
  owner_agent text,                          -- specific agent responsible

  -- Timeline
  deadline timestamptz,                      -- null = ongoing
  status text default 'active',              -- 'active' | 'achieved' | 'at_risk' | 'missed' | 'paused'

  -- What to do when off track
  actions_if_behind jsonb default '[]',      -- [{action, trigger_threshold, escalation_level}]
  last_checked_at timestamptz,
  check_interval_minutes int default 60,     -- how often daemon should check this

  -- History of value changes (append-only JSONB array)
  value_history jsonb default '[]',          -- [{value, timestamp, source}]

  -- Metadata
  parent_goal_id uuid references company_goals(id),  -- goal hierarchy (OKR: O -> KR)
  tags text[] default '{}',
  metadata jsonb default '{}',

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_company_goals_dept on company_goals(department);
create index idx_company_goals_status on company_goals(status);
create index idx_company_goals_deadline on company_goals(deadline)
  where deadline is not null and status = 'active';

alter table company_goals enable row level security;
create policy "Service role manages company goals" on company_goals
  for all using (true);


-- ─── 3.2 Table: daemon_reports ───
-- Append-only versioned daemon reports. Replaces the overwritten daemon-report.json
-- with a persistent, queryable history of all daemon cycles.

create table public.daemon_reports (
  id uuid primary key default gen_random_uuid(),

  -- Report content (same structure as current daemon-report.json)
  board jsonb not null,                      -- {total, open, inProgress, done}
  signals jsonb not null default '[]',       -- array of signal objects
  llm_analysis text,                         -- LLM summary (when available)
  llm_suggestions jsonb default '[]',
  alerts jsonb default '[]',

  -- Goal check results
  goal_checks jsonb default '[]',            -- [{goalId, previousValue, currentValue, status, action_taken}]

  -- Performance
  duration_ms int,

  -- Metadata
  cycle_number int,                          -- monotonically increasing cycle counter
  metadata jsonb default '{}',

  created_at timestamptz default now()
);

create index idx_daemon_reports_created on daemon_reports(created_at desc);
create index idx_daemon_reports_cycle on daemon_reports(cycle_number);

-- TTL: keep 30 days of daemon reports (cleanup via cron or app logic)

alter table daemon_reports enable row level security;
create policy "Service role manages daemon reports" on daemon_reports
  for all using (true);


-- ═══════════════════════════════════════════════════════════════
-- Layer 4: RIFLESSIONE — Learning from Decisions
-- ═══════════════════════════════════════════════════════════════

-- ─── 4.1 Table: decision_journal ───
-- Tracks every significant decision, its expected outcome, actual outcome,
-- retrospective score, and extracted learnings. Embedding for semantic search
-- enables "what happened last time we chose X?" queries.

create table public.decision_journal (
  id uuid primary key default gen_random_uuid(),

  -- Decision identity
  title text not null,                       -- 'Adopted Voyage AI voyage-law-2 for legal embeddings'
  description text not null,                 -- full context and rationale
  department text not null,
  decision_type text not null,               -- 'architectural' | 'operational' | 'strategic' | 'tactical'

  -- Source
  source_task_id uuid references company_tasks(id) on delete set null,
  source_session_id uuid references company_sessions(id) on delete set null,
  source_adr text,                           -- 'ADR-forma-mentis' | 'ADR-integration-framework'
  decided_by text not null,                  -- 'cme' | 'boss' | 'architect'

  -- Expected outcome
  expected_outcome text not null,            -- 'Legal article similarity scores > 0.7 for IT text'
  expected_benefit text,                     -- 'Reduced hallucination by 40%'
  success_criteria jsonb default '[]',       -- [{criterion, measurable: bool, metric, target}]

  -- Actual outcome (filled in during review)
  actual_outcome text,
  outcome_score float,                       -- 0.0-1.0 (0=total failure, 1=exceeded expectations)
  outcome_notes text,
  reviewed_at timestamptz,
  reviewed_by text,

  -- Timeline
  decided_at timestamptz default now(),
  review_due_at timestamptz,                 -- when to evaluate the outcome
  status text default 'active',              -- 'active' | 'reviewed' | 'superseded' | 'reverted'

  -- Learning extraction
  learnings jsonb default '[]',              -- [{learning, confidence, applicable_to_departments}]

  -- Embedding for semantic search
  embedding vector(1024),

  -- Metadata
  tags text[] default '{}',
  metadata jsonb default '{}',

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_decision_journal_dept on decision_journal(department);
create index idx_decision_journal_type on decision_journal(decision_type);
create index idx_decision_journal_status on decision_journal(status);
create index idx_decision_journal_review_due on decision_journal(review_due_at)
  where status = 'active' and review_due_at is not null;
create index idx_decision_journal_embedding on decision_journal
  using hnsw (embedding vector_cosine_ops);

alter table decision_journal enable row level security;
create policy "Service role manages decision journal" on decision_journal
  for all using (true);


-- ─── Deferred FK: company_knowledge.source_decision_id → decision_journal ───
-- Added after both tables exist to avoid circular dependency issues.

alter table public.company_knowledge
  add constraint fk_company_knowledge_decision
  foreign key (source_decision_id) references decision_journal(id) on delete set null;


-- ═══════════════════════════════════════════════════════════════
-- RPC Functions — Semantic Search
-- ═══════════════════════════════════════════════════════════════

-- ─── match_company_knowledge ───
-- Semantic search across company-wide operational intelligence.
-- Mirrors match_legal_knowledge pattern from 003_vector_db.sql.

create or replace function match_company_knowledge(
  query_embedding vector(1024),
  filter_category text default null,
  filter_departments text[] default null,
  match_threshold float default 0.35,
  match_count int default 5
)
returns table (
  id uuid,
  category text,
  title text,
  content text,
  departments text[],
  metadata jsonb,
  times_referenced int,
  similarity float
)
language sql stable
set hnsw.ef_search = 200
as $$
  select
    ck.id,
    ck.category,
    ck.title,
    ck.content,
    ck.departments,
    ck.metadata,
    ck.times_referenced,
    1 - (ck.embedding <=> query_embedding) as similarity
  from public.company_knowledge ck
  where ck.is_active = true
    and ck.embedding is not null
    and 1 - (ck.embedding <=> query_embedding) > match_threshold
    and (filter_category is null or ck.category = filter_category)
    and (filter_departments is null or ck.departments && filter_departments)
  order by ck.embedding <=> query_embedding
  limit match_count;
$$;


-- ─── match_department_memory ───
-- Semantic search within a specific department's memory.
-- Respects is_active flag and TTL (expires_at).

create or replace function match_department_memory(
  query_embedding vector(1024),
  filter_department text,
  filter_category text default null,
  match_threshold float default 0.35,
  match_count int default 10
)
returns table (
  id uuid,
  department text,
  category text,
  key text,
  content text,
  confidence float,
  times_accessed int,
  similarity float
)
language sql stable
set hnsw.ef_search = 200
as $$
  select
    dm.id,
    dm.department,
    dm.category,
    dm.key,
    dm.content,
    dm.confidence,
    dm.times_accessed,
    1 - (dm.embedding <=> query_embedding) as similarity
  from public.department_memory dm
  where dm.is_active = true
    and dm.embedding is not null
    and dm.department = filter_department
    and 1 - (dm.embedding <=> query_embedding) > match_threshold
    and (filter_category is null or dm.category = filter_category)
    and (dm.expires_at is null or dm.expires_at > now())
  order by dm.embedding <=> query_embedding
  limit match_count;
$$;


-- ─── match_company_sessions ───
-- Semantic search across session history.
-- Finds past sessions similar to a given query (e.g., "what did we do
-- last time normattiva failed?").

create or replace function match_company_sessions(
  query_embedding vector(1024),
  filter_department text default null,
  filter_type text default null,
  match_threshold float default 0.35,
  match_count int default 5
)
returns table (
  id uuid,
  session_type text,
  department text,
  summary text,
  key_decisions jsonb,
  started_at timestamptz,
  duration_ms int,
  similarity float
)
language sql stable
set hnsw.ef_search = 200
as $$
  select
    cs.id,
    cs.session_type,
    cs.department,
    cs.summary,
    cs.key_decisions,
    cs.started_at,
    cs.duration_ms,
    1 - (cs.embedding <=> query_embedding) as similarity
  from public.company_sessions cs
  where cs.embedding is not null
    and 1 - (cs.embedding <=> query_embedding) > match_threshold
    and (filter_department is null or cs.department = filter_department)
    and (filter_type is null or cs.session_type = filter_type)
  order by cs.embedding <=> query_embedding
  limit match_count;
$$;


-- ─── match_decisions ───
-- Semantic search across the decision journal.
-- Enables "what happened last time we chose X?" queries.

create or replace function match_decisions(
  query_embedding vector(1024),
  filter_department text default null,
  filter_type text default null,
  match_threshold float default 0.35,
  match_count int default 5
)
returns table (
  id uuid,
  title text,
  description text,
  department text,
  decision_type text,
  expected_outcome text,
  actual_outcome text,
  outcome_score float,
  status text,
  decided_at timestamptz,
  similarity float
)
language sql stable
set hnsw.ef_search = 200
as $$
  select
    dj.id,
    dj.title,
    dj.description,
    dj.department,
    dj.decision_type,
    dj.expected_outcome,
    dj.actual_outcome,
    dj.outcome_score,
    dj.status,
    dj.decided_at,
    1 - (dj.embedding <=> query_embedding) as similarity
  from public.decision_journal dj
  where dj.embedding is not null
    and 1 - (dj.embedding <=> query_embedding) > match_threshold
    and (filter_department is null or dj.department = filter_department)
    and (filter_type is null or dj.decision_type = filter_type)
  order by dj.embedding <=> query_embedding
  limit match_count;
$$;
