import test from "node:test";
import assert from "node:assert/strict";

import { runMarketScout } from "../lib/jarvis-market-scout.js";
import { runJarvisBrain } from "../lib/jarvis-brain.js";

const never = () => new Promise(() => {});

function abortableNever(_url, options = {}) {
  return new Promise((_resolve, reject) => {
    options.signal?.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  });
}

test("Market Scout queue submission degrades quickly instead of exhausting the request", async () => {
  const startedAt = Date.now();
  const result = await runMarketScout({
    command: "Finde 10 neue Produkte",
    workerUrl: "https://worker.example.test",
    fetchImpl: abortableNever,
    queueTimeoutMs: 1000,
  });
  const elapsed = Date.now() - startedAt;

  assert.equal(result.ok, false);
  assert.equal(result.reason, "market_scout_queue_timeout");
  assert.match(result.summary, /Hintergrundauftrag/i);
  assert.ok(elapsed < 2000, `Market Scout queue timeout guard was too slow: ${elapsed} ms`);
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
