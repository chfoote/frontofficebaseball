alter table public.auctions add column player_name text;

update public.auctions a
set player_name = coalesce(p.full_name, concat_ws(' ', p.first_name, p.last_name), 'Unknown Player')
from public.player_seasons ps
join public.players p on p.id = ps.player_id
where ps.id = a.player_season_id;

update public.auctions set player_name = 'Unknown Player' where player_name is null;
alter table public.auctions alter column player_name set not null;
alter table public.auctions alter column player_season_id drop not null;
alter table public.auctions drop constraint auctions_player_season_id_fkey;
alter table public.auctions add constraint auctions_player_season_id_fkey
  foreign key (player_season_id) references public.player_seasons(id) on delete set null;

create or replace function public.snapshot_auction_player_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.player_name is null or btrim(new.player_name) = '' then
    select coalesce(p.full_name, concat_ws(' ', p.first_name, p.last_name), 'Unknown Player')
      into new.player_name
    from public.player_seasons ps
    join public.players p on p.id = ps.player_id
    where ps.id = new.player_season_id;
  end if;
  new.player_name := coalesce(nullif(btrim(new.player_name), ''), 'Unknown Player');
  return new;
end;
$$;

create trigger snapshot_auction_player_before_insert
  before insert on public.auctions
  for each row execute function public.snapshot_auction_player_name();
