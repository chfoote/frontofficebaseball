-- Miguel Vargas was initially signed by the Los Angeles Dodgers in 2017.
-- Source: The Baseball Cube 2017 Dodgers UDFA/initial-signing class.
insert into public.mlb_initial_signings (
  player_api_id,
  player_name,
  birth_date,
  position,
  mlb_team_id,
  mlb_team_name,
  signing_year,
  signing_type
) values (
  '678246',
  'Miguel Vargas',
  '1999-11-17',
  '3B',
  119,
  'Los Angeles Dodgers',
  2017,
  'INTERNATIONAL'
)
on conflict (player_name, mlb_team_id, signing_year) do update
set player_api_id = excluded.player_api_id,
    birth_date = excluded.birth_date,
    position = excluded.position,
    mlb_team_name = excluded.mlb_team_name,
    signing_type = excluded.signing_type;
