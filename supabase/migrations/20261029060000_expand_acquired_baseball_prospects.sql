insert into public.mlb_acquired_prospect_rights (season_year, player_name, fantasy_team_id, acquisition_note)
select 2027, source.player_name, team.id, 'Workbook acquired prospect'
from (values
  ('STM', 'Gabriel Arias'), ('STM', 'Liam Doyle'), ('STM', 'Esteban Mejia'),
  ('WAR', 'Ralphy Velazquez'), ('WAR', 'Dylan Beavers'),
  ('BBS', 'Malcolm Nunez'), ('BBS', 'Gabriel Rodriguez'), ('BBS', 'Junior Sanquintin'),
  ('BBS', 'George Valera'), ('BBS', 'Freudis Nova'), ('BBS', 'Alexfri Planez'),
  ('BBS', 'Jhonkensy Noel'), ('BBS', 'Jesus Sanchez'), ('BBS', 'Jasson Dominguez'),
  ('BBS', 'Yasel Antuna'), ('BBS', 'Masyn Winn'), ('BBS', 'Edwin Nunez'),
  ('BBS', 'Samuel Basallo'), ('BBS', 'Maikol Hernandez'), ('BBS', 'Joshua Baez'),
  ('BBS', 'Won-Bin Cho'), ('BBS', 'Jonathan Mejia'), ('BBS', 'Braylin Tavera'),
  ('BBS', 'Cooper Hjerpe'), ('BBS', 'Jordan Beck'), ('BBS', 'Jacob Wilson'),
  ('BBS', 'Gage Jump'),
  ('MCW', 'Ike Irish'), ('MCW', 'Joseph Dzierwa'), ('MCW', 'Nate George'),
  ('MCW', 'Tanner Franklin'), ('MCW', 'Tink Hence'), ('MCW', 'Angel Rondon'),
  ('MCW', 'Luis Gonzalez'), ('MCW', 'Alec Willis'), ('MCW', 'Gabriel Moreno'),
  ('MCW', 'Hudson Haskin'), ('MCW', 'Michael McGreevy'), ('MCW', 'Spencer Jones')
) as source(abbreviation, player_name)
join public.fantasy_teams team on team.abbreviation = source.abbreviation
on conflict (season_year, player_name) do update
set fantasy_team_id = excluded.fantasy_team_id,
    acquisition_note = excluded.acquisition_note;

-- Remove the misspelled workbook aliases now represented by canonical MLB names.
delete from public.mlb_acquired_prospect_rights
where season_year = 2027
  and player_name in ('Sam Bassalo', 'jason dominguez', 'Noel Jhonkensy', 'Gabby Moreno', 'Hudson Haskins', 'Braylin Tevera');
