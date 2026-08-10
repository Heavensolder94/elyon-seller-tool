import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  transformSellerDashboard,
  transformSellerRuntimeLoader,
} from "../scripts/seller-listing-parity-transform.mjs";

test("canonical inventory snapshot remains available for diagnostics", async () => {
  const sourceUrl = new URL("../api/ebay/listings.js", import.meta.url);
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /sell\/inventory\/v1\/inventory_item\?limit=/);
  assert.match(source, /sell\/inventory\/v1\/offer\?sku=\$\{encodeURIComponent\(sku\)\}/);
  assert.match(source, /status === "PUBLISHED"/);
  assert.match(source, /status === "UNPUBLISHED"/);
  assert.match(source, /source: "ebay_inventory_api"/);
  execFileSync(process.execPath, ["--check", fileURLToPath(sourceUrl)]);
});

test("seller-state uses My eBay ActiveList for real active listings", async () => {
  const sourceUrl = new URL("../api/ebay/seller-state.js", import.meta.url);
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /GetMyeBaySelling/);
  assert.match(source, /<ActiveList>/);
  assert.match(source, /X-EBAY-API-IAF-TOKEN/);
  assert.match(source, /X-EBAY-API-SITEID.*77/);
  assert.match(source, /TRADING_API_VERSION = "1455"/);
  assert.match(source, /status: "PUBLISHED"/);
  assert.match(source, /source: "ebay_trading_get_myeBaySelling_active"/);
  execFileSync(process.execPath, ["--check", fileURLToPath(sourceUrl)]);
});

test("Seller Hub drafts are not fabricated from Inventory API UNPUBLISHED offers", async () => {
  const source = await readFile(new URL("../api/ebay/seller-state.js", import.meta.url), "utf8");
  assert.match(source, /sellerHubDrafts/);
  assert.match(source, /readable: false/);
  assert.match(source, /count: null/);
  assert.match(source, /UNPUBLISHED Inventory Offers werden deshalb nicht als Seller-Hub-Entwürfe gezählt/);
  assert.match(source, /inventoryUnpublished/);
  assert.match(source, /fetchInventoryOfferSnapshot/);
});

test("listing status UI uses one read-only Seller state endpoint", async () => {
  const source = await readFile(new URL("../seller-ebay-listing-sync.js", import.meta.url), "utf8");
  assert.match(source, /\/api\/ebay\/seller-state\?environment=production/);
  assert.match(source, /Seller Hub · aktiv/);
  assert.match(source, /Seller Hub · Entwürfe/);
  assert.match(source, /Inventory API · UNPUBLISHED/);
  assert.doesNotMatch(source, /sync-listings/);
  assert.doesNotMatch(source, /\/api\/ebay\?action=listings/);
  assert.doesNotMatch(source, /access_token|refresh_token|client_secret/i);
  execFileSync(process.execPath, ["--check", fileURLToPath(new URL("../seller-ebay-listing-sync.js", import.meta.url))]);
});

test("production transform removes false UNPUBLISHED draft semantics", async () => {
  const runtimeSource = await readFile(new URL("../seller-runtime-loader.js", import.meta.url), "utf8");
  const dashboardSource = await readFile(new URL("../seller-dashboard-v2.js", import.meta.url), "utf8");
  const runtime = transformSellerRuntimeLoader(runtimeSource);
  const dashboard = transformSellerDashboard(dashboardSource);

  assert.match(runtime, /\/api\/ebay\/seller-state\?environment=production/);
  assert.match(runtime, /draftProducts = \[\];/);
  assert.match(runtime, /Seller-Hub-Entwürfe: nicht per öffentlicher eBay API auslesbar/);
  assert.match(runtime, /Inventory-API UNPUBLISHED \(separat\)/);
  assert.doesNotMatch(runtime, /eBay meldet aktuell 0 UNPUBLISHED-Angebote/);

  assert.match(dashboard, /Seller-Hub-Entwürfe<\/small><strong>—<\/strong>/);
  assert.match(dashboard, /Seller Hub · Trading API ActiveList/);
  assert.match(dashboard, /Seller Hub aktiv/);
  assert.match(dashboard, /\/api\/ebay\/seller-state\?environment=production/);
});
