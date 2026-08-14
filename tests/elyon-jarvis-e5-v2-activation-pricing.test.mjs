import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildJarvisAutonomyEnv,
  getJarvisE5ControlSnapshot,
  parseJarvisAutonomyProviders,
} from "../lib/elyon-jarvis-e5-v2-policy.js";
import {
  getJarvisPipelineControlSnapshot,
  saveJarvisPipelineControl,
} from "../lib/elyon-jarvis-pipeline-control-store.js";

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
    } else if (op === "HGETALL") {
      result = Object.fromEntries(hash(command[1]));
    } else {
      throw new Error(`Unsupported E5 V2 Redis command: ${op}`);
    }
    return { ok: true, status: 200, json: async () => ({ result }) };
  }

  return { fetchImpl, strings };
}

test("E5 V2 autonomy pricing defaults to local and ignores unrelated paid-provider API keys", async () => {
  const redis = createRedisHarness();
  const env = {
    ...REDIS_ENV,
    OPENAI_API_KEY: "used-by-other-seller-features",
    DEEPSEEK_API_KEY: "used-by-other-seller-features",
    OPENROUTER_API_KEY: "jarvis-free-router",
  };

  assert.deepEqual(parseJarvisAutonomyProviders(env), ["local"]);
  const scoped = buildJarvisAutonomyEnv(env);
  assert.equal(scoped.OPENAI_API_KEY, "");
  assert.equal(scoped.DEEPSEEK_API_KEY, "");
  assert.equal(scoped.OPENROUTER_API_KEY, "jarvis-free-router");

  const snapshot = await getJarvisE5ControlSnapshot({
    env,
    e5V2: true,
    fetchImpl: redis.fetchImpl,
    now: "2026-08-14T18:00:00.000Z",
  });
  assert.equal(snapshot.decision.allowed, true);
  assert.equal(snapshot.usage.pricingComplete, true);
  assert.equal(snapshot.control.sourceMode, "assisted");
  assert.equal(snapshot.control.mode, "autopilot");
  assert.equal(snapshot.autonomyPolicy.assistedPromotedToE5Autopilot, true);
  assert.deepEqual(snapshot.autonomyPolicy.providers, ["local"]);
  assert.equal(snapshot.autonomyPolicy.livePublishingAllowed, false);
});

test("E5 V2 activates an unconfigured pipeline through draft while live publishing remains locked", async () => {
  const redis = createRedisHarness();
  const env = {
    ...REDIS_ENV,
    OPENAI_API_KEY: "unrelated-openai-key",
    DEEPSEEK_API_KEY: "unrelated-deepseek-key",
  };
  const snapshot = await getJarvisPipelineControlSnapshot({
    env,
    e5V2: true,
    fetchImpl: redis.fetchImpl,
    now: "2026-08-14T18:00:00.000Z",
  });

  assert.equal(snapshot.pipeline.enabled, true);
  assert.equal(snapshot.pipeline.activation, "e5_v2_default");
  assert.equal(snapshot.control.mode, "autopilot");
  assert.equal(snapshot.permissions.internalPipelineAllowed, true);
  assert.equal(snapshot.permissions.ebayDraftAllowed, true);
  assert.equal(snapshot.permissions.livePublishingAllowed, false);
  assert.equal(snapshot.reasons.includes("full_product_pipeline_disabled"), false);
  assert.equal(snapshot.reasons.includes("pricing_unconfigured"), false);
});

test("an explicit E5 disable is preserved and never overridden by V2 activation", async () => {
  const redis = createRedisHarness();
  const env = { ...REDIS_ENV };
  await saveJarvisPipelineControl({ enabled: false }, {
    env,
    fetchImpl: redis.fetchImpl,
    now: "2026-08-14T18:05:00.000Z",
  });

  const snapshot = await getJarvisPipelineControlSnapshot({
    env,
    e5V2: true,
    fetchImpl: redis.fetchImpl,
    now: "2026-08-14T18:06:00.000Z",
  });
  assert.equal(snapshot.pipeline.enabled, false);
  assert.equal(snapshot.permissions.internalPipelineAllowed, false);
  assert.equal(snapshot.permissions.ebayDraftAllowed, false);
  assert.ok(snapshot.reasons.includes("full_product_pipeline_disabled"));
  assert.equal(snapshot.permissions.livePublishingAllowed, false);
});

test("explicit paid autonomy remains fail-closed when its pricing is missing", async () => {
  const redis = createRedisHarness();
  const snapshot = await getJarvisE5ControlSnapshot({
    env: {
      ...REDIS_ENV,
      ELYON_JARVIS_AUTONOMY_PROVIDERS: "deepseek",
      DEEPSEEK_API_KEY: "paid-autonomy-key",
    },
    e5V2: true,
    fetchImpl: redis.fetchImpl,
    now: "2026-08-14T18:10:00.000Z",
  });
  assert.equal(snapshot.decision.allowed, false);
  assert.ok(snapshot.decision.reasons.includes("pricing_unconfigured"));
  assert.equal(snapshot.control.mode, "assisted");
});

test("E5 V2 wiring keeps external live actions locked", async () => {
  const [pipelineApi, workerApi, bridge, pipelineStore] = await Promise.all([
    readFile(new URL("../api/jarvis-pipeline-control.js", import.meta.url), "utf8"),
    readFile(new URL("../api/jarvis-worker.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/elyon-company-os-pipeline-bridge.js", import.meta.url), "utf8"),
    readFile(new URL("../lib/elyon-jarvis-pipeline-control-store.js", import.meta.url), "utf8"),
  ]);

  assert.match(pipelineApi, /e5V2:\s*true/);
  assert.match(workerApi, /getJarvisE5ControlSnapshot/);
  assert.match(bridge, /e5V2:\s*true/);
  assert.match(pipelineStore, /ebayDraftAllowed/);
  for (const source of [pipelineApi, workerApi, pipelineStore]) {
    assert.match(source, /livePublishingAllowed:\s*false/);
    assert.doesNotMatch(source, /publish_listing|place_supplier_order|issue_refund/);
  }
});
