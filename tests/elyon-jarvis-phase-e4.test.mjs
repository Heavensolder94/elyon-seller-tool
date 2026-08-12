import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import {
  DEFAULT_CONTROL,
  getJarvisControlSnapshot,
  meterJarvisWorkerOutcome,
  normalizeJarvisControl,
  recordJarvisAutopilotOutcome,
  reserveJarvisAutopilotSlot,
  updateJarvisControl,
} from "../lib/elyon-jarvis-control-store.js";
import { allowedPatch } from "../api/jarvis-control.js";
import { runJarvisWorker } from "../lib/elyon-jarvis-worker.js";

const controlApiUrl = new URL("../api/jarvis-control.js", import.meta.url);
const jobsApiUrl = new URL("../api/jarvis-jobs.js", import.meta.url);
const workerApiUrl = new URL("../api/jarvis-worker.js", import.meta.url);
const workerUrl = new URL("../lib/elyon-jarvis-worker.js", import.meta.url);
const clientUrl = new URL("../seller-jarvis-client.js", import.meta.url);
const controlUiUrl = new URL("../seller-jarvis-e4-control.js", import.meta.url);
const cloudUiUrl = new URL("../seller-jarvis-e1-cloud.js", import.meta.url);
const bootstrapUrl = new URL("../seller-jarvis-bootstrap.js", import.meta.url);
const prepareUrl = new URL("../scripts/prepare-agent-registry.mjs", import.meta.url);
const envExampleUrl = new URL("../.env.example", import.meta.url);

const REDIS_ENV = {
  UPSTASH_REDIS_REST_URL: "https://redis.mock",
  UPSTASH_REDIS_REST_TOKEN: "test-token",
};

function createRedisHarness() {
  const strings = new Map();
  const hashes = new Map();
  const hash = (key) => {
    if (!hashes.has(key)) hashes.set(key, new Map());
    return hashes.get(key);
  };

  async function fetchImpl(_url, options = {}) {
    const command = JSON.parse(options.body || "[]");
    const op = String(command[0] || "").toUpperCase();
    let result = null;
    if (op === "GET") {
      result = strings.has(command[1]) ? strings.get(command[1]) : null;
    } else if (op === "SET") {
      strings.set(command[1], command[2]);
      result = "OK";
    } else if (op === "INCR") {
      const next = (Number(strings.get(command[1])) || 0) + 1;
      strings.set(command[1], String(next));
      result = next;
    } else if (op === "DECR") {
      const next = (Number(strings.get(command[1])) || 0) - 1;
      strings.set(command[1], String(next));
      result = next;
    } else if (op === "EXPIRE") {
      result = 1;
    } else if (op === "HGETALL") {
      result = Object.fromEntries(hash(command[1]));
    } else if (op === "HINCRBY") {
      const bucket = hash(command[1]);
      const next = (Number(bucket.get(command[2])) || 0) + Number(command[3] || 0);
      bucket.set(command[2], String(next));
      result = next;
    } else if (op === "HINCRBYFLOAT") {
      const bucket = hash(command[1]);
      const next = (Number(bucket.get(command[2])) || 0) + Number(command[3] || 0);
      bucket.set(command[2], String(next));
      result = String(next);
    } else {
      throw new Error(`Unsupported E4 Redis command: ${op}`);
    }
    return { ok: true, status: 200, json: async () => ({ result }) };
  }

  return { fetchImpl, strings, hashes };
}

function pricedEnv(overrides = {}) {
  return {
    ...REDIS_ENV,
    OPENAI_API_KEY: "openai-test",
    ELYON_AI_OPENAI_INPUT_EUR_PER_1M: "2",
    ELYON_AI_OPENAI_OUTPUT_EUR_PER_1M: "4",
    ...overrides,
  };
}

function successfulOutcome() {
  return {
    ok: true,
    blocked: false,
    result: {
      phase: "E4",
      runs: [{
        provider: "openai",
        model: "test-model",
        usage: { inputTokens: 1_000_000, outputTokens: 500_000, totalTokens: 1_500_000 },
      }],
    },
  };
}

test("E4 defaults to assisted mode and keeps safety controls non-disableable", () => {
  const normalized = normalizeJarvisControl({
    mode: "autopilot",
    budget: { requirePricingForAutonomy: false, reservePerJobEur: 0 },
    errorGuard: { autoPause: false, maxConsecutiveFailures: 5 },
  }, DEFAULT_CONTROL);
  assert.equal(normalized.mode, "autopilot");
  assert.equal(normalized.budget.requirePricingForAutonomy, true);
  assert.equal(normalized.budget.reservePerJobEur, DEFAULT_CONTROL.budget.reservePerJobEur);
  assert.equal(normalized.errorGuard.autoPause, true);
  assert.equal(normalized.errorGuard.maxConsecutiveFailures, 5);
  assert.equal(DEFAULT_CONTROL.mode, "assisted");
  assert.equal(DEFAULT_CONTROL.budget.hardEur, 20);
});

test("E4 fails closed for autonomous AI when active provider pricing is missing", async () => {
  const redis = createRedisHarness();
  const snapshot = await getJarvisControlSnapshot({
    env: { ...REDIS_ENV, OPENAI_API_KEY: "configured-but-unpriced" },
    fetchImpl: redis.fetchImpl,
    now: "2026-08-13T00:20:00.000Z",
  });
  assert.equal(snapshot.control.mode, "assisted");
  assert.equal(snapshot.decision.allowed, false);
  assert.ok(snapshot.decision.reasons.includes("pricing_unconfigured"));
  assert.equal(snapshot.usage.pricingComplete, false);
});

test("E4 assisted/autopilot modes resolve to controlled batch sizes and kill switch overrides both", async () => {
  const redis = createRedisHarness();
  const options = { env: pricedEnv(), fetchImpl: redis.fetchImpl, now: "2026-08-13T00:20:00.000Z" };
  let snapshot = await getJarvisControlSnapshot(options);
  assert.equal(snapshot.decision.allowed, true);
  assert.equal(snapshot.decision.batchLimit, 1);

  await updateJarvisControl({ mode: "autopilot" }, options);
  snapshot = await getJarvisControlSnapshot(options);
  assert.equal(snapshot.control.mode, "autopilot");
  assert.equal(snapshot.decision.allowed, true);
  assert.equal(snapshot.decision.batchLimit, 2);

  await updateJarvisControl({ killSwitch: true }, options);
  snapshot = await getJarvisControlSnapshot(options);
  assert.equal(snapshot.decision.allowed, false);
  assert.ok(snapshot.decision.reasons.includes("kill_switch"));
  assert.equal(snapshot.decision.state, "stopped");
});

test("E4 meters provider token usage with server-configured EUR rates", () => {
  const metering = meterJarvisWorkerOutcome(successfulOutcome(), pricedEnv());
  assert.equal(metering.inputTokens, 1_000_000);
  assert.equal(metering.outputTokens, 500_000);
  assert.equal(metering.totalTokens, 1_500_000);
  assert.equal(metering.pricedTokens, 1_500_000);
  assert.equal(metering.unpricedTokens, 0);
  assert.equal(metering.estimatedCostEur, 4);
  assert.equal(metering.pricingComplete, true);
});

test("E4 reserves hourly/day job slots atomically and auto-pauses after repeated technical failures", async () => {
  const redis = createRedisHarness();
  const options = { env: pricedEnv(), fetchImpl: redis.fetchImpl, now: "2026-08-13T00:20:00.000Z" };
  await updateJarvisControl({ limits: { maxJobsPerHour: 1, maxJobsPerDay: 10 }, errorGuard: { maxConsecutiveFailures: 3 } }, options);
  const snapshot = await getJarvisControlSnapshot(options);
  assert.equal((await reserveJarvisAutopilotSlot(snapshot, options)).reserved, true);
  assert.equal((await reserveJarvisAutopilotSlot(snapshot, options)).reserved, false);

  const failure = { ok: false, blocked: false, error: "provider failed", result: { phase: "E4", runs: [] } };
  await recordJarvisAutopilotOutcome(failure, options);
  await recordJarvisAutopilotOutcome(failure, options);
  const third = await recordJarvisAutopilotOutcome(failure, options);
  assert.equal(third.paused, true);
  const paused = await getJarvisControlSnapshot(options);
  assert.equal(paused.control.pausedByGuard, true);
  assert.equal(paused.decision.allowed, false);
  assert.ok(paused.decision.reasons.includes("auto_paused"));
});

test("E4 worker exits before queue scan when control is stopped", async () => {
  let scanned = false;
  const result = await runJarvisWorker({
    env: {},
    controlSnapshotImpl: async () => ({
      control: { mode: "manual", killSwitch: false, pausedByGuard: false },
      decision: { allowed: false, state: "paused", reasons: ["manual_mode"], batchLimit: 0 },
    }),
    listDueJobsImpl: async () => { scanned = true; return []; },
    executeClaimImpl: async () => ({ ok: true }),
  });
  assert.equal(scanned, false);
  assert.equal(result.phase, "E4");
  assert.equal(result.processed, 0);
  assert.deepEqual(result.control.reasons, ["manual_mode"]);
});

test("E4 API/client/UI expose control without browser worker dispatch or external action authority", async () => {
  const [api, jobs, workerApi, worker, client, ui, cloud, bootstrap, prepare, envExample] = await Promise.all([
    readFile(controlApiUrl, "utf8"),
    readFile(jobsApiUrl, "utf8"),
    readFile(workerApiUrl, "utf8"),
    readFile(workerUrl, "utf8"),
    readFile(clientUrl, "utf8"),
    readFile(controlUiUrl, "utf8"),
    readFile(cloudUiUrl, "utf8"),
    readFile(bootstrapUrl, "utf8"),
    readFile(prepareUrl, "utf8"),
    readFile(envExampleUrl, "utf8"),
  ]);

  assert.match(api, /requireSellerAccess/);
  assert.match(api, /req\.method !== "PUT"/);
  assert.match(api, /getJarvisControlSnapshot/);
  assert.match(jobs, /control/);
  assert.match(jobs, /workerState/);
  assert.match(workerApi, /CRON_SECRET/);
  assert.match(worker, /getJarvisControlSnapshot/);
  assert.match(worker, /reserveJarvisAutopilotSlot/);
  assert.match(worker, /recordJarvisAutopilotOutcome/);
  assert.doesNotMatch(api, /publish_listing|place_supplier_order|issue_refund|send_customer_message/);

  assert.doesNotThrow(() => new vm.Script(client));
  assert.doesNotThrow(() => new vm.Script(ui));
  assert.match(client, /async function control/);
  assert.match(client, /async function updateControl/);
  assert.match(client, /\/api\/jarvis-control/);
  assert.match(ui, /JARVIS SOFORT STOPPEN/);
  assert.match(ui, /ASSISTIERT/);
  assert.match(ui, /AUTOPILOT/);
  assert.match(ui, /Kostenwerte sind Token-basierte Schätzwerte/);
  assert.doesNotMatch(ui, /setInterval|MutationObserver|\/api\/jarvis-worker/);
  assert.match(cloud, /Phase E4/);
  assert.match(cloud, /NOT-AUS/);

  assert.match(bootstrap, /seller-jarvis-e4-control\.js/);
  assert.match(bootstrap, /phase-e4-v1/);
  assert.match(prepare, /seller-jarvis-e4-control\.js/);
  assert.match(prepare, /one-script Jarvis D1\/D2\/D3\/E1\/E4 bootstrap/);
  assert.match(envExample, /ELYON_AI_OPENAI_INPUT_EUR_PER_1M/);
  assert.match(envExample, /ELYON_AI_DEEPSEEK_OUTPUT_EUR_PER_1M/);
});

test("E4 API patch surface cannot directly switch off the fail-closed safety flags", () => {
  const patch = allowedPatch({
    mode: "autopilot",
    budget: { requirePricingForAutonomy: false, reservePerJobEur: 0, hardEur: 20 },
    errorGuard: { autoPause: false, maxConsecutiveFailures: 2 },
    externalActionsLocked: false,
  });
  const normalized = normalizeJarvisControl({ ...DEFAULT_CONTROL, ...patch }, DEFAULT_CONTROL);
  assert.equal(normalized.mode, "autopilot");
  assert.equal(normalized.budget.requirePricingForAutonomy, true);
  assert.equal(normalized.errorGuard.autoPause, true);
  assert.equal(Object.prototype.hasOwnProperty.call(patch, "externalActionsLocked"), false);
});
