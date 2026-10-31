alter table public.league_transactions
  drop constraint if exists league_transactions_player_season_id_key;

alter table public.league_transactions
  add column if not exists position text;

update public.league_transactions transaction
set position = season.position
from public.player_seasons season
where transaction.player_season_id = season.id
  and transaction.position is null;

create index if not exists league_transactions_player_season_id_idx
  on public.league_transactions(player_season_id);
