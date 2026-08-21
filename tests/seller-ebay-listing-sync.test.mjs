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

test("Elyon draft registry exposes only observed UNPUBLISHED drafts and keeps lifecycle history", async () => {
  const sourceUrl = new URL("../lib/ebay-draft-registry.js", import.meta.url);
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /elyon_ebay_draft_registry_v1/);
  assert.match(source, /registerElyonDraft/);
  assert.match(source, /reconcileElyonDraftRecords/);
  assert.match(source, /inventoryState === "UNPUBLISHED"/);
  assert.match(source, /source: "elyon_inventory_draft"/);
  assert.match(source, /inventoryState === "PUBLISHED"/);
  assert.match(source, /missing\(record, "removed"/);
  assert.match(source, /missing\(record, "ended"/);
  assert.match(source, /visibilityMode === "seller_hub_feed"/);
  assert.doesNotMatch(source, /startsWith\(["']ELYON/);
  execFileSync(process.execPath, ["--check", fileURLToPath(sourceUrl)]);
});

test("seller-state counts only reconciled Elyon drafts, not every UNPUBLISHED Inventory offer", async () => {
  const sourceUrl = new URL("../api/ebay/seller-state.js", import.meta.url);
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /reconcileElyonDraftRegistry/);
  assert.match(source, /draftItems = draftRegistry\.drafts/);
  assert.match(source, /const items = \[\.\.\.draftItems, \.\.\.activeListings\]/);
  assert.match(source, /drafts: draftItems\.length/);
  assert.match(source, /draftSource: "elyon_draft_registry_plus_ebay_inventory"/);
  assert.match(source, /zwei erfolgreichen eBay-Abgleichen/);
  assert.doesNotMatch(source, /drafts:\s*number\(inventorySnapshot/);
});

test("successful Elyon lifecycle actions update the persistent draft registry", async () => {
  const sourceUrl = new URL("../api/ebay/index.js", import.meta.url);
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /registerElyonDraft/);
  assert.match(source, /action === "create-draft" \|\| action === "draft"/);
  assert.match(source, /source: "elyon_auto_lister"/);
  assert.match(source, /markElyonDraftState/);
  assert.match(source, /state: "published"/);
  assert.match(source, /state: "withdrawn"/);
  assert.match(source, /Der eBay-Vorgang war erfolgreich, aber Elyons Entwurfsregister konnte nicht aktualisiert werden/);
  execFileSync(process.execPath, ["--check", fileURLToPath(sourceUrl)]);
});

test("listing status UI shows numeric live counts plus lifecycle history", async () => {
  const sourceUrl = new URL("../seller-ebay-listing-sync.js", import.meta.url);
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /\/api\/ebay\/seller-state\?environment=production/);
  assert.match(source, /<small>Entwürfe<\/small><strong>\$\{draftsAvailable \? drafts : "!"\}/);
  assert.match(source, /<small>Aktive Listings<\/small><strong>\$\{active\}/);
  assert.match(source, /<small>Entfernt<\/small>/);
  assert.match(source, /<small>Beendet<\/small>/);
  assert.match(source, /zwei erfolgreiche Abgleiche/i);
  assert.doesNotMatch(source, /Seller Hub · Entwürfe/);
  assert.doesNotMatch(source, /Inventory API · UNPUBLISHED/);
  assert.doesNotMatch(source, /sync-listings/);
  assert.doesNotMatch(source, /access_token|refresh_token|client_secret/i);
  execFileSync(process.execPath, ["--check", fileURLToPath(sourceUrl)]);
});

test("production transform keeps numeric Elyon drafts and real active listings", async () => {
  const runtimeSource = await readFile(new URL("../seller-runtime-loader.js", import.meta.url), "utf8");
  const dashboardSource = await readFile(new URL("../seller-dashboard-v2.js", import.meta.url), "utf8");
  const runtime = transformSellerRuntimeLoader(runtimeSource);
  const dashboard = transformSellerDashboard(dashboardSource);

  assert.match(runtime, /\/api\/ebay\/seller-state\?environment=production/);
  assert.match(runtime, /draftProducts = enriched\.filter\(\(item\) => listingStatus\(item\) === "UNPUBLISHED"\)/);
  assert.match(runtime, /Aktuell sind keine von Elyon erstellten eBay-Entwürfe vorhanden/);
  assert.match(runtime, /<small>Entwürfe<\/small><strong>\$\{window\.__elyonSellerState\?\.draftsAvailable === false \? "!" : draftProducts\.length\}/);
  assert.doesNotMatch(runtime, /Seller-Hub-Entwürfe: nicht per öffentlicher eBay API auslesbar/);

  assert.match(dashboard, /Von Elyon erstellte eBay-Entwürfe/);
  assert.match(dashboard, /Direkt aus dem eBay-Verkäuferkonto/);
  assert.match(dashboard, /<span>Entwürfe<\/span>/);
  assert.match(dashboard, /\/api\/ebay\/seller-state\?environment=production/);
});
