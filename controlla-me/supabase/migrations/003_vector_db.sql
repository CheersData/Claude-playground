-- ============================================================
-- 003_vector_db.sql — Database vettoriale per RAG e memoria collettiva
-- ============================================================

-- Abilita estensione pgvector
create extension if not exists vector with schema extensions;

-- ─── Tabella: Chunk di documenti analizzati ───
-- Ogni documento viene spezzato in chunk e indicizzato per ricerca semantica.
create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid references public.analyses(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  -- Metadati del chunk: tipo_documento, giurisdizione, clausola, rischio, etc.
  metadata jsonb default '{}',
  embedding vector(1024),
  created_at timestamptz default now()
);

-- ─── Tabella: Knowledge base legale (intelligenza collettiva) ───
-- Raccoglie norme, sentenze, pattern di clausole e pattern di rischio
-- estratti da OGNI analisi. Più usi l'app, più diventa intelligente.
create table public.legal_knowledge (
  id uuid primary key default gen_random_uuid(),
  -- 'law_reference' | 'court_case' | 'clause_pattern' | 'risk_pattern'
  category text not null,
  title text not null,
  content text not null,
  -- Metadati: reference, court, date, severity, document_type, etc.
  metadata jsonb default '{}',
  embedding vector(1024),
  source_analysis_id uuid references public.analyses(id) on delete set null,
  times_seen int default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─── Tabella: Corpus legislativo italiano ───
-- Articoli di legge reali (Codice Civile, D.Lgs., etc.)
-- Questo è il cuore: fornisce il contesto normativo VERO agli agenti.
-- Risolve il problema dell'hallucination normativa (es. Art. 34-bis DPR 380
-- citato al posto di Art. 1538 c.c. per vendita a corpo).
create table public.legal_articles (
  id uuid primary key default gen_random_uuid(),
  -- Fonte: "Codice Civile", "D.Lgs. 122/2005", "L. 431/1998", etc.
  law_source text not null,
  -- Riferimento: "Art. 1538", "Art. 6", etc.
  article_reference text not null,
  -- Titolo/rubrica dell'articolo (se presente)
  article_title text,
  -- Testo completo dell'articolo
  article_text text not null,
  -- Libro/Titolo/Capo per navigazione gerarchica
  hierarchy jsonb default '{}',
  -- Keywords per full-text search: ["vendita", "corpo", "tolleranza", "superficie"]
  keywords text[] default '{}',
  -- Istituti giuridici correlati: ["vendita_a_corpo", "rettifica_prezzo"]
  related_institutes text[] default '{}',
  -- Embedding per ricerca semantica
  embedding vector(1024),
  -- URL fonte originale (normattiva.it)
  source_url text,
  -- Vigenza
  is_in_force boolean default true,
  last_verified_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  -- Unico per fonte + riferimento
  unique(law_source, article_reference)
);

-- ─── Indexes ───
-- HNSW: funziona con 0 righe, non serve rebuild, ottimo recall
create index idx_document_chunks_embedding on public.document_chunks
  using hnsw (embedding vector_cosine_ops);

create index idx_legal_knowledge_embedding on public.legal_knowledge
  using hnsw (embedding vector_cosine_ops);

create index idx_document_chunks_analysis_id on public.document_chunks(analysis_id);
create index idx_legal_knowledge_category on public.legal_knowledge(category);
create index idx_legal_knowledge_title on public.legal_knowledge(title);

-- Indexes per legal_articles
create index idx_legal_articles_embedding on public.legal_articles
  using hnsw (embedding vector_cosine_ops);
create index idx_legal_articles_law_source on public.legal_articles(law_source);
create index idx_legal_articles_reference on public.legal_articles(article_reference);
create index idx_legal_articles_keywords on public.legal_articles using gin(keywords);
create index idx_legal_articles_institutes on public.legal_articles using gin(related_institutes);

-- ─── Row Level Security ───
alter table public.document_chunks enable row level security;
alter table public.legal_knowledge enable row level security;

-- Document chunks: utenti possono vedere solo i chunk delle proprie analisi
create policy "Users can view own document chunks" on public.document_chunks
  for select using (
    exists (
      select 1 from public.analyses
      where analyses.id = document_chunks.analysis_id
      and analyses.user_id = auth.uid()
    )
  );

-- Legal knowledge: lettura pubblica (è intelligenza collettiva!)
create policy "Anyone can read legal knowledge" on public.legal_knowledge
  for select using (true);

-- Legal articles: lettura pubblica (corpus legislativo condiviso)
alter table public.legal_articles enable row level security;

create policy "Anyone can read legal articles" on public.legal_articles
  for select using (true);

-- Service role può fare tutto (inserimenti server-side)
create policy "Service role inserts document chunks" on public.document_chunks
  for insert with check (true);

create policy "Service role inserts legal knowledge" on public.legal_knowledge
  for insert with check (true);

create policy "Service role updates legal knowledge" on public.legal_knowledge
  for update using (true);

create policy "Service role manages legal articles" on public.legal_articles
  for all using (true);

-- ─── Funzione: ricerca semantica nei chunk dei documenti ───
create or replace function match_document_chunks(
  query_embedding vector(1024),
  match_threshold float default 0.7,
  match_count int default 5
)
returns table (
  id uuid,
  analysis_id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language sql stable
as $$
  select
    dc.id,
    dc.analysis_id,
    dc.content,
    dc.metadata,
    1 - (dc.embedding <=> query_embedding) as similarity
  from public.document_chunks dc
  where 1 - (dc.embedding <=> query_embedding) > match_threshold
  order by dc.embedding <=> query_embedding
  limit match_count;
$$;

-- ─── Funzione: ricerca nella knowledge base legale ───
create or replace function match_legal_knowledge(
  query_embedding vector(1024),
  filter_category text default null,
  match_threshold float default 0.65,
  match_count int default 5
)
returns table (
  id uuid,
  category text,
  title text,
  content text,
  metadata jsonb,
  times_seen int,
  similarity float
)
language sql stable
as $$
  select
    lk.id,
    lk.category,
    lk.title,
    lk.content,
    lk.metadata,
    lk.times_seen,
    1 - (lk.embedding <=> query_embedding) as similarity
  from public.legal_knowledge lk
  where 1 - (lk.embedding <=> query_embedding) > match_threshold
    and (filter_category is null or lk.category = filter_category)
  order by lk.embedding <=> query_embedding
  limit match_count;
$$;

-- ─── Funzione: ricerca semantica negli articoli di legge ───
-- Questa è la funzione chiave per il RAG normativo.
-- Esempio: "vendita a corpo tolleranza superficie" → Art. 1537, 1538, 1539 c.c.
create or replace function match_legal_articles(
  query_embedding vector(1024),
  filter_law_source text default null,
  filter_institutes text[] default null,
  match_threshold float default 0.6,
  match_count int default 10
)
returns table (
  id uuid,
  law_source text,
  article_reference text,
  article_title text,
  article_text text,
  related_institutes text[],
  similarity float
)
language sql stable
as $$
  select
    la.id,
    la.law_source,
    la.article_reference,
    la.article_title,
    la.article_text,
    la.related_institutes,
    1 - (la.embedding <=> query_embedding) as similarity
  from public.legal_articles la
  where la.is_in_force = true
    and 1 - (la.embedding <=> query_embedding) > match_threshold
    and (filter_law_source is null or la.law_source = filter_law_source)
    and (filter_institutes is null or la.related_institutes && filter_institutes)
  order by la.embedding <=> query_embedding
  limit match_count;
$$;

-- ─── Funzione: lookup diretto per fonte legislativa ───
-- Usata quando il Classifier identifica le leggi applicabili.
create or replace function get_articles_by_source(
  p_law_source text,
  p_limit int default 50
)
returns table (
  id uuid,
  article_reference text,
  article_title text,
  article_text text,
  related_institutes text[]
)
language sql stable
as $$
  select
    la.id,
    la.article_reference,
    la.article_title,
    la.article_text,
    la.related_institutes
  from public.legal_articles la
  where la.law_source = p_law_source
    and la.is_in_force = true
  order by la.article_reference
  limit p_limit;
$$;

-- ─── Funzione: ricerca per istituto giuridico ───
-- Esempio: "vendita_a_corpo" → Art. 1537, 1538, 1539 c.c.
create or replace function get_articles_by_institute(
  p_institute text,
  p_limit int default 20
)
returns table (
  id uuid,
  law_source text,
  article_reference text,
  article_title text,
  article_text text,
  related_institutes text[]
)
language sql stable
as $$
  select
    la.id,
    la.law_source,
    la.article_reference,
    la.article_title,
    la.article_text,
    la.related_institutes
  from public.legal_articles la
  where p_institute = any(la.related_institutes)
    and la.is_in_force = true
  order by la.law_source, la.article_reference
  limit p_limit;
$$;

-- ─── Funzione: incrementa times_seen o inserisci nuovo record ───
create or replace function upsert_legal_knowledge(
  p_category text,
  p_title text,
  p_content text,
  p_metadata jsonb,
  p_embedding vector(1024),
  p_source_analysis_id uuid
)
returns uuid
language plpgsql
as $$
declare
  existing_id uuid;
  result_id uuid;
begin
  -- Cerca per titolo e categoria (match esatto)
  select id into existing_id
  from public.legal_knowledge
  where category = p_category and title = p_title
  limit 1;

  if existing_id is not null then
    -- Aggiorna: incrementa counter e aggiorna embedding (media mobile)
    update public.legal_knowledge
    set times_seen = times_seen + 1,
        updated_at = now(),
        metadata = p_metadata,
        embedding = p_embedding
    where id = existing_id;
    result_id := existing_id;
  else
    -- Inserisci nuovo
    insert into public.legal_knowledge (category, title, content, metadata, embedding, source_analysis_id)
    values (p_category, p_title, p_content, p_metadata, p_embedding, p_source_analysis_id)
    returning id into result_id;
  end if;

  return result_id;
end;
$$;
