do $$
declare
  steven_profile public.profiles;
  daniel_profile public.profiles;
begin
  -- This was a one-time correction for a legacy hockey franchise. The
  -- baseball database may not contain that historical team id.
  if not exists (select 1 from public.fantasy_teams where id = 1) then
    raise notice 'Skipping legacy team 1 manager history: fantasy team 1 does not exist.';
    return;
  end if;

  select * into steven_profile
  from public.profiles
  where display_name ilike 'Steven I%'
  order by created_at
  limit 1;

  select * into daniel_profile
  from public.profiles
  where display_name ilike 'Daniel P%'
  order by created_at
  limit 1;

  -- Team 1 was operated by Steven as the Toronto Ice Bears in 2026.
  if steven_profile.id is not null and steven_profile.email is not null then
    insert into public.team_user_assignments (
      user_id, user_email, fantasy_team_id, season_year, role
    ) values (
      steven_profile.id, steven_profile.email, 1, 2026, 'owner'
    )
    on conflict (fantasy_team_id, season_year) do update
    set user_id = excluded.user_id,
        user_email = excluded.user_email,
        role = excluded.role,
        updated_at = now();
  end if;

  insert into public.fantasy_team_manager_tenures (
    fantasy_team_id, manager_name, profile_id, start_season, end_season
  ) values (
    1, coalesce(steven_profile.display_name, 'Steven I.'), steven_profile.id, 2026, 2026
  )
  on conflict (fantasy_team_id, start_season) do update
  set manager_name = excluded.manager_name,
      profile_id = excluded.profile_id,
      end_season = 2026;

  -- Daniel took over the same franchise as the Niagara Bengals for 2027.
  insert into public.fantasy_team_manager_tenures (
    fantasy_team_id, manager_name, profile_id, start_season, end_season
  ) values (
    1, coalesce(daniel_profile.display_name, 'Daniel P.'), daniel_profile.id, 2027, null
  )
  on conflict (fantasy_team_id, start_season) do update
  set manager_name = excluded.manager_name,
      profile_id = excluded.profile_id,
      end_season = null;
end
$$;
