import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { runQueuedLocalMargin, manualWorkforceQueue, runDirectWorkforceExecution, respondWithWorkforceExecution, runClaimedRegistryExecution, listWorkforceExecutionHistory, recordWorkforceExecution, WORKFORCE_REGISTRY_REQUEST, WORKFORCE_DELEGATED_REQUEST } from "../lib/ai-workforce-runtime.js";
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
  const paths = ["../api/ai-agent-run-registry.js", "../api/ai-agent-run-advanced.js", "../api/ai-agent-run-custom.js", "../api/ai-workforce-v2.js", "../api/ai-agent-run.js"];
  const [registry, advanced, custom, manager, legacy] = await Promise.all(paths.map(path => readFile(new URL(path, import.meta.url), "utf8")));
  assert.match(registry, /req\[WORKFORCE_REGISTRY_REQUEST\] = true/);
  for (const source of [advanced, custom, manager, legacy]) {
    assert.match(source, /return await runDirectWorkforceExecution\(req, res,/);
    assert.match(source, /return respondWithWorkforceExecution\((req, res|request, response),/);
  }
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
      const expected = /status=eq\.([^&]+)/.exec(path)?.[1];
      if (!current || current.status !== expected) return [];
      tasks.set(id, { ...current, ...body });
      return [{ id }];
    }
    if (options.method === "POST" && path.includes("/jarvis_agent_runs?")) {
      runs.push(...body);
      return body.map(row => ({ id: row.id }));
    }
    if (options.method === "GET") {
      const id = /id=eq\.([^&]+)/.exec(path)?.[1];
      return id ? (tasks.has(id) ? [{ ...tasks.get(id), jarvis_agent_runs: runs.filter(run => run.task_id === id) }] : []) : [...tasks.values()].filter(row=>!path.includes("origin=eq.auto_local_queue")||(row.status==="queued"&&row.payload.origin==="auto_local_queue"));
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


test("direct execution registers one task and one run even when the handler uses the shared response helper", async () => {
  const {tasks,runs,request}=claimHarness();
  const response=responseCapture();
  let calls=0;
  await runDirectWorkforceExecution({headers:{"idempotency-key":"direct-execution-test-001"}},response,base.agentId,async(req,res)=>{
    calls++;
    assert.equal([...tasks.values()][0].status,"running");
    return respondWithWorkforceExecution(req,res,200,{ok:true,task:base});
  },{persistence:"enabled",request,nowMs});
  assert.equal(calls,1);
  assert.equal(tasks.size,1);
  assert.equal(runs.length,1);
  assert.equal(response.payload.runtime.origin,"legacy_handler");
  assert.equal(response.payload.runtime.journal,"recorded");
});

test("registry-managed and delegated direct handlers do not claim a second execution", async () => {
  for(const marker of [WORKFORCE_REGISTRY_REQUEST,WORKFORCE_DELEGATED_REQUEST]){
    let calls=0;
    const res=responseCapture();
    await runDirectWorkforceExecution({[marker]:true,headers:{"idempotency-key":"nested-execution-test-001"}},res,base.agentId,async(_req,response)=>{
      calls++;
      return response.status(200).json({ok:true,task:base});
    },{persistence:"enabled",request:async()=>{assert.fail("nested claim attempted")}});
    assert.equal(calls,1);
    assert.equal(res.payload.runtime,undefined);
  }
});


test("manual retries require confirmed failure, same employee and a single bounded successor", async () => {
  const {tasks,runs,request}=claimHarness();
  const options={persistence:"enabled",request,nowMs};
  let calls=0;
  const failed=async(_req,res)=>{calls++;return res.status(502).json({ok:false,task:{...base,status:"failed"}})};
  const initial=responseCapture();
  await runClaimedRegistryExecution(registryRequest("manual-retry-original-001"),initial,base.agentId,failed,options);
  assert.equal(initial.payload.runtime.journal,"recorded");
  const originalId=initial.payload.runtime.taskId;
  const retry=async(id,key,agentId=base.agentId)=>{
    const res=responseCapture();
    const req=registryRequest(key);
    req.headers["x-elyon-retry-of"]=id;
    await runClaimedRegistryExecution(req,res,agentId,failed,options);
    return res;
  };
  assert.equal((await retry(originalId,"manual-retry-other-001","elyon-profit-specialist")).code,409);
  const first=await retry(originalId,"manual-retry-successor-001");
  assert.equal(first.code,502);
  assert.equal(tasks.get(first.payload.runtime.taskId).payload.retryOf,originalId);
  assert.equal(tasks.get(first.payload.runtime.taskId).payload.retryDepth,1);
  assert.equal((await retry(originalId,"manual-retry-successor-002")).code,409);
  const second=await retry(first.payload.runtime.taskId,"manual-retry-successor-003");
  assert.equal(second.code,502);
  assert.equal(tasks.get(second.payload.runtime.taskId).payload.retryDepth,2);
  assert.equal((await retry(second.payload.runtime.taskId,"manual-retry-successor-004")).code,409);
  assert.equal(calls,3);
  assert.equal(runs.length,3);
});

test("unconfirmed or running attempts cannot be retried and never dispatch",async()=>{
  const {tasks,request}=claimHarness();
  const id="00000000-0000-4000-a000-000000000001";
  const metadata={version:1,agentId:"elyon-product-data-specialist",origin:"registry",retryDepth:0};
  for(const status of ["running","completed","failed"]){
    tasks.set(id,{id,status,payload:metadata});
    const req=registryRequest("retry-unconfirmed-test-001");
    req.headers["x-elyon-retry-of"]=id;
    const res=responseCapture();
    await runClaimedRegistryExecution(req,res,base.agentId,async()=>assert.fail("unsafe retry"),{persistence:"enabled",request,nowMs});
    assert.equal(res.code,409);
  }
});


test("browser bridge preserves headers and provider settings, adds keys only to same-origin execution POSTs and guards aliases",async()=>{
  const source=await readFile(new URL("../seller-ai-workforce-advanced-settings.js",import.meta.url),"utf8");
  const start=source.indexOf("  function installFetchBridge() {");
  const end=source.indexOf("  function install() {",start);
  assert.ok(start>=0&&end>start);
  const calls=[];
  let release;
  const gate=new Promise(resolve=>{release=resolve});
  const window={location:{origin:"https://seller.example"},crypto:{randomUUID:()=>"generated-test-key-123456"},fetch:async(input,init)=>{calls.push({input,init});if(calls.length===1)await gate;return new Response("{}")}};
  runInNewContext(source.slice(start,end)+"\ninstallFetchBridge();",{window,URL,Headers,Response,ENDPOINT:"/api/ai-agent-run",ADVANCED_ENDPOINT:"/api/ai-agent-run-advanced",AGENTS:{"elyon-product-data-checker":{}},advancedFor:()=>({common:{maxTokens:1200,priority:"medium"}}),temperatureFor:()=>0.15});
  const first=window.fetch("/api/ai-agent-run",{method:"POST",headers:{"X-Elyon-Retry-Of":"previous","Content-Type":"application/json"},body:JSON.stringify({agentId:"elyon-product-data-checker",agent:{provider:"local"}})});
  const concurrent=await window.fetch("/api/ai-agent-run-registry",{method:"POST",body:JSON.stringify({agentId:"elyon-product-data-specialist"})});
  assert.equal(concurrent.status,409);
  assert.equal(calls.length,1);
  assert.equal(new URL(calls[0].input).pathname,"/api/ai-agent-run-advanced");
  assert.equal(calls[0].init.headers.get("Idempotency-Key"),"generated-test-key-123456");
  assert.equal(calls[0].init.headers.get("X-Elyon-Retry-Of"),"previous");
  assert.equal(JSON.parse(calls[0].init.body).agent.provider,"local");
  release();await first;
  await window.fetch("/api/ai-agent-run-registry",{method:"POST",headers:{"Idempotency-Key":"existing-test-key-1234"},body:JSON.stringify({agentId:"elyon-product-data-specialist"})});
  assert.equal(calls[1].init.headers.get("Idempotency-Key"),"existing-test-key-1234");
  await window.fetch("https://other.example/api/ai-agent-run",{method:"POST",body:"{}"});
  assert.equal(calls[2].input,"https://other.example/api/ai-agent-run");
  assert.equal(calls[2].init.headers,undefined);
  await window.fetch("/api/ai-agent-run-registry",{method:"GET"});
  assert.equal(calls[3].init.headers,undefined);
});


test("manual queue persists encrypted drafts and atomically starts same task once",async()=>{
  const {tasks,runs,request}=claimHarness();
  const options={env:{SUPABASE_SERVICE_ROLE_KEY:"synthetic-queue-test-secret"},persistence:"enabled",request,nowMs};
  const body={operation:"create",agentId:"elyon-product-data-checker",title:"Test title private",description:"Check synthetic product privately",type:"product_analysis",priority:"normal"};
  const create=async()=>{const res=responseCapture();await manualWorkforceQueue({method:"POST",headers:{"idempotency-key":"queue-creation-test-001"},body},res,options);return res;};
  const created=await create();
  assert.equal(created.code,201);
  assert.equal(created.payload.task.status,"queued");
  assert.equal(created.payload.task.description,body.description);
  const id=created.payload.task.id;
  assert.doesNotMatch(JSON.stringify([...tasks.values()]),/Test title private|Check synthetic product privately/);
  const duplicate=await create();
  assert.equal(duplicate.code,200);
  assert.equal(duplicate.payload.task.id,id);
  assert.equal(tasks.size,1);
  const history=await listWorkforceExecutionHistory(options);
  assert.equal(history.entries[0].status,"awaiting_manual_start");
  const makeReq=(prompt=body.description)=>({headers:{"idempotency-key":"queue-start-test-00001","x-elyon-queued-task":id},body:{title:body.title,taskPrompt:prompt,priority:"medium"}});
  const denied=responseCapture();
  await runDirectWorkforceExecution(makeReq("different"),denied,base.agentId,async()=>assert.fail("changed draft executed"),options);
  assert.equal(denied.code,409);
  let calls=0;let release;
  const gate=new Promise(resolve=>{release=resolve});
  const first=responseCapture();
  const running=runDirectWorkforceExecution(makeReq(),first,base.agentId,async(req,res)=>{
    calls++;assert.equal(tasks.get(id).status,"running");await gate;return respondWithWorkforceExecution(req,res,200,{ok:true,task:base});
  },options);
  await new Promise(resolve=>setImmediate(resolve));
  const competing=responseCapture();
  await runDirectWorkforceExecution(makeReq(),competing,base.agentId,async()=>assert.fail("duplicate execution"),options);
  assert.equal(competing.code,409);
  const cancellation=responseCapture();
  await manualWorkforceQueue({method:"POST",body:{operation:"cancel",taskId:id}},cancellation,options);
  assert.equal(cancellation.code,409);
  release();await running;
  assert.equal(calls,1);assert.equal(tasks.size,1);assert.equal(runs.length,1);
  assert.equal(first.payload.runtime.taskId,id);assert.equal(first.payload.runtime.origin,"manual_queue");
  assert.equal(tasks.get(id).status,"completed");
  const listing=responseCapture();await manualWorkforceQueue({method:"GET"},listing,options);
  assert.equal(listing.payload.entries[0].description,"");
  assert.equal(listing.payload.entries[0].startable,false);
});

test("manual queue rejects credentials and invalid inputs; cancel is terminal and preview cannot persist",async()=>{
  const {tasks,request}=claimHarness();
  const options={env:{SUPABASE_SERVICE_ROLE_KEY:"synthetic-queue-test-secret"},persistence:"enabled",request,nowMs};
  const body={operation:"create",agentId:base.agentId,title:"Check",description:"API key: sk-testsecret123456",type:"research",priority:"medium"};
  const req={method:"POST",headers:{"idempotency-key":"queue-cancel-test-00001"},body};
  const bad=responseCapture();await manualWorkforceQueue(req,bad,options);assert.equal(bad.code,400);assert.equal(tasks.size,0);
  req.body.description="Synthetic analysis";
  const created=responseCapture();await manualWorkforceQueue(req,created,options);assert.equal(created.code,201);
  const id=created.payload.task.id;
  const cancelled=responseCapture();await manualWorkforceQueue({method:"POST",body:{operation:"cancel",taskId:id}},cancelled,options);
  assert.equal(cancelled.payload.task.status,"cancelled");
  const res=responseCapture();await runDirectWorkforceExecution({headers:{"idempotency-key":"queue-start-test-00002","x-elyon-queued-task":id},body:{title:body.title,taskPrompt:body.description,priority:"medium"}},res,base.agentId,async()=>assert.fail("cancelled task executed"),options);
  assert.equal(res.code,409);
  const disabled=responseCapture();await manualWorkforceQueue(req,disabled,{...options,persistence:"disabled",request:async()=>assert.fail("preview write")});assert.equal(disabled.code,503);
});

test("manual queue with an unavailable encryption key refuses creation and invalid ciphertext cannot dispatch",async()=>{
  const {tasks,request}=claimHarness();
  const options={env:{SUPABASE_SERVICE_ROLE_KEY:"synthetic-queue-test-secret"},persistence:"enabled",request,nowMs};
  const req={method:"POST",headers:{"idempotency-key":"queue-tamper-test-00001"},body:{operation:"create",agentId:base.agentId,title:"Check",description:"Synthetic analysis",type:"research",priority:"medium"}};
  const missing=responseCapture();await manualWorkforceQueue(req,missing,{...options,env:{}});assert.equal(missing.code,503);assert.equal(tasks.size,0);
  const created=responseCapture();await manualWorkforceQueue(req,created,options);const id=created.payload.task.id;
  tasks.get(id).payload.queueEnvelope.tag="AAAAAAAAAAAAAAAAAAAAAA";
  const listing=responseCapture();await manualWorkforceQueue({method:"GET"},listing,options);assert.equal(listing.payload.entries[0].startable,false);
  const denied=responseCapture();await runDirectWorkforceExecution({headers:{"idempotency-key":"queue-start-test-00003","x-elyon-queued-task":id},body:{title:req.body.title,taskPrompt:req.body.description,priority:"medium"}},denied,base.agentId,async()=>assert.fail("tampered task executed"),options);assert.equal(denied.code,409);
});


const marginValues={purchasePrice:15,shippingCost:0,sellingPrice:25,ebayFeePercent:10,paymentFee:0,otherCosts:1,expectedReturnRatePercent:0,returnCost:0};
const autopilot={control:{mode:"autopilot",sourceMode:"autopilot",killSwitch:false,pausedByGuard:false},decision:{allowed:true}};
async function scheduleMargin(options,key="automatic-margin-test-001",input=marginValues,confirmed=true){
  const res=responseCapture();
  await manualWorkforceQueue({method:"POST",headers:{"idempotency-key":key},body:{operation:"create_auto_margin",input,confirmed}},res,options);
  return res;
}
test("automatic margin tasks require explicit confirmation and complete bounded numeric inputs",async()=>{
  const {tasks,request}=claimHarness();
  const options={persistence:"enabled",request,nowMs,env:{}};
  assert.equal((await scheduleMargin(options,"automatic-margin-invalid-001",marginValues,false)).code,400);
  assert.equal((await scheduleMargin(options,"automatic-margin-invalid-002",{...marginValues,shippingCost:null})).code,400);
  assert.equal((await scheduleMargin(options,"automatic-margin-invalid-003",{...marginValues,taskPrompt:"arbitrary command"})).code,400);
  assert.equal(tasks.size,0);
  const created=await scheduleMargin(options);assert.equal(created.code,201);assert.equal(created.payload.task.executionMode,"auto_local_margin");assert.equal(created.payload.task.startable,false);
  assert.equal((await scheduleMargin(options)).payload.task.id,created.payload.task.id);
  assert.equal(tasks.size,1);
  const history=await listWorkforceExecutionHistory(options);assert.equal(history.entries[0].status,"awaiting_auto_start");
});
test("idle worker claims one local margin task, records actual calculation, cannot run twice",async()=>{
  const {tasks,runs,request}=claimHarness();
  const options={persistence:"enabled",request,nowMs,env:{}};
  const created=await scheduleMargin(options);const id=created.payload.task.id;
  let reservations=0;const outcomes=[];
  const worker={...options,snapshot:autopilot,refreshControl:async()=>autopilot,reserveSlot:async()=>{reservations++;return {reserved:true}},recordOutcome:async outcome=>outcomes.push(outcome)};
  const results=await Promise.all([runQueuedLocalMargin(worker),runQueuedLocalMargin(worker)]);
  assert.equal(results.reduce((n,r)=>n+r.processed,0),1);
  assert.equal(tasks.get(id).status,"completed");
  assert.equal(tasks.get(id).payload.marginResult.profit,6.5);
  assert.equal(tasks.get(id).payload.marginResult.marginPercent,26);
  assert.equal(tasks.get(id).payload.marginResult.passesMinimum,true);
  assert.equal(tasks.get(id).payload.taskState,"approval_required");
  assert.equal(tasks.get(id).payload.marginInput,undefined);
  assert.equal(runs.length,1);
  assert.equal(outcomes.length,1);
  assert.equal(outcomes[0].result.runs[0].usage.totalTokens,0);
  assert.equal(outcomes[0].result.runs[0].provider,"local");
  assert.ok(reservations>=1&&reservations<=2);
  assert.equal((await runQueuedLocalMargin(worker)).status,"idle");
  const listing=responseCapture();await manualWorkforceQueue({method:"GET"},listing,options);
  assert.equal(listing.payload.entries[0].marginResult.profit,6.5);
});
test("automatic margin jobs respect actual autopilot, kill switch, provider and quota; never start manual tasks",async()=>{
  const {tasks,request}=claimHarness();
  const options={persistence:"enabled",request,nowMs,env:{}};
  const created=await scheduleMargin(options);const id=created.payload.task.id;
  const worker={...options,snapshot:autopilot,refreshControl:async()=>autopilot,reserveSlot:async()=>({reserved:false}),recordOutcome:async()=>assert.fail("unexpected execution")};
  for(const override of [{snapshot:{...autopilot,control:{...autopilot.control,sourceMode:"assisted"}}},{snapshot:{...autopilot,control:{...autopilot.control,killSwitch:true}}},{env:{ELYON_JARVIS_AUTONOMY_PROVIDERS:"openai"}},{persistence:"disabled"}]){
    assert.equal((await runQueuedLocalMargin({...worker,...override,request:async()=>assert.fail("disabled queue queried")})).status,"disabled");
  }
  assert.equal((await runQueuedLocalMargin({...worker,refreshControl:async()=>({...autopilot,decision:{allowed:false}})})).status,"paused");
  assert.equal((await runQueuedLocalMargin(worker)).status,"limit");
  assert.equal(tasks.get(id).status,"queued");
  const res=responseCapture();await manualWorkforceQueue({method:"POST",body:{operation:"cancel",taskId:id}},res,options);
  assert.equal(res.payload.task.status,"cancelled");
  assert.equal((await runQueuedLocalMargin(worker)).status,"idle");
});
