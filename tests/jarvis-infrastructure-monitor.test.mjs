import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { recordInfrastructureCycle, readInfrastructureStatus, INFRA_KEY, INTERVAL_SECONDS } from "../lib/jarvis-infrastructure-monitor.js";

const start = Date.parse("2026-11-28T00:00:00Z");
const env = { SUPABASE_URL: "https://example.invalid", SUPABASE_SERVICE_ROLE_KEY: "test-only-secret" };

function harness() {
  let lock = null;
  let until = 0;
  const state = {};
  const command = async ([op, script, ...args]) => {
    const answer = result => ({ configured: true, data: { result } });
    if (op === "HMGET") {
      assert.equal(script, INFRA_KEY);
      return answer(args.map(key => state[key] ?? null));
    }
    assert.equal(op, "EVAL");
    assert.equal(args[0], "2");
    assert.equal(args[1], INFRA_KEY);
    const time = Number(args[3]);
    if (args.length === 6) {
      if (time >= Number(state.lastCronMs || 0)) {
        state.lastCronMs = String(time);
        state.lastCronOk = args[4];
      }
      if (args[4] === "1" && time >= Number(state.lastSuccessMs || 0)) state.lastSuccessMs = String(time);
      if (lock !== null && time < until) return answer(0);
      lock = String(time);
      until = time + Number(args[5]) * 1000;
      return answer(1);
    }
    if (lock !== String(time)) return answer(0);
    state.lastCheckMs = String(time);
    state.checks = args[4];
    return answer(1);
  };
  return { command, state };
}

test("cron records every attempt but checks infrastructure only once every six hours", async () => {
  const { command, state } = harness();
  const queries = [];
  let cloudflareCalls = 0;
  const request = async (path, init) => {
    if (path === "/rest/v1/rpc/jarvis_workforce_storage_health") return { databaseBytes: 12569747, taskTableBytes: 229376, runTableBytes: 253952, retentionDays: 90, archiveCandidates: 0 };
    assert.match(path, /^\/rest\/v1\/jarvis_[a-z_]+\?select=id&limit=1$/);
    assert.equal(init.method, "GET");
    assert.ok(init.signal);
    queries.push(path);
    return [{ id: "private-db-id" }];
  };
  const fetchImpl = async (url, init) => {
    cloudflareCalls++;
    assert.match(url, /\.workers\.dev\/runtime\/health$/);
    assert.equal(init.redirect, "error");
    assert.equal(init.headers.Authorization, undefined);
    return { ok: true, json: async () => ({ ok: true, service: "jarvis-task-runtime", queue: "configured" }) };
  };
  const args = { env, command, request, fetchImpl };
  const first = await recordInfrastructureCycle({ ...args, nowMs: start, workerOk: true });
  assert.equal(first.checked, true);
  assert.equal(queries.length, 4);
  assert.equal(cloudflareCalls, 1);
  const second = await recordInfrastructureCycle({ ...args, nowMs: start + 300000, workerOk: false });
  assert.equal(second.checked, false);
  assert.equal(queries.length, 4);
  assert.equal(cloudflareCalls, 1);
  const status = await readInfrastructureStatus({ env, command, nowMs: start + 300000 });
  assert.equal(status.cron.status, "degraded");
  assert.equal(status.cron.lastSuccessAt, new Date(start).toISOString());
  assert.equal(status.checks.supabase.status, "online");
  assert.equal(status.checks.cloudflare.status, "online");
  assert.doesNotMatch(JSON.stringify(state), /private-db-id|test-only-secret/);
  const next = await recordInfrastructureCycle({ ...args, nowMs: start + INTERVAL_SECONDS * 1000, workerOk: true });
  assert.equal(next.checked, true);
  assert.equal(queries.length, 8);
  assert.equal(cloudflareCalls, 2);
});

test("partial reads, missing queue, timeout and stale evidence cannot report healthy", async () => {
  const { command } = harness();
  const request = async path => {
    if (path.includes("jarvis_tasks")) throw Object.assign(Error("private detail"), { status: 503 });
    return path.includes("jarvis_memory") ? {} : [];
  };
  const fetchImpl = async () => ({ ok: true, json: async () => ({ ok: true, service: "jarvis-task-runtime", queue: "missing" }) });
  await recordInfrastructureCycle({ env, command, request, fetchImpl, nowMs: start, workerOk: true });
  const status = await readInfrastructureStatus({ env, command, nowMs: start });
  assert.equal(status.checks.supabase.status, "degraded");
  assert.equal(status.checks.supabase.stores.jarvis_tasks, "http_503");
  assert.equal(status.checks.supabase.stores.jarvis_memory, "invalid_response");
  assert.equal(status.checks.cloudflare.status, "degraded");
  assert.equal(status.checks.cloudflare.reason, "queue_not_confirmed");
  assert.doesNotMatch(JSON.stringify(status), /private detail/);
  const stale = await readInfrastructureStatus({ env, command, nowMs: start + 8 * 3600000 });
  assert.equal(stale.stale, true);
  assert.equal(stale.cron.status, "unverified");
  assert.equal(stale.checks.supabase.status, "unverified");
  assert.equal(stale.checks.supabase.lastStatus, "degraded");
});

test("monitor storage outage never triggers unthrottled probes or reports confirmed checks", async () => {
  let probes = 0;
  const command = async () => { throw Error("private Redis failure"); };
  const result = await recordInfrastructureCycle({ env, command, request: async () => { probes++; }, fetchImpl: async () => { probes++; }, nowMs: start });
  assert.equal(result.ok, false);
  assert.equal(probes, 0);
  const status = await readInfrastructureStatus({ env, command, nowMs: start });
  assert.equal(status.available, false);
  assert.equal(status.cron.status, "unverified");
  assert.doesNotMatch(JSON.stringify(status), /private Redis failure/);
});

test("concurrent cron completions share one six-hour check window", async () => {
  const { command } = harness();
  let probes = 0;
  const args = { env, command, nowMs: start, workerOk: true,
    request: async () => { probes++; return []; },
    fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, service: "jarvis-task-runtime", queue: "configured" }) }) };
  const results = await Promise.all([recordInfrastructureCycle(args), recordInfrastructureCycle(args)]);
  assert.equal(results.filter(result => result.checked).length, 1);
  assert.equal(probes, 5);
});

test("existing authenticated cron and status UI are reused without a new scheduled route", async () => {
  const [cron, api, ui, config] = await Promise.all(["../api/jarvis-worker.js", "../api/jarvis-system-status.js", "../seller-jarvis-integration-center.js", "../vercel.json"].map(path => readFile(new URL(path, import.meta.url), "utf8")));
  assert.ok(cron.indexOf("if (!access.ok)") < cron.indexOf("await recordInfrastructureCycle"));
  assert.match(cron, /recordInfrastructureCycle\(\{ env, workerOk:/);
  assert.match(api, /infrastructureReader: readInfrastructureStatus/);
  assert.match(ui, /Supabase · automatisch/);
  assert.match(ui, /Letzter erfolgreicher Aufruf/);
  assert.match(ui, /Kein Queue-Ausführungstest/);
  assert.equal(JSON.parse(config).crons.find(job => job.path === "/api/jarvis-worker").schedule, "*/5 * * * *");
  assert.equal(JSON.parse(config).crons.filter(job => /infrastructure/i.test(job.path)).length, 0);
});


test("storage budget thresholds use the measured database bytes and never schedule deletions", async () => {
  for (const [databaseBytes, expected] of [[349999999, "online"], [350000000, "warning"], [425000000, "critical"]]) {
    const { command } = harness();
    const calls = [];
    const request = async (path, init) => {
      calls.push({path, method: init.method});
      if (path.includes("/rpc/")) return { databaseBytes, taskTableBytes: 1000, runTableBytes: 1000, retentionDays: 90, archiveCandidates: 3 };
      return [];
    };
    await recordInfrastructureCycle({ env, command, request, nowMs: start, fetchImpl: async () => ({ok:true,json:async()=>({ok:true,service:"jarvis-task-runtime",queue:"configured"})}) });
    const status = await readInfrastructureStatus({env,command,nowMs:start});
    assert.equal(status.checks.storage.status,expected);
    assert.equal(status.checks.storage.archiveCandidates,3);
    assert.equal(calls.length,5);
    assert.ok(calls.every(call => call.method === "GET" || (call.method === "POST" && call.path === "/rest/v1/rpc/jarvis_workforce_storage_health")));
    const stale = await readInfrastructureStatus({env,command,nowMs:start+8*3600000});
    assert.equal(stale.checks.storage.status,"unverified");
  }
});

test("absent storage migration or invalid RPC result does not fabricate a zero measurement", async () => {
  const {command}=harness();
  await recordInfrastructureCycle({env,command,nowMs:start,request:async path=>{if(path.includes("/rpc/"))throw Error("not installed");return [];},fetchImpl:async()=>({ok:true,json:async()=>({ok:true,service:"jarvis-task-runtime",queue:"configured"})})});
  const status=await readInfrastructureStatus({env,command,nowMs:start});
  assert.equal(status.checks.supabase.status,"online");
  assert.equal(status.checks.storage.status,"unverified");
  assert.equal(status.checks.storage.databaseBytes,undefined);
});

test("storage RPC migration grants only service role read-only inventory access",async()=>{
  const sql=await readFile(new URL("../supabase/migrations/20261128010000_jarvis_workforce_storage_health.sql",import.meta.url),"utf8");
  assert.match(sql,/security invoker/i);
  assert.match(sql,/revoke all on function .* from public, anon, authenticated/i);
  assert.match(sql,/grant execute on function .* to service_role/i);
  assert.match(sql,/t\.type = 'workforce-agent-execution'/);
  assert.match(sql,/t\.finished_at < pg_catalog\.now\(\) - interval '90 days'/);
  assert.doesNotMatch(sql.replace(/^--.*$/gm,""),/\b(delete from|truncate|insert into|update public)\b/i);
});
