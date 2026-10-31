-- Ensure every admin is notified whenever a trade enters the approval queue.
-- Regular user trades enter the queue when their status changes to accepted.
-- Admin-created trades are inserted directly with accepted status.

create or replace function public.notify_admin_of_inserted_accepted_trade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_profile record;
  from_team_name text;
  to_team_name text;
  third_team_name text;
  team_summary text;
begin
  if new.status <> 'accepted' then
    return new;
  end if;

  select team_name into from_team_name from public.fantasy_teams where id = new.from_team_id;
  select team_name into to_team_name from public.fantasy_teams where id = new.to_team_id;
  select team_name into third_team_name from public.fantasy_teams where id = new.third_team_id;

  team_summary := coalesce(from_team_name, 'One team') || ' and ' || coalesce(to_team_name, 'another team');
  if new.third_team_id is not null then
    team_summary := team_summary || ' and ' || coalesce(third_team_name, 'a third team');
  end if;

  for admin_profile in
    select id as user_id from public.profiles where is_admin = true
  loop
    perform public.create_notification(
      admin_profile.user_id,
      new.created_by,
      'trade_admin_review',
      'Trade ready for admin review',
      team_summary || ' submitted a trade for approval.',
      '/admin/trades',
      jsonb_build_object(
        'trade_offer_id', new.id,
        'season_year', new.season_year,
        'from_team_id', new.from_team_id,
        'to_team_id', new.to_team_id,
        'third_team_id', new.third_team_id,
        'status', new.status
      )
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists notify_admin_of_inserted_accepted_trade on public.trade_offers;
create trigger notify_admin_of_inserted_accepted_trade
  after insert on public.trade_offers
  for each row
  when (new.status = 'accepted')
  execute function public.notify_admin_of_inserted_accepted_trade();

-- The existing status notification handles user trades after both teams accept.
-- Include the creator when that account is also a league admin.
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
  third_team_name text;
  notification_title text;
  notification_body text;
  notify_team_id bigint;
  team_summary text;
begin
  if old.status = new.status then return new; end if;

  select team_name into from_team_name from public.fantasy_teams where id = new.from_team_id;
  select team_name into to_team_name from public.fantasy_teams where id = new.to_team_id;
  select team_name into third_team_name from public.fantasy_teams where id = new.third_team_id;

  if new.status = 'accepted' then
    notification_title := 'Trade offer accepted';
    notification_body := coalesce(to_team_name, 'The receiving team') || ' accepted your trade offer.';
    notify_team_id := new.from_team_id;
    team_summary := coalesce(from_team_name, 'One team') || ' and ' || coalesce(to_team_name, 'another team');
    if new.third_team_id is not null then
      team_summary := team_summary || ' and ' || coalesce(third_team_name, 'a third team');
    end if;

    for assignment in select id as user_id from public.profiles where is_admin = true
    loop
      perform public.create_notification(
        assignment.user_id,
        new.created_by,
        'trade_admin_review',
        'Trade ready for admin review',
        team_summary || ' have accepted a trade.',
        '/admin/trades',
        jsonb_build_object(
          'trade_offer_id', new.id,
          'season_year', new.season_year,
          'from_team_id', new.from_team_id,
          'to_team_id', new.to_team_id,
          'third_team_id', new.third_team_id,
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
      or (notify_team_id is null and fantasy_team_id in (new.from_team_id, new.to_team_id, new.third_team_id))
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
        'third_team_id', new.third_team_id,
        'status', new.status
      )
    );
  end loop;

  return new;
end;
$$;
