-- ============================================================
-- 033_domain_support.sql — Multi-domain/vertical corpus filtering
-- ============================================================
--
-- NOTE: Migration 027 renamed `domain` to `vertical`.
-- This migration uses `vertical` consistently. If the column `vertical`
-- already exists (from 027), we skip. If only `domain` exists (pre-027),
-- we rename it to `vertical`.
--
-- The functions below use `filter_vertical` parameter name for consistency
-- with migration 027.

-- Ensure vertical column exists (idempotent — handles both pre/post 027 states)
DO $$
BEGIN
  -- If 'vertical' exists, we're good (027 already ran)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'legal_articles' AND column_name = 'vertical') THEN
    -- nothing to do
    NULL;
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'legal_articles' AND column_name = 'domain') THEN
    -- pre-027 state: rename domain to vertical
    ALTER TABLE public.legal_articles RENAME COLUMN domain TO vertical;
  ELSE
    -- neither exists: add vertical
    ALTER TABLE public.legal_articles ADD COLUMN vertical TEXT NOT NULL DEFAULT 'legal';
  END IF;
END $$;

-- Index for vertical filtering (drop old domain indexes if they exist)
DROP INDEX IF EXISTS idx_legal_articles_domain;
DROP INDEX IF EXISTS idx_legal_articles_domain_source;
CREATE INDEX IF NOT EXISTS idx_legal_articles_vertical
  ON public.legal_articles(vertical);
CREATE INDEX IF NOT EXISTS idx_legal_articles_vertical_source
  ON public.legal_articles(vertical, law_source);

-- ─── Update match_legal_articles to support vertical filter ───
CREATE OR REPLACE FUNCTION match_legal_articles(
  query_embedding vector(1024),
  filter_law_source text DEFAULT null,
  filter_institutes text[] DEFAULT null,
  filter_vertical text DEFAULT null,
  match_threshold float DEFAULT 0.6,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  law_source text,
  article_reference text,
  article_title text,
  article_text text,
  hierarchy jsonb,
  keywords text[],
  related_institutes text[],
  source_url text,
  is_in_force boolean,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    la.id,
    la.law_source,
    la.article_reference,
    la.article_title,
    la.article_text,
    la.hierarchy,
    la.keywords,
    la.related_institutes,
    la.source_url,
    la.is_in_force,
    1 - (la.embedding <=> query_embedding) AS similarity
  FROM public.legal_articles la
  WHERE la.is_in_force = true
    AND la.embedding IS NOT NULL
    AND 1 - (la.embedding <=> query_embedding) > match_threshold
    AND (filter_law_source IS NULL OR la.law_source = filter_law_source)
    AND (filter_institutes IS NULL OR la.related_institutes && filter_institutes)
    AND (filter_vertical IS NULL OR la.vertical = filter_vertical)
  ORDER BY la.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ─── Update get_articles_by_source to support vertical filter ───
CREATE OR REPLACE FUNCTION get_articles_by_source(
  p_law_source text,
  p_limit int DEFAULT 50,
  p_vertical text DEFAULT null
)
RETURNS TABLE (
  id uuid,
  law_source text,
  article_reference text,
  article_title text,
  article_text text,
  hierarchy jsonb,
  keywords text[],
  related_institutes text[],
  source_url text,
  is_in_force boolean
)
LANGUAGE sql STABLE
AS $$
  SELECT
    la.id,
    la.law_source,
    la.article_reference,
    la.article_title,
    la.article_text,
    la.hierarchy,
    la.keywords,
    la.related_institutes,
    la.source_url,
    la.is_in_force
  FROM public.legal_articles la
  WHERE la.law_source = p_law_source
    AND la.is_in_force = true
    AND (p_vertical IS NULL OR la.vertical = p_vertical)
  ORDER BY la.article_reference
  LIMIT p_limit;
$$;

-- ─── Update get_articles_by_institute to support vertical filter ───
CREATE OR REPLACE FUNCTION get_articles_by_institute(
  p_institute text,
  p_limit int DEFAULT 20,
  p_vertical text DEFAULT null
)
RETURNS TABLE (
  id uuid,
  law_source text,
  article_reference text,
  article_title text,
  article_text text,
  hierarchy jsonb,
  keywords text[],
  related_institutes text[],
  source_url text,
  is_in_force boolean
)
LANGUAGE sql STABLE
AS $$
  SELECT
    la.id,
    la.law_source,
    la.article_reference,
    la.article_title,
    la.article_text,
    la.hierarchy,
    la.keywords,
    la.related_institutes,
    la.source_url,
    la.is_in_force
  FROM public.legal_articles la
  WHERE p_institute = ANY(la.related_institutes)
    AND la.is_in_force = true
    AND (p_vertical IS NULL OR la.vertical = p_vertical)
  ORDER BY la.article_reference
  LIMIT p_limit;
$$;
