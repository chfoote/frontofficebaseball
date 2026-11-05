import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchMlbOffseasonWindow, isInMlbOffseason } from "../src/lib/mlbOffseason.ts";

test("offseason comparison covers winter and spring training, excluding postseason and Opening Day", () => {
  const window = { endOfSeason: "2026-10-31", nextOpeningDay: "2027-03-25" };
  for (const date of ["2026-11-01", "2026-11-03", "2027-01-01", "2027-03-24"]) {
    assert.equal(isInMlbOffseason(date, window), true, date);
  }
  for (const date of ["2026-09-27", "2026-10-31", "2027-03-25", "2027-07-01", "2027-11-01"]) {
    assert.equal(isInMlbOffseason(date, window), false, date);
  }
});

test("MLB season dates are shared across tables and missing dates can be retried", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return { ok: true, json: async () => ({ seasons: [] }) };
  };
  try {
    await assert.rejects(fetchMlbOffseasonWindow(2026), /unavailable/);
    globalThis.fetch = async (url) => {
      calls++;
      return { ok: true, json: async () => ({ seasons: [url.includes("/2026?") ? { seasonEndDate: "2026-10-31" } : { regularSeasonStartDate: "2027-03-25" }] }) };
    };
    const [first, second] = await Promise.all([fetchMlbOffseasonWindow(2026), fetchMlbOffseasonWindow(2026)]);
    assert.equal(first, second);
    assert.deepEqual(first, { endOfSeason: "2026-10-31", nextOpeningDay: "2027-03-25" });
    assert.equal(calls, 4);
  } finally { globalThis.fetch = original; }
});
