create table if not exists public.trade_email_deliveries (
  id bigint generated always as identity primary key,
  trade_offer_id bigint not null references public.trade_offers(id) on delete cascade,
  event_type text not null check (event_type in ('offer_received', 'trade_accepted')),
  recipient_email text not null,
  recipient_name text,
  subject text not null,
  message text not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'sent', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint trade_email_delivery_once unique (trade_offer_id, event_type, recipient_email)
);

create index if not exists trade_email_deliveries_queue_idx
  on public.trade_email_deliveries (next_attempt_at, id)
  where status in ('queued', 'processing');

alter table public.trade_email_deliveries enable row level security;
revoke all on public.trade_email_deliveries from anon, authenticated;

create or replace function public.queue_trade_offer_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient record;
  from_name text;
  to_name text;
  counter_label text;
begin
  if new.status <> 'pending' then return new; end if;

  select team_name into from_name from public.fantasy_teams where id = new.from_team_id;
  select team_name into to_name from public.fantasy_teams where id = new.to_team_id;
  counter_label := case when new.parent_trade_offer_id is null then 'trade offer' else 'counter offer' end;

  for recipient in
    select distinct
      coalesce(nullif(trim(p.email), ''), nullif(trim(a.user_email), '')) as email,
      coalesce(nullif(trim(p.display_name), ''), split_part(coalesce(p.email, a.user_email), '@', 1)) as display_name
    from public.team_user_assignments a
    left join public.profiles p on p.id = a.user_id
    where a.fantasy_team_id = new.to_team_id
      and a.season_year = new.season_year
  loop
    if recipient.email is not null then
      insert into public.trade_email_deliveries (
        trade_offer_id, event_type, recipient_email, recipient_name, subject, message
      ) values (
        new.id,
        'offer_received',
        recipient.email,
        recipient.display_name,
        'New GLDHL ' || counter_label || ' from ' || coalesce(from_name, 'another team'),
        coalesce(from_name, 'Another team') || ' sent ' || coalesce(to_name, 'your team') || ' a ' || counter_label || '. Sign in to review and respond.'
      ) on conflict do nothing;
    end if;
  end loop;
  return new;
end;
$$;

create or replace function public.queue_accepted_trade_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  commissioner record;
  from_name text;
  to_name text;
  third_name text;
  teams text;
begin
  if old.status = new.status or new.status <> 'accepted' then return new; end if;

  select team_name into from_name from public.fantasy_teams where id = new.from_team_id;
  select team_name into to_name from public.fantasy_teams where id = new.to_team_id;
  select team_name into third_name from public.fantasy_teams where id = new.third_team_id;
  teams := coalesce(from_name, 'One team') || ' and ' || coalesce(to_name, 'another team');
  if new.third_team_id is not null then teams := teams || ' and ' || coalesce(third_name, 'a third team'); end if;

  for commissioner in
    select email, coalesce(nullif(trim(display_name), ''), split_part(email, '@', 1)) as display_name
    from public.profiles
    where is_admin = true and nullif(trim(email), '') is not null
  loop
    insert into public.trade_email_deliveries (
      trade_offer_id, event_type, recipient_email, recipient_name, subject, message
    ) values (
      new.id,
      'trade_accepted',
      commissioner.email,
      commissioner.display_name,
      'GLDHL trade accepted — commissioner review required',
      teams || ' accepted trade offer #' || new.id || '. Sign in to review the trade.'
    ) on conflict do nothing;
  end loop;
  return new;
end;
$$;

drop trigger if exists queue_trade_offer_email on public.trade_offers;
create trigger queue_trade_offer_email
  after insert on public.trade_offers
  for each row execute function public.queue_trade_offer_email();

drop trigger if exists queue_accepted_trade_email on public.trade_offers;
create trigger queue_accepted_trade_email
  after update of status on public.trade_offers
  for each row execute function public.queue_accepted_trade_email();

create or replace function public.claim_trade_email_deliveries(p_limit integer default 10)
returns setof public.trade_email_deliveries
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimable as (
    select delivery.id
    from public.trade_email_deliveries delivery
    where delivery.attempt_count < 8
      and delivery.next_attempt_at <= now()
      and (delivery.status = 'queued' or (delivery.status = 'processing' and delivery.updated_at < now() - interval '5 minutes'))
    order by delivery.id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  )
  update public.trade_email_deliveries delivery
  set status = 'processing', attempt_count = delivery.attempt_count + 1, updated_at = now(), last_error = null
  from claimable
  where delivery.id = claimable.id
  returning delivery.*;
end;
$$;

revoke all on function public.claim_trade_email_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_trade_email_deliveries(integer) to service_role;
