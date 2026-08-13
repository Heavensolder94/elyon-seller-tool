import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";
import {
  optimizeAdvancedAgentSettings,
  optimizeAiWorkforceClient,
  optimizeWorkforceWorkspaceV3,
  optimizeVirtualAgentsRuntimeLoader,
} from "../scripts/virtual-agents-runtime-optimization.mjs";
import {
  optimizeTaskPromptHelper,
  optimizeWorkforceAgentBuilder,
  optimizeWorkforceInterfaceV4,
  optimizeWorkforceStructureV2,
  optimizeWorkforceV2Operations,
} from "../scripts/virtual-agents-render-storm-optimization.mjs";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("AI workforce mounts directly into the dedicated virtual-agent root", async () => {
  const optimized = optimizeAiWorkforceClient(await source("ai-workforce-client.js"));

  assert.match(optimized, /document\.getElementById\("virtualAgentsSettingsRoot"\)/);
  assert.match(optimized, /document\.getElementById\("virtualAgentsTab"\)/);
  assert.doesNotMatch(optimized, /function watchMount\(/);
  assert.doesNotMatch(optimized, /observer\.observe\(document\.documentElement/);
  assert.doesNotThrow(() => new Script(optimized, { filename: "ai-workforce-client.js" }));
});

test("advanced settings observe only relevant agent cards", async () => {
  const optimized = optimizeAdvancedAgentSettings(await source("seller-ai-workforce-advanced-settings.js"));

  assert.match(optimized, /const root = document\.getElementById\("virtualAgentsSettingsRoot"\)/);
  assert.match(optimized, /observer\.observe\(root, \{ childList: true, subtree: true \}\)/);
  assert.match(optimized, /function scheduleCardUpdate\(\)/);
  assert.doesNotMatch(optimized, /observer\.observe\(document\.documentElement/);
  assert.doesNotMatch(optimized, /\[100, 500, 1200, 2400\]/);
  assert.doesNotThrow(() => new Script(optimized, { filename: "seller-ai-workforce-advanced-settings.js" }));
});

test("workspace v3 refreshes from virtual-agent events without observing the whole app", async () => {
  const optimized = optimizeWorkforceWorkspaceV3(await source("seller-ai-workforce-workspace-v3.js"));

  assert.match(optimized, /function workspaceIsActive\(\)/);
  assert.match(optimized, /function refreshWorkspace\(\)/);
  assert.match(optimized, /elyon:runtime-group-loaded/);
  assert.match(optimized, /elyon:tab-changed/);
  assert.match(optimized, /event\.target\?\.id === "mainMenu"/);
  assert.doesNotMatch(optimized, /observer\.observe\(document\.documentElement/);
  assert.doesNotMatch(optimized, /\[100, 500, 1200\]/);
  assert.doesNotThrow(() => new Script(optimized, { filename: "seller-ai-workforce-workspace-v3.js" }));
});

test("legacy workforce v2 keeps execution APIs but does not render or observe on boot", async () => {
  const optimized = optimizeWorkforceStructureV2(await source("seller-ai-workforce-structure-v2.js"));

  assert.match(optimized, /function installRuntimeApi\(\)/);
  assert.match(optimized, /window\.ElyonAIWorkforceV2 =/);
  assert.doesNotMatch(optimized, /function watch\(\)/);
  assert.doesNotMatch(optimized, /observer\.observe\(document\.documentElement/);
  assert.doesNotMatch(optimized, /\[100, 400, 900, 1800\]/);
  assert.doesNotThrow(() => new Script(optimized, { filename: "seller-ai-workforce-structure-v2.js" }));
});

test("v2 operations exposes runOperations without a global button observer", async () => {
  const optimized = optimizeWorkforceV2Operations(await source("seller-ai-workforce-v2-operations.js"));

  assert.match(optimized, /ElyonAIWorkforceV2\.runOperations = runOperations/);
  assert.doesNotMatch(optimized, /observer\.observe\(document\.documentElement/);
  assert.doesNotMatch(optimized, /\[100, 400, 900, 1800\]/);
  assert.doesNotThrow(() => new Script(optimized, { filename: "seller-ai-workforce-v2-operations.js" }));
});

test("v4 interface is event-driven and has no DOM observer retry loop", async () => {
  const optimized = optimizeWorkforceInterfaceV4(await source("seller-ai-workforce-interface-v4.js"));

  assert.match(optimized, /function workspaceIsActive\(\)/);
  assert.match(optimized, /function refreshWhenActive\(\)/);
  assert.doesNotMatch(optimized, /new MutationObserver\(queueRefresh\)/);
  assert.doesNotMatch(optimized, /\[80, 300, 800\]/);
  assert.doesNotThrow(() => new Script(optimized, { filename: "seller-ai-workforce-interface-v4.js" }));
});

test("agent builder keeps its API without observing every workforce DOM mutation", async () => {
  const optimized = optimizeWorkforceAgentBuilder(await source("seller-ai-workforce-agent-builder.js"));

  assert.match(optimized, /window\.ElyonAIAgentBuilder =/);
  assert.match(optimized, /function installObserver\(\) \{\s+return false;/);
  assert.doesNotMatch(optimized, /state\.observer\.observe\(root/);
  assert.doesNotMatch(optimized, /\[100, 400, 900\]/);
  assert.doesNotThrow(() => new Script(optimized, { filename: "seller-ai-workforce-agent-builder.js" }));
});

test("task prompt helper does not schedule a startup retry burst", async () => {
  const optimized = optimizeTaskPromptHelper(await source("seller-ai-task-prompt-helper.js"));

  assert.doesNotMatch(optimized, /\[100, 350, 800\]/);
  assert.match(optimized, /elyon:ai-workforce-team-v6-rendered/);
  assert.doesNotThrow(() => new Script(optimized, { filename: "seller-ai-task-prompt-helper.js" }));
});

test("desktop runtime no longer executes discarded legacy UI and coalesces duplicate virtual-agent activation", async () => {
  const optimized = optimizeVirtualAgentsRuntimeLoader(await source("seller-runtime-loader.js"));

  assert.doesNotMatch(optimized, /seller-virtual-agents-legacy\.js/);
  assert.match(optimized, /virtualAgentsTab:[\s\S]*ai-workforce-client\.js[\s\S]*ai-workforce-mount-fix\.js[\s\S]*seller-ai-workforce-advanced-settings\.js/);
  assert.match(optimized, /virtual-agents-stable-20260813-3/);
  assert.match(optimized, /duplicateVirtualActivation/);
  assert.match(optimized, /now - lastVirtualActivation < 250/);
  assert.doesNotThrow(() => new Script(optimized, { filename: "seller-runtime-loader.js" }));
});

test("Vercel build keeps compatibility refreshes out of the critical activation path", async () => {
  const prepare = await source("scripts/prepare-vercel.mjs");

  assert.doesNotMatch(prepare, /ElyonAIWorkforceV2\?\.render/);
  assert.match(prepare, /requestIdleCallback/);
  assert.match(prepare, /window\.ElyonAIWorkforceWorkspaceV3\?\.render/);
  assert.match(prepare, /window\.ElyonAIAgentBuilder\?\.refresh/);
  assert.match(prepare, /window\.ElyonAIWorkforceInterfaceV4\?\.refresh/);
  assert.match(prepare, /optimizeWorkforceStructureV2/);
  assert.match(prepare, /optimizeWorkforceV2Operations/);
  assert.match(prepare, /optimizeWorkforceInterfaceV4/);
  assert.match(prepare, /optimizeWorkforceAgentBuilder/);
});

test("mount compatibility layer has no global DOM observer or retry storm", async () => {
  const mountFix = await source("ai-workforce-mount-fix.js");

  assert.doesNotMatch(mountFix, /new MutationObserver/);
  assert.doesNotMatch(mountFix, /window\.addEventListener\("focus"/);
  assert.doesNotMatch(mountFix, /\[0, 150, 600, 1500\]/);
  assert.match(mountFix, /elyon:runtime-group-loaded/);
  assert.doesNotThrow(() => new Script(mountFix, { filename: "ai-workforce-mount-fix.js" }));
});
