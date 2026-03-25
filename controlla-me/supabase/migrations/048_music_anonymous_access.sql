-- 048_music_anonymous_access.sql
-- Allow anonymous users to upload and analyze music (user_id nullable).
-- Matches the legal analysis pattern where auth is optional.

-- Drop the NOT NULL constraint on user_id (keep the FK for authenticated users)
alter table public.music_analyses
  alter column user_id drop not null;

-- Add RLS policy for service_role to insert/read anonymous records
-- (service_role already has full access via default policies, but be explicit)

-- Allow anonymous reads via service_role (the API uses createAdminClient)
-- No changes needed: service_role bypasses RLS.

-- Add policy for anon inserts (the upload route uses createAdminClient/service_role,
-- so this is not strictly needed, but documents the intent)
comment on column public.music_analyses.user_id is
  'NULL for anonymous uploads. FK to auth.users when authenticated.';
