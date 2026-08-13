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

test("desktop runtime no longer executes the discarded legacy agent UI and coalesces duplicate virtual-agent activation", async () => {
  const optimized = optimizeVirtualAgentsRuntimeLoader(await source("seller-runtime-loader.js"));

  assert.doesNotMatch(optimized, /seller-virtual-agents-legacy\.js/);
  assert.match(optimized, /virtualAgentsTab:[\s\S]*ai-workforce-client\.js[\s\S]*ai-workforce-mount-fix\.js[\s\S]*seller-ai-workforce-advanced-settings\.js/);
  assert.match(optimized, /virtual-agents-stable-20260813-2/);
  assert.match(optimized, /duplicateVirtualActivation/);
  assert.match(optimized, /now - lastVirtualActivation < 250/);
  assert.doesNotThrow(() => new Script(optimized, { filename: "seller-runtime-loader.js" }));
});

test("mount compatibility layer has no global DOM observer or retry storm", async () => {
  const mountFix = await source("ai-workforce-mount-fix.js");

  assert.doesNotMatch(mountFix, /new MutationObserver/);
  assert.doesNotMatch(mountFix, /window\.addEventListener\("focus"/);
  assert.doesNotMatch(mountFix, /\[0, 150, 600, 1500\]/);
  assert.match(mountFix, /elyon:runtime-group-loaded/);
  assert.doesNotThrow(() => new Script(mountFix, { filename: "ai-workforce-mount-fix.js" }));
});
