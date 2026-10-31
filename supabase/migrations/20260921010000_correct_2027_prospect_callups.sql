-- Correct prospect promotions that were originally entered as ordinary signings.
update public.league_transactions
set action = 'called_up',
    season_year = 2027
where id = 276
  and player_id = 222
  and fantasy_team_id = 2;

update public.league_transactions
set action = 'called_up'
where id = 277
  and player_id = 223
  and fantasy_team_id = 2
  and season_year = 2027;

-- Podkolzin already has canonical 2027 call-up transaction 274. Transaction
-- 282 points at the same player-season and duplicated that promotion as a signing.
delete from public.league_transactions
where id = 282
  and player_id = 221
  and player_season_id = 893
  and action = 'signed'
  and season_year = 2027;
