import test from "node:test";
import assert from "node:assert/strict";

import { runMarketScout } from "../lib/jarvis-market-scout.js";
import { runJarvisBrain } from "../lib/jarvis-brain.js";

const never = () => new Promise(() => {});

test("Market Scout returns a controlled degraded result before a provider can exhaust the request", async () => {
  const startedAt = Date.now();
  const result = await runMarketScout({
    command: "Finde 10 neue Produkte",
    route: never,
    timeoutMs: 100,
  });
  const elapsed = Date.now() - startedAt;

  assert.equal(result.ok, false);
  assert.equal(result.reason, "market_scout_timeout");
  assert.match(result.summary, /Zeitlimit/i);
  assert.match(result.warnings.join(" "), /kontrolliert beendet/i);
  assert.ok(elapsed < 1000, `Market Scout timeout guard was too slow: ${elapsed} ms`);
});

test("Jarvis Brain bounds each model attempt and degrades instead of hanging indefinitely", async () => {
  const startedAt = Date.now();
  const result = await runJarvisBrain({
    command: "Was ist der nächste sinnvolle Schritt?",
    routeAI: never,
    attemptTimeoutMs: 100,
    buildContext: async () => ({
      coreBrain: { version: "test", loaded: [], core: [], playbook: null, warnings: [] },
      memories: [],
      backgroundOperationalHistory: { recentTasks: [], recentAgentRuns: [] },
      currentTurnEvidence: null,
      warnings: [],
    }),
    saveMemory: async () => null,
  });
  const elapsed = Date.now() - startedAt;

  assert.equal(result.ok, false);
  assert.equal(result.mode, "brain_degraded");
  assert.equal(result.brain.attempts.length, 3);
  assert.deepEqual(result.brain.attempts.map((attempt) => attempt.error), ["TIMEOUT", "TIMEOUT", "TIMEOUT"]);
  assert.ok(elapsed < 1500, `Brain timeout guard was too slow: ${elapsed} ms`);
});
