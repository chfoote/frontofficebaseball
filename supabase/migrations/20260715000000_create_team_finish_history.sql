create table public.fantasy_team_finishes (
  id bigint generated always as identity primary key,
  fantasy_team_id bigint not null references public.fantasy_teams(id) on delete cascade,
  season_year integer not null,
  placement integer not null,
  created_at timestamptz not null default now(),
  constraint fantasy_team_finishes_placement_check check (placement between 1 and 3),
  constraint fantasy_team_finishes_team_season_key unique (fantasy_team_id, season_year),
  constraint fantasy_team_finishes_season_placement_key unique (season_year, placement)
);

create index fantasy_team_finishes_team_idx
  on public.fantasy_team_finishes (fantasy_team_id, season_year desc);

alter table public.fantasy_team_finishes enable row level security;

create policy "Team finish history is publicly readable"
  on public.fantasy_team_finishes for select using (true);

create policy "Admins can create team finish history"
  on public.fantasy_team_finishes for insert to authenticated
  with check (public.is_admin());

create policy "Admins can update team finish history"
  on public.fantasy_team_finishes for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "Admins can delete team finish history"
  on public.fantasy_team_finishes for delete to authenticated
  using (public.is_admin());

create or replace function public.refresh_fantasy_team_finish_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_team_id bigint;
begin
  affected_team_id := coalesce(new.fantasy_team_id, old.fantasy_team_id);

  update public.fantasy_teams
  set
    championships = (select count(*) from public.fantasy_team_finishes where fantasy_team_id = affected_team_id and placement = 1),
    runner_up_finishes = (select count(*) from public.fantasy_team_finishes where fantasy_team_id = affected_team_id and placement = 2),
    third_place_finishes = (select count(*) from public.fantasy_team_finishes where fantasy_team_id = affected_team_id and placement = 3)
  where id = affected_team_id;

  if tg_op = 'UPDATE' and old.fantasy_team_id <> new.fantasy_team_id then
    update public.fantasy_teams
    set
      championships = (select count(*) from public.fantasy_team_finishes where fantasy_team_id = old.fantasy_team_id and placement = 1),
      runner_up_finishes = (select count(*) from public.fantasy_team_finishes where fantasy_team_id = old.fantasy_team_id and placement = 2),
      third_place_finishes = (select count(*) from public.fantasy_team_finishes where fantasy_team_id = old.fantasy_team_id and placement = 3)
    where id = old.fantasy_team_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger refresh_fantasy_team_finish_counts_after_change
  after insert or update or delete on public.fantasy_team_finishes
  for each row execute function public.refresh_fantasy_team_finish_counts();
