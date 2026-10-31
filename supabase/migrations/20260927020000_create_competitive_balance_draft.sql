create table public.competitive_balance_draft_picks (
  id bigint generated always as identity primary key,
  draft_season integer not null,
  based_on_season integer not null,
  round integer not null check (round between 1 and 10),
  pick_in_round integer not null check (pick_in_round between 1 and 20),
  overall_pick integer not null check (overall_pick > 0),
  fantasy_team_id bigint not null references public.fantasy_teams(id) on delete restrict,
  player_id bigint references public.players(id) on delete restrict,
  player_season_id bigint references public.player_seasons(id) on delete set null,
  position text,
  nhl_team text,
  previous_player_season jsonb,
  selected_at timestamptz,
  selected_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (draft_season, round, pick_in_round),
  unique (draft_season, overall_pick),
  unique (draft_season, player_id)
);

alter table public.competitive_balance_draft_picks enable row level security;

create policy "Competitive balance draft is publicly readable"
  on public.competitive_balance_draft_picks for select using (true);

insert into public.competitive_balance_draft_picks (
  draft_season, based_on_season, round, pick_in_round, overall_pick, fantasy_team_id
)
select 2027, 2026, slot.round_number, slot.pick_number, slot.overall_pick, team.id
from (values
  (1, 1, 1, 'Niagara Bengals'),
  (1, 2, 2, 'Halifax Shithawks'),
  (1, 3, 3, 'San Diego Seadogs'),
  (2, 1, 4, 'Niagara Bengals'),
  (2, 2, 5, 'Halifax Shithawks'),
  (2, 3, 6, 'San Diego Seadogs')
) as slot(round_number, pick_number, overall_pick, team_name)
join public.fantasy_teams team on lower(team.team_name) = lower(slot.team_name)
on conflict (draft_season, round, pick_in_round) do nothing;

create or replace function public.make_competitive_balance_pick(
  p_pick_id bigint,
  p_player_api_id text,
  p_player_name text,
  p_position text,
  p_nhl_team text default null
)
returns public.competitive_balance_draft_picks
language plpgsql
security definer
set search_path = public
as $$
declare
  draft_pick public.competitive_balance_draft_picks;
  selected_player public.players;
  selected_season public.player_seasons;
  season_existed boolean := false;
  name_parts text[];
  result public.competitive_balance_draft_picks;
begin
  if not public.is_admin() then raise exception 'Only commissioners can submit competitive balance draft picks.'; end if;
  if nullif(trim(p_player_api_id), '') is null or nullif(trim(p_player_name), '') is null then raise exception 'Choose a valid NHL player.'; end if;

  select * into draft_pick from public.competitive_balance_draft_picks where id = p_pick_id for update;
  if not found then raise exception 'Draft pick not found.'; end if;
  if draft_pick.player_id is not null then raise exception 'This draft pick has already been submitted.'; end if;

  select * into selected_player from public.players where player_api_id = trim(p_player_api_id);
  if selected_player.id is null then
    name_parts := regexp_split_to_array(trim(p_player_name), '\s+');
    insert into public.players (player_api_id, first_name, last_name, full_name, on_trade_block, notes)
    values (
      trim(p_player_api_id),
      case when array_length(name_parts, 1) > 1 then array_to_string(name_parts[1:array_length(name_parts, 1)-1], ' ') else null end,
      name_parts[array_length(name_parts, 1)],
      trim(p_player_name), false, 'Created through the Competitive Balance Draft.'
    ) returning * into selected_player;
  end if;

  if exists (select 1 from public.competitive_balance_draft_picks where draft_season = draft_pick.draft_season and player_id = selected_player.id) then
    raise exception 'This player has already been selected in the Competitive Balance Draft.';
  end if;
  if exists (
    select 1 from public.player_seasons
    where player_id = selected_player.id
      and season_year = draft_pick.draft_season
      and fantasy_team_id is not null
  ) then
    raise exception 'This player already belongs to a GLDHL franchise for the draft season.';
  end if;

  select * into selected_season from public.player_seasons
  where player_id = selected_player.id and season_year = draft_pick.draft_season;
  season_existed := selected_season.id is not null;

  if selected_season.id is null then
    insert into public.player_seasons (
      player_id, season_year, fantasy_team_id, salary, position, term_end_year, contract_group, notes
    ) values (
      selected_player.id, draft_pick.draft_season, draft_pick.fantasy_team_id, null,
      'AP', null, 'COMP_BALANCE',
      'Competitive Balance Draft · Round ' || draft_pick.round || ', Pick ' || draft_pick.pick_in_round
    ) returning * into selected_season;
  else
    update public.player_seasons
    set fantasy_team_id = draft_pick.fantasy_team_id,
        salary = null,
        position = 'AP',
        term_end_year = null,
        contract_group = 'COMP_BALANCE',
        notes = 'Competitive Balance Draft · Round ' || draft_pick.round || ', Pick ' || draft_pick.pick_in_round
    where id = selected_season.id;
  end if;

  update public.competitive_balance_draft_picks
  set player_id = selected_player.id,
      player_season_id = selected_season.id,
      position = upper(nullif(trim(p_position), '')),
      nhl_team = upper(nullif(trim(p_nhl_team), '')),
      previous_player_season = case when season_existed then to_jsonb(selected_season) else null end,
      selected_at = now(),
      selected_by = auth.uid()
  where id = draft_pick.id
  returning * into result;

  return result;
end;
$$;

grant execute on function public.make_competitive_balance_pick(bigint, text, text, text, text) to authenticated;

create or replace function public.undo_competitive_balance_pick(p_pick_id bigint)
returns public.competitive_balance_draft_picks
language plpgsql
security definer
set search_path = public
as $$
declare
  draft_pick public.competitive_balance_draft_picks;
  snapshot jsonb;
  result public.competitive_balance_draft_picks;
begin
  if not public.is_admin() then raise exception 'Only commissioners can undo competitive balance draft picks.'; end if;
  select * into draft_pick from public.competitive_balance_draft_picks where id = p_pick_id for update;
  if not found or draft_pick.player_id is null then raise exception 'There is no submitted selection to undo.'; end if;
  snapshot := draft_pick.previous_player_season;

  if snapshot is null then
    delete from public.player_seasons where id = draft_pick.player_season_id and position = 'AP' and contract_group = 'COMP_BALANCE';
  else
    update public.player_seasons
    set fantasy_team_id = (snapshot ->> 'fantasy_team_id')::bigint,
        salary = (snapshot ->> 'salary')::integer,
        position = snapshot ->> 'position',
        term_end_year = (snapshot ->> 'term_end_year')::integer,
        contract_group = snapshot ->> 'contract_group',
        notes = snapshot ->> 'notes'
    where id = draft_pick.player_season_id;
  end if;

  update public.competitive_balance_draft_picks
  set player_id = null, player_season_id = null, position = null, nhl_team = null,
      previous_player_season = null, selected_at = null, selected_by = null
  where id = draft_pick.id
  returning * into result;
  return result;
end;
$$;

grant execute on function public.undo_competitive_balance_pick(bigint) to authenticated;
