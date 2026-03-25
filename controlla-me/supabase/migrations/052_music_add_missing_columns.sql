-- ============================================================
-- Migration 052: Add missing columns to music tables
--
-- Fixes PGRST204 errors where Python code writes columns
-- that don't exist in the DB schema:
--   music_analyses:       + track_name, analysis_type
--   music_artist_profiles: + last_analysis_id, total_analyses
-- ============================================================

-- 1. music_analyses — add track_name and analysis_type
alter table public.music_analyses
  add column if not exists track_name text,
  add column if not exists analysis_type text default 'full';

comment on column public.music_analyses.track_name is
  'Human-readable track name (defaults to filename stem in pipeline)';

comment on column public.music_analyses.analysis_type is
  'Type of analysis: full, quick, reanalysis (default: full)';

-- Index for track_name lookups (used by get_analyses_by_track)
create index if not exists idx_music_analyses_track_name
  on music_analyses(track_name);


-- 2. music_artist_profiles — add last_analysis_id and total_analyses
alter table public.music_artist_profiles
  add column if not exists last_analysis_id uuid references public.music_analyses(id) on delete set null,
  add column if not exists total_analyses int not null default 0;

comment on column public.music_artist_profiles.last_analysis_id is
  'FK to the most recent analysis for this artist';

comment on column public.music_artist_profiles.total_analyses is
  'Running count of analyses performed for this artist';
