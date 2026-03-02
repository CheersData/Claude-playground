-- Migration 017: aggiunge campi di contatto a lawyer_referrals
--
-- Prerequisito GDPR (ADR aperta):
--   Prima del lancio commerciale definire:
--   - Base giuridica per raccolta dati personali (consenso esplicito o legittimo interesse)
--   - DPA con gli studi legali che ricevono i referral
--   - Periodo di conservazione e procedura di cancellazione
--   Per ora i dati sono raccolti ma non condivisi con terzi.
--
-- Esegui su Supabase SQL Editor.

alter table public.lawyer_referrals
  add column if not exists contact_name    text,
  add column if not exists contact_email   text,
  add column if not exists contact_phone   text,
  add column if not exists notes           text;

-- Indice su status per filtrare referral in attesa di matching
create index if not exists idx_lawyer_referrals_status
  on public.lawyer_referrals(status);

comment on column public.lawyer_referrals.contact_name  is 'Nome e cognome del richiedente';
comment on column public.lawyer_referrals.contact_email is 'Email di contatto (dati personali — vedi ADR GDPR)';
comment on column public.lawyer_referrals.contact_phone is 'Telefono di contatto (dati personali — vedi ADR GDPR)';
comment on column public.lawyer_referrals.notes         is 'Descrizione libera del problema';
