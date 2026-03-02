-- ============================================================
-- 004_security_fixes.sql — Fix sicurezza GDPR/privacy
-- SEC-005: RLS legal_knowledge + rimozione documentTextPreview + cleanup TTL
-- ============================================================

-- ─── 1. Fix RLS: legal_knowledge lettura solo service_role ───
--
-- PROBLEMA: "for select using (true)" permette a qualsiasi utente anonimo/autenticato
-- di leggere legal_knowledge che contiene frammenti da contratti di altri utenti (PII).
-- SOLUZIONE: Dropiamo la policy pubblica. Il service_role bypassa RLS per default
-- in Supabase (admin client), quindi gli agenti continuano a funzionare.
-- Nessun accesso client-side diretto a legal_knowledge.

drop policy if exists "Anyone can read legal knowledge" on public.legal_knowledge;

-- Aggiungiamo policy esplicita: solo service_role può leggere
-- (gli agenti usano createAdminClient() che bypassa RLS — questa policy
-- è una safety net per eventuali query dirette future)
create policy "Service role reads legal knowledge" on public.legal_knowledge
  for select using (auth.role() = 'service_role');

-- ─── 2. Funzione TTL: cleanup document_chunks > 30 giorni ───
--
-- I chunk dei documenti analizzati rimangono indefinitamente.
-- Retention policy: 30 giorni (bilanciamento utilità vs privacy GDPR).
create or replace function cleanup_old_document_chunks(retention_days int default 30)
returns int
language plpgsql
security definer
as $$
declare
  deleted_count int;
begin
  delete from public.document_chunks
  where created_at < now() - (retention_days || ' days')::interval;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- ─── 3. Funzione TTL: cleanup legal_knowledge con times_seen = 1 e > 90 giorni ───
--
-- Entry visti una sola volta e vecchi sono probabilmente rumore da contratti one-off.
-- Retention: 90 giorni per entry con times_seen = 1.
create or replace function cleanup_rare_legal_knowledge(retention_days int default 90)
returns int
language plpgsql
security definer
as $$
declare
  deleted_count int;
begin
  delete from public.legal_knowledge
  where times_seen = 1
    and created_at < now() - (retention_days || ' days')::interval;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- ─── 4. Indice per cleanup efficiente ───
create index if not exists idx_document_chunks_created_at
  on public.document_chunks(created_at);

create index if not exists idx_legal_knowledge_created_at_times_seen
  on public.legal_knowledge(created_at, times_seen);

-- ─── Note per operazioni ───
-- Eseguire periodicamente (cron o Supabase Edge Function):
--   SELECT cleanup_old_document_chunks(30);    -- ogni settimana
--   SELECT cleanup_rare_legal_knowledge(90);   -- ogni mese
