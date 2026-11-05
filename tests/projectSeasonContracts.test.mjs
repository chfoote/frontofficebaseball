import assert from "node:assert/strict";
import { test } from "node:test";
import { projectSeasonContracts } from "../src/lib/projectSeasonContracts.ts";

const row = (id, player_id, season_year, salary, term_end_year, extra = {}) => ({ id, player_id, season_year, salary, term_end_year, fantasy_team_id: 2, position: "SP", ...extra });

test("Mallards 2028 includes seven continuing contracts, counting the explicit contract only once", () => {
  const salaries = [250000, 3750000, 5750000, 250000, 4000000, 3550000, 250000];
  const rows = salaries.map((salary, index) => row(index + 1, index + 1, 2027, salary, 2028));
  rows.push(row(20, 1, 2028, 250000, 2029));
  const projected = projectSeasonContracts(rows, 2028);
  assert.equal(projected.length, 7);
  assert.equal(projected.reduce((total, item) => total + item.salary, 0), 17800000);
  assert.ok(projected.every((item) => item.season_year === 2028));
  assert.equal(rows[0].season_year, 2027);
});

test("the latest ownership and salary override older contracts globally", () => {
  const rows = [row(1, 1, 2026, 1000000, 2030), row(2, 1, 2027, 750000, 2030, { fantasy_team_id: 3 }), row(3, 1, 2028, 500000, 2028, { fantasy_team_id: 4 })];
  assert.deepEqual(projectSeasonContracts(rows, 2028), [rows[2]]);
  assert.deepEqual(projectSeasonContracts(rows.slice(0, 2), 2028), [{ ...rows[1], season_year: 2028 }]);
});

test("expired, released, and unsigned rights do not resurrect older commitments", () => {
  const rows = [
    row(1, 1, 2026, 1000000, 2030), row(2, 1, 2027, null, null, { position: "RFA" }),
    row(3, 2, 2026, 1000000, 2030), row(4, 2, 2027, null, null, { fantasy_team_id: null }),
    row(5, 3, 2027, 250000, 2027), row(6, 4, 2027, 250000, null),
    row(7, 5, 2027, 0, 2030, { position: "PROSPECT" }),
  ];
  assert.deepEqual(projectSeasonContracts(rows, 2028), []);
});

test("future rows cannot change earlier projections, and explicit rights remain visible", () => {
  const rows = [row(1, 1, 2027, 250000, 2029), row(2, 1, 2029, 500000, 2030, { fantasy_team_id: 3 }), row(3, 2, 2028, null, null, { position: "RFA" })];
  assert.deepEqual(projectSeasonContracts(rows, 2028), [{ ...rows[0], season_year: 2028 }, rows[2]]);
});

test("future team views resolve the whole league before filtering and expire each contract in multi-year views", () => {
  const rows = [
    row(1, 1, 2027, 5750000, 2030, { position: "OF" }),
    row(2, 2, 2027, 4000000, 2030),
    row(3, 3, 2027, 250000, 2029),
    row(4, 3, 2028, 250000, 2029),
    row(5, 4, 2027, 250000, 2030),
    row(6, 4, 2028, 250000, 2030, { fantasy_team_id: 3 }),
  ];
  const roster = (season) => projectSeasonContracts(rows, season).filter((item) => item.fantasy_team_id === 2);
  assert.deepEqual(roster(2028).map((item) => item.player_id), [1, 2, 3]);
  assert.deepEqual(roster(2029).map((item) => item.player_id), [1, 2, 3]);
  assert.deepEqual(roster(2030).map((item) => item.player_id), [1, 2]);
  assert.deepEqual(roster(2031), []);
});
