alter table public.auctions
  add column if not exists player_id bigint references public.players(id) on delete set null;

update public.auctions auction
set player_id = season.player_id
from public.player_seasons season
where season.id = auction.player_season_id
  and auction.player_id is null;

alter table public.auctions
  drop constraint if exists auctions_one_active_player;

create unique index if not exists auctions_one_active_player_idx
  on public.auctions (player_id)
  where resolution is null and player_id is not null;

create or replace function public.snapshot_auction_player_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.player_id is null and new.player_season_id is not null then
    select ps.player_id into new.player_id
    from public.player_seasons ps
    where ps.id = new.player_season_id;
  end if;

  if new.player_name is null or btrim(new.player_name) = '' then
    select coalesce(p.full_name, concat_ws(' ', p.first_name, p.last_name), 'Unknown Player')
      into new.player_name
    from public.players p
    where p.id = new.player_id;
  end if;

  new.player_name := coalesce(nullif(btrim(new.player_name), ''), 'Unknown Player');
  return new;
end;
$$;
