alter table public.chat_messages
  add column if not exists is_system boolean not null default false,
  add column if not exists link text;

create or replace function public.prepare_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_id uuid;
begin
  -- Official messages are created only by trusted database triggers.
  if new.is_system and current_setting('app.system_chat', true) = 'true' then
    new.message := trim(new.message);
    new.author_name := coalesce(nullif(trim(new.author_name), ''), 'GLDHL Admin');
    return new;
  end if;

  sender_id := auth.uid();
  if sender_id is null then raise exception 'You must be signed in to send a message.'; end if;

  new.user_id := sender_id;
  new.message := trim(new.message);
  new.is_system := false;
  new.link := null;

  select coalesce(nullif(trim(p.display_name), ''), p.email, 'League member')
  into new.author_name
  from public.profiles p
  where p.id = sender_id;

  new.author_name := coalesce(new.author_name, 'League member');

  select
    t.id,
    coalesce(b.team_name, t.team_name),
    coalesce(b.abbreviation, t.abbreviation),
    coalesce(b.logo, t.logo)
  into new.fantasy_team_id, new.team_name, new.team_abbreviation, new.team_logo
  from public.team_user_assignments a
  join public.fantasy_teams t on t.id = a.fantasy_team_id
  left join lateral (
    select h.team_name, h.abbreviation, h.logo
    from public.fantasy_team_branding_history h
    where h.fantasy_team_id = t.id
      and h.start_season <= a.season_year
      and (h.end_season is null or h.end_season >= a.season_year)
    order by h.start_season desc
    limit 1
  ) b on true
  where a.user_id = sender_id
  order by a.season_year desc
  limit 1;

  return new;
end;
$$;

create or replace function public.post_league_transaction_to_chat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_id uuid;
  admin_name text;
  player_name text;
  team_name text;
  action_text text;
  chat_text text;
  chat_link text;
begin
  select p.id, coalesce(nullif(trim(p.display_name), ''), p.email, 'GLDHL Admin')
  into admin_id, admin_name
  from public.profiles p
  where lower(p.email) = 'sales@sg-print.com'
    and p.is_admin = true
  limit 1;

  if admin_id is null then return new; end if;

  if new.trade_offer_id is not null then
    chat_text := 'A new trade has been approved and posted.';
    chat_link := '/transactions#trade-' || new.trade_offer_id;
  else
    select coalesce(p.full_name, trim(concat_ws(' ', p.first_name, p.last_name)), 'a player')
    into player_name from public.players p where p.id = new.player_id;

    select coalesce(b.team_name, t.team_name, 'A team')
    into team_name
    from public.fantasy_teams t
    left join lateral (
      select h.team_name
      from public.fantasy_team_branding_history h
      where h.fantasy_team_id = t.id
        and h.start_season <= new.season_year
        and (h.end_season is null or h.end_season >= new.season_year)
      order by h.start_season desc limit 1
    ) b on true
    where t.id = new.fantasy_team_id;

    action_text := case new.action
      when 'signed' then 'signed'
      when 'called_up' then 'called up'
      when 'waived' then 'waived'
      when 'claimed' then 'claimed'
      when 'bought_out' then 'bought out'
      when 'retained' then 'retained'
      when 'injured_reserve' then 'assigned to Injured Reserve'
      when 'long_term_injured_reserve' then 'assigned to Long Term Injured Reserve'
      when 'released_to_rfa_offer' then 'released to an RFA offer'
      when 'matched_rfa_offer' then 'matched an RFA offer for'
      when 'traded' then 'acquired via trade'
      else 'updated'
    end;

    chat_text := coalesce(team_name, 'A team') || ' have ' || action_text || ' '
      || case when new.position is not null then upper(new.position) || ' ' else '' end
      || coalesce(nullif(player_name, ''), 'a player') || '.';
    chat_link := '/transactions';
  end if;

  begin
    perform set_config('app.system_chat', 'true', true);
    insert into public.chat_messages (
      user_id, message, author_name, is_system, link
    ) values (
      admin_id, chat_text, admin_name, true, chat_link
    );
  exception when others then
    -- Chat should never prevent an official transaction from being posted.
    raise warning 'Unable to post transaction % to league chat: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists post_league_transaction_to_chat on public.league_transactions;
create trigger post_league_transaction_to_chat
  after insert on public.league_transactions
  for each row execute function public.post_league_transaction_to_chat();
