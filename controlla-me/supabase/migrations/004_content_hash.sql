-- ============================================================
-- 004_content_hash.sql — Aggiunge content_hash per delta loading
-- ============================================================
-- Permette di rilevare articoli modificati senza scaricare il
-- testo completo dal DB. Lo script seed-corpus.ts confronta
-- l'hash del testo scaricato con quello in DB: se diverso,
-- rigenera l'embedding.

alter table public.legal_articles
  add column if not exists content_hash text;

-- Popola hash per articoli esistenti (MD5 del testo)
update public.legal_articles
  set content_hash = md5(article_text)
  where content_hash is null;

-- Index per query veloci sul hash
create index if not exists idx_legal_articles_content_hash
  on public.legal_articles(law_source, article_reference, content_hash);
