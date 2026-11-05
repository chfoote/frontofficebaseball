import assert from "node:assert/strict";
import { test } from "node:test";
import { findAvailableStandingsOrder } from "../src/lib/standingsOrder.ts";

test("2028 dashboard skips future MLB data and falls back through 2027 to scored 2026 standings", async () => {
  const calls = [];
  const result = await findAvailableStandingsOrder(2028, 2026, 2027, async (year) => {
    calls.push(year);
    return year === 2026 ? [{ id: 2, points: 500 }, { id: 1, points: 400 }] : [{ id: 1, points: 0 }, { id: 2, points: 0 }];
  });
  assert.deepEqual(calls, [2027, 2026]);
  assert.deepEqual(result, [2, 1]);
});

test("a season with scores uses its own standings and never requests older seasons", async () => {
  const calls = [];
  assert.deepEqual(await findAvailableStandingsOrder(2027, 2026, 2027, async (year) => {
    calls.push(year);
    return [{ id: 3, points: 500 }, { id: 1, points: 0 }];
  }), [3, 1]);
  assert.deepEqual(calls, [2027]);
});

test("historical dashboards never use a later season and empty leagues preserve team order", async () => {
  const calls = [];
  assert.deepEqual(await findAvailableStandingsOrder(2026, 2026, 2027, async (year) => {
    calls.push(year);
    return [{ id: 2, points: 0 }, { id: 1, points: 0 }];
  }), [2, 1]);
  assert.deepEqual(calls, [2026]);
});
