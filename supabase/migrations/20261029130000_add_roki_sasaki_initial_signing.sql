-- Roki Sasaki signed with the Los Angeles Dodgers as an international amateur
-- free agent in 2025. Because he was not selected in the MLB Draft, his farm
-- rights must come from the initial-signings table.
-- Source: MLB.com, Dodgers press release dated January 22, 2025.
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
  '808963',
  'Roki Sasaki',
  '2001-11-03',
  'SP',
  119,
  'Los Angeles Dodgers',
  2025,
  'INTERNATIONAL'
)
on conflict (player_name, mlb_team_id, signing_year) do update
set player_api_id = excluded.player_api_id,
    birth_date = excluded.birth_date,
    position = excluded.position,
    mlb_team_name = excluded.mlb_team_name,
    signing_type = excluded.signing_type;
