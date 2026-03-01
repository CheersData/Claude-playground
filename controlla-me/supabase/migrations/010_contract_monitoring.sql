-- ============================================================
-- 006_contract_monitoring.sql — Schema per contract monitoring PMI
-- ARCH: definisce ora lo schema per evitare breaking migrations con 1000 utenti
-- ============================================================

-- ─── Tabella: Contratti monitorati ───
-- Prodotto PMI: monitoraggio continuo di contratti attivi.
-- Un contratto ha una data di scadenza, clausole da monitorare, alert configurati.
-- MVP: solo metadata + link analisi. Phase 2: full monitoring pipeline.
create table public.monitored_contracts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  -- Link all'analisi originale (se il contratto è stato analizzato da controlla.me)
  analysis_id uuid references public.analyses(id) on delete set null,
  -- Nome/titolo del contratto (es. "Affitto ufficio via Roma 5")
  name text not null,
  -- Tipo documento (eredita dal classifier se collegato ad analisi)
  document_type text,
  -- Controparte contrattuale
  counterparty_name text,
  -- Date chiave
  contract_start_date date,
  contract_end_date date,
  -- Alert: numero di giorni prima della scadenza per la notifica
  alert_days_before int[] default '{90, 30, 7}',
  -- Status del monitoring
  status text default 'active' check (status in ('active', 'expired', 'terminated', 'paused')),
  -- Clausole critiche da monitorare (estratte dall'analisi o inserite manualmente)
  -- Array di { clauseId, title, currentText, lastChecked }
  monitored_clauses jsonb default '[]',
  -- Rinnovo automatico: se presente, il contratto si rinnova automaticamente
  auto_renewal jsonb, -- { type: 'tacit'|'explicit', noticePeriodDays: 90, renewedUntil: null }
  -- Metadata addizionali (valore contratto, valuta, etc.)
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─── Tabella: Alert storici ───
-- Log degli alert generati e il loro stato (notificato, letto, ignorato).
create table public.contract_alerts (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid references public.monitored_contracts(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  alert_type text not null check (
    alert_type in (
      'expiry_approaching',     -- Scadenza imminente
      'auto_renewal_notice',    -- Periodo di disdetta in scadenza
      'clause_change_detected', -- Rilevato cambiamento clausola (future)
      'custom'                  -- Alert personalizzato
    )
  ),
  -- Quanti giorni mancano alla scadenza (snapshot al momento della generazione)
  days_until_expiry int,
  message text not null,
  -- Canale di notifica usato
  notified_via text[] default '{}', -- ['email', 'in_app', 'webhook']
  -- Status dell'alert
  status text default 'pending' check (status in ('pending', 'sent', 'read', 'dismissed')),
  triggered_at timestamptz default now(),
  read_at timestamptz
);

-- ─── Tabella: Checklist rinnovo ───
-- Task da completare per il rinnovo/chiusura di un contratto.
-- Generata automaticamente da advisor o configurata manualmente.
create table public.contract_renewal_tasks (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid references public.monitored_contracts(id) on delete cascade not null,
  title text not null,
  description text,
  due_date date,
  completed boolean default false,
  completed_at timestamptz,
  created_at timestamptz default now()
);

-- ─── Indexes ───
create index idx_monitored_contracts_user_id on public.monitored_contracts(user_id);
create index idx_monitored_contracts_end_date on public.monitored_contracts(contract_end_date)
  where status = 'active';
create index idx_contract_alerts_user_id on public.contract_alerts(user_id);
create index idx_contract_alerts_status on public.contract_alerts(status)
  where status in ('pending', 'sent');

-- ─── RLS ───
alter table public.monitored_contracts enable row level security;
alter table public.contract_alerts enable row level security;
alter table public.contract_renewal_tasks enable row level security;

-- Utenti vedono solo i loro contratti
create policy "Users manage own contracts" on public.monitored_contracts
  for all using (auth.uid() = user_id);

create policy "Users manage own alerts" on public.contract_alerts
  for all using (auth.uid() = user_id);

create policy "Users manage own renewal tasks" on public.contract_renewal_tasks
  for all using (
    exists (
      select 1 from public.monitored_contracts mc
      where mc.id = contract_renewal_tasks.contract_id
      and mc.user_id = auth.uid()
    )
  );

-- ─── Funzione: genera alert per contratti in scadenza ───
-- Da chiamare via cron giornaliero.
create or replace function generate_expiry_alerts()
returns int
language plpgsql
security definer
as $$
declare
  rec record;
  alert_day int;
  existing_alert_count int;
  generated_count int := 0;
begin
  -- Per ogni contratto attivo con data di scadenza
  for rec in
    select mc.id, mc.user_id, mc.name, mc.contract_end_date, mc.alert_days_before
    from public.monitored_contracts mc
    where mc.status = 'active'
      and mc.contract_end_date is not null
      and mc.contract_end_date >= current_date
  loop
    -- Per ogni soglia di alert configurata
    foreach alert_day in array rec.alert_days_before loop
      -- Verifica se oggi è il giorno giusto per l'alert
      if (rec.contract_end_date - current_date) = alert_day then
        -- Evita duplicati: non inserire se già esiste per oggi
        select count(*) into existing_alert_count
        from public.contract_alerts ca
        where ca.contract_id = rec.id
          and ca.alert_type = 'expiry_approaching'
          and ca.days_until_expiry = alert_day
          and ca.triggered_at >= current_date;

        if existing_alert_count = 0 then
          insert into public.contract_alerts (
            contract_id, user_id, alert_type, days_until_expiry, message, status
          ) values (
            rec.id,
            rec.user_id,
            'expiry_approaching',
            alert_day,
            format('Il contratto "%s" scade tra %s giorni (%s).',
                   rec.name, alert_day, to_char(rec.contract_end_date, 'DD/MM/YYYY')),
            'pending'
          );
          generated_count := generated_count + 1;
        end if;
      end if;
    end loop;
  end loop;

  return generated_count;
end;
$$;

-- ─── Trigger: updated_at automatico ───
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger monitored_contracts_updated_at
  before update on public.monitored_contracts
  for each row execute function set_updated_at();
