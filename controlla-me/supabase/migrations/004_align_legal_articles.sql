-- Migrazione: allinea la tabella legal_articles esistente allo schema atteso dal codice.
--
-- Il DB attuale ha colonne: law_source, article_reference
-- Il codice si aspetta: source_id, source_name, source_type, article_number, in_force, url, hierarchy
--
-- Strategia: aggiunge le colonne mancanti, popola dai dati esistenti, poi opzionalmente rimuove le vecchie.

-- 1. Aggiungi colonne mancanti (se non esistono gia)
DO $$
BEGIN
  -- source_id
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'legal_articles' AND column_name = 'source_id') THEN
    ALTER TABLE public.legal_articles ADD COLUMN source_id text;
  END IF;

  -- source_name
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'legal_articles' AND column_name = 'source_name') THEN
    ALTER TABLE public.legal_articles ADD COLUMN source_name text;
  END IF;

  -- source_type
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'legal_articles' AND column_name = 'source_type') THEN
    ALTER TABLE public.legal_articles ADD COLUMN source_type text;
  END IF;

  -- article_number
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'legal_articles' AND column_name = 'article_number') THEN
    ALTER TABLE public.legal_articles ADD COLUMN article_number text;
  END IF;

  -- in_force
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'legal_articles' AND column_name = 'in_force') THEN
    ALTER TABLE public.legal_articles ADD COLUMN in_force boolean DEFAULT true;
  END IF;

  -- url
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'legal_articles' AND column_name = 'url') THEN
    ALTER TABLE public.legal_articles ADD COLUMN url text;
  END IF;

  -- hierarchy (jsonb)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'legal_articles' AND column_name = 'hierarchy') THEN
    ALTER TABLE public.legal_articles ADD COLUMN hierarchy jsonb NOT NULL DEFAULT '{}';
  END IF;

  -- embedding (vector) — per ricerca semantica futura
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'legal_articles' AND column_name = 'embedding') THEN
    -- Assicurati che l'estensione vector esista
    CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
    ALTER TABLE public.legal_articles ADD COLUMN embedding vector(1536);
  END IF;

  -- last_updated
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'legal_articles' AND column_name = 'last_updated') THEN
    ALTER TABLE public.legal_articles ADD COLUMN last_updated timestamptz;
  END IF;

  -- created_at
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'legal_articles' AND column_name = 'created_at') THEN
    ALTER TABLE public.legal_articles ADD COLUMN created_at timestamptz DEFAULT now();
  END IF;
END $$;

-- 2. Popola le nuove colonne dai dati esistenti
-- law_source = "Codice Civile" → source_id = "codice_civile", source_name = "Codice Civile", source_type = "normattiva"
UPDATE public.legal_articles
SET
  source_id = CASE
    WHEN law_source = 'Codice Civile' THEN 'codice_civile'
    WHEN law_source = 'Codice Penale' THEN 'codice_penale'
    WHEN law_source = 'Codice del Consumo' THEN 'codice_consumo'
    WHEN law_source = 'Codice di Procedura Civile' THEN 'codice_proc_civile'
    WHEN law_source ILIKE '%231%' THEN 'dlgs_231_2001'
    WHEN law_source ILIKE '%122%' THEN 'dlgs_122_2005'
    WHEN law_source ILIKE '%Lavoratori%' THEN 'statuto_lavoratori'
    WHEN law_source ILIKE '%Edilizia%' THEN 'tu_edilizia'
    WHEN law_source ILIKE '%GDPR%' OR law_source ILIKE '%2016/679%' THEN 'gdpr'
    WHEN law_source ILIKE '%93/13%' THEN 'dir_93_13_clausole_abusive'
    WHEN law_source ILIKE '%2011/83%' THEN 'dir_2011_83_consumatori'
    WHEN law_source ILIKE '%2019/771%' THEN 'dir_2019_771_vendita_beni'
    WHEN law_source ILIKE '%Roma%' OR law_source ILIKE '%593/2008%' THEN 'reg_roma_i'
    WHEN law_source ILIKE '%DSA%' OR law_source ILIKE '%2022/2065%' THEN 'dsa'
    ELSE lower(replace(replace(law_source, ' ', '_'), '.', ''))
  END,
  source_name = law_source,
  source_type = CASE
    WHEN law_source ILIKE '%GDPR%' OR law_source ILIKE '%Direttiva%' OR law_source ILIKE '%Dir.%'
      OR law_source ILIKE '%Regolamento%Roma%' OR law_source ILIKE '%DSA%'
      OR law_source ILIKE '%2016/679%' OR law_source ILIKE '%93/13%'
      OR law_source ILIKE '%2011/83%' OR law_source ILIKE '%2019/771%'
      OR law_source ILIKE '%593/2008%' OR law_source ILIKE '%2022/2065%'
    THEN 'eurlex'
    ELSE 'normattiva'
  END
WHERE source_id IS NULL AND law_source IS NOT NULL;

-- article_reference = "Art. 1470" → article_number = "1470"
UPDATE public.legal_articles
SET article_number = regexp_replace(article_reference, '^\s*Art\.?\s*', '', 'i')
WHERE article_number IS NULL AND article_reference IS NOT NULL;

-- in_force default
UPDATE public.legal_articles
SET in_force = true
WHERE in_force IS NULL;

-- 3. Rendi NOT NULL le colonne essenziali (dopo il backfill)
ALTER TABLE public.legal_articles ALTER COLUMN source_id SET NOT NULL;
ALTER TABLE public.legal_articles ALTER COLUMN source_name SET NOT NULL;
ALTER TABLE public.legal_articles ALTER COLUMN source_type SET NOT NULL;
ALTER TABLE public.legal_articles ALTER COLUMN article_number SET NOT NULL;

-- 4. Aggiungi vincolo UNIQUE per upsert delta (se non esiste gia)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'legal_articles_source_id_article_number_key'
  ) THEN
    ALTER TABLE public.legal_articles ADD CONSTRAINT legal_articles_source_id_article_number_key
      UNIQUE (source_id, article_number);
  END IF;
END $$;

-- 5. Crea indici (se non esistono gia)
CREATE INDEX IF NOT EXISTS idx_legal_articles_source ON public.legal_articles(source_id);
CREATE INDEX IF NOT EXISTS idx_legal_articles_source_type ON public.legal_articles(source_type);
CREATE INDEX IF NOT EXISTS idx_legal_articles_hierarchy ON public.legal_articles USING gin(hierarchy);
CREATE INDEX IF NOT EXISTS idx_legal_articles_in_force ON public.legal_articles(in_force) WHERE in_force = true;

-- 6. RLS policies (aggiungi se non esistono)
ALTER TABLE public.legal_articles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Lettura pubblica
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'legal_articles' AND policyname = 'Chiunque puo leggere il corpus') THEN
    CREATE POLICY "Chiunque puo leggere il corpus" ON public.legal_articles
      FOR SELECT USING (true);
  END IF;

  -- Solo service_role per scrittura
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'legal_articles' AND policyname = 'Solo admin puo inserire') THEN
    CREATE POLICY "Solo admin puo inserire" ON public.legal_articles
      FOR INSERT WITH CHECK (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'legal_articles' AND policyname = 'Solo admin puo aggiornare') THEN
    CREATE POLICY "Solo admin puo aggiornare" ON public.legal_articles
      FOR UPDATE USING (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'legal_articles' AND policyname = 'Solo admin puo cancellare') THEN
    CREATE POLICY "Solo admin puo cancellare" ON public.legal_articles
      FOR DELETE USING (auth.role() = 'service_role');
  END IF;
END $$;

-- 7. Funzione get_corpus_hierarchy (crea o sostituisci)
CREATE OR REPLACE FUNCTION public.get_corpus_hierarchy(p_source_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'source_id', sub.source_id,
        'source_name', sub.source_name,
        'source_type', sub.source_type,
        'article_count', sub.article_count,
        'hierarchy_tree', sub.hierarchy_tree
      )
      ORDER BY sub.source_name
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT
      la.source_id,
      la.source_name,
      la.source_type,
      count(*) AS article_count,
      jsonb_agg(
        jsonb_build_object(
          'article_number', la.article_number,
          'article_title', la.article_title,
          'hierarchy', la.hierarchy,
          'id', la.id
        )
        ORDER BY
          CASE WHEN la.article_number ~ '^\d+$' THEN lpad(la.article_number, 6, '0')
               WHEN la.article_number ~ '^\d+' THEN lpad((regexp_match(la.article_number, '^\d+'))[1], 6, '0') || la.article_number
               ELSE la.article_number
          END
      ) AS hierarchy_tree
    FROM public.legal_articles la
    WHERE la.in_force = true
      AND (p_source_id IS NULL OR la.source_id = p_source_id)
    GROUP BY la.source_id, la.source_name, la.source_type
  ) sub;
$$;

-- Fatto! Le vecchie colonne (law_source, article_reference) restano per sicurezza.
-- Puoi rimuoverle in futuro con:
-- ALTER TABLE public.legal_articles DROP COLUMN law_source;
-- ALTER TABLE public.legal_articles DROP COLUMN article_reference;
