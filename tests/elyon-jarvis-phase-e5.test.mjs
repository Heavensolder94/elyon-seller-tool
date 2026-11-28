import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { updateJarvisControl } from "../lib/elyon-jarvis-control-store.js";
import {
  getJarvisPipelineControlSnapshot,
  saveJarvisPipelineControl,
} from "../lib/elyon-jarvis-pipeline-control-store.js";
import {
  dispatchCompanyOsPipelineStart,
  isPipelineStartEvent,
} from "../lib/elyon-company-os-pipeline-bridge.js";
import { runJarvisWorker } from "../lib/elyon-jarvis-worker.js";
import {
  claimJarvisWorkerJob, finishJarvisWorkerJob, finishJarvisPipelineHandoff,
  listDueJarvisWorkerJobs, LEASE_PREFIX, HANDOFF_INDEX,
} from "../lib/elyon-jarvis-worker-store.js";
import { JOB_PREFIX } from "../lib/elyon-jarvis-event-store.js";
import { publicSnapshot } from "../api/jarvis-pipeline-control.js";

const pipelineApiUrl = new URL("../api/jarvis-pipeline-control.js", import.meta.url);
const pipelineStoreUrl = new URL("../lib/elyon-jarvis-pipeline-control-store.js", import.meta.url);
const bridgeUrl = new URL("../lib/elyon-company-os-pipeline-bridge.js", import.meta.url);
const workerUrl = new URL("../lib/elyon-jarvis-worker.js", import.meta.url);
const uiUrl = new URL("../seller-jarvis-e5-pipeline.js", import.meta.url);
const bootstrapUrl = new URL("../seller-jarvis-bootstrap.js", import.meta.url);
const prepareUrl = new URL("../scripts/prepare-agent-registry.mjs", import.meta.url);

const PRICED_ENV = {
  UPSTASH_REDIS_REST_URL: "https://redis.mock",
  UPSTASH_REDIS_REST_TOKEN: "test-token",
  OPENAI_API_KEY: "openai-test",
  ELYON_AI_OPENAI_INPUT_EUR_PER_1M: "2",
  ELYON_AI_OPENAI_OUTPUT_EUR_PER_1M: "4",
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
      throw new Error(`Unsupported E5 Redis command: ${op}`);
    }
    return { ok: true, status: 200, json: async () => ({ result }) };
  }

  return { fetchImpl };
}

function allowedWorkerControl(mode = "assisted") {
  return {
    control: { mode, killSwitch: false, pausedByGuard: false },
    decision: { allowed: true, state: "active", reasons: [], batchLimit: 1 },
  };
}

function validEvent() {
  return {
    eventId: "evt-e5-1",
    type: "nova.product.created",
    source: "company-os",
    sourceId: "product-123",
    subjectId: "product-123",
    correlationId: "corr-e5-1",
    payload: { title: "Testprodukt" },
  };
}

function workerHarness({ outcome, storedStatus = "SUCCESS" } = {}) {
  let pipelineCalls = 0;
  return {
    options: {
      env: {},
      controlSnapshotImpl: async () => allowedWorkerControl("assisted"),
      listDueJobsImpl: async () => [{ jobId: "job-e5-1" }],
      reserveSlotImpl: async () => ({ reserved: true }),
      claimJobImpl: async () => ({
        claimed: true,
        job: {
          jobId: "job-e5-1",
          eventId: "evt-e5-1",
          command: "Prüfe das Produkt intern.",
          capability: "product_data",
          priority: "medium",
        },
      }),
      getEventImpl: async () => validEvent(),
      executeClaimImpl: async () => outcome,
      finishJobImpl: async () => ({
        jobId: "job-e5-1",
        eventType: "nova.product.created",
        status: storedStatus,
        attempts: 1,
        pipelineHandoff: storedStatus === "SUCCESS" ? { status: "PENDING", attempts: 0 } : undefined,
      }),
      recordOutcomeImpl: async () => ({
        paused: false,
        metering: { estimatedCostEur: 0, totalTokens: 0 },
      }),
      pipelineStartImpl: async () => {
        pipelineCalls += 1;
        return { attempted: true, delivered: true, skipped: false, pipelineJobId: "pipeline-1" };
      },
    },
    pipelineCalls: () => pipelineCalls,
  };
}

test("E5 is disabled by default; assisted allows internal pipeline but not draft; autopilot allows draft only", async () => {
  const redis = createRedisHarness();
  const options = {
    env: PRICED_ENV,
    fetchImpl: redis.fetchImpl,
    now: "2026-08-13T01:00:00.000Z",
  };

  let snapshot = await getJarvisPipelineControlSnapshot(options);
  assert.equal(snapshot.pipeline.enabled, false);
  assert.equal(snapshot.permissions.internalPipelineAllowed, false);
  assert.equal(snapshot.permissions.ebayDraftAllowed, false);
  assert.equal(snapshot.permissions.livePublishingAllowed, false);

  await saveJarvisPipelineControl({ enabled: true }, options);
  snapshot = await getJarvisPipelineControlSnapshot(options);
  assert.equal(snapshot.control.mode, "assisted");
  assert.equal(snapshot.permissions.internalPipelineAllowed, true);
  assert.equal(snapshot.permissions.ebayDraftAllowed, false);
  assert.ok(snapshot.reasons.includes("draft_requires_autopilot"));

  await updateJarvisControl({ mode: "autopilot" }, options);
  snapshot = await getJarvisPipelineControlSnapshot(options);
  assert.equal(snapshot.control.mode, "autopilot");
  assert.equal(snapshot.permissions.internalPipelineAllowed, true);
  assert.equal(snapshot.permissions.ebayDraftAllowed, true);
  assert.equal(snapshot.permissions.livePublishingAllowed, false);

  await updateJarvisControl({ killSwitch: true }, options);
  snapshot = await getJarvisPipelineControlSnapshot(options);
  assert.equal(snapshot.permissions.internalPipelineAllowed, false);
  assert.equal(snapshot.permissions.ebayDraftAllowed, false);
  assert.equal(snapshot.permissions.livePublishingAllowed, false);
  assert.ok(snapshot.reasons.includes("kill_switch"));
});

test("E5 public control snapshot never grants live publishing or other protected external actions", () => {
  const snapshot = publicSnapshot({
    pipeline: { enabled: true },
    control: { mode: "autopilot", killSwitch: false, pausedByGuard: false, state: "active" },
    permissions: {
      internalPipelineAllowed: true,
      ebayDraftAllowed: true,
      livePublishingAllowed: true,
      supplierOrdersAllowed: true,
      customerMessagesAllowed: true,
      refundsAllowed: true,
      legalDataChangesAllowed: true,
    },
    reasons: [],
  });
  assert.equal(snapshot.permissions.internalPipelineAllowed, true);
  assert.equal(snapshot.permissions.ebayDraftAllowed, true);
  assert.equal(snapshot.permissions.livePublishingAllowed, false);
  assert.equal(snapshot.permissions.supplierOrdersAllowed, false);
  assert.equal(snapshot.permissions.customerMessagesAllowed, false);
  assert.equal(snapshot.permissions.refundsAllowed, false);
  assert.equal(snapshot.permissions.legalDataChangesAllowed, false);
});

test("E5 Company OS bridge only accepts the canonical company-os Nova-created event", async () => {
  assert.equal(isPipelineStartEvent(validEvent()), true);
  assert.equal(isPipelineStartEvent({ ...validEvent(), type: "order.created" }), false);
  assert.equal(isPipelineStartEvent({ ...validEvent(), source: "browser" }), false);
  assert.equal(isPipelineStartEvent({ ...validEvent(), subjectId: "", sourceId: "" }), false);

  let fetchCalls = 0;
  const blocked = await dispatchCompanyOsPipelineStart(validEvent(), {
    env: { ELYON_BRIDGE_SECRET: "secret" },
    controlSnapshotImpl: async () => ({
      pipeline: { enabled: true },
      control: { mode: "manual" },
      permissions: { internalPipelineAllowed: false },
      reasons: ["manual_mode"],
    }),
    fetchImpl: async () => { fetchCalls += 1; throw new Error("must not fetch"); },
  });
  assert.equal(blocked.skipped, true);
  assert.equal(blocked.reason, "manual_mode");
  assert.equal(fetchCalls, 0);
});

test("E5 Company OS bridge uses only the server bridge secret and sends a bounded pipeline-start payload", async () => {
  let request = null;
  const result = await dispatchCompanyOsPipelineStart(validEvent(), {
    env: {
      ELYON_BRIDGE_SECRET: "server-only-secret",
      ELYON_COMPANY_OS_URL: "https://company-os.example",
    },
    controlSnapshotImpl: async () => ({
      pipeline: { enabled: true },
      control: { mode: "assisted" },
      permissions: { internalPipelineAllowed: true },
      reasons: [],
    }),
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, job: { id: "pipeline-job-1" }, reused: false }),
      };
    },
  });

  assert.equal(result.delivered, true);
  assert.equal(result.pipelineJobId, "pipeline-job-1");
  assert.equal(request.url, "https://company-os.example/api/jarvis-pipeline-start");
  assert.equal(request.options.headers["X-Elyon-Bridge-Secret"], "server-only-secret");
  assert.deepEqual(request.body, {
    productId: "product-123",
    source: "jarvis",
    sourceEventId: "evt-e5-1",
    correlationId: "corr-e5-1",
  });
  assert.equal(Object.prototype.hasOwnProperty.call(request.body, "command"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(request.body, "token"), false);
});

test("E5 bridge retries a pending reservation with unchanged event identity and accepts a confirmed job", async () => {
  const requests = [];
  const result = await dispatchCompanyOsPipelineStart(validEvent(), {
    env: { ELYON_BRIDGE_SECRET: "test-secret" },
    controlSnapshotImpl: async () => ({ permissions: { internalPipelineAllowed: true } }),
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return requests.length === 1
        ? { ok: true, status: 202, json: async () => ({ ok: true, pending: true, jobId: "" }) }
        : { ok: true, status: 200, json: async () => ({ ok: true, reused: true, jobId: "pipeline-job-1" }) };
    },
  });
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0], requests[1]);
  assert.equal(result.delivered, true);
  assert.equal(result.pipelineJobId, "pipeline-job-1");
});

test("E5 bridge does not mark a still pending reservation as delivered", async () => {
  let calls = 0;
  const result = await dispatchCompanyOsPipelineStart(validEvent(), {
    env: { ELYON_BRIDGE_SECRET: "test-secret" },
    controlSnapshotImpl: async () => ({ permissions: { internalPipelineAllowed: true } }),
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, status: 202, json: async () => ({ ok: true, pending: true, jobId: "" }) };
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.delivered, false);
  assert.equal(result.reason, "company_os_pipeline_start_pending");
});

test("E5 bridge rejects unconfirmed and contradictory success responses", async () => {
  for (const data of [
    {},
    { ok: true },
    { ok: true, pending: true, jobId: "job-1" },
    { ok: true, job: { id: "job-1" }, jobId: "job-2" },
    { ok: false, jobId: "job-1" },
  ]) {
    const result = await dispatchCompanyOsPipelineStart(validEvent(), {
      env: { ELYON_BRIDGE_SECRET: "test-secret" },
      controlSnapshotImpl: async () => ({ permissions: { internalPipelineAllowed: true } }),
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => data }),
    });
    assert.equal(result.delivered, false);
    assert.equal(result.reason, "company_os_pipeline_start_unconfirmed");
  }
});

test("E5 worker schedules Company OS only after a successful Jarvis outcome persisted as SUCCESS", async () => {
  const success = workerHarness({
    outcome: { ok: true, blocked: false, result: { phase: "E5", runs: [] } },
    storedStatus: "SUCCESS",
  });
  const result = await runJarvisWorker(success.options);
  assert.equal(success.pipelineCalls(), 0);
  assert.equal(result.processed, 1);
  assert.equal(result.results[0].pipelineStart.delivered, false);
  assert.equal(result.results[0].pipelineStart.reason, "handoff_persisted_pending");
  assert.equal(result.safety.livePublishingAllowed, false);

  const failed = workerHarness({
    outcome: { ok: false, blocked: false, error: "agent failed", result: { phase: "E5", runs: [] } },
    storedStatus: "FAILED",
  });
  await runJarvisWorker(failed.options);
  assert.equal(failed.pipelineCalls(), 0);

  const blocked = workerHarness({
    outcome: { ok: false, blocked: true, error: "agent blocker", result: { phase: "E5", runs: [] } },
    storedStatus: "BLOCKED",
  });
  await runJarvisWorker(blocked.options);
  assert.equal(blocked.pipelineCalls(), 0);
});

function pendingJob(patch = {}) {
  return {
    jobId: "job-e5-1", eventId: validEvent().eventId, eventType: "nova.product.created",
    source: "company-os", subjectId: "product-123", sourceId: "product-123",
    executionPolicy: "auto_internal", autoExecute: true, status: "SUCCESS",
    attempts: 1, pipelineHandoff: { status: "PENDING", attempts: 0, nextRunAt: "2026-08-13T00:00:00.000Z" },
    ...patch,
  };
}

test("E5 handoff recovery never reruns the successful agent or reserves a model slot", async () => {
  const job = pendingJob();
  const control = allowedWorkerControl("autopilot");
  let calls = 0;
  const result = await runJarvisWorker({
    env: {}, controlSnapshotImpl: async () => control,
    listDueJobsImpl: async () => [job],
    claimJobImpl: async () => ({ claimed: true, handoffOnly: true, owner: "lease-1", job }),
    getEventImpl: async () => validEvent(),
    reserveSlotImpl: async () => { throw Error("must not reserve a model slot"); },
    executeClaimImpl: async () => { throw Error("must not rerun agent"); },
    recordOutcomeImpl: async () => { throw Error("must not meter agent again"); },
    pipelineStartImpl: async (event) => {
      calls++;
      assert.equal(event.eventId, job.eventId);
      return { attempted: true, delivered: true, pipelineJobId: "pipeline-1" };
    },
    finishHandoffImpl: async (_claim, outcome) => ({
      ...job, pipelineHandoff: { status: "DELIVERED", pipelineJobId: outcome.pipelineJobId },
    }),
  });
  assert.equal(calls, 1);
  assert.equal(result.results[0].pipelineHandoff.status, "DELIVERED");
  assert.equal(result.results[0].estimatedCostEur, 0);
});

test("E5 handoff recovery refuses a mismatched persisted event identity", async () => {
  const job = pendingJob();
  const result = await runJarvisWorker({
    env: {}, controlSnapshotImpl: async () => allowedWorkerControl("autopilot"),
    listDueJobsImpl: async () => [job],
    claimJobImpl: async () => ({ claimed: true, handoffOnly: true, owner: "lease-1", job }),
    getEventImpl: async () => ({ ...validEvent(), subjectId: "other-product" }),
    executeClaimImpl: async () => { throw Error("must not rerun agent"); },
    pipelineStartImpl: async () => { throw Error("must not dispatch"); },
    finishHandoffImpl: async (_claim, outcome) => ({
      ...job, pipelineHandoff: { status: "NEEDS_REVIEW", lastError: outcome.reason },
    }),
  });
  assert.equal(result.results[0].pipelineHandoff.lastError, "handoff_event_identity_missing");
});

function createHandoffRedisHarness(initialJob, initialOwner) {
  const values = new Map([[JOB_PREFIX + initialJob.jobId, JSON.stringify(initialJob)]]);
  const due = new Map();
  if (initialOwner) values.set(LEASE_PREFIX + initialJob.jobId, initialOwner);
  return {
    values, due,
    fetchImpl: async (_url, options) => {
      const [op, ...args] = JSON.parse(options.body);
      let result;
      if (op === "GET") result = values.get(args[0]) ?? null;
      else if (op === "SET") {
        if (args.includes("NX") && values.has(args[0])) result = null;
        else { values.set(args[0], args[1]); result = "OK"; }
      } else if (op === "MGET") result = args.map(key => values.get(key) ?? null);
      else if (op === "ZRANGEBYSCORE") result = [...due.entries()].filter(([, score]) => score <= Number(args[2])).map(([id]) => id).slice(0, args[5]);
      else if (op === "ZREVRANGE") result = [];
      else if (op === "DEL") { values.delete(args[0]); result = 1; }
      else if (op === "EVAL") {
        const [script, count, jobKey, leaseKey, index, owner, record, pending, score, id] = args;
        assert.equal(count, 3);
        assert.equal(index, HANDOFF_INDEX);
        assert.match(script, /redis.call\('GET', KEYS\[2\]\)/);
        if (values.get(leaseKey) !== owner) result = 0;
        else {
          values.set(jobKey, record);
          if (pending === "1") due.set(id, Number(score)); else due.delete(id);
          values.delete(leaseKey);
          result = 1;
        }
      } else throw Error("unexpected Redis command " + op);
      return { ok: true, json: async () => ({ result }) };
    },
  };
}

test("E5 durable handoff survives recent-index eviction and retries independently", async () => {
  const running = pendingJob({ status: "RUNNING", pipelineHandoff: undefined, leaseOwner: "review-lease" });
  const redis = createHandoffRedisHarness(running, "review-lease");
  const now = "2026-08-13T00:00:00.000Z";
  const opts = { env: PRICED_ENV, fetchImpl: redis.fetchImpl, now };
  const stored = await finishJarvisWorkerJob({ owner: "review-lease", job: running }, { ok: true, result: { summary: "ok" } }, opts);
  assert.equal(stored.status, "SUCCESS");
  assert.equal(stored.pipelineHandoff.status, "PENDING");
  assert.ok(redis.due.has(stored.jobId));
  assert.equal((await listDueJarvisWorkerJobs(opts))[0].jobId, stored.jobId);
  const claim = await claimJarvisWorkerJob(stored.jobId, { ...opts, owner: "handoff-lease" });
  assert.equal(claim.handoffOnly, true);
  assert.equal(claim.job.attempts, 1);
  assert.equal(claim.job.pipelineHandoff.attempts, 1);
  const retry = await finishJarvisPipelineHandoff(claim, { attempted: true, delivered: false, status: 503, reason: "unavailable" }, opts);
  assert.equal(retry.pipelineHandoff.status, "PENDING");
  assert.equal((await listDueJarvisWorkerJobs(opts)).length, 0);
  const later = { ...opts, now: "2026-08-13T00:02:00.000Z", owner: "handoff-lease-2" };
  const next = await claimJarvisWorkerJob(stored.jobId, later);
  assert.equal(next.job.pipelineHandoff.attempts, 2);
  await assert.rejects(finishJarvisPipelineHandoff(claim, { delivered: true, pipelineJobId: "stale" }, later), /Lease/);
  const done = await finishJarvisPipelineHandoff(next, { attempted: true, delivered: true, pipelineJobId: "pipeline-1" }, later);
  assert.equal(done.pipelineHandoff.status, "DELIVERED");
  assert.equal(done.pipelineHandoff.pipelineJobId, "pipeline-1");
  assert.equal(redis.due.size, 0);
});

test("E5 exhausted handoffs stop for review and do not create another model or bridge call", async () => {
  const job = pendingJob({
    pipelineHandoff: { status: "PENDING", attempts: 3, nextRunAt: "2026-08-13T00:00:00.000Z" },
  });
  const redis = createHandoffRedisHarness(job);
  const opts = { env: PRICED_ENV, fetchImpl: redis.fetchImpl, now: "2026-08-13T00:00:00.000Z", owner: "last-lease" };
  const claim = await claimJarvisWorkerJob(job.jobId, opts);
  assert.equal(claim.handoffExhausted, true);
  const result = await runJarvisWorker({
    env: {}, controlSnapshotImpl: async () => allowedWorkerControl("autopilot"),
    listDueJobsImpl: async () => [job],
    claimJobImpl: async () => claim,
    executeClaimImpl: async () => { throw Error("must not rerun agent"); },
    getEventImpl: async () => { throw Error("must not load event"); },
    pipelineStartImpl: async () => { throw Error("must not dispatch"); },
    finishHandoffImpl: (claim, outcome) => finishJarvisPipelineHandoff(claim, outcome, opts),
  });
  assert.equal(result.results[0].pipelineHandoff.status, "NEEDS_REVIEW");
  assert.equal(result.results[0].pipelineHandoff.lastError.code, "handoff_attempts_exhausted");
  assert.equal(redis.due.size, 0);
});

test("E5 UI remains plan/control only and bootstrap keeps the single lazy Jarvis startup", async () => {
  const [api, store, bridge, worker, ui, bootstrap, prepare] = await Promise.all([
    readFile(pipelineApiUrl, "utf8"),
    readFile(pipelineStoreUrl, "utf8"),
    readFile(bridgeUrl, "utf8"),
    readFile(workerUrl, "utf8"),
    readFile(uiUrl, "utf8"),
    readFile(bootstrapUrl, "utf8"),
    readFile(prepareUrl, "utf8"),
  ]);

  assert.doesNotThrow(() => new vm.Script(ui));
  assert.match(api, /requireSellerAccess/);
  assert.match(api, /validateBridgeAccess/);
  assert.match(api, /livePublishingAllowed:\s*false/);
  assert.match(store, /ebayDraftAllowed/);
  assert.match(store, /mode === "autopilot"/);
  assert.match(store, /livePublishingAllowed:\s*false/);
  assert.match(bridge, /X-Elyon-Bridge-Secret/);
  assert.match(bridge, /getJarvisPipelineControlSnapshot/);
  assert.match(worker, /outcome\.ok === true && stored\.status === "SUCCESS"/);
  assert.match(worker, /dispatchCompanyOsPipelineStart/);
  assert.match(worker, /livePublishingAllowed:\s*false/);

  assert.match(ui, /\/api\/jarvis-pipeline-control/);
  assert.match(ui, /eBay ENTWURF/);
  assert.match(ui, /STOPP \/ Prüfung/);
  assert.doesNotMatch(ui, /\/api\/jarvis-worker|\/api\/ebay\/create-draft|publish_listing/);
  assert.doesNotMatch(ui, /setInterval|MutationObserver/);

  assert.match(bootstrap, /seller-jarvis-e5-pipeline\.js/);
  assert.match(bootstrap, /phase-e5-v1/);
  assert.equal((bootstrap.match(/seller-jarvis-bootstrap/g) || []).length, 0);
  assert.match(prepare, /seller-jarvis-e5-pipeline\.js/);
  assert.match(prepare, /one-script Jarvis D1\/D2\/D3\/E1\/E4\/E5 bootstrap/);
});


test("E5 worker uses the shared local queue only when Nova has no due work and control permits execution",async()=>{
  const control=allowedWorkerControl("autopilot");
  let invocations=0;
  const result=await runJarvisWorker({
    env:{},controlSnapshotImpl:async()=>control,listDueJobsImpl:async()=>[],
    executeClaimImpl:async()=>assert.fail("Nova execution without job"),
    pipelineStartImpl:async()=>assert.fail("local queue must not dispatch Company OS"),
    runQueuedLocalMarginImpl:async options=>{invocations++;assert.equal(options.snapshot,control);assert.equal(await options.refreshControl(),control);return {status:"completed",processed:1};},
  });
  assert.equal(invocations,1);
  assert.equal(result.workforceQueue.processed,1);
  assert.equal(result.processed,0);
  const nova=workerHarness({outcome:{ok:true,blocked:false,result:{phase:"E5",runs:[]}},storedStatus:"SUCCESS"});
  const busy=await runJarvisWorker({...nova.options,runQueuedLocalMarginImpl:async()=>assert.fail("Nova must retain priority")});
  assert.equal(busy.workforceQueue.status,"nova_priority");
  assert.equal(busy.processed,1);
  await runJarvisWorker({env:{},controlSnapshotImpl:async()=>({control:{mode:"manual"},decision:{allowed:false}}),listDueJobsImpl:async()=>assert.fail("paused scan"),runQueuedLocalMarginImpl:async()=>assert.fail("paused dispatch")});
});
