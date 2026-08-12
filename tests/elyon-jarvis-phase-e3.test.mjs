import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { authorizeCron } from "../api/jarvis-worker.js";
import {
  isE3AutoInternalJob,
  retryDelayMs,
} from "../lib/elyon-jarvis-worker-store.js";
import {
  executeJarvisWorkerClaim,
  runJarvisWorker,
} from "../lib/elyon-jarvis-worker.js";

const workerApiUrl = new URL("../api/jarvis-worker.js", import.meta.url);
const eventsApiUrl = new URL("../api/jarvis-events.js", import.meta.url);
const jobsApiUrl = new URL("../api/jarvis-jobs.js", import.meta.url);
const workerUrl = new URL("../lib/elyon-jarvis-worker.js", import.meta.url);
const workerStoreUrl = new URL("../lib/elyon-jarvis-worker-store.js", import.meta.url);
const cloudUiUrl = new URL("../seller-jarvis-e1-cloud.js", import.meta.url);
const vercelUrl = new URL("../vercel.json", import.meta.url);

function safeJob(overrides = {}) {
  return {
    jobId: "job-e3-test",
    eventId: "evt-e3-test",
    eventType: "nova.product.created",
    source: "company-os",
    sourceId: "ELY-2026-E3-1",
    subjectId: "ELY-2026-E3-1",
    status: "QUEUED",
    executionPolicy: "auto_internal",
    autoExecute: true,
    command: "Prüfe das neu eingegangene Nova-Produkt vollständig und bestimme die nächsten internen Prüfschritte.",
    capability: "product_data",
    priority: "medium",
    attempts: 0,
    maxAttempts: 3,
    ...overrides,
  };
}

function safeEvent() {
  return {
    eventId: "evt-e3-test",
    type: "nova.product.created",
    source: "company-os",
    sourceId: "ELY-2026-E3-1",
    subjectId: "ELY-2026-E3-1",
    correlationId: "corr-e3-test",
    payload: {
      title: "E3 Testprodukt",
      supplierUrl: "https://supplier.invalid/e3",
      companyOsSection: "finden_nova_eingang",
      importMode: "created",
    },
  };
}

const registry = {
  agents: [{
    id: "elyon-product-data-specialist",
    name: "Elyon Product Data Specialist",
    kind: "core",
    role: "Prüft Produktdaten und Datenqualität.",
    department: "product",
    enabled: true,
    locked: true,
    autonomyMode: "auto_internal",
    capabilities: ["product_data", "product", "workflow"],
  }],
};

function allowedControl() {
  return {
    control: { mode: "assisted", killSwitch: false, pausedByGuard: false },
    decision: { allowed: true, state: "ready", reasons: [], batchLimit: 1 },
  };
}

test("E3 cron endpoint fails closed and accepts only the configured CRON_SECRET", () => {
  assert.deepEqual(authorizeCron({ headers: {} }, {}), {
    ok: false,
    status: 503,
    error: "jarvis_worker_cron_unconfigured",
  });
  assert.equal(authorizeCron({ headers: { authorization: "Bearer wrong" } }, { CRON_SECRET: "right" }).ok, false);
  assert.equal(authorizeCron({ headers: { authorization: "Bearer right" } }, { CRON_SECRET: "right" }).ok, true);
});

test("E3 autonomous scope remains restricted to Company OS nova.product.created jobs", () => {
  assert.equal(isE3AutoInternalJob(safeJob()), true);
  assert.equal(isE3AutoInternalJob(safeJob({ source: "browser" })), false);
  assert.equal(isE3AutoInternalJob(safeJob({ eventType: "order.created" })), false);
  assert.equal(isE3AutoInternalJob(safeJob({ eventType: "ebay.draft.created" })), false);
  assert.equal(retryDelayMs(1), 60_000);
  assert.equal(retryDelayMs(2), 300_000);
  assert.equal(retryDelayMs(3), 900_000);
});

test("E3 delegation still runs exactly one safe Product Data agent under E4", async () => {
  let executionBody = null;
  const outcome = await executeJarvisWorkerClaim(
    { claimed: true, owner: "lease", job: safeJob({ status: "RUNNING", attempts: 1 }) },
    safeEvent(),
    {
      internalRequest: { headers: { "x-elyon-seller-token": "server-only" } },
      listRegistryImpl: async () => registry,
      executePlanImpl: async (_req, plan, body) => {
        executionBody = body;
        assert.equal(plan.delegations.length, 1);
        assert.equal(plan.delegations[0].agentId, "elyon-product-data-specialist");
        return [{
          ok: true,
          statusCode: 200,
          agentId: "elyon-product-data-specialist",
          agentName: "Elyon Product Data Specialist",
          capability: "product_data",
          payload: {
            provider: "local",
            model: "local-fallback",
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            result: {
              status: "completed",
              summary: "Produktdaten intern geprüft.",
              blockers: [],
              warnings: [],
            },
          },
        }];
      },
    }
  );

  assert.equal(outcome.ok, true);
  assert.equal(outcome.blocked, false);
  assert.equal(outcome.result.phase, "E4");
  assert.equal(executionBody.maxAgents, 1);
  assert.equal(executionBody.stopOnBlocker, true);
  assert.equal(executionBody.sourceType, "nova.product.created");
  assert.equal(executionBody.input.product.id, "ELY-2026-E3-1");
  assert.equal(executionBody.input.product.title, "E3 Testprodukt");
  assert.equal(JSON.stringify(executionBody).includes("publish_listing"), false);
  assert.equal(JSON.stringify(executionBody).includes("place_supplier_order"), false);
});

test("E3 worker mechanics process a claimed job once when E4 control permits it and E5 handoff is available", async () => {
  const finished = [];
  const result = await runJarvisWorker({
    env: {},
    now: "2026-08-12T22:00:00.000Z",
    controlSnapshotImpl: async () => allowedControl(),
    reserveSlotImpl: async () => ({ reserved: true, hourCount: 1, dayCount: 1 }),
    recordOutcomeImpl: async () => ({ metering: { estimatedCostEur: 0, totalTokens: 0 }, paused: false }),
    listDueJobsImpl: async () => [safeJob()],
    claimJobImpl: async () => ({ claimed: true, owner: "lease-1", job: safeJob({ status: "RUNNING", attempts: 1 }) }),
    getEventImpl: async () => safeEvent(),
    executeClaimImpl: async () => ({
      ok: true,
      blocked: false,
      result: { phase: "E4", summary: { status: "completed", summary: "ok" }, runs: [] },
    }),
    finishJobImpl: async (claim, outcome) => {
      assert.equal(claim.owner, "lease-1");
      assert.equal(outcome.ok, true);
      const stored = { ...claim.job, status: "SUCCESS", result: outcome.result };
      finished.push(stored);
      return stored;
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.phase, "E5");
  assert.equal(result.processed, 1);
  assert.equal(result.results[0].status, "SUCCESS");
  assert.equal(finished.length, 1);
  assert.equal(result.safety.maxJobsPerRun, 2);
  assert.equal(result.safety.maxAgentsPerJob, 1);
  assert.equal(result.safety.livePublishingAllowed, false);
});

test("E3 wiring remains protected while E4 adds the control gate", async () => {
  const [workerApi, eventsApi, jobsApi, worker, workerStore, cloudUi, vercelRaw] = await Promise.all([
    readFile(workerApiUrl, "utf8"),
    readFile(eventsApiUrl, "utf8"),
    readFile(jobsApiUrl, "utf8"),
    readFile(workerUrl, "utf8"),
    readFile(workerStoreUrl, "utf8"),
    readFile(cloudUiUrl, "utf8"),
    readFile(vercelUrl, "utf8"),
  ]);
  const vercel = JSON.parse(vercelRaw);

  assert.match(workerApi, /CRON_SECRET/);
  assert.match(workerApi, /timingSafeEqual/);
  assert.match(workerApi, /runJarvisWorker/);
  assert.match(workerApi, /req\.method !== "GET"/);
  assert.doesNotMatch(workerApi, /requireSellerAccess/);
  assert.match(eventsApi, /armJarvisJobForWorker/);
  assert.match(eventsApi, /eventIngestionExecutesAgents: false/);
  assert.match(jobsApi, /jarvis_jobs_read_only/);
  assert.match(jobsApi, /workerEnabled: workerAllowed/);
  assert.match(jobsApi, /maxAgentsPerJob: 1/);
  assert.match(worker, /maxAgents: 1/);
  assert.match(worker, /stopOnBlocker: true/);
  assert.match(worker, /getJarvisControlSnapshot/);
  assert.match(workerStore, /nova\.product\.created/);
  assert.match(workerStore, /company-os/);
  assert.match(workerStore, /"SET", leaseKey, owner, "NX", "EX"/);
  assert.match(cloudUi, /Phase E4/);
  assert.match(cloudUi, /WORKER AKTIV/);
  assert.deepEqual(vercel.crons, [{ path: "/api/jarvis-worker", schedule: "*/5 * * * *" }]);
});
