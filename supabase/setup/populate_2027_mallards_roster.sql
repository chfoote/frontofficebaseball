-- Run once in the standalone Front Office Baseball Supabase SQL Editor.
-- Duplicates the supplied 2027 St Thomas Mallards roster and contracts into
-- 2026. Existing 2027 rows are preserved.

do $$
declare
  mallards_team_id bigint;
begin
  select id into mallards_team_id
  from public.fantasy_teams
  where lower(team_name) = 'st thomas mallards'
  limit 1;

  if mallards_team_id is null then
    raise exception 'The St Thomas Mallards are not present in public.fantasy_teams.';
  end if;

  create temporary table mallards_import (
    player_api_id text primary key,
    first_name text not null,
    last_name text not null,
    full_name text not null,
    position text not null,
    salary integer not null,
    term_end_year integer not null
  ) on commit drop;

  insert into mallards_import values
    ('606466', 'Ketel', 'Marte', 'Ketel Marte', '2B', 5500000, 2027),
    ('518692', 'Freddie', 'Freeman', 'Freddie Freeman', '1B', 6000000, 2027),
    ('679529', 'Spencer', 'Torkelson', 'Spencer Torkelson', '1B', 250000, 2026),
    ('691406', 'Junior', 'Caminero', 'Junior Caminero', '3B', 250000, 2026),
    ('642715', 'Willy', 'Adames', 'Willy Adames', 'SS', 250000, 2026),
    ('678662', 'Ezequiel', 'Tovar', 'Ezequiel Tovar', 'SS', 250000, 2027),
    ('682998', 'Corbin', 'Carroll', 'Corbin Carroll', 'OF', 5750000, 2030),
    ('682985', 'Riley', 'Greene', 'Riley Greene', 'OF', 1000000, 2027),
    ('545361', 'Mike', 'Trout', 'Mike Trout', 'OF', 700000, 2026),
    ('671732', 'Lawrence', 'Butler', 'Lawrence Butler', 'OF', 250000, 2027),
    ('621439', 'Byron', 'Buxton', 'Byron Buxton', 'OF', 975000, 2026),
    ('689414', 'Liam', 'Hicks', 'Liam Hicks', 'C', 250000, 2028),
    ('669127', 'Shea', 'Langeliers', 'Shea Langeliers', 'C', 250000, 2027),
    ('592518', 'Manny', 'Machado', 'Manny Machado', '3B', 3750000, 2028),
    ('650911', 'Cristopher', 'Sánchez', 'Cristopher Sánchez', 'SP', 4000000, 2030),
    ('554430', 'Zack', 'Wheeler', 'Zack Wheeler', 'SP', 3800000, 2027),
    ('543243', 'Sonny', 'Gray', 'Sonny Gray', 'SP', 2200000, 2026),
    ('690997', 'Nolan', 'McLean', 'Nolan McLean', 'SP', 3550000, 2030),
    ('592662', 'Robbie', 'Ray', 'Robbie Ray', 'SP', 1000000, 2026),
    ('656427', 'Jack', 'Flaherty', 'Jack Flaherty', 'SP', 600000, 2026),
    ('680570', 'Grayson', 'Rodriguez', 'Grayson Rodriguez', 'SP', 250000, 2027),
    ('683004', 'Jack', 'Leiter', 'Jack Leiter', 'SP', 250000, 2028),
    ('666142', 'Cole', 'Ragans', 'Cole Ragans', 'SP', 250000, 2027),
    ('695243', 'Mason', 'Miller', 'Mason Miller', 'RP', 250000, 2027),
    ('547973', 'Aroldis', 'Chapman', 'Aroldis Chapman', 'RP', 500000, 2026),
    ('656546', 'Jeff', 'Hoffman', 'Jeff Hoffman', 'RP', 500000, 2026);

  insert into public.players (
    player_api_id, first_name, last_name, full_name, on_trade_block, notes
  )
  select player_api_id, first_name, last_name, full_name, false, null
  from mallards_import
  on conflict (player_api_id) do update
  set first_name = excluded.first_name,
      last_name = excluded.last_name,
      full_name = excluded.full_name;

  insert into public.player_seasons (
    player_id, season_year, fantasy_team_id, position, salary,
    term_end_year, contract_group, notes
  )
  select
    player.id, target_season.season_year, mallards_team_id, roster.position, roster.salary,
    roster.term_end_year, null, null
  from mallards_import roster
  join public.players player using (player_api_id)
  cross join (values (2026), (2027)) as target_season(season_year)
  on conflict (player_id, season_year) do update
  set fantasy_team_id = excluded.fantasy_team_id,
      position = excluded.position,
      salary = excluded.salary,
      term_end_year = excluded.term_end_year;

end;
$$;

-- Verification: returns the complete Mallards 2026 roster, including Ketel.
select
  player.full_name,
  season.position,
  season.salary,
  season.term_end_year
from public.player_seasons season
join public.players player on player.id = season.player_id
join public.fantasy_teams team on team.id = season.fantasy_team_id
where season.season_year = 2026
  and lower(team.team_name) = 'st thomas mallards'
order by
  case season.position
    when 'C' then 1 when '1B' then 2 when '2B' then 3
    when 'SS' then 4 when '3B' then 5 when 'OF' then 6
    when 'DH' then 7 when 'SP' then 8 when 'RP' then 9 else 10
  end,
  player.full_name;
