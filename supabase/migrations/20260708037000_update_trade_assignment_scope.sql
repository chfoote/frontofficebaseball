create or replace function public.user_controls_team(
  team_id bigint,
  season_year integer
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from public.team_user_assignments
      where team_user_assignments.user_id = auth.uid()
        and team_user_assignments.fantasy_team_id = team_id
    ),
    false
  );
$$;

grant execute on function public.user_controls_team(bigint, integer)
  to authenticated;
