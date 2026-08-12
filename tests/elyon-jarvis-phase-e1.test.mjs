import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import {
  ingestJarvisEvent,
  listJarvisEvents,
  listJarvisJobs,
  normalizeIncomingEvent,
} from "../lib/elyon-jarvis-event-store.js";

const eventsApiUrl = new URL("../api/jarvis-events.js", import.meta.url);
const jobsApiUrl = new URL("../api/jarvis-jobs.js", import.meta.url);
const clientUrl = new URL("../seller-jarvis-client.js", import.meta.url);
const cloudUrl = new URL("../seller-jarvis-e1-cloud.js", import.meta.url);
const bootstrapUrl = new URL("../seller-jarvis-bootstrap.js", import.meta.url);
const prepareUrl = new URL("../scripts/prepare-agent-registry.mjs", import.meta.url);

const MOCK_ENV = {
  UPSTASH_REDIS_REST_URL: "https://redis.mock",
  UPSTASH_REDIS_REST_TOKEN: "test-token",
};

function createRedisHarness() {
  const strings = new Map();
  const zsets = new Map();

  function zset(key) {
    if (!zsets.has(key)) zsets.set(key, new Map());
    return zsets.get(key);
  }

  function sortedMembers(key, reverse = false) {
    const entries = [...zset(key).entries()].sort((a, b) => {
      if (a[1] !== b[1]) return a[1] - b[1];
      return a[0].localeCompare(b[0]);
    });
    if (reverse) entries.reverse();
    return entries.map(([member]) => member);
  }

  async function fetchImpl(_url, options = {}) {
    const command = JSON.parse(options.body || "[]");
    const op = String(command[0] || "").toUpperCase();
    let result = null;

    if (op === "GET") {
      result = strings.has(command[1]) ? strings.get(command[1]) : null;
    } else if (op === "SET") {
      const [, key, value, modifier] = command;
      if (String(modifier || "").toUpperCase() === "NX" && strings.has(key)) result = null;
      else {
        strings.set(key, value);
        result = "OK";
      }
    } else if (op === "ZADD") {
      const [, key, score, member] = command;
      const set = zset(key);
      const existed = set.has(member);
      set.set(member, Number(score));
      result = existed ? 0 : 1;
    } else if (op === "ZCARD") {
      result = zset(command[1]).size;
    } else if (op === "ZREMRANGEBYRANK") {
      const [, key, startRaw, stopRaw] = command;
      const members = sortedMembers(key, false);
      const start = Number(startRaw);
      const stop = Number(stopRaw);
      const selected = members.slice(start, stop + 1);
      for (const member of selected) zset(key).delete(member);
      result = selected.length;
    } else if (op === "ZREVRANGE") {
      const [, key, startRaw, stopRaw] = command;
      result = sortedMembers(key, true).slice(Number(startRaw), Number(stopRaw) + 1);
    } else if (op === "MGET") {
      result = command.slice(1).map((key) => strings.has(key) ? strings.get(key) : null);
    } else {
      throw new Error(`Unsupported mock Redis command: ${op}`);
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({ result }),
    };
  }

  return { fetchImpl, strings, zsets };
}

function eventInput(overrides = {}) {
  return {
    type: "nova.product.created",
    source: "nova",
    sourceId: "ELY-2026-00123",
    subjectId: "ELY-2026-00123",
    idempotencyKey: "nova:ELY-2026-00123:v1",
    correlationId: "corr-test-123",
    payload: {
      title: "Testprodukt",
      supplierUrl: "https://supplier.invalid/item/123",
      buyerEmail: "buyer@example.invalid",
      shippingAddress: { street: "Private 1", city: "Berlin" },
      manufacturerAddress: { city: "Shenzhen", country: "CN" },
    },
    ...overrides,
  };
}

test("E1 normalizes supported events and strips personal buyer/customer data before persistence", () => {
  const normalized = normalizeIncomingEvent(eventInput(), "2026-08-12T21:20:00.000Z");
  assert.equal(normalized.event.type, "nova.product.created");
  assert.equal(normalized.event.sourceId, "ELY-2026-00123");
  assert.equal(normalized.event.payload.title, "Testprodukt");
  assert.equal(normalized.event.payload.buyerEmail, undefined);
  assert.equal(normalized.event.payload.shippingAddress, undefined);
  assert.deepEqual(normalized.event.payload.manufacturerAddress, { city: "Shenzhen", country: "CN" });
  assert.equal(normalized.job.status, "QUEUED");
  assert.equal(normalized.job.executionPolicy, "manual_dispatch");
  assert.equal(normalized.job.autoExecute, false);
});

test("E1 creates exactly one deterministic event and queued cloud job for repeated ingestion", async () => {
  const redis = createRedisHarness();
  const options = { env: MOCK_ENV, fetchImpl: redis.fetchImpl, now: "2026-08-12T21:20:00.000Z" };
  const first = await ingestJarvisEvent(eventInput(), options);
  const second = await ingestJarvisEvent(eventInput(), { ...options, now: "2026-08-12T21:21:00.000Z" });

  assert.equal(first.duplicate, false);
  assert.equal(first.eventCreated, true);
  assert.equal(first.jobCreated, true);
  assert.equal(second.duplicate, true);
  assert.equal(second.eventCreated, false);
  assert.equal(second.jobCreated, false);
  assert.equal(second.event.eventId, first.event.eventId);
  assert.equal(second.job.jobId, first.job.jobId);
  assert.equal(first.job.correlationId, "corr-test-123");
  assert.equal(first.job.attempts, 0);
  assert.equal(first.job.maxAttempts, 3);
  assert.equal(first.job.nextRunAt, "2026-08-12T21:20:00.000Z");
  assert.equal(first.job.lastError, null);

  const events = await listJarvisEvents({ env: MOCK_ENV, fetchImpl: redis.fetchImpl, limit: 20 });
  const jobs = await listJarvisJobs({ env: MOCK_ENV, fetchImpl: redis.fetchImpl, limit: 20 });
  assert.equal(events.length, 1);
  assert.equal(jobs.length, 1);
});

test("E1 retry repairs a missing deterministic job without duplicating the event index", async () => {
  const redis = createRedisHarness();
  const options = { env: MOCK_ENV, fetchImpl: redis.fetchImpl, now: "2026-08-12T21:20:00.000Z" };
  const first = await ingestJarvisEvent(eventInput(), options);
  redis.strings.delete(`elyon:jarvis:job:v1:${first.job.jobId}`);

  const repaired = await ingestJarvisEvent(eventInput(), { ...options, now: "2026-08-12T21:22:00.000Z" });
  assert.equal(repaired.duplicate, true);
  assert.equal(repaired.eventCreated, false);
  assert.equal(repaired.jobCreated, true);
  assert.equal(repaired.job.jobId, first.job.jobId);

  const events = await listJarvisEvents({ env: MOCK_ENV, fetchImpl: redis.fetchImpl, limit: 20 });
  const jobs = await listJarvisJobs({ env: MOCK_ENV, fetchImpl: redis.fetchImpl, limit: 20 });
  assert.equal(events.length, 1);
  assert.equal(jobs.length, 1);
});

test("E1 rejects event types and requested actions that cross external safety boundaries", () => {
  assert.throws(
    () => normalizeIncomingEvent({ type: "ebay.live.publish", source: "test" }),
    (error) => error?.code === "event_action_blocked"
  );
  assert.throws(
    () => normalizeIncomingEvent(eventInput({ action: "publish_listing" })),
    (error) => error?.code === "event_action_blocked"
  );
  assert.throws(
    () => normalizeIncomingEvent({ type: "unknown.event", source: "test" }),
    (error) => error?.code === "event_type_not_supported"
  );
});

test("E1 persistence APIs remain protected/read-only while later worker phases stay isolated", async () => {
  const [eventsApi, jobsApi] = await Promise.all([
    readFile(eventsApiUrl, "utf8"),
    readFile(jobsApiUrl, "utf8"),
  ]);
  assert.match(eventsApi, /requireSellerAccess/);
  assert.match(eventsApi, /ingestJarvisEvent/);
  assert.match(eventsApi, /eventIngestionExecutesAgents: false/);
  assert.match(eventsApi, /autonomousExecutionEnabled: true/);
  assert.match(jobsApi, /requireSellerAccess/);
  assert.match(jobsApi, /req\.method !== "GET"/);
  assert.match(jobsApi, /jarvis_jobs_read_only/);
  assert.match(jobsApi, /getJarvisControlSnapshot/);
  assert.match(jobsApi, /workerEnabled: workerAllowed/);
  assert.doesNotMatch(jobsApi, /ai-agent-run-registry|registryRunner|executePlan|ElyonJarvis\.execute/);
});

test("E1 browser client can read cloud/control state but cannot ingest or dispatch jobs", async () => {
  const client = await readFile(clientUrl, "utf8");
  assert.doesNotThrow(() => new vm.Script(client));
  assert.match(client, /async function events/);
  assert.match(client, /async function jobs/);
  assert.match(client, /async function control/);
  assert.match(client, /\/api\/jarvis-events/);
  assert.match(client, /\/api\/jarvis-jobs/);
  assert.doesNotMatch(client, /ingestEvent|dispatchJob|runJob|retryJob/);
});

test("E1 cloud UI remains passive while E4 worker state is displayed from server queue metadata", async () => {
  const cloud = await readFile(cloudUrl, "utf8");
  assert.doesNotThrow(() => new vm.Script(cloud));
  assert.match(cloud, /window\.ElyonJarvis\.events/);
  assert.match(cloud, /window\.ElyonJarvis\.jobs/);
  assert.match(cloud, /Event Inbox/);
  assert.match(cloud, /Cloud Jobs/);
  assert.match(cloud, /WORKER AKTIV/);
  assert.match(cloud, /Phase E4/);
  assert.match(cloud, /NOT-AUS/);
  assert.doesNotMatch(cloud, /Math\.random\(|MutationObserver|setInterval/);
  assert.doesNotMatch(cloud, /ElyonJarvis\.execute|ElyonJarvis\.plan|publish_listing|place_supplier_order/);
});

test("E1 remains under the existing one-script startup architecture through E4", async () => {
  const [bootstrap, prepare] = await Promise.all([
    readFile(bootstrapUrl, "utf8"),
    readFile(prepareUrl, "utf8"),
  ]);
  assert.match(bootstrap, /seller-jarvis-e1-cloud\.js/);
  assert.match(bootstrap, /seller-jarvis-e4-control\.js/);
  assert.match(bootstrap, /phase-e4-v1/);
  assert.match(prepare, /seller-jarvis-e1-cloud\.js/);
  assert.match(prepare, /seller-jarvis-e4-control\.js/);
  assert.match(prepare, /one-script Jarvis D1\/D2\/D3\/E1\/E4 bootstrap/);
  assert.match(prepare, /const content = `<script defer src="\/\$\{jarvisBootstrapName\}/);
  assert.doesNotMatch(prepare, /seller-jarvis-e4-control\.js[\s\S]{0,300}<script defer/);
});
