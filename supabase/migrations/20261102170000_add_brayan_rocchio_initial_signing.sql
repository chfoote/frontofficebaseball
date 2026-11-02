-- Brayan Rocchio joined Cleveland in its 2017 international signing class.
-- International amateur signings are not returned by MLB's domestic draft
-- endpoint, so their original organization rights live in this table.
-- Source: MLB Pipeline / Guardians prospect bio.
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
  '677587',
  'Brayan Rocchio',
  '2001-01-13',
  'SS',
  114,
  'Cleveland Guardians',
  2017,
  'INTERNATIONAL'
)
on conflict (player_name, mlb_team_id, signing_year) do update
set player_api_id = excluded.player_api_id,
    birth_date = excluded.birth_date,
    position = excluded.position,
    mlb_team_name = excluded.mlb_team_name,
    signing_type = excluded.signing_type;
