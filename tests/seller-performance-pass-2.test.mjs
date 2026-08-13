import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  transformSellerDashboard,
  transformSellerRuntimeLoader,
} from "../scripts/seller-listing-parity-transform.mjs";

async function read(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("settings diagnostics use bounded retries instead of document-wide mutation observers", async () => {
  const [systemStatus, ebayStatus] = await Promise.all([
    read("seller-system-status-settings.js"),
    read("seller-ebay-api-status.js"),
  ]);

  assert.doesNotMatch(systemStatus, /new MutationObserver/);
  assert.doesNotMatch(ebayStatus, /new MutationObserver/);
  assert.match(systemStatus, /scheduleBoundedRepairs/);
  assert.match(ebayStatus, /scheduleBoundedDecorates/);
  assert.match(systemStatus, /STATUS_MAX_AGE_MS = 2 \* 60 \* 1000/);
  assert.match(ebayStatus, /MAX_AGE_MS = 2 \* 60 \* 1000/);
  assert.match(systemStatus, /settingsIsActive\(\)/);
  assert.match(ebayStatus, /settingsIsActive\(\)/);
});

test("finance status is cached and deduplicated inside settings", async () => {
  const source = await read("seller-system-status-settings.js");
  assert.match(source, /FINANCE_MAX_AGE_MS = 2 \* 60 \* 1000/);
  assert.match(source, /let financeRequest = null/);
  assert.match(source, /let financeCache = null/);
  assert.match(source, /if \(financeRequest\) return financeRequest/);
  assert.match(source, /financeCheckedAt = Date\.now\(\)/);
});

test("dashboard listing status shares a two-minute seller-state cache and only refreshes while dashboard is active", async () => {
  const source = await read("seller-ebay-listing-sync.js");
  assert.match(source, /CACHE_MAX_AGE_MS = 2 \* 60 \* 1000/);
  assert.match(source, /window\.__elyonSellerStateLoadedAt/);
  assert.match(source, /dashboardIsActive/);
  assert.match(source, /document\.visibilityState === "hidden"/);
  assert.match(source, /event\.detail\?\.tabId \|\| event\.detail/);
  assert.match(source, /load\(\{ force: true \}\)/);
});

test("production dashboard transform reuses seller-state and ignores focus refreshes outside dashboard", async () => {
  const [dashboardSource, runtimeSource] = await Promise.all([
    read("seller-dashboard-v2.js"),
    read("seller-runtime-loader.js"),
  ]);
  const dashboard = transformSellerDashboard(dashboardSource);
  const runtime = transformSellerRuntimeLoader(runtimeSource);

  assert.match(dashboard, /FOCUS_REFRESH_COOLDOWN_MS = 2 \* 60 \* 1000/);
  assert.match(dashboard, /async function getSellerStateCached\(\)/);
  assert.match(dashboard, /window\.__elyonSellerStateLoadedAt/);
  assert.match(dashboard, /document\.getElementById\("mainMenu"\)\?\.value === "dashboardTab"/);
  assert.match(dashboard, /getJson\("\/api\/ebay\/seller-state\?environment=production"\)/);
  assert.doesNotMatch(dashboard, /getJson\("\/api\/ebay\/listings\?environment=production"\)/);

  assert.match(runtime, /window\.__elyonSellerStateLoadedAt = Date\.now\(\)/);
});

test("performance pass files are valid JavaScript", () => {
  for (const relativePath of [
    "seller-system-status-settings.js",
    "seller-ebay-api-status.js",
    "seller-ebay-listing-sync.js",
    "scripts/seller-listing-parity-transform.mjs",
  ]) {
    execFileSync(process.execPath, ["--check", fileURLToPath(new URL(`../${relativePath}`, import.meta.url))], { stdio: "pipe" });
  }
});
