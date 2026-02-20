-- Increment analyses_count atomically
create or replace function public.increment_analyses_count(uid uuid)
returns void
language sql
security definer
as $$
  update public.profiles
  set analyses_count = analyses_count + 1
  where id = uid;
$$;

-- Monthly reset: call this via a cron job (e.g. Supabase pg_cron)
-- Resets all free users' analyses_count on the 1st of each month
create or replace function public.reset_monthly_analyses()
returns void
language sql
security definer
as $$
  update public.profiles
  set analyses_count = 0
  where plan = 'free';
$$;

-- Optional: schedule with pg_cron (if available)
-- select cron.schedule('reset-monthly', '0 0 1 * *', 'select public.reset_monthly_analyses()');
