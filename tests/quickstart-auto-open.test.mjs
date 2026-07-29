import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runtimeUrl = new URL("../seller-runtime-loader.js", import.meta.url);
const runtimeSource = await readFile(runtimeUrl, "utf8");

test("bridges the legacy automatic opener to the modern quickstart before DOMContentLoaded", () => {
  assert.match(runtimeSource, /function installLegacyQuickstartBridge\(\)/);
  assert.match(runtimeSource, /window\.openStartLauncher\s*=\s*openModernQuickstartFromLegacy/);
  assert.match(runtimeSource, /openModernQuickstartFromLegacy\(\)\s*\{\s*requestQuickstart\(false\)/s);

  const earlyBridge = runtimeSource.lastIndexOf("installLegacyQuickstartBridge();");
  const readyStateBranch = runtimeSource.indexOf('if (document.readyState === "loading")');
  assert.ok(earlyBridge >= 0 && earlyBridge < readyStateBranch, "legacy bridge must be installed before DOMContentLoaded");
});

test("manual quickstart clicks cannot fall through to the legacy button handler", () => {
  const manualBlock = runtimeSource.match(/closest\("#startLauncherBtn"\)([\s\S]*?)return;/)?.[1] || "";
  assert.match(manualBlock, /event\.preventDefault\(\)/);
  assert.match(manualBlock, /event\.stopPropagation\(\)/);
  assert.match(manualBlock, /requestQuickstart\(true\)/);
});

test("auto-open fix adds no polling or mutation observer", () => {
  assert.doesNotMatch(runtimeSource, /MutationObserver/);
  assert.doesNotMatch(runtimeSource, /setInterval/);
});
