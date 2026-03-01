-- ============================================================
-- 007_analysis_sessions.sql — Cache analisi migrata da filesystem a Supabase
-- ARCH: sostituisce .analysis-cache/*.json — funziona in serverless (Vercel)
-- ============================================================

-- ─── Tabella: Sessioni di analisi ───
-- Ogni analisi crea una sessione con i risultati dei 4 agenti.
-- Non richiede user_id: la sessione è creata prima dell'autenticazione.
-- TTL: 24h, pulita da cleanup_old_analysis_sessions().
create table public.analysis_sessions (
  session_id text primary key,  -- formato: {docHash16}-{random12}
  document_hash text not null,   -- SHA256 primi 16 char del testo documento
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  -- Risultati dei 4 agenti (null = non ancora eseguito)
  classification jsonb,
  analysis jsonb,
  investigation jsonb,
  advice jsonb,
  -- Timing effettivo di ogni fase (aggiunto dopo il completamento)
  phase_timing jsonb default '{}'
);

-- ─── Indexes ───
-- Ricerca per hash documento (per resume sessioni incomplete)
create index idx_analysis_sessions_doc_hash
  on public.analysis_sessions(document_hash);

-- Cleanup: trova sessioni vecchie
create index idx_analysis_sessions_updated_at
  on public.analysis_sessions(updated_at);

-- ─── RLS ───
-- Solo service_role può accedere — mai esposto al client direttamente.
alter table public.analysis_sessions enable row level security;
-- Nessuna policy pubblica: il blocco RLS senza policy = solo service_role passa.

-- ─── Funzione: cleanup sessioni scadute ───
create or replace function cleanup_old_analysis_sessions(
  retention_hours int default 24
)
returns int
language plpgsql
security definer
as $$
declare
  deleted_count int;
begin
  delete from public.analysis_sessions
  where updated_at < now() - (retention_hours * interval '1 hour');

  get diagnostics deleted_count = row_count;

  if deleted_count > 0 then
    raise notice '[CACHE] TTL cleanup: % sessioni scadute rimosse', deleted_count;
  end if;

  return deleted_count;
end;
$$;

-- ─── Funzione: medie tempi fasi (ultime 30 sessioni complete) ───
create or replace function get_average_phase_timings()
returns jsonb
language sql
security definer
as $$
  select jsonb_build_object(
    'classifier',   coalesce(avg((phase_timing->'classifier'->>'durationMs')::numeric / 1000), 12),
    'analyzer',     coalesce(avg((phase_timing->'analyzer'->>'durationMs')::numeric / 1000), 25),
    'investigator', coalesce(avg((phase_timing->'investigator'->>'durationMs')::numeric / 1000), 22),
    'advisor',      coalesce(avg((phase_timing->'advisor'->>'durationMs')::numeric / 1000), 18)
  )
  from (
    select phase_timing
    from public.analysis_sessions
    where advice is not null
      and phase_timing != '{}'
    order by updated_at desc
    limit 30
  ) recent;
$$;
