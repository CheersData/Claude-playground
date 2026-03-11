-- ============================================================
-- 026_cdp.sql — Customer Data Profile (CDP)
-- Profilo cliente unificato con event sourcing e bonifica dati.
-- Primo passo verso piattaforma multi-agente.
-- ============================================================

-- ─── Tabella: Profili cliente unificati ───
-- JSONB flessibile per evoluzione senza migrazioni.
-- Un profilo per utente, aggiornato incrementalmente dagli eventi.
create table public.customer_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,

  -- Sezioni del profilo (JSONB per flessibilita)
  identity jsonb not null default '{}',
  -- { email_domain, account_type, inferred_sector, inferred_region, signup_source }

  behavior jsonb not null default '{}',
  -- { total_analyses, analyses_last_30d, avg_session_duration_ms,
  --   preferred_doc_types, deep_search_rate, corpus_queries,
  --   last_active_at, engagement_score }

  risk_profile jsonb not null default '{}',
  -- { avg_fairness_score, risk_distribution, common_risk_areas,
  --   needs_lawyer_rate, legal_literacy }

  preferences jsonb not null default '{}',
  -- { preferred_language, notification_opt_in, lawyer_interest, corpus_interests }

  lifecycle jsonb not null default '{}',
  -- { stage, first_analysis_at, plan_history, conversion_signals, churn_risk }

  -- Metadati
  computed_at timestamptz default now(),
  version int not null default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─── Tabella: Eventi profilo (append-only log) ───
-- Ogni interazione dell'utente genera un evento.
-- Il profilo e una vista materializzata calcolata dagli eventi.
create table public.profile_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  -- Tipi: 'analysis_completed', 'deep_search_performed', 'corpus_query',
  --       'lawyer_referral_requested', 'plan_changed', 'login', 'profile_updated'
  event_data jsonb not null default '{}',
  processed boolean not null default false,
  created_at timestamptz default now()
);

-- ─── Indexes ───

-- Profili: lookup rapido per stage lifecycle (segmentazione)
create index idx_cdp_lifecycle_stage
  on public.customer_profiles using gin (lifecycle);

-- Profili: ordinamento per ultimo ricalcolo
create index idx_cdp_computed_at
  on public.customer_profiles(computed_at);

-- Eventi: lookup per utente + ordinamento temporale
create index idx_profile_events_user_created
  on public.profile_events(user_id, created_at desc);

-- Eventi: filtraggio per tipo (analitiche)
create index idx_profile_events_type
  on public.profile_events(event_type);

-- Eventi: pipeline di ricalcolo (trova eventi non processati)
create index idx_profile_events_unprocessed
  on public.profile_events(processed)
  where processed = false;

-- Eventi: TTL cleanup (trova eventi vecchi)
create index idx_profile_events_created_at
  on public.profile_events(created_at);

-- ─── RLS ───
alter table public.customer_profiles enable row level security;
alter table public.profile_events enable row level security;

-- Profili CDP: utenti possono leggere solo il proprio profilo
create policy "Users can view own CDP profile"
  on public.customer_profiles
  for select
  using (auth.uid() = user_id);

-- Profili CDP: solo service_role puo scrivere (il backend aggiorna)
-- Nessuna policy INSERT/UPDATE per utenti normali = solo service_role passa.

-- Eventi: utenti possono leggere i propri eventi
create policy "Users can view own profile events"
  on public.profile_events
  for select
  using (auth.uid() = user_id);

-- Eventi: solo service_role puo inserire (il backend crea eventi)
-- Nessuna policy INSERT per utenti normali = solo service_role passa.

-- ─── Funzione: Cleanup eventi scaduti (TTL 365 giorni) ───
create or replace function cleanup_old_profile_events(
  retention_days int default 365
)
returns int
language plpgsql
security definer
as $$
declare
  deleted_count int;
begin
  delete from public.profile_events
  where created_at < now() - (retention_days * interval '1 day');

  get diagnostics deleted_count = row_count;

  if deleted_count > 0 then
    raise notice '[CDP] TTL cleanup: % eventi scaduti rimossi', deleted_count;
  end if;

  return deleted_count;
end;
$$;

-- ─── Funzione: Conta eventi per tipo (analytics) ───
create or replace function cdp_event_counts(
  p_user_id uuid,
  p_since timestamptz default now() - interval '30 days'
)
returns jsonb
language sql
security definer
as $$
  select coalesce(
    jsonb_object_agg(event_type, cnt),
    '{}'::jsonb
  )
  from (
    select event_type, count(*) as cnt
    from public.profile_events
    where user_id = p_user_id
      and created_at >= p_since
    group by event_type
  ) sub;
$$;

-- ─── Funzione: Crea profilo CDP iniziale per utente ───
-- Chiamata dopo signup o per backfill utenti esistenti.
create or replace function cdp_init_profile(p_user_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_profile public.profiles;
begin
  -- Leggi dati dal profilo esistente
  select * into v_profile
  from public.profiles
  where id = p_user_id;

  if not found then
    raise exception 'Profile not found for user %', p_user_id;
  end if;

  -- Inserisci profilo CDP (ignora se gia esiste)
  insert into public.customer_profiles (user_id, identity, behavior, lifecycle)
  values (
    p_user_id,
    jsonb_build_object(
      'email_domain', split_part(v_profile.email, '@', 2),
      'account_type', 'individual',
      'signup_source', 'organic'
    ),
    jsonb_build_object(
      'total_analyses', v_profile.analyses_count,
      'analyses_last_30d', 0,
      'last_active_at', now()
    ),
    jsonb_build_object(
      'stage', case
        when v_profile.analyses_count >= 10 then 'power_user'
        when v_profile.analyses_count >= 3 then 'engaged'
        when v_profile.analyses_count >= 1 then 'activated'
        else 'new'
      end,
      'plan_history', jsonb_build_array(
        jsonb_build_object('plan', v_profile.plan, 'from', v_profile.created_at, 'to', null)
      )
    )
  )
  on conflict (user_id) do nothing;
end;
$$;
