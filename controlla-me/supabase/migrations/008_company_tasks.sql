-- 008: Company Tasks — Task system per la virtual company
-- Tabella centrale per il coordinamento tra CME e dipartimenti.

create table company_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  department text not null,        -- 'ufficio-legale', 'data-engineering', 'quality-assurance', 'architecture', 'finance', 'operations'
  status text default 'open',      -- open, in_progress, review, done, blocked
  priority text default 'medium',  -- critical, high, medium, low
  created_by text not null,        -- 'cme', 'architect', 'qa-runner', 'cost-controller', etc.
  assigned_to text,                -- chi ci sta lavorando
  parent_task_id uuid references company_tasks(id),
  blocked_by uuid[] default '{}',
  result_summary text,
  result_data jsonb,
  labels text[] default '{}',
  created_at timestamptz default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index idx_company_tasks_dept on company_tasks(department);
create index idx_company_tasks_status on company_tasks(status);
create index idx_company_tasks_created_by on company_tasks(created_by);
create index idx_company_tasks_created_at on company_tasks(created_at desc);
