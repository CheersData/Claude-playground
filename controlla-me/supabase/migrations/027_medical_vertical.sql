-- Migration 027: Medical Vertical (studia.me)
--
-- Renames `domain` column (from 004) to `vertical` for consistency.
-- Adds vertical discriminator to legal_knowledge.
-- Medical articles go in the SAME tables, filtered by vertical = 'medical'.
-- Embedding dimension is the same (1024) for both voyage-law-2 and voyage-3.

-- ─── Step 1: Rename domain → vertical on legal_articles ───
-- Migration 004 added `domain TEXT NOT NULL DEFAULT 'legal'`.
-- We standardize the name to `vertical` across the codebase.
ALTER TABLE public.legal_articles
  RENAME COLUMN domain TO vertical;

-- Drop old domain indexes (from migration 004)
DROP INDEX IF EXISTS idx_legal_articles_domain;
DROP INDEX IF EXISTS idx_legal_articles_domain_source;

-- Create new vertical indexes
CREATE INDEX IF NOT EXISTS idx_legal_articles_vertical
  ON public.legal_articles (vertical);

CREATE INDEX IF NOT EXISTS idx_legal_articles_vertical_source
  ON public.legal_articles (vertical, law_source);

-- ─── Step 2: Add vertical column to legal_knowledge ───
ALTER TABLE public.legal_knowledge
  ADD COLUMN IF NOT EXISTS vertical TEXT NOT NULL DEFAULT 'legal';

CREATE INDEX IF NOT EXISTS idx_legal_knowledge_vertical
  ON public.legal_knowledge (vertical);

-- ─── Step 3: Update match_legal_articles (from 004) to use vertical ───
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

-- ─── Step 4: Update get_articles_by_source (from 004) to use vertical ───
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

-- ─── Step 5: Update get_articles_by_institute (from 004) to use vertical ───
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

-- ─── Step 6: Vertical-specific article search (semantic) ───
CREATE OR REPLACE FUNCTION match_articles_by_vertical(
  p_vertical TEXT,
  query_embedding vector(1024),
  filter_law_source TEXT DEFAULT NULL,
  filter_institutes TEXT[] DEFAULT NULL,
  match_threshold FLOAT DEFAULT 0.4,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  law_source TEXT,
  article_reference TEXT,
  article_title TEXT,
  article_text TEXT,
  hierarchy JSONB,
  keywords TEXT[],
  related_institutes TEXT[],
  source_url TEXT,
  is_in_force BOOLEAN,
  vertical TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
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
    la.vertical,
    1 - (la.embedding <=> query_embedding) AS similarity
  FROM legal_articles la
  WHERE la.vertical = p_vertical
    AND la.embedding IS NOT NULL
    AND 1 - (la.embedding <=> query_embedding) > match_threshold
    AND (filter_law_source IS NULL OR la.law_source = filter_law_source)
    AND (filter_institutes IS NULL OR la.related_institutes && filter_institutes)
  ORDER BY la.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ─── Step 7: Vertical-specific knowledge search (semantic) ───
CREATE OR REPLACE FUNCTION match_knowledge_by_vertical(
  p_vertical TEXT,
  query_embedding vector(1024),
  filter_category TEXT DEFAULT NULL,
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  category TEXT,
  source_ref TEXT,
  metadata JSONB,
  vertical TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    lk.id,
    lk.content,
    lk.category,
    lk.source_ref,
    lk.metadata,
    lk.vertical,
    1 - (lk.embedding <=> query_embedding) AS similarity
  FROM legal_knowledge lk
  WHERE lk.vertical = p_vertical
    AND lk.embedding IS NOT NULL
    AND 1 - (lk.embedding <=> query_embedding) > match_threshold
    AND (filter_category IS NULL OR lk.category = filter_category)
  ORDER BY lk.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ─── Step 8: Articles by source within a vertical ───
CREATE OR REPLACE FUNCTION get_articles_by_source_vertical(
  p_vertical TEXT,
  p_law_source TEXT,
  p_limit INT DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  law_source TEXT,
  article_reference TEXT,
  article_title TEXT,
  article_text TEXT,
  hierarchy JSONB,
  keywords TEXT[],
  related_institutes TEXT[],
  source_url TEXT,
  is_in_force BOOLEAN
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
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
  FROM legal_articles la
  WHERE la.vertical = p_vertical
    AND la.law_source = p_law_source
  ORDER BY la.article_reference
  LIMIT p_limit;
END;
$$;

-- ─── Step 9: Articles by topic within a vertical ───
CREATE OR REPLACE FUNCTION get_articles_by_topic_vertical(
  p_vertical TEXT,
  p_topic TEXT,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  law_source TEXT,
  article_reference TEXT,
  article_title TEXT,
  article_text TEXT,
  hierarchy JSONB,
  keywords TEXT[],
  related_institutes TEXT[],
  source_url TEXT,
  is_in_force BOOLEAN
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
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
  FROM legal_articles la
  WHERE la.vertical = p_vertical
    AND la.related_institutes @> ARRAY[p_topic]
  ORDER BY la.law_source, la.article_reference
  LIMIT p_limit;
END;
$$;

-- ─── Step 10: Distinct topics for a vertical ───
CREATE OR REPLACE FUNCTION get_distinct_topics_vertical(p_vertical TEXT)
RETURNS TABLE (
  topic TEXT,
  article_count BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.topic,
    COUNT(*) AS article_count
  FROM legal_articles la,
       LATERAL unnest(la.related_institutes) AS t(topic)
  WHERE la.vertical = p_vertical
    AND la.related_institutes IS NOT NULL
  GROUP BY t.topic
  ORDER BY article_count DESC;
END;
$$;

-- ─── Step 11: Stats per vertical (fixed SQL — uses lateral join) ───
CREATE OR REPLACE FUNCTION get_vertical_stats(p_vertical TEXT)
RETURNS TABLE (
  total_articles BIGINT,
  total_with_embedding BIGINT,
  total_sources BIGINT,
  total_topics BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) AS total_articles,
    COUNT(*) FILTER (WHERE la.embedding IS NOT NULL) AS total_with_embedding,
    COUNT(DISTINCT la.law_source) AS total_sources,
    (SELECT COUNT(DISTINCT t.topic)
     FROM legal_articles la2,
          LATERAL unnest(la2.related_institutes) AS t(topic)
     WHERE la2.vertical = p_vertical
       AND la2.related_institutes IS NOT NULL) AS total_topics
  FROM legal_articles la
  WHERE la.vertical = p_vertical;
END;
$$;
