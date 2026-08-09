import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import {
  optimizeProviderModelGuard,
  optimizeWorkforceV2Operations,
  optimizeWorkforceV2Structure,
  optimizeWorkforceWorkspaceV3,
} from "../scripts/virtual-agents-runtime-optimization.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (file) => readFile(path.join(root, file), "utf8");

const cases = [
  ["seller-ai-workforce-structure-v2.js", optimizeWorkforceV2Structure],
  ["seller-ai-workforce-v2-operations.js", optimizeWorkforceV2Operations],
  ["seller-ai-workforce-workspace-v3.js", optimizeWorkforceWorkspaceV3],
  ["seller-ai-provider-model-guard.js", optimizeProviderModelGuard],
];

test("virtual-agent production runtime removes remaining global VM observers", async () => {
  for (const [file, optimize] of cases) {
    const optimized = optimize(await source(file));
    assert.doesNotMatch(optimized, /observer\.observe\(document\.documentElement/);
    assert.doesNotThrow(() => new Script(optimized, { filename: file }));
  }
});

test("virtual-agent production runtime removes retry storms and uses lifecycle events", async () => {
  const structure = optimizeWorkforceV2Structure(await source("seller-ai-workforce-structure-v2.js"));
  const operations = optimizeWorkforceV2Operations(await source("seller-ai-workforce-v2-operations.js"));
  const workspace = optimizeWorkforceWorkspaceV3(await source("seller-ai-workforce-workspace-v3.js"));
  const providerGuard = optimizeProviderModelGuard(await source("seller-ai-provider-model-guard.js"));

  assert.doesNotMatch(structure, /\[100, 400, 900, 1800\]/);
  assert.doesNotMatch(operations, /\[100, 400, 900, 1800\]/);
  assert.doesNotMatch(workspace, /\[100, 500, 1200\]/);
  assert.doesNotMatch(providerGuard, /\[120, 400, 900, 1800\]/);
  assert.match(structure, /elyon:ai-workforce-v2-rendered/);
  assert.match(operations, /elyon:ai-workforce-v2-rendered/);
  assert.match(workspace, /elyon:ai-workforce-v2-rendered/);
  assert.match(providerGuard, /elyon:runtime-group-loaded/);
});

test("V3 redesign is the canonical team view and exposes the workbook separately", async () => {
  const redesign = await source("seller-virtual-agents-redesign.js");
  assert.match(redesign, /VISIBLE_AGENT_IDS/);
  assert.match(redesign, /elyon-manager/);
  assert.match(redesign, /data-aiw-view-button="team"/);
  assert.match(redesign, /data-aiw-view-button="tasks"/);
  assert.match(redesign, /data-aiw-view="tasks"\] #aiwAgentGrid/);
  assert.match(redesign, /manualReviewRequired/);
  assert.match(redesign, /task\.result\.blockers/);
  assert.match(redesign, /observer\.observe\(observedRoot, \{ childList: true, subtree: true \}\)/);
  assert.doesNotMatch(redesign, /observer\.observe\(document\.documentElement/);
  assert.doesNotThrow(() => new Script(redesign, { filename: "seller-virtual-agents-redesign.js" }));
});

test("build always runs virtual-agent finalization and mirrors the redesign asset", async () => {
  const packageJson = JSON.parse(await source("package.json"));
  const vercel = JSON.parse(await source("vercel.json"));
  const finalizer = await source("scripts/finalize-virtual-agents.mjs");

  assert.match(packageJson.scripts["prepare:web"], /finalize-virtual-agents\.mjs/);
  assert.match(vercel.buildCommand, /finalize-virtual-agents\.mjs/);
  assert.match(finalizer, /copyFile\(redesignSource, redesignTarget\)/);
  assert.match(finalizer, /seller-virtual-agents-redesign\.js/);
  assert.match(finalizer, /globaler Observer blieb/);
});
