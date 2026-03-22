-- ============================================================
-- 043_lower_thresholds_and_null_audit.sql
--
-- Three fixes for vector search retrieval:
-- 1. Lower SQL default thresholds to match TypeScript callers
-- 2. Ensure SET hnsw.ef_search = 200 on ALL vector search RPCs
-- 3. Diagnostic + remediation for NULL embeddings
--
-- Context:
-- - SQL defaults are higher than TS callers actually pass
--   (e.g., match_legal_articles default 0.6 but TS passes 0.45)
-- - If a caller omits threshold, the SQL default applies and
--   silently filters out valid results
-- - Voyage AI voyage-law-2 yields lower similarity for Italian
--   legal text (~0.40-0.65), so thresholds must be calibrated
--
-- Depends on: 003, 034, 035, 040
-- ============================================================


-- ═══════════════════════════════════════════════════════════════
-- Part 1: NULL embedding diagnostic
-- ═══════════════════════════════════════════════════════════════

-- Report NULL embeddings across all vector-indexed tables
DO $$
DECLARE
  tbl TEXT;
  total_count INT;
  null_count INT;
BEGIN
  -- legal_articles
  SELECT count(*), count(*) FILTER (WHERE embedding IS NULL)
    INTO total_count, null_count FROM public.legal_articles;
  RAISE NOTICE 'legal_articles: total=%, null_embedding=%, with_embedding=%',
    total_count, null_count, total_count - null_count;

  -- document_chunks
  SELECT count(*), count(*) FILTER (WHERE embedding IS NULL)
    INTO total_count, null_count FROM public.document_chunks;
  RAISE NOTICE 'document_chunks: total=%, null_embedding=%, with_embedding=%',
    total_count, null_count, total_count - null_count;

  -- legal_knowledge
  SELECT count(*), count(*) FILTER (WHERE embedding IS NULL)
    INTO total_count, null_count FROM public.legal_knowledge;
  RAISE NOTICE 'legal_knowledge: total=%, null_embedding=%, with_embedding=%',
    total_count, null_count, total_count - null_count;

  -- company_knowledge
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'company_knowledge' AND table_schema = 'public') THEN
    SELECT count(*), count(*) FILTER (WHERE embedding IS NULL)
      INTO total_count, null_count FROM public.company_knowledge;
    RAISE NOTICE 'company_knowledge: total=%, null_embedding=%, with_embedding=%',
      total_count, null_count, total_count - null_count;
  END IF;

  -- department_memory
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'department_memory' AND table_schema = 'public') THEN
    SELECT count(*), count(*) FILTER (WHERE embedding IS NULL)
      INTO total_count, null_count FROM public.department_memory;
    RAISE NOTICE 'department_memory: total=%, null_embedding=%, with_embedding=%',
      total_count, null_count, total_count - null_count;
  END IF;

  -- company_sessions
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'company_sessions' AND table_schema = 'public') THEN
    SELECT count(*), count(*) FILTER (WHERE embedding IS NULL)
      INTO total_count, null_count FROM public.company_sessions;
    RAISE NOTICE 'company_sessions: total=%, null_embedding=%, with_embedding=%',
      total_count, null_count, total_count - null_count;
  END IF;

  -- decision_journal
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'decision_journal' AND table_schema = 'public') THEN
    SELECT count(*), count(*) FILTER (WHERE embedding IS NULL)
      INTO total_count, null_count FROM public.decision_journal;
    RAISE NOTICE 'decision_journal: total=%, null_embedding=%, with_embedding=%',
      total_count, null_count, total_count - null_count;
  END IF;
END $$;

-- Break down NULL embeddings in legal_articles by law_source
-- (helps identify which sources need re-indexing via data-connector)
DO $$
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE '--- legal_articles NULL embeddings by law_source ---';
  FOR r IN
    SELECT law_source,
           count(*) AS total,
           count(*) FILTER (WHERE embedding IS NULL) AS null_emb
    FROM public.legal_articles
    GROUP BY law_source
    HAVING count(*) FILTER (WHERE embedding IS NULL) > 0
    ORDER BY count(*) FILTER (WHERE embedding IS NULL) DESC
  LOOP
    RAISE NOTICE '  %: %/% articles missing embedding', r.law_source, r.null_emb, r.total;
  END LOOP;
END $$;


-- ═══════════════════════════════════════════════════════════════
-- Part 2: Recreate core vector search RPCs with lower defaults
--         + SET hnsw.ef_search = 200
-- ═══════════════════════════════════════════════════════════════

-- ─── 2.1 match_document_chunks ───
-- Was: default threshold 0.7
-- New: default threshold 0.5
-- Rationale: TS callers pass 0.7 explicitly, but buildRAGContext
-- and searchAll use 0.55. Lowering default prevents silent misses
-- if caller omits threshold.
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector(1024),
  match_threshold float DEFAULT 0.5,
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

-- ─── 2.2 match_legal_knowledge ───
-- Was: default threshold 0.65
-- New: default threshold 0.4
-- Rationale: TS searchLegalKnowledge defaults to 0.55, buildRAGContext
-- uses 0.5. Voyage AI voyage-law-2 yields 0.40-0.65 for Italian legal
-- text. At 0.65 default, valid results are silently dropped.
CREATE OR REPLACE FUNCTION match_legal_knowledge(
  query_embedding vector(1024),
  filter_category text DEFAULT null,
  match_threshold float DEFAULT 0.4,
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

-- ─── 2.3 match_legal_articles ───
-- Was: default threshold 0.6
-- New: default threshold 0.35
-- Rationale: TS searchArticles defaults to 0.45 (lowered from 0.65
-- through 3 iterations). searchArticlesByInstitute passes 0.3.
-- At 0.6 default, corpus articles in the 0.40-0.60 similarity
-- range (which is normal for voyage-law-2 Italian text) get dropped.
CREATE OR REPLACE FUNCTION match_legal_articles(
  query_embedding vector(1024),
  filter_law_source text DEFAULT null,
  filter_institutes text[] DEFAULT null,
  filter_vertical text DEFAULT null,
  match_threshold float DEFAULT 0.35,
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

-- ─── 2.4 match_articles_by_vertical ───
-- Was: default threshold 0.4
-- New: default threshold 0.3
-- Rationale: vertical-specific searches on specialized corpora
-- (medical, HR) may have even lower similarities. Aligning with
-- the 0.3 used by searchArticlesByInstitute.
CREATE OR REPLACE FUNCTION match_articles_by_vertical(
  p_vertical TEXT,
  query_embedding vector(1024),
  filter_law_source TEXT DEFAULT NULL,
  filter_institutes TEXT[] DEFAULT NULL,
  match_threshold FLOAT DEFAULT 0.3,
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

-- ─── 2.5 match_knowledge_by_vertical ───
-- Was: default threshold 0.5
-- New: default threshold 0.35
-- Rationale: align with match_company_knowledge (0.35) and
-- account for lower voyage-law-2 similarities.
CREATE OR REPLACE FUNCTION match_knowledge_by_vertical(
  p_vertical TEXT,
  query_embedding vector(1024),
  filter_category TEXT DEFAULT NULL,
  match_threshold FLOAT DEFAULT 0.35,
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


-- ═══════════════════════════════════════════════════════════════
-- Part 3: Recreate Forma Mentis RPCs with lowered defaults
--         (already had hnsw.ef_search = 200 from 040)
-- ═══════════════════════════════════════════════════════════════

-- ─── 3.1 match_company_knowledge ───
-- Was: default 0.35 — already good, keeping as-is
-- Re-created to ensure SET hnsw.ef_search = 200 is present
CREATE OR REPLACE FUNCTION match_company_knowledge(
  query_embedding vector(1024),
  filter_category text DEFAULT null,
  filter_departments text[] DEFAULT null,
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  category text,
  title text,
  content text,
  departments text[],
  metadata jsonb,
  times_referenced int,
  similarity float
)
LANGUAGE sql STABLE
SET hnsw.ef_search = 200
AS $$
  SELECT
    ck.id,
    ck.category,
    ck.title,
    ck.content,
    ck.departments,
    ck.metadata,
    ck.times_referenced,
    1 - (ck.embedding <=> query_embedding) AS similarity
  FROM public.company_knowledge ck
  WHERE ck.is_active = true
    AND ck.embedding IS NOT NULL
    AND 1 - (ck.embedding <=> query_embedding) > match_threshold
    AND (filter_category IS NULL OR ck.category = filter_category)
    AND (filter_departments IS NULL OR ck.departments && filter_departments)
  ORDER BY ck.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ─── 3.2 match_department_memory ───
-- Was: default 0.35 → lowered to 0.3
CREATE OR REPLACE FUNCTION match_department_memory(
  query_embedding vector(1024),
  filter_department text,
  filter_category text DEFAULT null,
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  department text,
  category text,
  key text,
  content text,
  confidence float,
  times_accessed int,
  similarity float
)
LANGUAGE sql STABLE
SET hnsw.ef_search = 200
AS $$
  SELECT
    dm.id,
    dm.department,
    dm.category,
    dm.key,
    dm.content,
    dm.confidence,
    dm.times_accessed,
    1 - (dm.embedding <=> query_embedding) AS similarity
  FROM public.department_memory dm
  WHERE dm.is_active = true
    AND dm.embedding IS NOT NULL
    AND dm.department = filter_department
    AND 1 - (dm.embedding <=> query_embedding) > match_threshold
    AND (filter_category IS NULL OR dm.category = filter_category)
    AND (dm.expires_at IS NULL OR dm.expires_at > now())
  ORDER BY dm.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ─── 3.3 match_company_sessions ───
-- Was: default 0.35 → lowered to 0.3
CREATE OR REPLACE FUNCTION match_company_sessions(
  query_embedding vector(1024),
  filter_department text DEFAULT null,
  filter_type text DEFAULT null,
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  session_type text,
  department text,
  summary text,
  key_decisions jsonb,
  started_at timestamptz,
  duration_ms int,
  similarity float
)
LANGUAGE sql STABLE
SET hnsw.ef_search = 200
AS $$
  SELECT
    cs.id,
    cs.session_type,
    cs.department,
    cs.summary,
    cs.key_decisions,
    cs.started_at,
    cs.duration_ms,
    1 - (cs.embedding <=> query_embedding) AS similarity
  FROM public.company_sessions cs
  WHERE cs.embedding IS NOT NULL
    AND 1 - (cs.embedding <=> query_embedding) > match_threshold
    AND (filter_department IS NULL OR cs.department = filter_department)
    AND (filter_type IS NULL OR cs.session_type = filter_type)
  ORDER BY cs.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ─── 3.4 match_decisions ───
-- Was: default 0.35 → lowered to 0.3
CREATE OR REPLACE FUNCTION match_decisions(
  query_embedding vector(1024),
  filter_department text DEFAULT null,
  filter_type text DEFAULT null,
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  department text,
  decision_type text,
  expected_outcome text,
  actual_outcome text,
  outcome_score float,
  status text,
  decided_at timestamptz,
  similarity float
)
LANGUAGE sql STABLE
SET hnsw.ef_search = 200
AS $$
  SELECT
    dj.id,
    dj.title,
    dj.description,
    dj.department,
    dj.decision_type,
    dj.expected_outcome,
    dj.actual_outcome,
    dj.outcome_score,
    dj.status,
    dj.decided_at,
    1 - (dj.embedding <=> query_embedding) AS similarity
  FROM public.decision_journal dj
  WHERE dj.embedding IS NOT NULL
    AND 1 - (dj.embedding <=> query_embedding) > match_threshold
    AND (filter_department IS NULL OR dj.department = filter_department)
    AND (filter_type IS NULL OR dj.decision_type = filter_type)
  ORDER BY dj.embedding <=> query_embedding
  LIMIT match_count;
$$;


-- ═══════════════════════════════════════════════════════════════
-- Summary of threshold changes (SQL defaults)
-- ═══════════════════════════════════════════════════════════════
--
-- Function                    Old Default  New Default  Rationale
-- ─────────────────────────── ─────────── ─────────── ──────────
-- match_document_chunks        0.70        0.50        TS callers use 0.55-0.70
-- match_legal_knowledge        0.65        0.40        TS callers use 0.50-0.55
-- match_legal_articles         0.60        0.35        TS callers use 0.30-0.45
-- match_articles_by_vertical   0.40        0.30        Align with institute search
-- match_knowledge_by_vertical  0.50        0.35        Align with company_knowledge
-- match_company_knowledge      0.35        0.30        Slight improvement
-- match_department_memory      0.35        0.30        Slight improvement
-- match_company_sessions       0.35        0.30        Slight improvement
-- match_decisions              0.35        0.30        Slight improvement
--
-- All functions confirmed to have:
--   SET hnsw.ef_search = 200
--   WHERE ... IS NOT NULL guard on embedding column
