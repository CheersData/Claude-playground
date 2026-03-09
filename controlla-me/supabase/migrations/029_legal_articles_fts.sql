-- Migration 029: Full-Text Search su legal_articles (Italian stemming)
--
-- Aggiunge ricerca full-text PostgreSQL come alternativa/complemento
-- alla ricerca semantica via embeddings. Usa lo stemmer italiano di pg
-- per normalizzare termini giuridici (es. "locazione" ↔ "locazioni").
--
-- Vantaggi rispetto a ILIKE:
-- - Stemming: "contratti" matcha "contratto", "contrattuale", ecc.
-- - Ranking: ts_rank ordina per rilevanza
-- - Performance: GIN index, O(1) lookup vs full scan
--
-- Dipendenze: 004 (legal_articles), 005 (colonne article_title, article_text)

-- 1. Colonna tsvector per il full-text index
ALTER TABLE legal_articles
  ADD COLUMN IF NOT EXISTS article_text_ts tsvector;

-- 2. Popola la colonna per le righe esistenti
UPDATE legal_articles
SET article_text_ts = to_tsvector(
  'italian',
  COALESCE(article_title, '') || ' ' || COALESCE(article_text, '')
);

-- 3. GIN index per ricerca veloce
CREATE INDEX IF NOT EXISTS idx_legal_articles_fts
  ON legal_articles USING GIN (article_text_ts);

-- 4. Trigger per aggiornamento automatico su INSERT/UPDATE
CREATE OR REPLACE FUNCTION legal_articles_fts_trigger()
RETURNS trigger AS $$
BEGIN
  NEW.article_text_ts := to_tsvector(
    'italian',
    COALESCE(NEW.article_title, '') || ' ' || COALESCE(NEW.article_text, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_legal_articles_fts ON legal_articles;

CREATE TRIGGER trg_legal_articles_fts
  BEFORE INSERT OR UPDATE OF article_title, article_text
  ON legal_articles
  FOR EACH ROW
  EXECUTE FUNCTION legal_articles_fts_trigger();

-- 5. RPC per ricerca full-text con ranking
CREATE OR REPLACE FUNCTION search_legal_articles_fts(
  p_query text,
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  law_source text,
  article_reference text,
  article_title text,
  article_text text,
  related_institutes text[],
  rank real
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    la.id,
    la.law_source,
    la.article_reference,
    la.article_title,
    la.article_text,
    la.related_institutes,
    ts_rank(la.article_text_ts, plainto_tsquery('italian', p_query)) AS rank
  FROM legal_articles la
  WHERE la.article_text_ts @@ plainto_tsquery('italian', p_query)
  ORDER BY rank DESC
  LIMIT p_limit;
$$;
