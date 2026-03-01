-- ============================================================
-- 005_audit_log.sql — Audit log strutturato persistente
-- SEC-006: Tracciabilità decisioni AI per EU AI Act compliance
-- ============================================================

-- ─── Tabella: Audit log ───
-- Registra ogni evento significativo del sistema per:
-- - EU AI Act art. 13: trasparenza e tracciabilità
-- - GDPR art. 5(2): accountability
-- - Incident response: diagnosi post-mortem
-- - Finance: correlazione costi AI con richieste

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  -- Timestamp preciso dell'evento
  created_at timestamptz default now() not null,
  -- Tipo evento: 'auth.login' | 'auth.failed' | 'analyze.start' | 'analyze.complete'
  --              | 'analyze.error' | 'tier.change' | 'agent.toggle' | 'corpus.query'
  --              | 'stripe.checkout' | 'stripe.webhook' | 'rate_limit.hit'
  event_type text not null,
  -- ID utente Supabase (null se anonimo o errore auth)
  user_id uuid references auth.users(id) on delete set null,
  -- Session ID della console (per correlare eventi nella stessa sessione operativa)
  console_sid text,
  -- Session ID dell'analisi (per correlare con cache e Supabase analyses)
  analysis_session_id text,
  -- IP address del client (da x-forwarded-for)
  ip_address text,
  -- User-Agent (per audit trail)
  user_agent text,
  -- Payload JSON: contesto specifico dell'evento
  -- es. analyze.complete → { documentHash, phases, agentModels, fairnessScore, tokensTotal }
  -- es. tier.change → { fromTier, toTier, sid }
  -- es. auth.failed → { inputLength, reason }
  payload jsonb default '{}',
  -- Risultato: 'success' | 'failure' | 'error' | 'rate_limited'
  result text,
  -- Messaggio di errore se result = 'error' | 'failure'
  error_message text,
  -- Durata totale operazione in ms (per performance monitoring)
  duration_ms int,
  -- Conteggio token AI (per cost tracking)
  tokens_input int,
  tokens_output int,
  -- Modello AI usato (per cost attribution)
  ai_model text
);

-- ─── Indexes ───
create index idx_audit_logs_created_at on public.audit_logs(created_at desc);
create index idx_audit_logs_user_id on public.audit_logs(user_id);
create index idx_audit_logs_event_type on public.audit_logs(event_type);
create index idx_audit_logs_console_sid on public.audit_logs(console_sid) where console_sid is not null;

-- ─── RLS: solo service_role può leggere e scrivere ───
-- I log non devono essere leggibili da client-side per evitare information disclosure.
alter table public.audit_logs enable row level security;

create policy "Service role manages audit logs" on public.audit_logs
  for all using (auth.role() = 'service_role');

-- ─── Funzione helper: cleanup log > 12 mesi ───
-- GDPR: retention minima necessaria per compliance EU AI Act.
-- Per audit trail legale 12 mesi sono sufficienti; per incidenti gravi conservare più a lungo.
create or replace function cleanup_old_audit_logs(retention_months int default 12)
returns int
language plpgsql
security definer
as $$
declare
  deleted_count int;
begin
  delete from public.audit_logs
  where created_at < now() - (retention_months || ' months')::interval;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- ─── View per dashboard operations (solo service_role) ───
create or replace view audit_summary_7d as
select
  event_type,
  result,
  count(*) as count,
  avg(duration_ms)::int as avg_duration_ms,
  sum(tokens_input) as total_tokens_input,
  sum(tokens_output) as total_tokens_output,
  date_trunc('day', created_at) as day
from public.audit_logs
where created_at > now() - interval '7 days'
group by event_type, result, date_trunc('day', created_at)
order by day desc, count desc;
