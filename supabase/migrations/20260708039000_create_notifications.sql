create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  type text not null,
  title text not null,
  body text,
  link text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_created_at_idx
  on public.notifications (recipient_user_id, created_at desc);

create index if not exists notifications_recipient_read_at_idx
  on public.notifications (recipient_user_id, read_at);

alter table public.notifications enable row level security;

drop policy if exists "Users and admins can read notifications"
  on public.notifications;

create policy "Users and admins can read notifications"
  on public.notifications
  for select
  to authenticated
  using (auth.uid() = recipient_user_id or public.is_admin());

drop policy if exists "Admins can create notifications"
  on public.notifications;

create policy "Admins can create notifications"
  on public.notifications
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Users can update their notifications"
  on public.notifications;

create policy "Users can update their notifications"
  on public.notifications
  for update
  to authenticated
  using (auth.uid() = recipient_user_id or public.is_admin())
  with check (auth.uid() = recipient_user_id or public.is_admin());

drop policy if exists "Users can delete their notifications"
  on public.notifications;

create policy "Users can delete their notifications"
  on public.notifications
  for delete
  to authenticated
  using (auth.uid() = recipient_user_id or public.is_admin());

create or replace function public.create_notification(
  recipient_user_id uuid,
  actor_user_id uuid,
  notification_type text,
  notification_title text,
  notification_body text,
  notification_link text,
  notification_metadata jsonb default '{}'::jsonb
)
returns public.notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  created_notification public.notifications;
begin
  insert into public.notifications (
    recipient_user_id,
    actor_user_id,
    type,
    title,
    body,
    link,
    metadata
  )
  values (
    create_notification.recipient_user_id,
    create_notification.actor_user_id,
    create_notification.notification_type,
    create_notification.notification_title,
    create_notification.notification_body,
    create_notification.notification_link,
    coalesce(create_notification.notification_metadata, '{}'::jsonb)
  )
  returning * into created_notification;

  return created_notification;
end;
$$;

create or replace function public.notify_trade_offer_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment record;
  from_team_name text;
  to_team_name text;
begin
  select team_name into from_team_name
  from public.fantasy_teams
  where id = new.from_team_id;

  select team_name into to_team_name
  from public.fantasy_teams
  where id = new.to_team_id;

  for assignment in
    select distinct user_id
    from public.team_user_assignments
    where fantasy_team_id = new.to_team_id
      and user_id <> new.created_by
  loop
    perform public.create_notification(
      assignment.user_id,
      new.created_by,
      'trade_offer_received',
      'New trade offer',
      coalesce(from_team_name, 'A team') || ' sent a trade offer to ' || coalesce(to_team_name, 'your team') || '.',
      '/trade-manager',
      jsonb_build_object(
        'trade_offer_id', new.id,
        'season_year', new.season_year,
        'from_team_id', new.from_team_id,
        'to_team_id', new.to_team_id
      )
    );
  end loop;

  return new;
end;
$$;

create or replace function public.notify_trade_offer_status_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment record;
  from_team_name text;
  to_team_name text;
  notification_title text;
  notification_body text;
  notify_team_id bigint;
begin
  if old.status = new.status then
    return new;
  end if;

  select team_name into from_team_name
  from public.fantasy_teams
  where id = new.from_team_id;

  select team_name into to_team_name
  from public.fantasy_teams
  where id = new.to_team_id;

  if new.status = 'accepted' then
    notification_title := 'Trade offer accepted';
    notification_body := coalesce(to_team_name, 'The receiving team') || ' accepted your trade offer.';
    notify_team_id := new.from_team_id;

    for assignment in
      select id as user_id
      from public.profiles
      where is_admin = true
        and id <> new.created_by
    loop
      perform public.create_notification(
        assignment.user_id,
        new.created_by,
        'trade_admin_review',
        'Trade ready for admin review',
        coalesce(from_team_name, 'One team') || ' and ' || coalesce(to_team_name, 'another team') || ' have accepted a trade.',
        '/admin/trades',
        jsonb_build_object(
          'trade_offer_id', new.id,
          'season_year', new.season_year,
          'from_team_id', new.from_team_id,
          'to_team_id', new.to_team_id,
          'status', new.status
        )
      );
    end loop;
  elsif new.status = 'declined' then
    notification_title := 'Trade offer declined';
    notification_body := coalesce(to_team_name, 'The receiving team') || ' declined your trade offer.';
    notify_team_id := new.from_team_id;
  elsif new.status = 'countered' then
    notification_title := 'Trade offer countered';
    notification_body := coalesce(to_team_name, 'The receiving team') || ' sent a counter offer.';
    notify_team_id := new.from_team_id;
  elsif new.status = 'completed' then
    notification_title := 'Trade completed';
    notification_body := coalesce(from_team_name, 'One team') || ' and ' || coalesce(to_team_name, 'another team') || ' had a trade approved.';
    notify_team_id := null;
  else
    return new;
  end if;

  for assignment in
    select distinct user_id
    from public.team_user_assignments
    where (
        (notify_team_id is not null and fantasy_team_id = notify_team_id)
        or (notify_team_id is null and fantasy_team_id in (new.from_team_id, new.to_team_id))
      )
  loop
    perform public.create_notification(
      assignment.user_id,
      new.created_by,
      'trade_offer_' || new.status,
      notification_title,
      notification_body,
      '/trade-manager',
      jsonb_build_object(
        'trade_offer_id', new.id,
        'season_year', new.season_year,
        'from_team_id', new.from_team_id,
        'to_team_id', new.to_team_id,
        'status', new.status
      )
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists notify_trade_offer_insert
  on public.trade_offers;

create trigger notify_trade_offer_insert
  after insert on public.trade_offers
  for each row
  execute function public.notify_trade_offer_insert();

drop trigger if exists notify_trade_offer_status_update
  on public.trade_offers;

create trigger notify_trade_offer_status_update
  after update of status on public.trade_offers
  for each row
  execute function public.notify_trade_offer_status_update();

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
