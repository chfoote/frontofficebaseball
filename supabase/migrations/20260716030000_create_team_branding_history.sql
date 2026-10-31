create table public.fantasy_team_branding_history (
  id bigint generated always as identity primary key,
  fantasy_team_id bigint not null references public.fantasy_teams(id) on delete cascade,
  start_season integer not null,
  end_season integer,
  team_name text not null,
  abbreviation text not null,
  logo text,
  primary_color text,
  secondary_color text,
  created_at timestamptz not null default now(),
  constraint fantasy_team_branding_valid_seasons check (
    end_season is null or end_season >= start_season
  ),
  constraint fantasy_team_branding_unique_start unique (fantasy_team_id, start_season)
);

create index fantasy_team_branding_team_seasons_idx
  on public.fantasy_team_branding_history(fantasy_team_id, start_season, end_season);

create or replace function public.validate_team_branding_history()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.fantasy_team_branding_history existing
    where existing.fantasy_team_id = new.fantasy_team_id
      and existing.id <> coalesce(new.id, -1)
      and int4range(existing.start_season, coalesce(existing.end_season, 2147483646), '[]')
          && int4range(new.start_season, coalesce(new.end_season, 2147483646), '[]')
  ) then
    raise exception 'Team branding season ranges cannot overlap.';
  end if;
  new.abbreviation = upper(trim(new.abbreviation));
  return new;
end;
$$;

create trigger validate_team_branding_history_before_write
  before insert or update on public.fantasy_team_branding_history
  for each row execute function public.validate_team_branding_history();

alter table public.fantasy_team_branding_history enable row level security;

create policy "Team branding history is publicly readable"
  on public.fantasy_team_branding_history for select using (true);
create policy "Admins can create team branding history"
  on public.fantasy_team_branding_history for insert to authenticated
  with check (public.is_admin());
create policy "Admins can update team branding history"
  on public.fantasy_team_branding_history for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admins can delete team branding history"
  on public.fantasy_team_branding_history for delete to authenticated
  using (public.is_admin());
