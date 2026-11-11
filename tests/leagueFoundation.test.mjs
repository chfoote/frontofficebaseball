import { leagueFixture as fixture } from "./helpers/leagueFixture.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { POOLSTERS_LEAGUE_ID } from "../src/lib/leagueIdentity.ts";

const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const deli = "33333333-3333-4333-8333-333333333333";



test("foundation preserves legacy IDs, contracts, assignments, targets, and upsert keys", async () => {
  const db = await fixture();
  try {
    for (const table of ["fantasy_teams", "player_seasons", "team_user_assignments", "manager_targets"]) {
      assert.deepEqual((await db.query(`select league_id from public.${table}`)).rows, [{ league_id: POOLSTERS_LEAGUE_ID }]);
    }
    assert.deepEqual((await db.query("select id,player_id,fantasy_team_id,salary from player_seasons")).rows, [{ id: 1, player_id: 1, fantasy_team_id: 1, salary: 250000 }]);
    await db.exec(`insert into manager_targets(league_id,user_id,player_api_id,player_name,position,stat_group,estimated_salary)
      values ('${POOLSTERS_LEAGUE_ID}','${owner}','tolle','Payton Tolle','SP','pitching',500000)
      on conflict(league_id,user_id,player_api_id) do update set estimated_salary=excluded.estimated_salary;`);
    assert.equal((await db.query("select estimated_salary from manager_targets")).rows[0].estimated_salary, 500000);
    await db.exec(`insert into player_seasons(player_id,season_year,fantasy_team_id,salary) values (1,2027,1,750000)
      on conflict(player_id,season_year) do update set salary=excluded.salary;`);
    assert.equal((await db.query("select salary from player_seasons")).rows[0].salary, 750000);
    // Team deletion must keep its player's league identity while clearing ownership.
    await db.exec("delete from fantasy_teams where id=1");
    assert.deepEqual((await db.query("select league_id,fantasy_team_id from player_seasons")).rows, [{ league_id: POOLSTERS_LEAGUE_ID, fantasy_team_id: null }]);
    assert.equal((await db.query("select * from team_user_assignments")).rows.length, 0);
  } finally { await db.close(); }
});

test("membership privacy and privileges cannot be changed by a normal manager", async () => {
  const db = await fixture();
  try {
    await db.exec(`select set_config('request.jwt.claim.sub','${other}',false); set role authenticated;`);
    assert.deepEqual((await db.query("select user_id,role from league_memberships")).rows, [{ user_id: other, role: "member" }]);
    assert.equal((await db.query("select name from leagues")).rows[0].name, "Poolsters");
    await assert.rejects(db.exec(`update league_memberships set role='commissioner' where user_id='${other}'`), /permission denied/i);
    await assert.rejects(db.exec(`insert into leagues(id,slug,name,current_season,first_recorded_season) values ('${deli}','deli-shop','Deli Shop',2027,2027)`), /permission denied/i);
    assert.equal((await db.query("select * from manager_targets")).rows.length, 0);
    await db.exec("reset role; set role anon;");
    assert.equal((await db.query("select * from leagues")).rows.length, 1);
    await assert.rejects(db.query("select * from league_memberships"), /permission denied/i);
    await db.exec("reset role");
    await db.exec(`insert into auth.users values ('${deli}', 'new@example.com'); insert into profiles(id) values ('${deli}')`);
    assert.equal((await db.query(`select role from league_memberships where user_id='${deli}'`)).rows[0].role, "member");
  } finally { await db.close(); }
});

test("additional league activation and core writes are blocked during the transition", async () => {
  const db = await fixture();
  try {
    await assert.rejects(db.exec(`insert into leagues(id,slug,name,current_season,first_recorded_season,is_enabled) values ('${deli}','deli-shop','Deli Shop',2027,2027,true)`), /league_activation_poolsters_only/);
    await db.exec(`insert into leagues(id,slug,name,current_season,first_recorded_season) values ('${deli}','deli-shop','Deli Shop',2027,2027)`);
    for (const table of ["fantasy_teams", "player_seasons", "team_user_assignments", "manager_targets"]) {
      await assert.rejects(db.exec(`update ${table} set league_id='${deli}'`));
    }
    await db.exec("set role anon");
    assert.equal((await db.query("select * from leagues")).rows.length, 1);
  } finally { await db.close(); }
});

test("contract and assignment foreign keys enforce the same league as their team", async () => {
  const db = await fixture();
  try {
    await db.exec(`insert into leagues(id,slug,name,current_season,first_recorded_season) values ('${deli}','deli-shop','Deli Shop',2027,2027)`);
    // Remove only transitional guards to exercise the permanent composite FKs.
    await db.exec(`alter table player_seasons drop constraint player_seasons_poolsters_transition;
      alter table team_user_assignments drop constraint assignments_poolsters_transition;`);
    await assert.rejects(db.exec(`update player_seasons set league_id='${deli}' where id=1`), /foreign key/i);
    await assert.rejects(db.exec(`update team_user_assignments set league_id='${deli}' where id=1`), /foreign key/i);
    const result = await db.query(`select count(*)::integer as relationships from pg_constraint
      where contype='f' and conrelid='public.player_seasons'::regclass and confrelid='public.fantasy_teams'::regclass`);
    assert.equal(result.rows[0].relationships, 1);
  } finally { await db.close(); }
});
