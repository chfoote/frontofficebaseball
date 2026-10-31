alter table public.fantasy_teams
  add column if not exists championships integer not null default 0,
  add column if not exists runner_up_finishes integer not null default 0,
  add column if not exists third_place_finishes integer not null default 0;

comment on column public.fantasy_teams.championships is 'Number of league championships won.';
comment on column public.fantasy_teams.runner_up_finishes is 'Number of second-place league finishes.';
comment on column public.fantasy_teams.third_place_finishes is 'Number of third-place league finishes.';
