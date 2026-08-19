import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

function syntaxCheck(relativePath) {
  execFileSync(process.execPath, ["--check", fileURLToPath(new URL(`../${relativePath}`, import.meta.url))], { stdio: "pipe" });
}

test("settings eBay check verifies API reachability and OAuth separately", async () => {
  const source = await readFile(new URL("../seller-ebay-api-status.js", import.meta.url), "utf8");
  assert.match(source, /\/api\/ebay-taxonomy\?action=status/);
  assert.match(source, /\/api\/ebay\/status\?environment=production/);
  assert.match(source, /Promise\.allSettled/);
  assert.match(source, /apiReachable/);
  assert.match(source, /oauthConnected/);
  assert.match(source, /configured !== false/);
});

test("status messages no longer confuse API reachability with OAuth connection", async () => {
  const source = await readFile(new URL("../seller-ebay-api-status.js", import.meta.url), "utf8");
  assert.match(source, /eBay API erreichbar · OAuth verbunden/);
  assert.match(source, /eBay API erreichbar · OAuth nicht verbunden/);
  assert.match(source, /eBay API-Status nicht abrufbar · OAuth verbunden/);
  assert.match(source, /eBay API derzeit nicht erreichbar/);
  assert.match(source, /eBay API wird geprüft/);
});

test("one verified eBay state updates both overview and detailed settings status", async () => {
  const source = await readFile(new URL("../seller-ebay-api-status.js", import.meta.url), "utf8");
  assert.match(source, /DETAIL_RESULT_ID = "setIntEbayStatus"/);
  assert.match(source, /OVERVIEW_RESULT_ID = "intEbayStatus"/);
  assert.match(source, /function applyOverviewState/);
  assert.match(source, /oauthConnected === true/);
  assert.match(source, /label: "Verbunden"/);
  assert.match(source, /applyOverviewState\(state/);
});

test("unified eBay state also refreshes the system status row and badge", async () => {
  const source = await readFile(new URL("../seller-ebay-api-status.js", import.meta.url), "utf8");
  assert.match(source, /function ebayStatusRows/);
  assert.match(source, /"ebay oauth"/);
  assert.match(source, /function ebayHeroBadges/);
  assert.match(source, /\.sd-badge/);
  assert.match(source, /row\.dataset\.ebayStatusVerified/);
});

test("legacy API status button is captured exactly once and remains reusable", async () => {
  const source = await readFile(new URL("../seller-ebay-api-status.js", import.meta.url), "utf8");
  assert.match(source, /setEbayConnectPlanBtn/);
  assert.match(source, /setIntEbayStatus/);
  assert.match(source, /document\.addEventListener\("click", captureClick, true\)/);
  assert.match(source, /stopImmediatePropagation\(\)/);
  assert.match(source, /aria-busy/);
  assert.match(source, /MAX_AGE_MS/);
  assert.match(source, /window\.ElyonEbayApiStatus/);
});

test("public OAuth status contract remains minimal and secret-free", async () => {
  const source = await readFile(new URL("../api/ebay/index.js", import.meta.url), "utf8");
  assert.match(source, /return \{ connected: Boolean\(tokenRecord\?\.refresh_token \|\| tokenRecord\?\.access_token\) \}/);
  assert.doesNotMatch(source, /publicConnectionStatus[\s\S]{0,300}refresh_token:/);
});

test("desktop runtime loads all settings diagnostics only with the settings workspace", async () => {
  const build = await readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../seller-runtime-loader.js", import.meta.url), "utf8");
  const settingsGroup = runtime.indexOf("settingsTab:");
  const systemIndex = runtime.indexOf('{ src: "/seller-system-status-settings.js" }');
  const ebayIndex = runtime.indexOf('{ src: "/seller-ebay-api-status.js" }');

  assert.ok(settingsGroup > 0);
  assert.ok(systemIndex > settingsGroup);
  assert.ok(ebayIndex > systemIndex);
  assert.doesNotMatch(build, /<script[^>]+seller-system-status-settings\.js/);
  assert.doesNotMatch(build, /<script[^>]+seller-ebay-api-status\.js/);
  assert.match(build, /\["seller-ebay-api-status\.js", "public\/seller-ebay-api-status\.js"\]/);
});

test("eBay status verifier and runtime loader are valid JavaScript", () => {
  syntaxCheck("seller-ebay-api-status.js");
  syntaxCheck("seller-runtime-loader.js");
  syntaxCheck("scripts/prepare-vercel.mjs");
});
