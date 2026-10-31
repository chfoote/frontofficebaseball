alter table public.fantasy_team_manager_tenures
  add column if not exists profile_id uuid references public.profiles(id) on delete set null;

create index if not exists fantasy_team_manager_tenures_profile_idx
  on public.fantasy_team_manager_tenures(profile_id);

-- Link historical tenure names where there is one unambiguous profile match.
update public.fantasy_team_manager_tenures tenure
set profile_id = matched.id
from (
  select lower(trim(display_name)) as normalized_name, min(id::text)::uuid as id
  from public.profiles
  where display_name is not null and trim(display_name) <> ''
  group by lower(trim(display_name))
  having count(*) = 1
) matched
where tenure.profile_id is null
  and lower(trim(tenure.manager_name)) = matched.normalized_name;

comment on column public.fantasy_team_manager_tenures.profile_id is
  'Optional profile link used to preserve a manager career across franchises and seasons.';
