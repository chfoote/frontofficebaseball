create table if not exists public.discord_transaction_deliveries (
  transaction_id bigint primary key
    references public.league_transactions(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'sent', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  discord_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists discord_transaction_deliveries_queue_idx
  on public.discord_transaction_deliveries (next_attempt_at, transaction_id)
  where status in ('queued', 'processing');

alter table public.discord_transaction_deliveries enable row level security;

-- Delivery state is server-only. No browser-facing policies are intentionally created.
revoke all on public.discord_transaction_deliveries from anon, authenticated;

create or replace function public.enqueue_discord_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.discord_transaction_deliveries (transaction_id)
  values (new.id)
  on conflict (transaction_id) do nothing;
  return new;
end;
$$;

revoke all on function public.enqueue_discord_transaction() from public;

drop trigger if exists enqueue_discord_transaction on public.league_transactions;
create trigger enqueue_discord_transaction
  after insert on public.league_transactions
  for each row execute function public.enqueue_discord_transaction();

-- Queue the existing history. The primary key makes this safe to run more than once.
insert into public.discord_transaction_deliveries (transaction_id)
select id from public.league_transactions
on conflict (transaction_id) do nothing;

create or replace function public.claim_discord_transaction_deliveries(p_limit integer default 5)
returns setof public.discord_transaction_deliveries
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimable as (
    select delivery.transaction_id
    from public.discord_transaction_deliveries delivery
    where delivery.attempt_count < 8
      and delivery.next_attempt_at <= now()
      and (
        delivery.status = 'queued'
        or (delivery.status = 'processing' and delivery.updated_at < now() - interval '5 minutes')
      )
    order by delivery.transaction_id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 5), 25))
  )
  update public.discord_transaction_deliveries delivery
  set status = 'processing',
      attempt_count = delivery.attempt_count + 1,
      updated_at = now(),
      last_error = null
  from claimable
  where delivery.transaction_id = claimable.transaction_id
  returning delivery.*;
end;
$$;

revoke all on function public.claim_discord_transaction_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_discord_transaction_deliveries(integer) to service_role;

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_discord_transaction_worker()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url := 'https://ptexqhshfyjfnmlwyzzv.supabase.co/functions/v1/discord-transactions',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{"batch_size":5}'::jsonb,
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  -- Discord availability must never prevent the league transaction itself.
  raise warning 'Unable to wake Discord transaction worker for transaction %: %', new.id, sqlerrm;
  return new;
end;
$$;

revoke all on function public.notify_discord_transaction_worker() from public;

-- Wake the Edge Function for every future transaction. The enqueue trigger runs first
-- (Postgres orders same-event triggers by name), so the worker always has a row to claim.
drop trigger if exists notify_discord_transaction_worker on public.league_transactions;
create trigger notify_discord_transaction_worker
  after insert on public.league_transactions
  for each row execute function public.notify_discord_transaction_worker();
