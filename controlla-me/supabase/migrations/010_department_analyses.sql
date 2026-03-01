-- 010: Department Analyses
-- Analisi AI per-dipartimento generate dal daily standup (scripts/daily-standup.ts via claude -p CLI)
-- Consumate da: GET /api/company/departments/[dept]

create table department_analyses (
  id uuid primary key default gen_random_uuid(),
  department text not null,             -- 'ufficio-legale', 'architecture', etc.
  date date not null,                   -- YYYY-MM-DD (data del daily standup)
  summary text not null,                -- 1-2 frasi di stato del dipartimento
  status_label text not null,           -- 'on-track' | 'at-risk' | 'idle' | 'blocked'
  key_points text[] default '{}',       -- bullet list di osservazioni (max 4)
  open_count int default 0,
  in_progress_count int default 0,
  blocked_count int default 0,
  done_today_count int default 0,
  generated_at timestamptz default now(),
  -- Un'analisi per dipartimento per giorno (upsert su conflict)
  unique (department, date)
);

create index idx_dept_analyses_dept on department_analyses(department);
create index idx_dept_analyses_date on department_analyses(date desc);
