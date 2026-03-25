-- ============================================================
-- Migration 051: Fix music_trend_cache source CHECK constraint
--
-- Problem: The CHECK constraint on source only allows 5 values
-- but trend_scout.py also writes source='full_report' for
-- cached complete reports. This causes 400 Bad Request.
--
-- Fix: Drop and recreate the constraint with 'full_report' added.
-- ============================================================

ALTER TABLE public.music_trend_cache
  DROP CONSTRAINT IF EXISTS music_trend_cache_source_check;

ALTER TABLE public.music_trend_cache
  ADD CONSTRAINT music_trend_cache_source_check
  CHECK (source IN ('tunebat','hooktheory','lastfm','musicbrainz','soundcharts','full_report'));
