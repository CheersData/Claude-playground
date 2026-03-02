-- 006_connector_sync_log.sql
-- Tabella per tracciare le sincronizzazioni del Data Connector (Staff Service)

create table if not exists public.connector_sync_log (
  id uuid primary key default gen_random_uuid(),
  source_id text not null,
  sync_type text not null default 'full',    -- 'full' | 'delta' | 'test' | 'connect' | 'model'
  status text not null default 'running',    -- 'running' | 'completed' | 'failed'
  phase text,                                -- 'connect' | 'model' | 'load'
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  items_fetched int default 0,
  items_inserted int default 0,
  items_updated int default 0,
  items_skipped int default 0,
  errors int default 0,
  error_details jsonb default '[]'::jsonb,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_sync_log_source on public.connector_sync_log(source_id);
create index if not exists idx_sync_log_status on public.connector_sync_log(status);

-- RLS: solo service role
alter table public.connector_sync_log enable row level security;
create policy "Service role full access" on public.connector_sync_log
  for all using (true) with check (true);

-- Aggiungere last_synced_at a legal_articles per delta tracking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'legal_articles'
      AND column_name = 'last_synced_at'
  ) THEN
    ALTER TABLE public.legal_articles ADD COLUMN last_synced_at timestamptz;
  END IF;
END $$;
