-- ============================================================
-- 004_domain_support.sql — Add domain column for multi-domain corpus
-- ============================================================

-- Add domain column to legal_articles (default 'legal' for backward compat)
ALTER TABLE public.legal_articles
  ADD COLUMN IF NOT EXISTS domain TEXT NOT NULL DEFAULT 'legal';

-- Index for domain filtering
CREATE INDEX IF NOT EXISTS idx_legal_articles_domain
  ON public.legal_articles(domain);

-- Composite index for domain + law_source lookups
CREATE INDEX IF NOT EXISTS idx_legal_articles_domain_source
  ON public.legal_articles(domain, law_source);

-- ─── Update match_legal_articles to support domain filter ───
CREATE OR REPLACE FUNCTION match_legal_articles(
  query_embedding vector(1024),
  filter_law_source text DEFAULT null,
  filter_institutes text[] DEFAULT null,
  filter_domain text DEFAULT null,
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
    AND 1 - (la.embedding <=> query_embedding) > match_threshold
    AND (filter_law_source IS NULL OR la.law_source = filter_law_source)
    AND (filter_institutes IS NULL OR la.related_institutes && filter_institutes)
    AND (filter_domain IS NULL OR la.domain = filter_domain)
  ORDER BY la.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ─── Update get_articles_by_source to support domain filter ───
CREATE OR REPLACE FUNCTION get_articles_by_source(
  p_law_source text,
  p_limit int DEFAULT 50,
  p_domain text DEFAULT null
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
    AND (p_domain IS NULL OR la.domain = p_domain)
  ORDER BY la.article_reference
  LIMIT p_limit;
$$;

-- ─── Update get_articles_by_institute to support domain filter ───
CREATE OR REPLACE FUNCTION get_articles_by_institute(
  p_institute text,
  p_limit int DEFAULT 20,
  p_domain text DEFAULT null
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
    AND (p_domain IS NULL OR la.domain = p_domain)
  ORDER BY la.article_reference
  LIMIT p_limit;
$$;
