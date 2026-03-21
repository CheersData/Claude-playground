-- ============================================================
-- Migration 045: Music Office — Ufficio Musica Schema
--
-- 3 tables:
--   music_analyses       — Core analysis (audio DNA, trend report, direction plan)
--   music_artist_profiles — One profile per user (artist identity)
--   music_trend_cache    — Cached trend data with 7-day TTL
--
-- All tables: RLS enabled, service_role full access,
-- authenticated users own-row access on analyses + profiles.
-- ============================================================


-- ═══════════════════════════════════════════════════════════════
-- 1. music_analyses — Core analysis table
-- ═══════════════════════════════════════════════════════════════

create table public.music_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,

  -- File metadata
  file_name text not null,
  file_size_bytes bigint,
  duration_seconds numeric,

  -- Pipeline status
  status text not null default 'pending'
    check (status in ('pending','processing','stem_separation','analyzing','comparing','directing','completed','failed')),

  -- Analysis results (populated by agents)
  audio_dna jsonb,                          -- full audio analysis: structure, melody, harmony, vocal, arrangement
  trend_report jsonb,                       -- market comparison data from trend sources
  direction_plan jsonb,                     -- LLM-generated arrangement/production suggestions

  -- Summary metrics
  commercial_viability_score numeric(3,1)   -- 1.0-10.0
    check (commercial_viability_score >= 1.0 and commercial_viability_score <= 10.0),
  genre text,
  bpm numeric,
  musical_key text,

  -- Error handling
  error_message text,

  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

comment on table public.music_analyses is
  'Core music analysis table. Each row = one song analyzed through the 3-agent pipeline (Audio DNA, Trend Scout, Arrangiatore).';

-- Indexes
create index idx_music_analyses_user_id on music_analyses(user_id);
create index idx_music_analyses_status on music_analyses(status);

-- RLS
alter table public.music_analyses enable row level security;

create policy "service_role_full_access" on music_analyses
  for all using (true) with check (true);

create policy "users_read_own" on music_analyses
  for select to authenticated
  using (auth.uid() = user_id);

create policy "users_insert_own" on music_analyses
  for insert to authenticated
  with check (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════════
-- 2. music_artist_profiles — Artist identity (one per user)
-- ═══════════════════════════════════════════════════════════════

create table public.music_artist_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,

  -- Artist identity
  artist_name text not null,
  genre text,
  sub_genre text,
  monthly_listeners int,
  target_audience text,
  influences text[] default '{}',           -- array of artist/genre influences

  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One profile per user
  constraint music_artist_profiles_user_unique unique (user_id)
);

comment on table public.music_artist_profiles is
  'Artist profile for the Music Office. One per user. Stores identity, genre, influences for personalized analysis.';

-- RLS
alter table public.music_artist_profiles enable row level security;

create policy "service_role_full_access" on music_artist_profiles
  for all using (true) with check (true);

create policy "users_read_own" on music_artist_profiles
  for select to authenticated
  using (auth.uid() = user_id);

create policy "users_insert_own" on music_artist_profiles
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "users_update_own" on music_artist_profiles
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════════
-- 3. music_trend_cache — Cached trend data with TTL
-- ═══════════════════════════════════════════════════════════════

create table public.music_trend_cache (
  id uuid primary key default gen_random_uuid(),

  -- Cache identity
  genre text not null,
  source text not null
    check (source in ('tunebat','hooktheory','lastfm','musicbrainz','soundcharts')),
  query_key text not null,                  -- cache key for deduplication

  -- Cached data
  data jsonb not null,

  -- TTL
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),

  -- Dedup: one entry per source + query_key
  constraint music_trend_cache_source_key unique (source, query_key)
);

comment on table public.music_trend_cache is
  'Cached trend data from external music sources. 7-day TTL. Used by Trend Scout agent to avoid redundant API calls.';

-- Index for TTL cleanup queries
create index idx_music_trend_cache_expires on music_trend_cache(expires_at);

-- RLS (service_role only — backend manages cache)
alter table public.music_trend_cache enable row level security;

create policy "service_role_full_access" on music_trend_cache
  for all using (true) with check (true);
