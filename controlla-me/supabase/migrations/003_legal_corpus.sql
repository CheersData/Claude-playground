-- Tabella articoli del corpus giuridico
-- Ogni riga = un singolo articolo di legge con embedding vettoriale e gerarchia navigabile
create extension if not exists vector with schema extensions;

create table public.legal_articles (
  id uuid primary key default gen_random_uuid(),

  -- Identificazione fonte
  source_id text not null,            -- es. 'codice_civile', 'gdpr', 'dlgs_231_2001'
  source_name text not null,          -- es. 'Codice Civile', 'GDPR (Reg. 2016/679)'
  source_type text not null,          -- 'normattiva' | 'eurlex'

  -- Identificazione articolo
  article_number text not null,       -- es. '1321', '13', '2 bis'
  article_title text,                 -- titolo articolo se presente
  article_text text not null,         -- testo completo dell'articolo

  -- Gerarchia strutturale (navigazione ad albero)
  hierarchy jsonb not null default '{}',
  -- Esempio Codice Civile:
  -- { "book": "Libro IV - Delle obbligazioni",
  --   "title": "Titolo III - Dei singoli contratti",
  --   "chapter": "Capo I - Della vendita",
  --   "section": "Sezione I - Disposizioni generali" }
  --
  -- Esempio GDPR:
  -- { "chapter": "Capo III - Diritti dell'interessato",
  --   "section": "Sezione 2 - Informazione e accesso ai dati personali" }

  -- Embedding per ricerca semantica (1536 = OpenAI ada-002, 1024 = Voyage, ecc.)
  embedding vector(1536),

  -- Metadati
  url text,                           -- link alla fonte originale (normattiva/eurlex)
  in_force boolean default true,      -- norma vigente?
  last_updated timestamptz,           -- ultima modifica nota
  created_at timestamptz default now(),

  -- Vincolo unicita: un articolo per fonte
  unique(source_id, article_number)
);

-- Indici per query efficienti
create index idx_legal_articles_source on public.legal_articles(source_id);
create index idx_legal_articles_source_type on public.legal_articles(source_type);
create index idx_legal_articles_hierarchy on public.legal_articles using gin(hierarchy);
create index idx_legal_articles_in_force on public.legal_articles(in_force) where in_force = true;

-- Indice vettoriale per ricerca semantica (ivfflat, cosine)
-- NOTA: crearlo DOPO aver caricato almeno qualche centinaio di righe per cluster efficaci
-- create index idx_legal_articles_embedding on public.legal_articles
--   using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- RLS: gli articoli del corpus sono pubblici in lettura
alter table public.legal_articles enable row level security;

create policy "Chiunque puo leggere il corpus" on public.legal_articles
  for select using (true);

-- Solo service_role puo inserire/aggiornare (seed script)
create policy "Solo admin puo inserire" on public.legal_articles
  for insert with check (auth.role() = 'service_role');
create policy "Solo admin puo aggiornare" on public.legal_articles
  for update using (auth.role() = 'service_role');
create policy "Solo admin puo cancellare" on public.legal_articles
  for delete using (auth.role() = 'service_role');

-- Vista materializzata per l'albero di navigazione (sommario strutturato)
-- Costruisce la gerarchia aggregata per ogni fonte
create or replace function public.get_corpus_hierarchy(p_source_id text default null)
returns jsonb
language sql
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'source_id', sub.source_id,
        'source_name', sub.source_name,
        'source_type', sub.source_type,
        'article_count', sub.article_count,
        'hierarchy_tree', sub.hierarchy_tree
      )
      order by sub.source_name
    ),
    '[]'::jsonb
  )
  from (
    select
      la.source_id,
      la.source_name,
      la.source_type,
      count(*) as article_count,
      jsonb_agg(
        jsonb_build_object(
          'article_number', la.article_number,
          'article_title', la.article_title,
          'hierarchy', la.hierarchy,
          'id', la.id
        )
        order by
          -- Ordina per numero articolo (numerico se possibile)
          case when la.article_number ~ '^\d+$' then lpad(la.article_number, 6, '0')
               when la.article_number ~ '^\d+' then lpad((regexp_match(la.article_number, '^\d+'))[1], 6, '0') || la.article_number
               else la.article_number
          end
      ) as hierarchy_tree
    from public.legal_articles la
    where la.in_force = true
      and (p_source_id is null or la.source_id = p_source_id)
    group by la.source_id, la.source_name, la.source_type
  ) sub;
$$;
