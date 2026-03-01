-- 009: Agent Cost Log — Tracking costi reali per ogni chiamata agente.

create table agent_cost_log (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null,
  model_key text not null,
  provider text not null,
  input_tokens int not null,
  output_tokens int not null,
  total_cost_usd numeric(10,6) not null,
  duration_ms int not null,
  used_fallback boolean default false,
  session_type text,              -- 'analysis', 'corpus-qa', 'console', etc.
  created_at timestamptz default now()
);

create index idx_cost_agent on agent_cost_log(agent_name);
create index idx_cost_date on agent_cost_log(created_at);
create index idx_cost_provider on agent_cost_log(provider);
