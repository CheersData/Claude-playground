-- ============================================================
-- 034_fix_vector_search.sql — Fix vector search retrieval issues
-- ============================================================
--
-- Root causes identified:
-- 1. Embedding dimension mismatch: migration 004 created embedding as vector(1536)
--    but Voyage AI voyage-law-2 outputs 1024-dim vectors. If 004 ran before 003,
--    the column is 1536 and all embeddings are stored incorrectly.
-- 2. domain/vertical column conflict: migration 027 renamed domain->vertical,
--    then 033 re-added domain, creating two columns and confusion.
-- 3. NULL embeddings: articles inserted without embeddings silently fail
--    cosine distance computation (NULL <=> x = NULL, which is falsy).
--
-- This migration fixes the live DB regardless of which migration order was used.

-- ─── Step 1: Fix embedding dimension if wrong ───
-- Check if the embedding column is vector(1536) and fix to vector(1024).
-- This requires re-creating the column and re-indexing.
-- NOTE: If embeddings were stored as 1024-dim in a 1536-dim column, pgvector
-- would have zero-padded or rejected them. Either way, they need re-generation.
DO $$
DECLARE
  current_dim INT;
BEGIN
  -- Get current dimension of embedding column
  SELECT atttypmod INTO current_dim
  FROM pg_attribute
  WHERE attrelid = 'public.legal_articles'::regclass
    AND attname = 'embedding';

  -- pgvector stores dimension as typmod. For vector(N), typmod = N.
  -- If current dimension is 1536, we need to fix it.
  IF current_dim IS NOT NULL AND current_dim = 1536 THEN
    RAISE NOTICE 'FIXING: legal_articles.embedding is vector(1536), changing to vector(1024)';

    -- Drop the HNSW index first (it depends on the column type)
    DROP INDEX IF EXISTS idx_legal_articles_embedding;

    -- Set all embeddings to NULL (they were stored with wrong dimensions)
    -- They need to be regenerated via the data-connector pipeline
    UPDATE public.legal_articles SET embedding = NULL;

    -- Change column type
    ALTER TABLE public.legal_articles ALTER COLUMN embedding TYPE vector(1024);

    -- Recreate HNSW index
    CREATE INDEX idx_legal_articles_embedding ON public.legal_articles
      USING hnsw (embedding vector_cosine_ops);

    RAISE NOTICE 'DONE: embedding column fixed to vector(1024). Run data-connector to regenerate embeddings.';
  ELSE
    RAISE NOTICE 'OK: legal_articles.embedding is already vector(1024) (or column not found).';
  END IF;
END $$;

-- ─── Step 2: Consolidate domain/vertical columns ───
-- Migration 027 renamed domain->vertical. Migration 033 may have re-added domain.
-- We need: only `vertical` column, no `domain` column on legal_articles.
DO $$
BEGIN
  -- If both domain and vertical exist, drop the redundant domain column
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'legal_articles' AND column_name = 'domain'
             AND table_schema = 'public')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'legal_articles' AND column_name = 'vertical'
                 AND table_schema = 'public')
  THEN
    RAISE NOTICE 'FIXING: Dropping redundant domain column (vertical column exists)';
    DROP INDEX IF EXISTS idx_legal_articles_domain;
    DROP INDEX IF EXISTS idx_legal_articles_domain_source;
    ALTER TABLE public.legal_articles DROP COLUMN domain;
  END IF;

  -- If only domain exists (pre-027 state), rename to vertical
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'legal_articles' AND column_name = 'domain'
             AND table_schema = 'public')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'legal_articles' AND column_name = 'vertical'
                     AND table_schema = 'public')
  THEN
    RAISE NOTICE 'FIXING: Renaming domain -> vertical';
    ALTER TABLE public.legal_articles RENAME COLUMN domain TO vertical;
  END IF;

  -- Ensure vertical column exists with correct default
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'legal_articles' AND column_name = 'vertical'
                 AND table_schema = 'public')
  THEN
    RAISE NOTICE 'FIXING: Adding vertical column';
    ALTER TABLE public.legal_articles ADD COLUMN vertical TEXT NOT NULL DEFAULT 'legal';
  END IF;
END $$;

-- Ensure vertical indexes exist
CREATE INDEX IF NOT EXISTS idx_legal_articles_vertical
  ON public.legal_articles(vertical);
CREATE INDEX IF NOT EXISTS idx_legal_articles_vertical_source
  ON public.legal_articles(vertical, law_source);

-- ─── Step 3: Replace all RPC functions with NULL-safe versions ───

-- match_document_chunks: add NULL embedding guard
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

-- match_legal_knowledge: add NULL embedding guard
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

-- match_legal_articles: add NULL embedding guard + use vertical (not domain)
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

-- get_articles_by_source: use vertical (not domain)
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

-- get_articles_by_institute: use vertical (not domain)
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

-- ─── Step 4: Fix NULL is_in_force values ───
-- Articles ingested without explicit is_in_force default to NULL,
-- which causes them to be excluded by the WHERE is_in_force = true filter.
-- Fix: set all NULL is_in_force to true (default assumption: articles are in force).
UPDATE public.legal_articles SET is_in_force = true WHERE is_in_force IS NULL;
-- Prevent future NULLs by setting a default
ALTER TABLE public.legal_articles ALTER COLUMN is_in_force SET DEFAULT true;

-- ─── Step 5: Count articles with NULL embeddings (diagnostic) ───
DO $$
DECLARE
  total_count INT;
  null_embedding_count INT;
  has_embedding_count INT;
BEGIN
  SELECT count(*) INTO total_count FROM public.legal_articles;
  SELECT count(*) INTO null_embedding_count FROM public.legal_articles WHERE embedding IS NULL;
  SELECT count(*) INTO has_embedding_count FROM public.legal_articles WHERE embedding IS NOT NULL;

  RAISE NOTICE 'DIAGNOSTIC: legal_articles total=%, with_embedding=%, null_embedding=%',
    total_count, has_embedding_count, null_embedding_count;

  IF null_embedding_count > 0 THEN
    RAISE NOTICE 'ACTION REQUIRED: % articles have NULL embeddings. Run data-connector to regenerate.', null_embedding_count;
  END IF;
END $$;
