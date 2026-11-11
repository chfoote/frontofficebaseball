import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {leagueFixture} from './helpers/leagueFixture.mjs';
import {POOLSTERS_LEAGUE_ID as pool} from '../src/lib/leagueIdentity.ts';
import {projectSeasonContracts} from '../src/lib/projectSeasonContracts.ts';
const site='11111111-1111-4111-8111-111111111111', manager='22222222-2222-4222-8222-222222222222', outsider='44444444-4444-4444-8444-444444444444';
const sql=(name)=>readFile(new URL('../supabase/migrations/'+name+'.sql',import.meta.url),'utf8');
async function as(db,id){await db.exec(`reset role;select set_config('request.jwt.claim.sub','${id}',false);set role authenticated;`);}
async function fixture(){
 const db=await leagueFixture();
 await db.exec(await sql('20260708035000_add_admin_access_control'));
 await db.exec(`update auth.users set email='chfoote@icloud.com' where id='${site}';update profiles set email='chfoote@icloud.com' where id='${site}';update auth.users set email='manager@example.com' where id='${manager}';update profiles set email='manager@example.com' where id='${manager}';`);
 await db.exec(await sql('20261109120000_platform_league_admin'));
 await db.exec(await sql('20260708037000_update_trade_assignment_scope'));
 await db.exec(await sql('20260917010000_create_player_change_log'));
 // A representative existing contract RPC with global UPDATE and ON CONFLICT.
 await db.exec(`create function public.legacy_roll_contract(p_player_id bigint,p_salary integer) returns void language plpgsql security definer set search_path=public as $$
 begin
   update public.player_seasons set salary=p_salary where player_id=p_player_id;
   insert into public.player_seasons(player_id,season_year,fantasy_team_id,salary) values(p_player_id,2028,1,p_salary)
   on conflict(player_id,season_year) do update set salary=excluded.salary;
 end; $$;
 grant execute on function public.legacy_roll_contract(bigint,integer) to authenticated;`);
 await db.exec(`create table public.legacy_listings(player_id bigint);
   create function public.clear_stale_trade_market_records() returns trigger language plpgsql security definer as $$begin delete from public.legacy_listings where player_id=new.player_id;return new;end;$$;
   create trigger clear_trade_market_after_player_move after update on public.player_seasons for each row execute function public.clear_stale_trade_market_records();`);
 const carry=await sql('20261008030000_carry_waiver_claim_contracts_forward');
 await db.exec(carry.slice(0,carry.indexOf('-- Repair')));
 await db.exec('create table public.legacy_contract_actions(id bigint generated always as identity primary key,player_season_id bigint references public.player_seasons(id),from_team_id bigint references public.fantasy_teams(id))');
 await db.exec(await sql('20261110100000_scope_league_ownership'));
 await as(db,site);
 const deli=(await db.query(`select platform_create_league('Deli Shop','deli-shop',2027,10,'manager@example.com') as id`)).rows[0].id;
 const team=(await db.query(`select core_create_team('${deli}','Deli Team','TEX') as id`)).rows[0].id;
 return {db,deli,team};
}

test('same MLB player and manager have independent contracts and teams in the same season',async()=>{
 const {db,deli,team}=await fixture();try{
  await db.query(`select core_save_contract('${deli}',1,${team},2027,2028,500000,'SP')`);
  await db.query(`select admin_add_league_member('${deli}','chfoote@icloud.com')`);
  await db.query(`select admin_save_league_member('${deli}','${site}',2027,null,'member',${team})`);
  const rows=(await db.query(`select league_id,salary from player_seasons where player_id=1 and season_year=2027 order by salary`)).rows;
  assert.deepEqual(rows,[{league_id:pool,salary:250000},{league_id:deli,salary:500000}]);
  assert.equal((await db.query(`select * from team_user_assignments where user_id='${site}' and season_year=2027`)).rows.length,2);
  const cards=(await db.query('select account_league_dashboard() as data')).rows[0].data;
  assert.equal(cards.find(x=>x.id===pool).team.team_name,'Texas Leaguers');assert.equal(cards.find(x=>x.id===deli).team.team_name,'Deli Team');
  await db.exec(`insert into manager_targets(league_id,user_id,player_api_id,player_name,position,stat_group) values('${deli}','${site}','tolle','Payton Tolle','SP','pitching')`);
  assert.equal((await db.query(`select * from manager_targets where user_id='${site}' and player_api_id='tolle'`)).rows.length,2);
  await db.query(`select core_release_contract('${deli}',1,2027)`);
  assert.equal((await db.query(`select salary from player_seasons where league_id='${pool}' and player_id=1 and season_year=2027`)).rows[0].salary,250000);
  assert.equal((await db.query(`select fantasy_team_id from player_seasons where league_id='${deli}' and player_id=1 and season_year=2028`)).rows[0].fantasy_team_id,null);
 }finally{await db.close();}
});

test('commissioner in league B cannot write league A through direct queries or guessed team IDs',async()=>{
 const {db,deli,team}=await fixture();try{
  await as(db,manager);
  await db.query(`select core_save_contract('${deli}',1,${team},2027,2028,750000,'SP')`);
  await assert.rejects(db.query(`select core_save_contract('${pool}',1,1,2027,2028,900000,'SP')`),/Commissioner access/);
  await assert.rejects(db.query(`select core_save_contract('${deli}',1,1,2027,2028,900000,'SP')`),/team in this league/);
  await db.exec(`update player_seasons set salary=900000 where league_id='${pool}'`);
  assert.equal((await db.query(`select salary from player_seasons where league_id='${pool}' and season_year=2027`)).rows[0].salary,250000);
  await assert.rejects(db.exec(`insert into player_seasons(league_id,player_id,season_year,fantasy_team_id,salary) values('${deli}',1,2029,1,250000)`),/foreign key/i);
  await assert.rejects(db.exec(`update player_seasons set league_id='${pool}' where league_id='${deli}'`),/cannot be moved/i);
 }finally{await db.close();}
});

test('uniqueness and contract transactions prevent duplicate ownership within a league',async()=>{
 const {db,deli,team}=await fixture();try{
  await db.query(`select core_save_contract('${deli}',1,${team},2028,2028,600000,'SP')`);
  const second=(await db.query(`select core_create_team('${deli}','Other Deli Team','OTHER') as id`)).rows[0].id;
  await assert.rejects(db.query(`select core_save_contract('${deli}',1,${second},2027,2029,700000,'SP')`),/already owned/);
  assert.equal((await db.query(`select * from player_seasons where league_id='${deli}' and season_year=2027`)).rows.length,0);
  await assert.rejects(db.exec(`insert into player_seasons(league_id,player_id,season_year,fantasy_team_id,salary) values('${deli}',1,2028,${second},250000)`),/unique/i);
  await assert.rejects(db.query(`select core_create_team('${deli}','Duplicate','tex')`),/unique/i);
  await assert.rejects(db.query(`select admin_save_league_member('${deli}','${site}',2027,null,'member',${team})`),/Member not found/);
 }finally{await db.close();}
});

test('legacy RPCs and aliases stay Poolsters-only after relaxing the ownership keys',async()=>{
 const {db,deli,team}=await fixture();try{
  await db.query(`select core_save_contract('${deli}',1,${team},2027,2028,500000,'SP')`);
  const deliRow=(await db.query(`select id from player_seasons where league_id='${deli}' and season_year=2027`)).rows[0].id;
  await assert.rejects(db.exec(`insert into legacy_contract_actions(player_season_id,from_team_id) values(${deliRow},1)`),/only for Poolsters/);
  await assert.rejects(db.exec(`insert into legacy_contract_actions(player_season_id,from_team_id) values(1,${team})`),/only for Poolsters/);
  await db.exec('insert into legacy_contract_actions(player_season_id,from_team_id) values(1,1)');
  await db.exec('insert into legacy_listings values(1)');
  await db.query(`select core_save_contract('${deli}',1,${team},2027,2028,500000,'SP')`);
  await db.exec('reset role');assert.equal((await db.query('select * from legacy_listings')).rows.length,1);await as(db,site);
  await db.query('select legacy_roll_contract(1,300000)');
  await db.exec('reset role');assert.equal((await db.query('select * from legacy_listings')).rows.length,0);await as(db,site);
  assert.equal((await db.query(`select salary from player_seasons where league_id='${deli}' and season_year=2028`)).rows[0].salary,500000);
  assert.equal((await db.query(`select salary from player_seasons where league_id='${pool}' and season_year=2028`)).rows[0].salary,300000);
  await assert.rejects(db.query(`select carry_claimed_contract_forward(${deliRow})`),/not found/);
  await db.query(`select admin_add_league_member('${deli}','chfoote@icloud.com')`);
  await db.query(`select admin_save_league_member('${deli}','${site}',2027,null,'member',${team})`);
  assert.equal((await db.query(`select user_controls_team(${team},2027) as allowed`)).rows[0].allowed,false);
  assert.equal((await db.query('select user_controls_team(1,2027) as allowed')).rows[0].allowed,true);
  const logs=(await db.query(`select old_data,new_data from player_change_log where table_name='player_seasons'`)).rows;
  assert.equal(logs.some(row=>row.new_data?.league_id===deli || row.old_data?.league_id===deli),false);
 }finally{await db.close();}
});

test('private setup data, targets, audits, and team limits are enforced by the database',async()=>{
 const {db,deli,team}=await fixture();try{
  await db.query(`select core_save_contract('${deli}',1,${team},2027,2027,500000,'SP')`);
  await db.exec(`reset role;insert into auth.users values('${outsider}','outsider@example.com');insert into profiles(id,email) values('${outsider}','outsider@example.com');`);
  await as(db,outsider);
  assert.equal((await db.query(`select * from player_seasons where league_id='${deli}'`)).rows.length,0);
  assert.equal((await db.query(`select * from fantasy_teams where league_id='${deli}'`)).rows.length,0);
  assert.equal((await db.query(`select * from leagues where id='${deli}'`)).rows.length,0);
  assert.equal((await db.query('select * from league_core_audit')).rows.length,0);
  await assert.rejects(db.exec(`insert into manager_targets(league_id,user_id,player_api_id,player_name,position,stat_group) values('${deli}','${outsider}','tolle','Tolle','SP','pitching')`),/row-level security/i);
  await as(db,site);
  await db.query(`select platform_update_league('${deli}','Deli Shop',2,null,null)`);
  await db.query(`select core_create_team('${deli}','Second Deli','SECOND')`);
  await assert.rejects(db.query(`select core_create_team('${deli}','Too Many','THIRD')`),/team limit/);
  assert.ok((await db.query(`select * from league_core_audit where league_id='${deli}'`)).rows.length>0);
 }finally{await db.close();}
});

test('contract projections never collapse the same player across leagues',()=>{
 const rows=[{id:1,league_id:pool,player_id:1,season_year:2027,fantasy_team_id:1,salary:250000,position:'SP',term_end_year:2029},{id:2,league_id:'deli',player_id:1,season_year:2027,fantasy_team_id:2,salary:900000,position:'SP',term_end_year:2028}];
 assert.equal(projectSeasonContracts(rows,2028).length,2);
 assert.deepEqual(projectSeasonContracts(rows,2028,pool).map(row=>row.salary),[250000]);
 assert.equal(projectSeasonContracts(rows,2029,'deli').length,0);
});

test('Poolsters commissioner privileges do not become administration rights in another league',async()=>{
 const {db,deli,team}=await fixture();try{
  await db.query(`select admin_add_league_member('${deli}','chfoote@icloud.com')`);
  await db.query(`select admin_save_league_member('${deli}','${site}',2027,null,'commissioner',null)`);
  await db.query(`select admin_save_league_member('${deli}','${manager}',2027,null,'member',null)`);
  await db.query(`select admin_save_league_member('${pool}','${manager}',2027,null,'commissioner',null)`);
  await as(db,manager);
  assert.equal((await db.query('select is_admin() as allowed')).rows[0].allowed,true);
  await assert.rejects(db.query(`select core_save_contract('${deli}',1,${team},2027,2027,500000,'SP')`),/Commissioner access/);
  await assert.rejects(db.exec(`insert into player_seasons(league_id,player_id,season_year,fantasy_team_id,salary) values('${deli}',1,2027,${team},250000)`),/row-level security/i);
 }finally{await db.close();}
});

test('releasing one commitment preserves another team’s later season and other leagues',async()=>{
 const {db,deli,team}=await fixture();try{
  const laterTeam=(await db.query(`select core_create_team('${deli}','Later Owner','LATER') as id`)).rows[0].id;
  await db.query(`select core_save_contract('${deli}',1,${team},2027,2027,500000,'SP')`);
  await db.query(`select core_save_contract('${deli}',1,${laterTeam},2028,2028,750000,'SP')`);
  await db.query(`select core_release_contract('${deli}',1,2027)`);
  assert.equal((await db.query(`select fantasy_team_id from player_seasons where league_id='${deli}' and season_year=2027`)).rows[0].fantasy_team_id,null);
  assert.equal((await db.query(`select fantasy_team_id from player_seasons where league_id='${deli}' and season_year=2028`)).rows[0].fantasy_team_id,laterTeam);
  assert.equal((await db.query(`select salary from player_seasons where league_id='${pool}' and season_year=2027`)).rows[0].salary,250000);
 }finally{await db.close();}
});
