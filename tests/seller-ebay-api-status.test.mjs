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

test("desktop build keeps system settings in startup and loads eBay verification only with settings", async () => {
  const build = await readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../seller-runtime-loader.js", import.meta.url), "utf8");
  const settingsIndex = build.indexOf('<script defer src="/seller-system-status-settings.js"></script>');
  const settingsGroup = runtime.indexOf("settingsTab:");
  const ebayIndex = runtime.indexOf('{ src: "/seller-ebay-api-status.js" }');

  assert.ok(settingsIndex > 0);
  assert.ok(settingsGroup > 0);
  assert.ok(ebayIndex > settingsGroup);
  assert.doesNotMatch(build, /<script[^>]+seller-ebay-api-status\.js/);
  assert.match(build, /\["seller-ebay-api-status\.js", "public\/seller-ebay-api-status\.js"\]/);
});

test("eBay status verifier and runtime loader are valid JavaScript", () => {
  syntaxCheck("seller-ebay-api-status.js");
  syntaxCheck("seller-runtime-loader.js");
  syntaxCheck("scripts/prepare-vercel.mjs");
});
