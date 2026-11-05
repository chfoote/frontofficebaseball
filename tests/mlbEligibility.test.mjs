import assert from "node:assert/strict";
import { test } from "node:test";
import { countOutfieldGames, determineMlbEligibility, needsOutfieldGameLog, fetchMlbEligibility } from "../src/lib/mlbEligibility.ts";

const appearance = (season, position, games, starts = 0, team = 117) => ({
  season: String(season), player: { id: 670541 }, team: team ? { id: team } : undefined,
  position: { abbreviation: position }, stat: { gamesPlayed: games, gamesStarted: starts },
});

test("field positions require five games and DH requires ten", () => {
  for (const position of ["C", "1B", "2B", "SS", "3B", "LF", "CF", "RF", "DH"]) {
    const minimum = position === "DH" ? 10 : 5;
    const expected = ["LF", "CF", "RF"].includes(position) ? "OF" : position;
    assert.deepEqual(determineMlbEligibility(2026, [appearance(2026, position, minimum - 1)], []), []);
    assert.deepEqual(determineMlbEligibility(2026, [appearance(2026, position, minimum)], []), [expected]);
  }
});

test("Alvarez's 2026 appearances qualify him at OF and DH", () => {
  assert.deepEqual(determineMlbEligibility(2026, [appearance(2026, "LF", 25), appearance(2026, "DH", 134)], []), ["OF", "DH"]);
});

test("previous-season eligibility survives a current season with no appearances", () => {
  assert.deepEqual(determineMlbEligibility(2026, [appearance(2025, "LF", 100)], []), ["OF"]);
  assert.deepEqual(determineMlbEligibility(2027, [appearance(2025, "LF", 100)], []), []);
});

test("seasons qualify separately and never pool sub-threshold games", () => {
  assert.deepEqual(determineMlbEligibility(2026, [appearance(2025, "SS", 3), appearance(2026, "SS", 2)], []), []);
  assert.deepEqual(determineMlbEligibility(2026, [appearance(2025, "SS", 5), appearance(2026, "DH", 10)], []), ["SS", "DH"]);
});

test("SP uses five starts and RP uses five relief appearances, with dual eligibility", () => {
  assert.deepEqual(determineMlbEligibility(2026, [], [appearance(2026, "P", 8, 4)]), []);
  assert.deepEqual(determineMlbEligibility(2026, [], [appearance(2026, "P", 9, 5)]), ["SP"]);
  assert.deepEqual(determineMlbEligibility(2026, [], [appearance(2026, "P", 9, 4)]), ["RP"]);
  assert.deepEqual(determineMlbEligibility(2026, [], [appearance(2026, "P", 10, 5)]), ["SP", "RP"]);
  assert.deepEqual(determineMlbEligibility(2026, [], [appearance(2025, "P", 5, 5), appearance(2026, "P", 5)]), ["SP", "RP"]);
  assert.deepEqual(determineMlbEligibility(2027, [], [appearance(2025, "P", 10, 5)]), []);
});

test("traded players combine team appearances without also counting season totals", () => {
  const rows = [appearance(2026, "SS", 2, 0, 117), appearance(2026, "SS", 3, 0, 147)];
  assert.deepEqual(determineMlbEligibility(2026, rows, []), ["SS"]);
  assert.deepEqual(determineMlbEligibility(2026, [...rows, appearance(2026, "SS", 4, 0, null)], []), []);
  assert.deepEqual(determineMlbEligibility(2026, [rows[0], rows[0]], []), []);
});

test("borderline outfield totals count each game once, including doubleheaders", () => {
  const rows = [appearance(2026, "LF", 3), appearance(2026, "RF", 2)];
  assert.equal(needsOutfieldGameLog(rows), true);
  const gameLog = [1, 2, 3].map((gamePk) => ({ ...appearance(2026, "LF", 1), game: { gamePk } }));
  gameLog.push(...[3, 4].map((gamePk) => ({ ...appearance(2026, "RF", 1), game: { gamePk } })));
  assert.equal(countOutfieldGames(gameLog), 4);
  assert.deepEqual(determineMlbEligibility(2026, rows, [], new Map([[2026, 4]])), []);
  gameLog.push({ ...appearance(2026, "CF", 1), game: { gamePk: 5 } });
  assert.equal(countOutfieldGames(gameLog), 5);
  assert.deepEqual(determineMlbEligibility(2026, rows, [], new Map([[2026, 5]])), ["OF"]);
  assert.equal(needsOutfieldGameLog([appearance(2026, "LF", 5), appearance(2026, "RF", 2)]), false);
});

test("bulk API loader preserves multiple positions, requests exactly two seasons, and shares requests", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    const query = new URL(url).searchParams;
    const season = Number(query.get("season"));
    const splits = query.get("group") === "fielding"
      ? [appearance(season, "LF", 25), appearance(season, "DH", 134)] : [];
    return { ok: true, json: async () => ({ stats: [{ totalSplits: splits.length, splits }] }) };
  };
  try {
    const [first, second] = await Promise.all([fetchMlbEligibility(2026), fetchMlbEligibility(2026)]);
    assert.equal(first, second);
    assert.deepEqual(first.get(670541), ["OF", "DH"]);
    assert.equal(calls.length, 4);
    assert.deepEqual([...new Set(calls.map((url) => new URL(url).searchParams.get("season")))].sort(), ["2025", "2026"]);
    assert.ok(calls.every((url) => new URL(url).searchParams.get("gameType") === "R"));
  } finally { globalThis.fetch = original; }
});

test("failed requests reject instead of inventing eligibility and can be retried", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false });
  try {
    await assert.rejects(fetchMlbEligibility(2030), /Unable to load/);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ stats: [] }) });
    assert.equal((await fetchMlbEligibility(2030)).size, 0);
  } finally { globalThis.fetch = original; }
});
