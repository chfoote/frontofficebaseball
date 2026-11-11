import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { leagueFixture } from "./helpers/leagueFixture.mjs";
import { POOLSTERS_LEAGUE_ID as pool } from "../src/lib/leagueIdentity.ts";
const site="11111111-1111-4111-8111-111111111111";
const commissioner="22222222-2222-4222-8222-222222222222";
const member="33333333-3333-4333-8333-333333333333";

async function fixture(){
  const db=await leagueFixture();
  await db.exec(await readFile(new URL("../supabase/migrations/20260708035000_add_admin_access_control.sql",import.meta.url),"utf8"));
  await db.exec(`update auth.users set email='chfoote@icloud.com' where id='${site}';
    update profiles set email='chfoote@icloud.com' where id='${site}';
    update auth.users set email='commissioner@example.com' where id='${commissioner}';
    update profiles set email='commissioner@example.com' where id='${commissioner}';
    insert into auth.users values ('${member}','manager@example.com');
    insert into profiles(id,email,display_name) values ('${member}','manager@example.com','Manager');`);
  await db.exec(await readFile(new URL('../supabase/migrations/20261109120000_platform_league_admin.sql',import.meta.url),'utf8'));
  await as(db,site);
  return db;
}
async function as(db,id){await db.exec(`reset role;select set_config('request.jwt.claim.sub','${id}',false);set role authenticated;`);}
async function create(db){return (await db.query(`select platform_create_league('Deli Shop','deli-shop',2027,10,'commissioner@example.com',2026,null) as id`)).rows[0].id;}
async function dashboard(db){return (await db.query('select account_league_dashboard() as data')).rows[0].data;}
async function directory(db,league){return (await db.query(`select admin_league_directory('${league}',2027) as data`)).rows[0].data;}

test('site admin creates a setup league and sees all leagues; commissioners see only memberships',async()=>{
 const db=await fixture();try{
  assert.equal((await db.query('select is_platform_admin() as allowed')).rows[0].allowed,true);
  const deli=await create(db);const rows=await dashboard(db);
  assert.equal(rows.length,2);assert.equal(rows.find(x=>x.id===deli).is_enabled,false);assert.equal(rows.find(x=>x.id===pool).team.team_name,'Texas Leaguers');
  await as(db,commissioner);
  assert.equal((await db.query('select is_platform_admin() as allowed')).rows[0].allowed,false);
  assert.equal((await db.query('select is_admin() as allowed')).rows[0].allowed,false);
  await assert.rejects(db.exec("insert into fantasy_teams(team_name,abbreviation) values('Wrong League','BAD')"),/row-level security/i);
  assert.equal((await directory(db,deli)).members[0].role,'commissioner');
  await assert.rejects(db.query(`select platform_create_league('Bad','bad',2027,10,'commissioner@example.com')`),/Site administrator/);
  await assert.rejects(db.query('select platform_account_directory()'),/Site administrator/);
  await assert.rejects(db.query(`select admin_league_directory('${pool}',2027)`),/Commissioner access/);
  await as(db,member);assert.deepEqual((await dashboard(db)).map(x=>x.id),[pool]);
  await assert.rejects(db.query(`select admin_league_directory('${deli}',2027)`),/Commissioner access/);
 }finally{await db.close();}
});

test('membership edits are isolated; commissioner cannot escalate or alter global account names',async()=>{
 const db=await fixture();try{
  const deli=await create(db);await as(db,commissioner);
  await db.query(`select admin_add_league_member('${deli}','manager@example.com')`);
  await db.query(`select admin_save_league_member('${deli}','${member}',2027,'Deli Manager','member',null)`);
  assert.equal((await directory(db,deli)).members.find(x=>x.user_id===member).display_name,'Deli Manager');
  await assert.rejects(db.query(`select admin_save_league_member('${deli}','${member}',2027,'Boss','commissioner',null)`),/Only a site administrator/);
  await assert.rejects(db.query(`select platform_update_account_name('${member}','Changed')`),/Site administrator/);
  await db.exec(`update profiles set display_name='Wrong' where id='${member}'`);
  await db.exec('reset role');assert.equal((await db.query(`select display_name from profiles where id='${member}'`)).rows[0].display_name,'Manager');
  assert.equal((await db.query(`select display_name from league_memberships where league_id='${pool}' and user_id='${member}'`)).rows[0].display_name,null);
  await as(db,commissioner);await db.query(`select admin_remove_league_member('${deli}','${member}')`);
  await as(db,member);assert.deepEqual((await dashboard(db)).map(x=>x.id),[pool]);
 }finally{await db.close();}
});

test('last commissioner, cross-league teams, and nonmember assignments are protected atomically',async()=>{
 const db=await fixture();try{
  const deli=await create(db);
  await assert.rejects(db.query(`select admin_remove_league_member('${deli}','${commissioner}')`),/last commissioner/);
  await assert.rejects(db.query(`select admin_save_league_member('${deli}','${commissioner}',2027,null,'member',null)`),/last commissioner/);
  await assert.rejects(db.query(`select admin_save_league_member('${deli}','${member}',2027,null,'member',1)`),/Member not found/);
  await assert.rejects(db.query(`select admin_save_league_member('${deli}','${commissioner}',2027,'Should roll back','commissioner',1)`),/belonging to this league/);
  assert.equal((await directory(db,deli)).members[0].display_name,null);
  await db.query(`select admin_add_league_member('${deli}','chfoote@icloud.com')`);
  await db.query(`select admin_save_league_member('${deli}','${site}',2027,null,'commissioner',null)`);
  await db.query(`select admin_remove_league_member('${deli}','${commissioner}')`);
  await as(db,commissioner);await assert.rejects(db.query(`select admin_add_league_member('${deli}','manager@example.com')`),/Commissioner access/);
 }finally{await db.close();}
});

test('Poolsters commissioner can assign teams and removal revokes access without deleting rosters',async()=>{
 const db=await fixture();try{
  await db.query(`select admin_save_league_member('${pool}','${commissioner}',2027,null,'commissioner',null)`);
  await as(db,commissioner);assert.equal((await db.query('select is_admin() as allowed')).rows[0].allowed,true);
  await db.exec(`insert into fantasy_teams(team_name,abbreviation) values ('Second Team','SEC')`);
  await db.query(`select admin_save_league_member('${pool}','${member}',2027,'League Manager','member',2)`);
  await as(db,member);assert.equal((await dashboard(db))[0].team.team_name,'Second Team');
  await as(db,commissioner);await db.query(`select admin_remove_league_member('${pool}','${member}')`);
  await as(db,member);assert.deepEqual(await dashboard(db),[]);
  await db.exec('reset role');assert.equal((await db.query(`select * from team_user_assignments where user_id='${member}'`)).rows.length,0);
  assert.equal((await db.query('select * from player_seasons')).rows.length,1);
  assert.equal((await db.query(`select * from profiles where id='${member}'`)).rows.length,1);
 }finally{await db.close();}
});

test('direct API writes cannot appoint platform admins or commissioners',async()=>{
 const db=await fixture();try{
  await as(db,member);
  await assert.rejects(db.exec(`insert into platform_admins(user_id) values('${member}')`),/permission denied/);
  await assert.rejects(db.exec(`update league_memberships set role='commissioner' where user_id='${member}'`),/permission denied/);
  await assert.rejects(db.exec(`update profiles set is_admin=true where id='${member}'`),/cannot be changed/);
  await db.exec('reset role;set role anon');
  await assert.rejects(db.query('select account_league_dashboard()'),/permission denied/);
 }finally{await db.close();}
});

test('new accounts do not join Poolsters automatically and cannot read unrelated profiles',async()=>{
 const db=await fixture();const outsider='44444444-4444-4444-8444-444444444444';try{
  const deli=await create(db);
  await db.exec(`reset role; insert into auth.users values('${outsider}','outsider@example.com'); insert into profiles(id,email) values('${outsider}','outsider@example.com');`);
  await as(db,outsider);assert.deepEqual(await dashboard(db),[]);
  assert.equal((await db.query(`select * from profiles where id='${site}'`)).rows.length,0);
  await as(db,commissioner);await db.query(`select admin_add_league_member('${deli}','outsider@example.com')`);
  await as(db,outsider);assert.deepEqual((await dashboard(db)).map(x=>x.id),[deli]);
  assert.equal((await db.query(`select * from profiles where id='${site}'`)).rows.length,0);
  await assert.rejects(db.query(`select admin_add_league_member('${pool}','outsider@example.com')`),/Commissioner access/);
 }finally{await db.close();}
});
