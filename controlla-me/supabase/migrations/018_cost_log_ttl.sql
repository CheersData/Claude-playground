-- 018: TTL per agent_cost_log — ADR-011 Fase 1
-- agent_cost_log è l'unica tabella a crescita illimitata senza cleanup.
-- Retention: 6 mesi (sufficiente per analytics operativo e Finance).
-- Pattern identico a cleanup_old_audit_logs() di migration 007.

create or replace function cleanup_old_cost_logs(retention_months int default 6)
returns int
language plpgsql
security definer
as $$
declare
  deleted_count int;
begin
  delete from public.agent_cost_log
  where created_at < now() - (retention_months || ' months')::interval;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- View rolling 30 giorni per dashboard Finance
create or replace view cost_summary_30d as
select
  agent_name,
  provider,
  model_key,
  count(*) as calls,
  sum(total_cost_usd)::numeric(10,4) as total_cost_usd,
  sum(input_tokens) as total_input_tokens,
  sum(output_tokens) as total_output_tokens,
  avg(duration_ms)::int as avg_duration_ms,
  count(*) filter (where used_fallback) as fallback_count,
  date_trunc('day', created_at) as day
from public.agent_cost_log
where created_at > now() - interval '30 days'
group by agent_name, provider, model_key, date_trunc('day', created_at)
order by day desc, total_cost_usd desc;
