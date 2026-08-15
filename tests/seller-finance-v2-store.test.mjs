import test from "node:test";
import assert from "node:assert/strict";
import { mergeFinanceState, normalizeFinanceState } from "../lib/finance-store.js";

test("Finance V2 persists month closures as a dedicated state area", () => {
  const state = normalizeFinanceState({ monthClosures: { "2026-07": { closedAt: "2026-08-01T10:00:00.000Z" } } });
  assert.equal(state.monthClosures["2026-07"].closedAt, "2026-08-01T10:00:00.000Z");
});

test("Finance V2 merges month closures without dropping existing months", () => {
  const current = { monthClosures: { "2026-06": { closedAt: "2026-07-01T10:00:00.000Z" } } };
  const incoming = { monthClosures: { "2026-07": { closedAt: "2026-08-01T10:00:00.000Z" } } };
  const merged = mergeFinanceState(current, incoming, { action: "test" }).state;
  assert.ok(merged.monthClosures["2026-06"]);
  assert.ok(merged.monthClosures["2026-07"]);
});
