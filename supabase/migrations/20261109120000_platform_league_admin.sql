begin;

-- Registration now creates a platform account. Membership is explicit; new
-- accounts must not automatically join Poolsters when other leagues exist.
drop trigger if exists add_legacy_poolsters_membership on public.profiles;
drop function if exists public.add_legacy_poolsters_membership();

-- Platform authority is separate from any league's commissioner role.
create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
revoke all on public.platform_admins from public, anon, authenticated;
grant select on public.platform_admins to authenticated;
alter table public.platform_admins enable row level security;
create policy "Read own platform authority" on public.platform_admins for select to authenticated
using (user_id = (select auth.uid()));
insert into public.platform_admins(user_id)
select u.id from auth.users u join public.profiles p on p.id=u.id
where lower(u.email) = 'chfoote@icloud.com' and p.is_admin;

create function public.is_platform_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.platform_admins where user_id = auth.uid());
$$;
revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to anon, authenticated;

create function public.can_manage_league(p_league_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin() or exists(
    select 1 from public.league_memberships where league_id = p_league_id and user_id = auth.uid() and role = 'commissioner'
  );
$$;
revoke all on function public.can_manage_league(uuid) from public;
grant execute on function public.can_manage_league(uuid) to authenticated;

-- Compatibility for legacy Poolsters-only admin pages and RPCs. Draft-league
-- commissioners receive no authority over Poolsters or the platform.
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin() or exists(
    select 1 from public.league_memberships where league_id = '00000000-0000-4000-8000-000000000001'::uuid
      and user_id = auth.uid() and role = 'commissioner'
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

alter table public.leagues add column sport text not null default 'MLB' check(sport = 'MLB');
alter table public.leagues add column logo_url text check(logo_url is null or logo_url ~ '^(https://|/[^/])');
alter table public.leagues add column founded_year integer check(founded_year between 1800 and 2200);
alter table public.leagues add constraint league_founding_before_season check(founded_year is null or founded_year <= current_season);
alter table public.leagues add column team_limit integer not null default 10 check(team_limit between 2 and 30);
update public.leagues set logo_url='/poolsters-logo.png' where slug='poolsters';
alter table public.league_memberships add column display_name text check(length(display_name) <= 100);

-- Setup records can be managed, but the existing activation and core-table
-- CHECK constraints remain in force until gameplay isolation is complete.
drop policy "Enabled league identity is public" on public.leagues;
create policy "Visible league identities" on public.leagues for select to anon, authenticated
using (is_enabled or public.is_platform_admin());
drop policy "Users read their own league memberships" on public.league_memberships;
create policy "Own memberships and managed league memberships" on public.league_memberships for select to authenticated
using (user_id = (select auth.uid()) or public.can_manage_league(league_id));

create function public.can_view_account(p_user_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() = p_user_id or public.is_platform_admin() or exists(
    select 1 from public.league_memberships me join public.league_memberships them on them.league_id=me.league_id
    where me.user_id=auth.uid() and them.user_id=p_user_id
  );
$$;
revoke all on function public.can_view_account(uuid) from public;
grant execute on function public.can_view_account(uuid) to authenticated;
drop policy if exists "Authenticated users can read profiles" on public.profiles;
create policy "Accounts visible within shared leagues" on public.profiles for select to authenticated
using (public.can_view_account(id));
drop policy if exists "Admins can delete profiles" on public.profiles;
drop policy if exists "Users can delete their own profile" on public.profiles;
create policy "Site admins delete profiles" on public.profiles for delete to authenticated
using (public.is_platform_admin());

-- A commissioner's editable name belongs to the league. Global account names
-- and account authority must not be editable through legacy profile policies.
drop policy if exists "Admins can update profiles" on public.profiles;
drop policy if exists "Authenticated users can update profiles" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Account owners and platform admins update profiles" on public.profiles for update to authenticated
using (id = (select auth.uid()) or public.is_platform_admin())
with check (id = (select auth.uid()) or public.is_platform_admin());
create function public.protect_account_identity() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_platform_admin()
    and (new.id is distinct from old.id or new.email is distinct from old.email or new.is_admin is distinct from old.is_admin) then
    raise exception 'Account identity and permissions cannot be changed here.' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_account_identity() from public, anon, authenticated;
create trigger protect_account_identity before update on public.profiles for each row execute function public.protect_account_identity();

create function public.account_league_dashboard() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in to view your leagues.' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(row_data order by (row_data->>'is_enabled')::boolean desc, row_data->>'name') from (
    select to_jsonb(l) || jsonb_build_object(
      'membership_role', m.role, 'member_display_name', m.display_name,
      'team', (select jsonb_build_object('id',t.id,'team_name',t.team_name,'abbreviation',t.abbreviation,'logo',t.logo)
        from public.team_user_assignments a join public.fantasy_teams t on t.id=a.fantasy_team_id and t.league_id=a.league_id
        where a.league_id=l.id and a.user_id=auth.uid() and a.season_year=l.current_season limit 1),
      'team_count',(select count(*) from public.fantasy_teams t where t.league_id=l.id and t.active),
      'member_count',(select count(*) from public.league_memberships x where x.league_id=l.id),
      'commissioners',(select coalesce(jsonb_agg(jsonb_build_object('user_id',x.user_id,'name',coalesce(x.display_name,p.display_name,p.email))),'[]'::jsonb)
        from public.league_memberships x join public.profiles p on p.id=x.user_id where x.league_id=l.id and x.role='commissioner')
    ) as row_data
    from public.leagues l left join public.league_memberships m on m.league_id=l.id and m.user_id=auth.uid()
    where public.is_platform_admin() or m.user_id is not null
  ) rows), '[]'::jsonb);
end;
$$;

create function public.admin_league_directory(p_league_id uuid, p_season integer) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_manage_league(p_league_id) then raise exception 'Commissioner access required for this league.' using errcode='42501'; end if;
  return jsonb_build_object(
    'league',(select to_jsonb(l) from public.leagues l where id=p_league_id),
    'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'email',p.email,'account_name',p.display_name,
      'display_name',m.display_name,'role',m.role,'team_id',a.fantasy_team_id) order by coalesce(m.display_name,p.display_name,p.email)),'[]'::jsonb)
      from public.league_memberships m join public.profiles p on p.id=m.user_id
      left join public.team_user_assignments a on a.league_id=m.league_id and a.user_id=m.user_id and a.season_year=p_season
      where m.league_id=p_league_id),
    'teams',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'team_name',t.team_name,'abbreviation',t.abbreviation) order by t.team_name),'[]'::jsonb)
      from public.fantasy_teams t where t.league_id=p_league_id and t.active)
  );
end;
$$;

create function public.platform_account_directory() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'Site administrator access required.' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'email',email,'display_name',display_name) order by email) from public.profiles),'[]'::jsonb);
end;
$$;

create function public.platform_create_league(p_name text,p_slug text,p_season integer,p_team_limit integer,p_commissioner_email text,p_founded_year integer default null,p_logo_url text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := gen_random_uuid(); v_commissioner uuid;
begin
  if not public.is_platform_admin() then raise exception 'Site administrator access required.' using errcode='42501'; end if;
  if p_name is null or length(trim(p_name)) not between 2 and 100 or p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_slug)>80
    or p_season is null or p_season not between 1900 and 2200 or p_team_limit is null or p_team_limit not between 2 and 30 then
    raise exception 'Enter a league name, URL name, season, and 2–30 teams.';
  end if;
  select p.id into v_commissioner from public.profiles p join auth.users u on u.id=p.id where lower(u.email)=lower(trim(p_commissioner_email));
  if v_commissioner is null then raise exception 'The commissioner must register an account first.'; end if;
  insert into public.leagues(id,slug,name,current_season,first_recorded_season,is_enabled,team_limit,founded_year,logo_url)
  values(v_id,p_slug,trim(p_name),p_season,p_season,false,p_team_limit,p_founded_year,nullif(trim(p_logo_url),''));
  insert into public.league_memberships(league_id,user_id,role) values(v_id,v_commissioner,'commissioner');
  return v_id;
end;
$$;

create function public.admin_add_league_member(p_league_id uuid,p_email text) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  if not public.can_manage_league(p_league_id) then raise exception 'Commissioner access required for this league.' using errcode='42501'; end if;
  perform 1 from public.leagues where id=p_league_id for update;
  if not public.can_manage_league(p_league_id) then raise exception 'Commissioner access required for this league.' using errcode='42501'; end if;
  if not found then raise exception 'League not found.'; end if;
  select p.id into v_user from public.profiles p join auth.users u on u.id=p.id where lower(u.email)=lower(trim(p_email));
  if v_user is null then raise exception 'This user must register an account first.'; end if;
  if exists(select 1 from public.league_memberships where league_id=p_league_id and user_id=v_user) then raise exception 'This user is already a member.'; end if;
  insert into public.league_memberships(league_id,user_id,role) values(p_league_id,v_user,'member');
  return v_user;
end;
$$;

create function public.admin_save_league_member(p_league_id uuid,p_user_id uuid,p_season integer,p_display_name text,p_role text,p_team_id bigint default null)
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
    if exists(select 1 from public.team_user_assignments where user_id=p_user_id and season_year=p_season and league_id<>p_league_id) then raise exception 'This account has a team in another league for this season.'; end if;
    select email into v_email from public.profiles where id=p_user_id;
    insert into public.team_user_assignments(league_id,user_id,user_email,fantasy_team_id,season_year,role)
    values(p_league_id,p_user_id,v_email,p_team_id,p_season,'owner')
    on conflict(user_id,season_year) do update set fantasy_team_id=excluded.fantasy_team_id,user_email=excluded.user_email;
  end if;
end;
$$;

create function public.admin_remove_league_member(p_league_id uuid,p_user_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare v_role text;
begin
  if not public.can_manage_league(p_league_id) then raise exception 'Commissioner access required for this league.' using errcode='42501'; end if;
  perform 1 from public.leagues where id=p_league_id for update;
  if not public.can_manage_league(p_league_id) then raise exception 'Commissioner access required for this league.' using errcode='42501'; end if;
  select role into v_role from public.league_memberships where league_id=p_league_id and user_id=p_user_id;
  if v_role is null then raise exception 'Member not found in this league.'; end if;
  if v_role='commissioner' and not public.is_platform_admin() then raise exception 'Only a site administrator can remove a commissioner.' using errcode='42501'; end if;
  if v_role='commissioner' and (select count(*) from public.league_memberships where league_id=p_league_id and role='commissioner')<=1 then
    raise exception 'Assign another commissioner before removing the last commissioner.';
  end if;
  -- Revoke team access as well. Team rosters and manager-tenure history remain.
  delete from public.team_user_assignments where league_id=p_league_id and user_id=p_user_id;
  delete from public.league_memberships where league_id=p_league_id and user_id=p_user_id;
end;
$$;

create function public.platform_update_account_name(p_user_id uuid,p_name text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'Site administrator access required.' using errcode='42501'; end if;
  if length(p_name)>100 then raise exception 'Use a name of 100 characters or fewer.'; end if;
  update public.profiles set display_name=nullif(trim(p_name),'') where id=p_user_id;
  if not found then raise exception 'Account not found.'; end if;
end;
$$;

create function public.platform_update_league(p_league_id uuid,p_name text,p_team_limit integer,p_founded_year integer default null,p_logo_url text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_admin() then raise exception 'Site administrator access required.' using errcode='42501'; end if;
  if p_name is null or length(trim(p_name)) not between 2 and 100 or p_team_limit is null or p_team_limit not between 2 and 30 then raise exception 'Enter a name and 2–30 teams.'; end if;
  if p_team_limit < (select count(*) from public.fantasy_teams where league_id=p_league_id and active) then raise exception 'Team limit cannot be below the number of active teams.'; end if;
  update public.leagues set name=trim(p_name),team_limit=p_team_limit,founded_year=p_founded_year,logo_url=nullif(trim(p_logo_url),'') where id=p_league_id;
  if not found then raise exception 'League not found.'; end if;
end;
$$;

-- Explicit grants: no implicit PUBLIC execute on privileged RPCs.
revoke all on function public.account_league_dashboard(),public.admin_league_directory(uuid,integer),public.platform_account_directory(),
 public.platform_create_league(text,text,integer,integer,text,integer,text),public.admin_add_league_member(uuid,text),
 public.admin_save_league_member(uuid,uuid,integer,text,text,bigint),public.admin_remove_league_member(uuid,uuid),public.platform_update_account_name(uuid,text),public.platform_update_league(uuid,text,integer,integer,text) from public,anon;
grant execute on function public.account_league_dashboard(),public.admin_league_directory(uuid,integer),public.platform_account_directory(),
 public.platform_create_league(text,text,integer,integer,text,integer,text),public.admin_add_league_member(uuid,text),
 public.admin_save_league_member(uuid,uuid,integer,text,text,bigint),public.admin_remove_league_member(uuid,uuid),public.platform_update_account_name(uuid,text),public.platform_update_league(uuid,text,integer,integer,text) to authenticated;

notify pgrst, 'reload schema';
commit;
