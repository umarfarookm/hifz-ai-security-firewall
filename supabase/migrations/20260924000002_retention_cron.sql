-- Schedules the 30-day inspection retention job (see the previous migration).
-- pg_cron ships as an allowed extension on hosted Supabase projects. If this
-- migration fails with "extension pg_cron is not allow-listed", enable it
-- first from the dashboard: Database → Extensions → pg_cron, then re-run
-- `supabase db push`.

create extension if not exists pg_cron with schema extensions;

select
  cron.schedule(
    'hifz-delete-expired-inspections',
    '0 3 * * *', -- daily at 03:00 UTC
    $$ select delete_expired_inspections(); $$
  );
