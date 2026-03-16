-- ============================================================
-- 035_hnsw_ef_search.sql — Increase HNSW ef_search for better recall
-- ============================================================
--
-- Problem: pgvector default ef_search=40 is too low for our corpus (~5600 articles).
-- At ef_search=40 the ANN search explores too few candidates, missing relevant results.
-- Fix: SET hnsw.ef_search=200 on all match_* functions (function-level SET persists
-- only for the duration of the call, no global side effects).
--
-- Also covers the two vertical-specific functions from migration 027.

-- ─── 1. match_document_chunks ───
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector(1024),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  analysis_id uuid,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE sql STABLE
SET hnsw.ef_search = 200
AS $$
  SELECT
    dc.id,
    dc.analysis_id,
    dc.content,
    dc.metadata,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM public.document_chunks dc
  WHERE dc.embedding IS NOT NULL
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ─── 2. match_legal_knowledge ───
CREATE OR REPLACE FUNCTION match_legal_knowledge(
  query_embedding vector(1024),
  filter_category text DEFAULT null,
  match_threshold float DEFAULT 0.65,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  category text,
  title text,
  content text,
  metadata jsonb,
  times_seen int,
  similarity float
)
LANGUAGE sql STABLE
SET hnsw.ef_search = 200
AS $$
  SELECT
    lk.id,
    lk.category,
    lk.title,
    lk.content,
    lk.metadata,
    lk.times_seen,
    1 - (lk.embedding <=> query_embedding) AS similarity
  FROM public.legal_knowledge lk
  WHERE lk.embedding IS NOT NULL
    AND 1 - (lk.embedding <=> query_embedding) > match_threshold
    AND (filter_category IS NULL OR lk.category = filter_category)
  ORDER BY lk.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ─── 3. match_legal_articles ───
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
SET hnsw.ef_search = 200
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

-- ─── 4. match_articles_by_vertical ───
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
SET hnsw.ef_search = 200
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

-- ─── 5. match_knowledge_by_vertical ───
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
SET hnsw.ef_search = 200
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
