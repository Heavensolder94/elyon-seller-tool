import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transformSellerRuntimeLoader } from "../scripts/seller-listing-parity-transform.mjs";

const runtimeUrl = new URL("../seller-runtime-loader.js", import.meta.url);

async function productionRuntime() {
  return transformSellerRuntimeLoader(await readFile(runtimeUrl, "utf8"));
}

test("listing drafts and active listings have separate lazy workspaces", async () => {
  const runtime = await readFile(runtimeUrl, "utf8");
  assert.match(runtime, /const DRAFT_TAB_ID = "draftsTab"/);
  assert.match(runtime, /const ACTIVE_TAB_ID = "activeListingsTab"/);
  assert.match(runtime, /draftsTab: \[\]/);
  assert.match(runtime, /activeListingsTab: \[\]/);
  assert.match(runtime, /option\.textContent = "📝 Listing-Entwürfe"/);
  assert.match(runtime, /option\.textContent = "🟢 Aktive Listings"/);
});

test("production listing workspaces use the unified eBay seller-state endpoint", async () => {
  const runtime = await productionRuntime();
  assert.match(runtime, /getJson\("\/api\/ebay\/seller-state\?environment=production"\)/);
  assert.match(runtime, /getJson\("\/api\/products"\)/);
  assert.match(runtime, /listingStatus\(item\) === "UNPUBLISHED"/);
  assert.match(runtime, /listingStatus\(item\) === "PUBLISHED"/);
  assert.match(runtime, /Product Master wurde ausschließlich zur Anreicherung verwendet/);
  assert.doesNotMatch(runtime, /products\.filter\(isDraftProduct\)/);
  assert.doesNotMatch(runtime, /products\.filter\(isActiveProduct\)/);
});

test("product pipeline menu numbers inserted listing workspaces in sequence", async () => {
  const runtime = await readFile(runtimeUrl, "utf8");
  assert.match(runtime, /function numberProductPipelineMenu\(menu\)/);
  assert.match(runtime, /replace\(\/\^\\d\+\\\.\\s\*\//);
  assert.match(runtime, /option\.textContent = `\$\{index \+ 1\}\. \$\{label\}`/);
  assert.match(runtime, /numberProductPipelineMenu\(menu\)/);
});

test("draft workspace shows only Elyon-created eBay drafts and a real zero empty state", async () => {
  const runtime = await productionRuntime();
  assert.match(runtime, /eBay · Entwürfe/);
  assert.match(runtime, /von Elyon erstellten eBay-Entwürfe/);
  assert.match(runtime, /<small>Entwürfe<\/small>/);
  assert.match(runtime, /Aktuell sind keine von Elyon erstellten eBay-Entwürfe vorhanden/);
  assert.doesNotMatch(runtime, /Seller-Hub-Entwürfe/);
  assert.doesNotMatch(runtime, /Inventory API · UNPUBLISHED/);
  assert.doesNotMatch(runtime, /Noch ohne eBay-Artikelnummer/);
  assert.doesNotMatch(runtime, /data-draft-open/);
  assert.doesNotMatch(runtime, /openDraftForSelling/);
});

test("active workspace uses real eBay seller account listings", async () => {
  const runtime = await productionRuntime();
  assert.match(runtime, /eBay · Aktiv/);
  assert.match(runtime, /Aktive Listings werden direkt aus dem authentifizierten eBay-Verkäuferkonto geladen/);
  assert.match(runtime, /Aktuell sind keine aktiven eBay-Listings vorhanden/);
  assert.match(runtime, /eBay \$\{escapeHtml\(itemId\)\}/);
});

test("unmatched eBay listings remain visible and are marked", async () => {
  const runtime = await productionRuntime();
  assert.match(runtime, /Kein Product-Master-Match/);
  assert.match(runtime, /Mehrdeutiger Product-Master-Match/);
  assert.match(runtime, /Product Master war nicht erreichbar; die eBay-Listings bleiben trotzdem vollständig sichtbar/);
  assert.match(runtime, /items\.map\(\(item\) => enrichEbayListing\(item, products\)\)/);
});

test("dashboard listing-draft task routes to passive drafts without a DOM observer", async () => {
  const runtime = await readFile(runtimeUrl, "utf8");
  assert.match(runtime, /function isDashboardDraftTaskClick\(target\)/);
  assert.match(runtime, /Listing-Entwurf/);
  assert.match(runtime, /event\.stopImmediatePropagation\(\)/);
  assert.match(runtime, /requestGroup\(DRAFT_TAB_ID\)/);
  assert.doesNotMatch(runtime, /MutationObserver/);
  assert.doesNotMatch(runtime, /setInterval/);
});

test("listing collections leave loading state after eBay refresh", async () => {
  const runtime = await readFile(runtimeUrl, "utf8");
  assert.match(runtime, /finally \{\s*listingLoading = false;\s*renderDraftWorkspace\(message\);\s*renderActiveWorkspace\(message\)/);
});
