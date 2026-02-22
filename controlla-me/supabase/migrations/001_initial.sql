-- Tabella utenti (estende auth.users)
create table public.profiles (
  id uuid references auth.users primary key,
  email text,
  full_name text,
  analyses_count int default 0,
  plan text default 'free', -- 'free' | 'pro'
  stripe_customer_id text,
  created_at timestamptz default now()
);

-- Tabella analisi documenti
create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  file_name text not null,
  file_url text,
  document_type text,
  status text default 'pending', -- 'pending' | 'processing' | 'completed' | 'error'

  -- Risultati dei 4 agenti (JSONB)
  classification jsonb,
  analysis jsonb,
  investigation jsonb,
  advice jsonb,

  fairness_score numeric(3,1),
  summary text,

  created_at timestamptz default now(),
  completed_at timestamptz
);

-- Tabella approfondimenti on-demand
create table public.deep_searches (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid references public.analyses(id),
  user_question text not null,
  agent_response jsonb,
  sources jsonb, -- Array di {url, title, excerpt}
  created_at timestamptz default now()
);

-- Tabella referral avvocati
create table public.lawyer_referrals (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid references public.analyses(id),
  user_id uuid references public.profiles(id),
  lawyer_id uuid,
  specialization text,
  region text,
  status text default 'pending', -- 'pending' | 'contacted' | 'converted'
  created_at timestamptz default now()
);

-- Indexes
create index idx_analyses_user_id on public.analyses(user_id);
create index idx_analyses_status on public.analyses(status);
create index idx_deep_searches_analysis_id on public.deep_searches(analysis_id);
create index idx_lawyer_referrals_analysis_id on public.lawyer_referrals(analysis_id);

-- RLS Policies
alter table public.profiles enable row level security;
alter table public.analyses enable row level security;
alter table public.deep_searches enable row level security;
alter table public.lawyer_referrals enable row level security;

-- Profiles: users can read/update their own profile
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- Analyses: users can CRUD their own analyses
create policy "Users can view own analyses" on public.analyses
  for select using (auth.uid() = user_id);
create policy "Users can insert own analyses" on public.analyses
  for insert with check (auth.uid() = user_id);
create policy "Users can update own analyses" on public.analyses
  for update using (auth.uid() = user_id);

-- Deep searches: users can view deep searches for their analyses
create policy "Users can view own deep searches" on public.deep_searches
  for select using (
    exists (
      select 1 from public.analyses
      where analyses.id = deep_searches.analysis_id
      and analyses.user_id = auth.uid()
    )
  );
create policy "Users can insert own deep searches" on public.deep_searches
  for insert with check (
    exists (
      select 1 from public.analyses
      where analyses.id = deep_searches.analysis_id
      and analyses.user_id = auth.uid()
    )
  );

-- Lawyer referrals: users can manage their own referrals
create policy "Users can view own referrals" on public.lawyer_referrals
  for select using (auth.uid() = user_id);
create policy "Users can insert own referrals" on public.lawyer_referrals
  for insert with check (auth.uid() = user_id);

-- Function to auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
