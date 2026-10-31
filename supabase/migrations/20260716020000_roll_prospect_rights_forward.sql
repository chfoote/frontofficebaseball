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
  inserted_count integer := 0;
  prospect_count integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Only admins can roll league rights forward.';
  end if;
  if p_target_season <> p_source_season + 1 then
    raise exception 'The target season must immediately follow the source season.';
  end if;

  insert into public.player_seasons (
    player_id, season_year, fantasy_team_id, salary, position,
    term_end_year, contract_group, notes
  )
  select
    source.player_id, p_target_season, source.fantasy_team_id, null, 'RFA',
    null, 'RFA',
    'RFA rights carried forward from expired '
      || coalesce(nullif(trim(source.contract_group), ''), 'unclassified')
      || ' contract in ' || p_source_season
  from public.player_seasons source
  where source.season_year = p_source_season
    and source.term_end_year = p_source_season
    and source.fantasy_team_id is not null
  on conflict (player_id, season_year) do nothing;
  get diagnostics inserted_count = row_count;

  insert into public.player_seasons (
    player_id, season_year, fantasy_team_id, salary, position,
    term_end_year, contract_group, notes
  )
  select
    source.player_id, p_target_season, source.fantasy_team_id, null,
    case when upper(source.position) = 'AP' then 'AP' else 'PROSPECT' end,
    null, source.contract_group,
    'Prospect rights carried forward from ' || p_source_season
  from public.player_seasons source
  where source.season_year = p_source_season
    and upper(coalesce(source.position, '')) in ('PROSPECT', 'AP')
    and source.fantasy_team_id is not null
  on conflict (player_id, season_year) do nothing;
  get diagnostics prospect_count = row_count;

  return inserted_count + prospect_count;
end;
$$;

-- Seed all missing prospect-rights rows for the 2027 rollover.
insert into public.player_seasons (
  player_id, season_year, fantasy_team_id, salary, position,
  term_end_year, contract_group, notes
)
select
  source.player_id, 2027, source.fantasy_team_id, null,
  case when upper(source.position) = 'AP' then 'AP' else 'PROSPECT' end,
  null, source.contract_group, 'Prospect rights carried forward from 2026'
from public.player_seasons source
where source.season_year = 2026
  and upper(coalesce(source.position, '')) in ('PROSPECT', 'AP')
  and source.fantasy_team_id is not null
on conflict (player_id, season_year) do nothing;
