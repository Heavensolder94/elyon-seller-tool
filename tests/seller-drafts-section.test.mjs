import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runtimeUrl = new URL("../seller-runtime-loader.js", import.meta.url);

test("listing drafts and active listings have separate lazy workspaces", async () => {
  const runtime = await readFile(runtimeUrl, "utf8");
  assert.match(runtime, /const DRAFT_TAB_ID = "draftsTab"/);
  assert.match(runtime, /const ACTIVE_TAB_ID = "activeListingsTab"/);
  assert.match(runtime, /draftsTab: \[\]/);
  assert.match(runtime, /activeListingsTab: \[\]/);
  assert.match(runtime, /option\.textContent = "📝 Listing-Entwürfe"/);
  assert.match(runtime, /option\.textContent = "🟢 Aktive Listings"/);
  assert.match(runtime, /fetch\("\/api\/products"/);
  assert.match(runtime, /products\.filter\(isDraftProduct\)/);
  assert.match(runtime, /products\.filter\(isActiveProduct\)/);
});

test("product pipeline menu numbers inserted listing workspaces in sequence", async () => {
  const runtime = await readFile(runtimeUrl, "utf8");
  assert.match(runtime, /function numberProductPipelineMenu\(menu\)/);
  assert.match(runtime, /replace\(\/\^\\d\+\\\.\\s\*\//);
  assert.match(runtime, /option\.textContent = `\$\{index \+ 1\}\. \$\{label\}`/);
  assert.match(runtime, /numberProductPipelineMenu\(menu\)/);
});

test("draft workspace is passive and has no selling action", async () => {
  const runtime = await readFile(runtimeUrl, "utf8");
  assert.match(runtime, /Diese Übersicht ist rein passiv/);
  assert.match(runtime, /<small>Aktionen<\/small><strong style="font-size:14px">Keine<\/strong>/);
  assert.match(runtime, /<span class="elyon-listing-pill">Passiv<\/span>/);
  assert.doesNotMatch(runtime, /data-draft-open/);
  assert.doesNotMatch(runtime, /openDraftForSelling/);
});

test("active listing requires ebay item id plus online status", async () => {
  const runtime = await readFile(runtimeUrl, "utf8");
  assert.match(runtime, /function isActiveProduct\(product\)/);
  assert.match(runtime, /productItemIds\(product\)\.length > 0/);
  assert.match(runtime, /"live", "active", "published", "listed", "manually_listed", "online"/);
  assert.match(runtime, /eBay \$\{escapeHtml\(itemId\)\}/);
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

test("listing collections leave loading state after Product Master refresh", async () => {
  const runtime = await readFile(runtimeUrl, "utf8");
  assert.match(runtime, /finally \{\s*listingLoading = false;\s*renderDraftWorkspace\(message\);\s*renderActiveWorkspace\(message\)/);
});
