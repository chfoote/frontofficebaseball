alter table public.chat_messages
  add column if not exists system_label text;

create or replace function public.post_trade_block_listing_to_chat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  system_user_id uuid;
  player_name text;
  branded_team_name text;
  branded_team_abbreviation text;
  branded_team_logo text;
begin
  select p.id into system_user_id
  from public.profiles p
  where p.is_admin = true
  order by case when lower(p.email) = 'sales@sg-print.com' then 0 else 1 end, p.created_at
  limit 1;
  if system_user_id is null then return new; end if;

  select coalesce(p.full_name, nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), 'A player')
    into player_name
  from public.player_seasons ps
  join public.players p on p.id = ps.player_id
  where ps.id = new.player_season_id;

  select
    coalesce(history.team_name, team.team_name),
    coalesce(history.abbreviation, team.abbreviation),
    coalesce(history.logo, team.logo)
  into branded_team_name, branded_team_abbreviation, branded_team_logo
  from public.fantasy_teams team
  left join lateral (
    select h.team_name, h.abbreviation, h.logo
    from public.fantasy_team_branding_history h
    where h.fantasy_team_id = team.id
      and h.start_season <= new.season_year
      and (h.end_season is null or h.end_season >= new.season_year)
    order by h.start_season desc
    limit 1
  ) history on true
  where team.id = new.fantasy_team_id;

  begin
    perform set_config('app.system_chat', 'true', true);
    insert into public.chat_messages (
      user_id,
      message,
      author_name,
      fantasy_team_id,
      team_name,
      team_abbreviation,
      team_logo,
      is_system,
      system_label,
      link
    ) values (
      system_user_id,
      coalesce(branded_team_name, 'A team') || ' have placed ' || coalesce(player_name, 'a player') || ' on the Trade Block.',
      'Trade Market',
      new.fantasy_team_id,
      branded_team_name,
      branded_team_abbreviation,
      branded_team_logo,
      true,
      'Trade Market',
      '/trade-market'
    );
  exception when others then
    raise warning 'Unable to post trade-block listing % to league chat: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists post_trade_block_listing_to_chat on public.trade_block_listings;
create trigger post_trade_block_listing_to_chat
after insert on public.trade_block_listings
for each row execute function public.post_trade_block_listing_to_chat();
