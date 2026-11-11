import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const migration = (name) => readFile(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), "utf8");

export async function leagueFixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
    grant usage on schema auth to anon, authenticated;
    create table storage.buckets(id text primary key, name text, public boolean);
    create table storage.objects(id bigint primary key, bucket_id text);
    alter default privileges in schema public grant all on tables to anon, authenticated;
  `);
  for (const name of ["20260708000000_create_fantasy_teams", "20260708020000_create_fantasy_players", "20260708030000_create_team_user_assignments", "20260708032000_create_profiles", "20261107090000_create_manager_targets"]) {
    await db.exec(await migration(name));
  }
  await db.exec(`
    alter table public.profiles add column is_admin boolean not null default false;
    insert into auth.users values ('${owner}', 'owner@example.com'), ('${other}', 'other@example.com');
    insert into public.profiles(id,is_admin) values ('${owner}',true), ('${other}',false);
    insert into public.fantasy_teams(team_name,abbreviation) values ('Texas Leaguers','TEX');
    insert into public.players(player_api_id,full_name) values ('burns','Chase Burns');
    insert into public.player_seasons(player_id,season_year,fantasy_team_id,salary) values (1,2027,1,250000);
    insert into public.team_user_assignments(user_id,user_email,fantasy_team_id,season_year) values ('${owner}','owner@example.com',1,2027);
    insert into public.manager_targets(user_id,player_api_id,player_name,position,stat_group) values ('${owner}','tolle','Payton Tolle','SP','pitching');
  `);
  await db.exec(await migration("20261109090000_establish_poolsters_league"));
  return db;
}
