import assert from "node:assert/strict";
import { test } from "node:test";
import { POOLSTERS_LEAGUE_ID, leagueStorageKey, requireSupportedLeague, restoreLeagueScenario, leagueUrl, leagueRouteScope, isCoreLeaguePath, isPlatformPage } from "../src/lib/leagueIdentity.ts";

function storage(initial = {}) {
  const items = new Map(Object.entries(initial));
  return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => items.set(key, value), removeItem: (key) => items.delete(key) };
}

test("unsupported leagues cannot fall back to Poolsters or its saved scenario", () => {
  const saved = storage({ "front-office-baseball:roster-lab:manager": "poolsters scenario" });
  assert.throws(() => requireSupportedLeague("deli-shop"));
  assert.throws(() => restoreLeagueScenario(saved, "deli-shop", "manager"));
  assert.equal(saved.getItem("front-office-baseball:roster-lab:manager"), "poolsters scenario");
});

test("legacy Poolsters Lab scenarios move to the user's league-specific key once", () => {
  const saved = storage({ "front-office-baseball:roster-lab:manager": "saved scenario" });
  assert.equal(restoreLeagueScenario(saved, POOLSTERS_LEAGUE_ID, "manager"), "saved scenario");
  assert.equal(saved.getItem(leagueStorageKey("roster-lab", POOLSTERS_LEAGUE_ID, "manager")), "saved scenario");
  assert.equal(saved.getItem("front-office-baseball:roster-lab:manager"), null);
  assert.equal(restoreLeagueScenario(saved, POOLSTERS_LEAGUE_ID, "another-manager"), null);
});

test("existing league scenarios win over legacy data and failed writes keep the original", () => {
  const legacy = "front-office-baseball:roster-lab:manager";
  const key = leagueStorageKey("roster-lab", POOLSTERS_LEAGUE_ID, "manager");
  assert.equal(restoreLeagueScenario(storage({ [legacy]: "old", [key]: "new" }), POOLSTERS_LEAGUE_ID, "manager"), "new");
  const saved = storage({ [legacy]: "old" });
  assert.throws(() => restoreLeagueScenario({ ...saved, setItem() { throw new Error("quota"); } }, POOLSTERS_LEAGUE_ID, "manager"));
  assert.equal(saved.getItem(legacy), "old");
});

const otherLeague = "33333333-3333-4333-8333-333333333333";
test("valid second leagues never inherit legacy Poolsters scenarios",()=>{
 const saved=storage({"front-office-baseball:roster-lab:manager":"Poolsters only"});
 assert.equal(requireSupportedLeague(otherLeague),otherLeague);
 assert.equal(restoreLeagueScenario(saved,otherLeague,"manager"),null);
 assert.equal(saved.getItem("front-office-baseball:roster-lab:manager"),"Poolsters only");
 assert.notEqual(leagueStorageKey("roster-lab",otherLeague,"manager"),leagueStorageKey("roster-lab",POOLSTERS_LEAGUE_ID,"manager"));
});
test("league URL scope is explicit and malformed links never become Poolsters",()=>{
 assert.deepEqual(leagueRouteScope("/leagues/deli-shop/contracts"),{basename:"/leagues/deli-shop",slug:"deli-shop"});
 assert.deepEqual(leagueRouteScope("/admin/leagues"),{basename:"/",slug:null});
 assert.throws(()=>leagueRouteScope("/leagues/%2Fpoolsters/teams"));
 assert.equal(leagueUrl("poolsters","/teams/1?season=2027#roster"),"/leagues/poolsters/teams/1?season=2027#roster");
 assert.throws(()=>leagueUrl("deli-shop","//example.com"));assert.throws(()=>leagueUrl("deli-shop","/../poolsters"));assert.throws(()=>leagueUrl("deli-shop","/%2e%2e/poolsters"));
 assert.equal(isCoreLeaguePath("/teams/123"),true);assert.equal(isCoreLeaguePath("/teams/123/records"),false);assert.equal(isCoreLeaguePath("/auction-house"),false);
});

test("account pages are separate from an entered league",()=>{
 assert.equal(isPlatformPage("/","/"),true);assert.equal(isPlatformPage("/","/admin/leagues"),true);
 assert.equal(isPlatformPage("/leagues/deli-shop","/"),false);assert.equal(isPlatformPage("/","/standings"),false);
});
