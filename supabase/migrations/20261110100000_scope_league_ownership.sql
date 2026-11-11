begin;

-- Published clients can detect when this atomic core migration is complete.
alter table public.leagues add column core_setup_ready boolean not null default true;

-- Core setup is available independently of full gameplay activation.
create function public.can_read_league_core(p_league_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select public.is_platform_admin() or exists(select 1 from public.league_memberships where league_id=p_league_id and user_id=auth.uid())
    or exists(select 1 from public.leagues where id=p_league_id and is_enabled);
$$;
revoke all on function public.can_read_league_core(uuid) from public;
grant execute on function public.can_read_league_core(uuid) to anon,authenticated;
drop policy "Visible league identities" on public.leagues;
create policy "Accessible league identities" on public.leagues for select to anon,authenticated using(public.can_read_league_core(id));

alter table public.fantasy_teams drop constraint fantasy_teams_poolsters_transition;
alter table public.player_seasons drop constraint player_seasons_poolsters_transition;
alter table public.team_user_assignments drop constraint assignments_poolsters_transition;
alter table public.manager_targets drop constraint targets_poolsters_transition;
alter table public.fantasy_teams drop constraint fantasy_teams_abbreviation_key;
create unique index fantasy_teams_league_abbreviation_key on public.fantasy_teams(league_id,lower(abbreviation));
alter table public.player_seasons drop constraint player_seasons_player_id_season_year_key;
alter table public.player_seasons add constraint player_seasons_league_player_season_key unique(league_id,player_id,season_year);
alter table public.team_user_assignments drop constraint team_user_assignments_user_season_key;
alter table public.team_user_assignments drop constraint team_user_assignments_team_season_key;
alter table public.team_user_assignments add constraint assignments_league_user_season_key unique(league_id,user_id,season_year);
alter table public.team_user_assignments add constraint assignments_league_team_season_key unique(league_id,fantasy_team_id,season_year);
alter table public.team_user_assignments add constraint assignments_membership_fkey foreign key(league_id,user_id) references public.league_memberships(league_id,user_id) on delete cascade;
alter table public.manager_targets drop constraint manager_targets_pkey;
alter table public.manager_targets add constraint manager_targets_pkey primary key using index manager_targets_league_user_player_key;

-- Replacing policies is essential: adding a restrictive-looking permissive
-- policy beside a legacy USING(true) policy would still allow global access.
do $$ declare item record; table_name text; begin
  foreach table_name in array array['fantasy_teams','player_seasons','team_user_assignments','manager_targets'] loop
    for item in select policyname from pg_policies where schemaname='public' and tablename=table_name loop
      execute format('drop policy %I on public.%I',item.policyname,table_name);
    end loop;
  end loop;
end $$;
create policy "Read accessible teams" on public.fantasy_teams for select to anon,authenticated using(public.can_read_league_core(league_id));
create policy "Manage league teams" on public.fantasy_teams for all to authenticated using(public.can_manage_league(league_id)) with check(public.can_manage_league(league_id));
create policy "Read accessible contracts" on public.player_seasons for select to anon,authenticated using(public.can_read_league_core(league_id));
create policy "Manage league contracts" on public.player_seasons for all to authenticated using(public.can_manage_league(league_id)) with check(public.can_manage_league(league_id));
create policy "Read own or managed team access" on public.team_user_assignments for select to authenticated
using((user_id=auth.uid() and public.can_read_league_core(league_id)) or public.can_manage_league(league_id));
create policy "Manage league team access" on public.team_user_assignments for all to authenticated
using(public.can_manage_league(league_id)) with check(public.can_manage_league(league_id) and exists(select 1 from public.league_memberships m where m.league_id=team_user_assignments.league_id and m.user_id=team_user_assignments.user_id));
create policy "Private league targets" on public.manager_targets for all to authenticated
using(user_id=auth.uid() and (public.is_platform_admin() or exists(select 1 from public.league_memberships m where m.league_id=manager_targets.league_id and m.user_id=auth.uid()))) with check(user_id=auth.uid() and (public.is_platform_admin() or exists(select 1 from public.league_memberships m where m.league_id=manager_targets.league_id and m.user_id=auth.uid())));

create function public.keep_core_league_identity() returns trigger language plpgsql set search_path='' as $$
begin
  if new.league_id is distinct from old.league_id then raise exception 'Records cannot be moved between leagues.' using errcode='23514'; end if;
  return new;
end;
$$;
revoke all on function public.keep_core_league_identity() from public,anon,authenticated;
create trigger keep_team_league before update on public.fantasy_teams for each row execute function public.keep_core_league_identity();
create trigger keep_contract_league before update on public.player_seasons for each row execute function public.keep_core_league_identity();
create trigger keep_assignment_league before update on public.team_user_assignments for each row execute function public.keep_core_league_identity();
create trigger keep_target_league before update on public.manager_targets for each row execute function public.keep_core_league_identity();

create function public.check_core_assignment_membership() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.league_memberships where league_id=new.league_id and user_id=new.user_id) then
    raise exception 'The account must be a member of this league before receiving a team.' using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function public.check_core_assignment_membership() from public,anon,authenticated;
create trigger check_core_assignment_membership before insert or update on public.team_user_assignments for each row execute function public.check_core_assignment_membership();

create function public.check_league_team_limit() returns trigger language plpgsql security definer set search_path='' as $$
declare max_teams integer;
begin
  select team_limit into max_teams from public.leagues where id=new.league_id for update;
  if new.active and (tg_op='INSERT' or not old.active) and
    (select count(*) from public.fantasy_teams where league_id=new.league_id and active) >= max_teams then
    raise exception 'This league has reached its team limit.' using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function public.check_league_team_limit() from public,anon,authenticated;
create trigger check_league_team_limit before insert or update on public.fantasy_teams for each row execute function public.check_league_team_limit();

-- Old features continue to operate on Poolsters only. The views are updatable,
-- enforce the same-league predicate, and honor the caller's underlying RLS.
create schema poolsters_legacy;
grant usage on schema poolsters_legacy to anon,authenticated;
create view poolsters_legacy.fantasy_teams with(security_invoker=true) as
 select * from public.fantasy_teams where league_id='00000000-0000-4000-8000-000000000001'::uuid with local check option;
create view poolsters_legacy.player_seasons with(security_invoker=true) as
 select * from public.player_seasons where league_id='00000000-0000-4000-8000-000000000001'::uuid with local check option;
create view poolsters_legacy.team_user_assignments with(security_invoker=true) as
 select * from public.team_user_assignments where league_id='00000000-0000-4000-8000-000000000001'::uuid with local check option;
grant select on all tables in schema poolsters_legacy to anon;
grant select,insert,update,delete on all tables in schema poolsters_legacy to authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 execute 'grant usage on schema poolsters_legacy to service_role';
 execute 'grant select,insert,update,delete on all tables in schema poolsters_legacy to service_role';
end if;end $$;

create table public.league_core_legacy_functions(signature text primary key,definition text not null,captured_at timestamptz not null default now());
alter table public.league_core_legacy_functions enable row level security;
revoke all on public.league_core_legacy_functions from public,anon,authenticated;

-- Preserve the exact current production function bodies, including previous
-- fixes. Redirect reads/updates/deletes; keep INSERT targets on the real tables
-- so ON CONFLICT can use the new league-specific keys and legacy defaults.
do $$ declare item record; body text; begin
  for item in select p.oid,p.proname,pg_get_functiondef(p.oid) as definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f'
      and p.proname not in ('account_league_dashboard','admin_league_directory','admin_save_league_member','admin_remove_league_member','platform_update_league','check_league_team_limit')
      and p.prosrc ~* '(fantasy_teams|player_seasons|team_user_assignments)' loop
    insert into public.league_core_legacy_functions(signature,definition) values(item.oid::regprocedure::text,item.definition) on conflict do nothing;
    body:=regexp_replace(item.definition,'(\m(from|join|update)[[:space:]]+)(public\.)?(fantasy_teams|player_seasons|team_user_assignments)\M','\1poolsters_legacy.\4','gi');
    body:=regexp_replace(body,'on[[:space:]]+conflict[[:space:]]*\([[:space:]]*player_id[[:space:]]*,[[:space:]]*season_year[[:space:]]*\)','on conflict (league_id,player_id,season_year)','gi');
    body:=regexp_replace(body,'on[[:space:]]+conflict[[:space:]]*\([[:space:]]*user_id[[:space:]]*,[[:space:]]*season_year[[:space:]]*\)','on conflict (league_id,user_id,season_year)','gi');
    if body<>item.definition then execute body; end if;
  end loop;
  -- Legacy player-change/trade-market side effects are not league-aware yet.
  -- Core changes in other leagues get their own append-only audit below.
  for item in select p.oid,p.proname,pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('record_player_change','clear_stale_trade_market_records') loop
    insert into public.league_core_legacy_functions(signature,definition) values(item.oid::regprocedure::text,item.definition) on conflict do nothing;
    body:=regexp_replace(item.definition,'\mbegin\M',E'begin\n  if coalesce(to_jsonb(new)->>\'league_id\',to_jsonb(old)->>\'league_id\',\'00000000-0000-4000-8000-000000000001\') <> \'00000000-0000-4000-8000-000000000001\' then\n    if tg_op=\'DELETE\' then return old; end if; return new;\n  end if;','i');
    execute body;
  end loop;
end $$;

-- Legacy tables cannot accept core references from a setup league, including
-- through elevated trade/auction RPCs that bypass row-level security.
create function public.check_legacy_core_references() returns trigger language plpgsql security definer set search_path='' as $$
declare reference jsonb; value bigint; owner_league uuid;
begin
 for reference in select * from jsonb_array_elements(tg_argv[0]::jsonb) loop
   value:=(to_jsonb(new)->>(reference->>'column'))::bigint;
   if value is not null then
     execute format('select league_id from public.%I where id=$1',reference->>'table') into owner_league using value;
     if owner_league is not null and owner_league<>'00000000-0000-4000-8000-000000000001'::uuid then
       raise exception 'This legacy feature is available only for Poolsters records.' using errcode='23514';
     end if;
   end if;
 end loop;
 return new;
end;
$$;
revoke all on function public.check_legacy_core_references() from public,anon,authenticated;
do $$ declare item record; begin
 for item in select t.relname as table_name,jsonb_agg(jsonb_build_object('column',a.attname,'table',target.relname)) as references
   from pg_constraint f join pg_class t on t.oid=f.conrelid join pg_namespace n on n.oid=t.relnamespace
   join pg_class target on target.oid=f.confrelid join pg_namespace tn on tn.oid=target.relnamespace
   join pg_attribute a on a.attrelid=f.conrelid and a.attnum=f.conkey[1]
   where f.contype='f' and n.nspname='public' and tn.nspname='public' and array_length(f.conkey,1)=1
     and target.relname in ('fantasy_teams','player_seasons','team_user_assignments')
     and t.relname not in ('fantasy_teams','player_seasons','team_user_assignments','manager_targets','league_core_audit')
   group by t.relname loop
   execute format('create trigger check_legacy_core_references before insert or update on public.%I for each row execute function public.check_legacy_core_references(%L)',item.table_name,item.references::text);
 end loop;
end $$;

create table public.league_core_audit (
 id bigint generated always as identity primary key,
 league_id uuid not null references public.leagues(id), actor_id uuid references auth.users(id) on delete set null,
 table_name text not null, operation text not null, row_id bigint not null,
 before_data jsonb, after_data jsonb, created_at timestamptz not null default now()
);
create index league_core_audit_league_idx on public.league_core_audit(league_id,id desc);
alter table public.league_core_audit enable row level security;
revoke all on public.league_core_audit from public,anon,authenticated;
grant select on public.league_core_audit to authenticated;
create policy "Commissioners read core audit" on public.league_core_audit for select to authenticated using(public.can_manage_league(league_id));
create function public.record_league_core_change() returns trigger language plpgsql security definer set search_path='' as $$
declare before_row jsonb; after_row jsonb; source_row jsonb;
begin
 if tg_op<>'INSERT' then before_row:=to_jsonb(old); end if;
 if tg_op<>'DELETE' then after_row:=to_jsonb(new); end if;
 if tg_op='UPDATE' and before_row-'updated_at'=after_row-'updated_at' then return new; end if;
 source_row:=coalesce(after_row,before_row);
 insert into public.league_core_audit(league_id,actor_id,table_name,operation,row_id,before_data,after_data)
 values((source_row->>'league_id')::uuid,auth.uid(),tg_table_name,tg_op,(source_row->>'id')::bigint,before_row,after_row);
 if tg_op='DELETE' then return old; end if; return new;
end;
$$;
revoke all on function public.record_league_core_change() from public,anon,authenticated;
create trigger record_league_team_change after insert or update or delete on public.fantasy_teams for each row execute function public.record_league_core_change();
create trigger record_league_contract_change after insert or update or delete on public.player_seasons for each row execute function public.record_league_core_change();
create trigger record_league_assignment_change after insert or update or delete on public.team_user_assignments for each row execute function public.record_league_core_change();

create function public.core_create_team(p_league_id uuid,p_name text,p_abbreviation text) returns bigint language plpgsql security definer set search_path='' as $$
declare team_id bigint;
begin
 if not public.can_manage_league(p_league_id) then raise exception 'Commissioner access required for this league.' using errcode='42501'; end if;
 if p_name is null or length(trim(p_name)) not between 2 and 100 or p_abbreviation is null or upper(trim(p_abbreviation)) !~ '^[A-Z0-9]{2,8}$' then raise exception 'Enter a team name and a 2–8 character abbreviation.'; end if;
 insert into public.fantasy_teams(league_id,team_name,abbreviation) values(p_league_id,trim(p_name),upper(trim(p_abbreviation))) returning id into team_id;
 return team_id;
end;
$$;

create function public.core_save_contract(p_league_id uuid,p_player_id bigint,p_team_id bigint,p_start_year integer,p_end_year integer,p_salary integer,p_position text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.can_manage_league(p_league_id) then raise exception 'Commissioner access required for this league.' using errcode='42501'; end if;
 perform 1 from public.leagues where id=p_league_id for update;
 if not public.can_manage_league(p_league_id) then raise exception 'Commissioner access required.' using errcode='42501'; end if;
 if p_start_year is null or p_start_year not between 1900 and 2200 or p_end_year is null or p_end_year<p_start_year or p_end_year>p_start_year+4 or p_salary is null or p_salary<250000
   or p_position is null or p_position not in ('C','1B','2B','SS','3B','OF','DH','SP','RP') then raise exception 'Enter a position, at least $250,000, and a contract of 1–5 seasons.'; end if;
 if not exists(select 1 from public.fantasy_teams where id=p_team_id and league_id=p_league_id and active) then raise exception 'Choose an active team in this league.'; end if;
 if not exists(select 1 from public.players where id=p_player_id) then raise exception 'Player not found.'; end if;
 if exists(select 1 from public.player_seasons where league_id=p_league_id and player_id=p_player_id and season_year between p_start_year and p_end_year and fantasy_team_id is not null and fantasy_team_id<>p_team_id) then
   raise exception 'This player is already owned by another team in this league for a selected season.';
 end if;
 if exists(select 1 from public.player_seasons where league_id=p_league_id and player_id=p_player_id and season_year=p_start_year and fantasy_team_id=p_team_id and term_end_year>p_end_year) then
   raise exception 'Release the remaining commitment before shortening an existing contract.';
 end if;
 insert into public.player_seasons(league_id,player_id,season_year,fantasy_team_id,salary,position,term_end_year,contract_group)
 select p_league_id,p_player_id,year,p_team_id,p_salary,p_position,p_end_year,'LEAGUE_SETUP' from generate_series(p_start_year,p_end_year) year
 on conflict(league_id,player_id,season_year) do update set fantasy_team_id=excluded.fantasy_team_id,salary=excluded.salary,position=excluded.position,term_end_year=excluded.term_end_year,contract_group=case when player_seasons.fantasy_team_id=excluded.fantasy_team_id then player_seasons.contract_group else excluded.contract_group end;
end;
$$;

create function public.core_release_contract(p_league_id uuid,p_player_id bigint,p_from_year integer) returns void language plpgsql security definer set search_path='' as $$
declare owner_team bigint;
begin
 if not public.can_manage_league(p_league_id) then raise exception 'Commissioner access required for this league.' using errcode='42501'; end if;
 perform 1 from public.leagues where id=p_league_id for update;
 if not public.can_manage_league(p_league_id) then raise exception 'Commissioner access required.' using errcode='42501'; end if;
 if p_from_year is null or p_from_year not between 1900 and 2200 then raise exception 'Choose a valid starting season.'; end if;
 select fantasy_team_id into owner_team from public.player_seasons where league_id=p_league_id and player_id=p_player_id and season_year=p_from_year for update;
 if owner_team is null then raise exception 'No owned contract was found for this player in the selected season.'; end if;
 update public.player_seasons set fantasy_team_id=null,salary=null,position=null,term_end_year=null,contract_group='UFA'
 where league_id=p_league_id and player_id=p_player_id and season_year>=p_from_year and fantasy_team_id=owner_team;
end;
$$;

revoke all on function public.core_create_team(uuid,text,text),public.core_save_contract(uuid,bigint,bigint,integer,integer,integer,text),public.core_release_contract(uuid,bigint,integer) from public,anon;
grant execute on function public.core_create_team(uuid,text,text),public.core_save_contract(uuid,bigint,bigint,integer,integer,integer,text),public.core_release_contract(uuid,bigint,integer) to authenticated;

insert into public.league_core_legacy_functions(signature,definition)
select p.oid::regprocedure::text,pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_save_league_member' on conflict do nothing;

create or replace function public.admin_save_league_member(p_league_id uuid,p_user_id uuid,p_season integer,p_display_name text,p_role text,p_team_id bigint default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_role text; v_email text;
begin
  if not public.can_manage_league(p_league_id) then raise exception 'Commissioner access required for this league.' using errcode='42501'; end if;
  perform 1 from public.leagues where id=p_league_id for update;
  if not public.can_manage_league(p_league_id) then raise exception 'Commissioner access required for this league.' using errcode='42501'; end if;
  select role into v_role from public.league_memberships where league_id=p_league_id and user_id=p_user_id;
  if v_role is null then raise exception 'Member not found in this league.'; end if;
  if p_role is null or p_role not in ('member','commissioner') or p_season is null or p_season not between 1900 and 2200 then raise exception 'Invalid role or season.'; end if;
  if p_role <> v_role and not public.is_platform_admin() then raise exception 'Only a site administrator can appoint or remove commissioners.' using errcode='42501'; end if;
  if v_role='commissioner' and p_role<>'commissioner' and (select count(*) from public.league_memberships where league_id=p_league_id and role='commissioner') <= 1 then
    raise exception 'Assign another commissioner before removing the last commissioner.';
  end if;
  if p_team_id is not null and not exists(select 1 from public.fantasy_teams where id=p_team_id and league_id=p_league_id and active) then
    raise exception 'Choose an active team belonging to this league.';
  end if;
  update public.league_memberships set display_name=nullif(trim(p_display_name),''),role=p_role where league_id=p_league_id and user_id=p_user_id;
  if p_team_id is null then
    delete from public.team_user_assignments where league_id=p_league_id and user_id=p_user_id and season_year=p_season;
  else
    select email into v_email from public.profiles where id=p_user_id;
    insert into public.team_user_assignments(league_id,user_id,user_email,fantasy_team_id,season_year,role)
    values(p_league_id,p_user_id,v_email,p_team_id,p_season,'owner')
    on conflict(league_id,user_id,season_year) do update set fantasy_team_id=excluded.fantasy_team_id,user_email=excluded.user_email;
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
