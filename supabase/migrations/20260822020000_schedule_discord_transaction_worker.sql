create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'process-discord-transactions'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end;
$$;

select cron.schedule(
  'process-discord-transactions',
  '* * * * *',
  $$
    select net.http_post(
      url := 'https://ptexqhshfyjfnmlwyzzv.supabase.co/functions/v1/discord-transactions',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{"batch_size":5}'::jsonb,
      timeout_milliseconds := 5000
    );
  $$
);
