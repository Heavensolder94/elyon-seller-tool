import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runClaimedRegistryExecution, listWorkforceExecutionHistory, recordWorkforceExecution, WORKFORCE_REGISTRY_REQUEST, WORKFORCE_DELEGATED_REQUEST } from "../lib/ai-workforce-runtime.js";
import { JARVIS_NOVA_LOCAL_ONLY } from "../lib/elyon-jarvis-e5-v2-policy.js";

const nowMs = Date.parse("2026-11-28T00:00:00Z");
const base = { id: "browser-task-1", agentId: "elyon-product-data-checker", status: "approval_required", provider: "local", model: "local-fallback", durationMs: 4, sourceId: "private-source-id", title: "private title", result: { status: "manualReviewRequired", summary: "private result" }, inputSnapshot: { secret: "private secret" } };
function harness() {
  const calls = [];
  const request = async (path, options) => {
    const rows = JSON.parse(options.body);
    calls.push({ path, rows, method: options.method });
    return rows.map(row => ({ id: row.id }));
  };
  return { request, calls };
}

test("one canonical runtime identity preserves original task and records only metadata in existing tables", async () => {
  const { request, calls } = harness();
  const original = { ok: true, task: base, result: base.result };
  const result = await recordWorkforceExecution({ [WORKFORCE_REGISTRY_REQUEST]: true }, original, 200, { persistence: "enabled", request, nowMs });
  assert.equal(result.task.id, base.id);
  assert.equal(result.task.status, "approval_required");
  assert.equal(result.task.agentId, base.agentId);
  assert.equal(result.runtime.agentId, "elyon-product-data-specialist");
  assert.equal(result.runtime.origin, "registry");
  assert.equal(result.runtime.journal, "recorded");
  assert.equal(result.task.runtime.runId, result.runtime.runId);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].path, "/rest/v1/jarvis_tasks?select=id");
  assert.equal(calls[1].path, "/rest/v1/jarvis_agent_runs?select=id");
  assert.equal(calls[0].rows[0].status, "completed");
  assert.equal(calls[0].rows[0].payload.taskState, "approval_required");
  assert.equal(calls[1].rows[0].task_id, result.runtime.taskId);
  assert.equal(calls[1].rows[0].cost, null);
  assert.doesNotMatch(JSON.stringify(calls), /private|browser-task-1/);
  assert.equal(original.runtime, undefined);
});

test("manager records each child once and links it to the parent runtime task", async () => {
  const { request, calls } = harness();
  const child = { ...base, id: "child-1", agentId: "elyon-profit-specialist", status: "blocked", result: { status: "blocked" } };
  const skipped = await recordWorkforceExecution({ [WORKFORCE_DELEGATED_REQUEST]: true }, { ok: true, task: child }, 200, { persistence: "enabled", request });
  assert.equal(skipped.runtime, undefined);
  assert.equal(calls.length, 0);
  const result = await recordWorkforceExecution({}, { ok: true, task: { ...base, agentId: "elyon-manager" }, childTasks: [child] }, 200, { persistence: "enabled", request, nowMs });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].rows.length, 2);
  assert.equal(calls[1].rows.length, 2);
  assert.equal(result.childTasks[0].runtime.parentTaskId, result.runtime.taskId);
  assert.equal(result.childTasks[0].runtime.origin, "manager_delegation");
  assert.equal(result.childTasks[0].status, "blocked");
  assert.equal(calls[0].rows[1].output.resultState, "blocked");
  const duplicate = await recordWorkforceExecution({}, result, 200, { persistence: "enabled", request });
  assert.equal(duplicate, result);
  assert.equal(calls.length, 2);
});

test("failed writes do not erase outcomes or misrepresent journal persistence", async () => {
  let calls = 0;
  const request = async (_path, options) => {
    calls++;
    if (calls === 2) throw Error("private database error");
    return JSON.parse(options.body).map(row => ({ id: row.id }));
  };
  const result = await recordWorkforceExecution({ [JARVIS_NOVA_LOCAL_ONLY]: true }, { ok: false, task: { ...base, status: "failed" } }, 502, { persistence: "enabled", request, nowMs });
  assert.equal(result.runtime.origin, "nova_worker");
  assert.equal(result.runtime.journal, "partial");
  assert.equal(result.ok, false);
  assert.equal(result.task.status, "failed");
  assert.equal(calls, 2);
  assert.doesNotMatch(JSON.stringify(result.runtime), /private database error/);
  const unconfirmed = await recordWorkforceExecution({}, { ok: true, task: base }, 200, { persistence: "enabled", request: async () => [] });
  assert.equal(unconfirmed.runtime.journal, "unconfirmed");
});

test("test and preview environments never write production journal data", async () => {
  for (const env of [{ VERCEL_ENV: "production", NODE_TEST_CONTEXT: "child-v8", SUPABASE_URL: "test", SUPABASE_SERVICE_ROLE_KEY: "test" }, { VERCEL_ENV: "preview", SUPABASE_URL: "test", SUPABASE_SERVICE_ROLE_KEY: "test" }]) {
    const result = await recordWorkforceExecution({}, { ok: true, task: base }, 200, { env, request: async () => { assert.fail("journal must not write"); } });
    assert.equal(result.runtime.journal, "disabled");
  }
});

test("registry, direct handlers and manager delegation share the same runtime without another route", async () => {
  const paths = ["../api/ai-agent-run-registry.js", "../api/ai-agent-run-advanced.js", "../api/ai-agent-run-custom.js", "../api/ai-workforce-v2.js"];
  const [registry, advanced, custom, manager] = await Promise.all(paths.map(path => readFile(new URL(path, import.meta.url), "utf8")));
  assert.match(registry, /req\[WORKFORCE_REGISTRY_REQUEST\] = true/);
  for (const source of [advanced, custom, manager]) assert.match(source, /return respondWithWorkforceExecution\(req, res,/);
  assert.match(manager, /\[WORKFORCE_DELEGATED_REQUEST\]: true/);
});


test("history is bounded, distinguishes partial records and exposes no raw payload or hashes", async () => {
  const { request, calls } = harness();
  await recordWorkforceExecution({}, { ok: true, task: base }, 200, { persistence: "enabled", request, nowMs });
  const row = calls[0].rows[0];
  const run = calls[1].rows[0];
  const history = await listWorkforceExecutionHistory({ persistence: "enabled", limit: 1000, request: async (path, options) => {
    assert.match(path, /type=eq\.workforce-agent-execution/);
    assert.match(path, /limit=50$/);
    assert.equal(options.method, "GET");
    return [{ ...row, jarvis_agent_runs: [run] }, { ...row, jarvis_agent_runs: [] }, { ...row, payload: { version: 1, agentId: "constructor" } }];
  } });
  assert.equal(history.available, true);
  assert.equal(history.entries.length, 2);
  assert.equal(history.entries[0].agentId, "elyon-product-data-specialist");
  assert.equal(history.entries[0].taskState, "approval_required");
  assert.equal(history.entries[0].journal, "recorded");
  assert.equal(history.entries[1].journal, "partial");
  assert.doesNotMatch(JSON.stringify(history), /Fingerprint|private|browser-task/);
  const failure = await listWorkforceExecutionHistory({ persistence: "enabled", request: async () => { throw Error("private error"); } });
  assert.equal(failure.available, false);
  assert.equal(failure.status, "unverified");
});


function claimHarness() {
  const tasks = new Map();
  const runs = [];
  const request = async (path, options) => {
    const body = options.body ? JSON.parse(options.body) : null;
    if (options.method === "POST" && path.includes("/jarvis_tasks?")) {
      for (const row of body) if (tasks.has(row.id)) throw Object.assign(Error("duplicate"), { status: 409 });
      for (const row of body) tasks.set(row.id, { ...row });
      return body.map(row => ({ id: row.id }));
    }
    if (options.method === "PATCH") {
      const id = /id=eq\.([^&]+)/.exec(path)?.[1];
      const current = tasks.get(id);
      if (current?.status !== "running") return [];
      tasks.set(id, { ...current, ...body });
      return [{ id }];
    }
    if (options.method === "POST" && path.includes("/jarvis_agent_runs?")) {
      runs.push(...body);
      return body.map(row => ({ id: row.id }));
    }
    if (options.method === "GET") {
      const id = /id=eq\.([^&]+)/.exec(path)?.[1];
      return id ? (tasks.has(id) ? [tasks.get(id)] : []) : [...tasks.values()];
    }
    throw Error("unexpected request");
  };
  return { tasks, runs, request };
}
function responseCapture() {
  return { code: 200, payload: null, status(code) { this.code = code; return this; }, json(value) { this.payload = value; return this; }, setHeader() { return this; } };
}
const registryRequest = key => ({ [WORKFORCE_REGISTRY_REQUEST]: true, headers: key ? { "idempotency-key": key } : {} });

test("registry atomically claims before execution and prevents overlapping or repeated keyed calls", async () => {
  const { tasks, runs, request } = claimHarness();
  const key = "test-request-opaque-001";
  let executions = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const options = { persistence: "enabled", request, nowMs };
  const handler = async (_req, res) => {
    executions++;
    assert.equal([...tasks.values()][0].status, "running");
    await gate;
    return res.status(200).json({ ok: true, task: base });
  };
  const first = responseCapture();
  const firstRun = runClaimedRegistryExecution(registryRequest(key), first, base.agentId, handler, options);
  await new Promise(resolve => setImmediate(resolve));
  const duplicate = responseCapture();
  await runClaimedRegistryExecution(registryRequest(key), duplicate, base.agentId, handler, options);
  assert.equal(duplicate.code, 409);
  assert.equal(executions, 1);
  release();
  await firstRun;
  assert.equal(first.payload.runtime.journal, "recorded");
  assert.equal(first.payload.runtime.taskId, duplicate.payload.runtime.taskId);
  assert.equal(tasks.get(first.payload.runtime.taskId).status, "completed");
  assert.equal(runs.length, 1);
  assert.equal(runs[0].task_id, first.payload.runtime.taskId);
  const repeated = responseCapture();
  await runClaimedRegistryExecution(registryRequest(key), repeated, base.agentId, handler, options);
  assert.equal(repeated.code, 409);
  assert.equal(executions, 1);
  assert.doesNotMatch(JSON.stringify([...tasks.values()]), /test-request-opaque-001/);
});

test("keyed requests fail closed when reservation is uncertain; unkeyed compatibility remains", async () => {
  let executions = 0;
  const handler = async (_req, res) => { executions++; return res.status(200).json({ ok: true, task: base }); };
  const request = async () => { throw Error("unavailable"); };
  const options = { persistence: "enabled", request, nowMs };
  const keyed = responseCapture();
  await runClaimedRegistryExecution(registryRequest("test-request-opaque-002"), keyed, base.agentId, handler, options);
  assert.equal(keyed.code, 503);
  assert.equal(executions, 0);
  const malformed = responseCapture();
  await runClaimedRegistryExecution(registryRequest("bad"), malformed, base.agentId, handler, options);
  assert.equal(malformed.code, 400);
  assert.equal(executions, 0);
  const legacy = responseCapture();
  await runClaimedRegistryExecution(registryRequest(null), legacy, base.agentId, handler, options);
  assert.equal(legacy.code, 200);
  assert.equal(executions, 1);
});

test("registry exceptions finish the claimed task as failed without rerunning the agent", async () => {
  const { tasks, runs, request } = claimHarness();
  const response = responseCapture();
  await runClaimedRegistryExecution(registryRequest("test-request-opaque-003"), response, base.agentId, async () => { throw Error("secret provider error"); }, { persistence: "enabled", request, nowMs });
  assert.equal(response.code, 500);
  assert.equal(response.payload.runtime.journal, "recorded");
  assert.equal(tasks.get(response.payload.runtime.taskId).status, "failed");
  assert.equal(runs[0].status, "failed");
  assert.doesNotMatch(JSON.stringify(response.payload), /secret provider error/);
});

test("history identifies stale running attempts without automatically retrying them", async () => {
  const { tasks, request } = claimHarness();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const running = runClaimedRegistryExecution(registryRequest(null), responseCapture(), base.agentId, async (_req, res) => { await gate; return res.status(200).json({ ok: true, task: base }); }, { persistence: "enabled", request, nowMs });
  await new Promise(resolve => setImmediate(resolve));
  const fresh = await listWorkforceExecutionHistory({ persistence: "enabled", request, nowMs });
  assert.equal(fresh.entries[0].status, "running");
  assert.equal(fresh.entries[0].journal, "in_progress");
  const stale = await listWorkforceExecutionHistory({ persistence: "enabled", request, nowMs: nowMs + 16 * 60000 });
  assert.equal(stale.entries[0].status, "interrupted_unconfirmed");
  assert.equal([...tasks.values()][0].status, "running");
  release();
  await running;
});
