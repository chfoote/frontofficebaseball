create or replace function public.roll_expired_rfas_forward(
  p_source_season integer,
  p_target_season integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  if not public.is_admin() then
    raise exception 'Only admins can roll RFA rights forward.';
  end if;
  if p_target_season <> p_source_season + 1 then
    raise exception 'The target season must immediately follow the source season.';
  end if;

  insert into public.player_seasons (
    player_id,
    season_year,
    fantasy_team_id,
    salary,
    position,
    term_end_year,
    contract_group,
    notes
  )
  select
    source.player_id,
    p_target_season,
    source.fantasy_team_id,
    null,
    'RFA',
    null,
    'RFA',
    'RFA rights carried forward from expired '
      || coalesce(nullif(trim(source.contract_group), ''), 'unclassified')
      || ' contract in ' || p_source_season
  from public.player_seasons source
  where source.season_year = p_source_season
    and source.term_end_year = p_source_season
    and source.fantasy_team_id is not null
  on conflict (player_id, season_year) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

-- Catch every missing 2027 rights row, including contracts previously marked UFA or ELC.
insert into public.player_seasons (
  player_id, season_year, fantasy_team_id, salary, position,
  term_end_year, contract_group, notes
)
select
  source.player_id,
  2027,
  source.fantasy_team_id,
  null,
  'RFA',
  null,
  'RFA',
  'RFA rights carried forward from expired '
    || coalesce(nullif(trim(source.contract_group), ''), 'unclassified')
    || ' contract in 2026'
from public.player_seasons source
where source.season_year = 2026
  and source.term_end_year = 2026
  and source.fantasy_team_id is not null
on conflict (player_id, season_year) do nothing;
