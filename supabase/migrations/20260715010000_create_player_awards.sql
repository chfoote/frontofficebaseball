create table public.awards (
  id bigint generated always as identity primary key,
  name text not null unique,
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint awards_name_check check (length(trim(name)) > 0)
);

create table public.player_awards (
  id bigint generated always as identity primary key,
  award_id bigint not null references public.awards(id) on delete cascade,
  player_id bigint not null references public.players(id) on delete cascade,
  season_year integer not null,
  created_at timestamptz not null default now(),
  constraint player_awards_award_player_season_key unique (award_id, player_id, season_year)
);

create index player_awards_player_season_idx on public.player_awards (player_id, season_year);
create index player_awards_award_season_idx on public.player_awards (award_id, season_year);

alter table public.awards enable row level security;
alter table public.player_awards enable row level security;

create policy "Awards are publicly readable" on public.awards for select using (true);
create policy "Player awards are publicly readable" on public.player_awards for select using (true);
create policy "Admins can create awards" on public.awards for insert to authenticated with check (public.is_admin());
create policy "Admins can update awards" on public.awards for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins can delete awards" on public.awards for delete to authenticated using (public.is_admin());
create policy "Admins can assign player awards" on public.player_awards for insert to authenticated with check (public.is_admin());
create policy "Admins can update player awards" on public.player_awards for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins can delete player awards" on public.player_awards for delete to authenticated using (public.is_admin());

insert into storage.buckets (id, name, public)
values ('award-images', 'award-images', true)
on conflict (id) do nothing;

create policy "Award images are publicly readable" on storage.objects for select using (bucket_id = 'award-images');
create policy "Admins can upload award images" on storage.objects for insert to authenticated with check (bucket_id = 'award-images' and public.is_admin());
create policy "Admins can update award images" on storage.objects for update to authenticated using (bucket_id = 'award-images' and public.is_admin()) with check (bucket_id = 'award-images' and public.is_admin());
create policy "Admins can delete award images" on storage.objects for delete to authenticated using (bucket_id = 'award-images' and public.is_admin());
