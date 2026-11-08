import assert from "node:assert/strict";
import { test } from "node:test";
import { availableLabFreeAgents, validTargetEstimate } from "../src/lib/managerTargets.ts";

test("target estimates accept league minimum through five whole years", () => {
  assert.equal(validTargetEstimate(250000, 1), true);
  assert.equal(validTargetEstimate(1500000, 5), true);
  for (const [salary, term] of [[249999, 1], [NaN, 1], [Infinity, 1], [250000.5, 1], [250000, 0], [250000, 6], [250000, 1.5], [250000, NaN], [2147483648, 1]]) {
    assert.equal(validTargetEstimate(salary, term), false);
  }
});

test("mock signings remove matching MLB identities only in seasons they occupy", () => {
  const target = { season_year: 2027, fantasy_team_id: null, player: { player_api_id: "tolle" } };
  const other = { ...target, player: { player_api_id: "other" } };
  const contract = { ...target, fantasy_team_id: 3 };
  assert.deepEqual(availableLabFreeAgents([target, other], [contract], 2027), [other]);
  assert.deepEqual(availableLabFreeAgents([target], [contract], 2028), [target]);
  assert.deepEqual(availableLabFreeAgents([target], [{ ...contract, fantasy_team_id: null }], 2027), [target]);
  assert.deepEqual(availableLabFreeAgents([target], [], 2027), [target]);
});
