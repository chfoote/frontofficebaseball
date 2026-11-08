create table public.manager_targets (
  user_id uuid not null references auth.users(id) on delete cascade,
  player_api_id text not null,
  player_name text not null,
  position text not null,
  stat_group text not null check (stat_group in ('hitting', 'pitching')),
  estimated_salary integer not null default 250000 check (estimated_salary >= 250000),
  term integer not null default 1 check (term between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (user_id, player_api_id)
);
alter table public.manager_targets enable row level security;
grant select, insert, update, delete on public.manager_targets to authenticated;
create policy "Managers manage their own private targets"
  on public.manager_targets for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
