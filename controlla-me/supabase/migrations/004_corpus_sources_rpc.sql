-- ============================================================
-- 004_corpus_sources_rpc.sql — RPC per conteggio fonti corpus
-- ============================================================
-- Aggrega le fonti server-side per evitare il limite di 1000 righe
-- di Supabase JS client. Più efficiente del fetch paginato.

-- Aggiunge la colonna source_id se non esiste già
DO $$ BEGIN
  ALTER TABLE public.legal_articles ADD COLUMN IF NOT EXISTS source_id text;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ─── Funzione: conteggio articoli per fonte ───
create or replace function get_corpus_sources_count()
returns table (
  law_source text,
  article_count bigint
)
language sql stable
as $$
  select
    la.law_source,
    count(*) as article_count
  from public.legal_articles la
  where la.is_in_force = true
  group by la.law_source
  order by la.law_source;
$$;
