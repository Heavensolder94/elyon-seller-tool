import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runtimeUrl = new URL("../seller-runtime-loader.js", import.meta.url);

test("listing drafts have a dedicated lazy workspace", async () => {
  const runtime = await readFile(runtimeUrl, "utf8");
  assert.match(runtime, /const DRAFT_TAB_ID = "draftsTab"/);
  assert.match(runtime, /draftsTab: \[\]/);
  assert.match(runtime, /option\.textContent = "📝 Listing-Entwürfe"/);
  assert.match(runtime, /fetch\("\/api\/products"/);
  assert.match(runtime, /filter\(isDraftProduct\)/);
  assert.match(runtime, /Noch ohne eBay-Artikelnummer/);
});

test("dashboard listing-draft task routes to the drafts workspace without a DOM observer", async () => {
  const runtime = await readFile(runtimeUrl, "utf8");
  assert.match(runtime, /function isDashboardDraftTaskClick\(target\)/);
  assert.match(runtime, /Listing-Entwurf/);
  assert.match(runtime, /event\.stopImmediatePropagation\(\)/);
  assert.match(runtime, /requestGroup\(DRAFT_TAB_ID\)/);
  assert.doesNotMatch(runtime, /MutationObserver/);
  assert.doesNotMatch(runtime, /setInterval/);
});

test("drafts reuse the existing Product Master to selling adoption path", async () => {
  const runtime = await readFile(runtimeUrl, "utf8");
  assert.match(runtime, /await loadGroup\("productListTab"\)/);
  assert.match(runtime, /ElyonCompanyOsInbox\?\.adopt/);
  assert.match(runtime, /await loadGroup\("ebayListingTab"\)/);
});

test("draft list leaves loading state after Product Master refresh", async () => {
  const runtime = await readFile(runtimeUrl, "utf8");
  assert.match(runtime, /finally \{\s*draftLoading = false;\s*renderDraftWorkspace\(message\)/);
});
