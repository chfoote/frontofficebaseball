create table if not exists public.rookie_eligibility (
  id bigint generated always as identity primary key,
  season_year integer not null,
  player_id bigint not null references public.players(id) on delete cascade,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rookie_eligibility_player_season_key unique (season_year, player_id)
);

alter table public.rookie_eligibility enable row level security;
create policy "Rookie eligibility is publicly readable" on public.rookie_eligibility for select using (true);
create policy "Admins manage rookie eligibility" on public.rookie_eligibility for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.rookie_eligibility (season_year, player_id, notes)
select 2026, player.id, 'Initial 2026 GLDHL rookie class'
from public.players player
where lower(player.full_name) in (
  'dylan cozens',
  'connor mcmichael',
  'matthew wood',
  'matthew schaefer',
  'jordan spence',
  'arturs silovs'
)
on conflict (season_year, player_id) do nothing;

