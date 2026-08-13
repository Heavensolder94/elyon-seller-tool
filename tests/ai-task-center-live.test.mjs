import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const runtimeUrl = new URL("../seller-ai-task-center-live.js", import.meta.url);
const finalizerUrl = new URL("../scripts/finalize-seller-os.mjs", import.meta.url);
const indexUrl = new URL("../index.html", import.meta.url);

test("lightweight task center runtime is valid browser JavaScript", async () => {
  const source = await readFile(runtimeUrl, "utf8");
  assert.doesNotThrow(() => new vm.Script(source, { filename: "seller-ai-task-center-live.js" }));
  assert.match(source, /window\.ElyonAITaskCenterLive/);
});

test("task center replaces the static fallback without reviving the legacy workforce renderer", async () => {
  const source = await readFile(runtimeUrl, "utf8");
  assert.match(source, /root\.querySelector\("\[data-elyon-task-center-live\]"\) \|\| root\.querySelector\("\.task-center-empty"\)/);
  assert.match(source, /mount\.dataset\.elyonTaskCenterLive = "true"/);
  assert.doesNotMatch(source, /seller-virtual-agents-legacy/);
  assert.doesNotMatch(source, /root\.innerHTML\s*=/);
});

test("task center reads both current workforce tasks and legacy task logs", async () => {
  const source = await readFile(runtimeUrl, "utf8");
  assert.match(source, /elyon_ai_workforce_tasks/);
  assert.match(source, /elyon_ai_tasks/);
  assert.match(source, /elyon_ai_logs/);
  assert.match(source, /elyon_ai_events/);
  assert.match(source, /mergeTasks\(\)/);
  assert.match(source, /recentLogs\(\)/);
});

test("task center lifecycle is event driven without DOM polling", async () => {
  const source = await readFile(runtimeUrl, "utf8");
  assert.doesNotMatch(source, /MutationObserver/);
  assert.doesNotMatch(source, /setInterval\(/);
  assert.doesNotMatch(source, /\[0,\s*80,\s*250,\s*700\]/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /elyon:ai-workforce-v2-task-updated/);
  assert.match(source, /elyon:runtime-group-loaded/);
  assert.match(source, /elyon:tab-changed/);
});

test("static task form is wired into both task stores", async () => {
  const source = await readFile(runtimeUrl, "utf8");
  assert.match(source, /data-task-action="create-task"/);
  assert.match(source, /aiTaskTitleInput/);
  assert.match(source, /aiTaskDescriptionInput/);
  assert.match(source, /aiTaskAgentSelect/);
  assert.match(source, /aiTaskTypeSelect/);
  assert.match(source, /aiTaskPrioritySelect/);
  assert.match(source, /upsertInKey\(PRIMARY_TASK_KEY, task\)/);
  assert.match(source, /upsertInKey\(LEGACY_TASK_KEY, task\)/);
});

test("production finalizer ships the lightweight task center independently of the legacy chunk", async () => {
  const source = await readFile(finalizerUrl, "utf8");
  assert.match(source, /seller-ai-task-center-live\.js/);
  assert.match(source, /data-elyon-task-center-live="true"/);
  assert.match(source, /writeFile\(outputTaskCenterPath, taskCenterSource/);
  assert.match(source, /20260813-task-center-live-1/);
});

test("desktop HTML keeps a clear fallback mount for the live task center", async () => {
  const source = await readFile(indexUrl, "utf8");
  assert.match(source, /class="empty task-center-empty"/);
  assert.match(source, /Der dynamische Aufgabenbereich wird geladen/);
  assert.match(source, /data-task-action="create-task"/);
});
