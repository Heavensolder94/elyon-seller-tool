import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { recordWorkforceExecution, WORKFORCE_REGISTRY_REQUEST, WORKFORCE_DELEGATED_REQUEST } from "../lib/ai-workforce-runtime.js";
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
