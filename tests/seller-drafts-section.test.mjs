import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transformSellerRuntimeLoader } from "../scripts/seller-listing-parity-transform.mjs";

const runtimeUrl = new URL("../seller-runtime-loader.js", import.meta.url);

async function productionRuntime() {
  return transformSellerRuntimeLoader(await readFile(runtimeUrl, "utf8"));
}

async function renderEmptyDrafts(draftsAvailable, message = "") {
  const runtime = await productionRuntime();
  const source = runtime.slice(runtime.indexOf('  function renderDraftWorkspace('), runtime.indexOf('  function renderActiveWorkspace('));
  const draftTab = { innerHTML: "", querySelector() { return null; } };
  const context = vm.createContext({
    window: { __elyonSellerState: { draftsAvailable } },
    draftProducts: [], listingLoading: false,
    ensureListingWorkspaces: () => ({ draftTab }),
    escapeHtml: (value) => String(value),
    message,
  });
  vm.runInContext(source + '\nrenderDraftWorkspace(message);', context);
  return draftTab.innerHTML;
}

test("failed Inventory read never claims the draft inventory is empty", async () => {
  const html = await renderEmptyDrafts(false, "Entwürfe konnten nicht geprüft werden: eBay-Ausfall");
  assert.match(html, /Entwurfsbestand derzeit nicht prüfbar/);
  assert.doesNotMatch(html, /Aktuell sind keine von Elyon/);
});

test("failed seller-state request never claims an empty draft inventory", async () => {
  const html = await renderEmptyDrafts(undefined, "Fehler: Netzwerk nicht erreichbar");
  assert.match(html, /Entwurfsbestand derzeit nicht prüfbar/);
  assert.doesNotMatch(html, /Aktuell sind keine von Elyon/);
});

test("confirmed empty draft inventory retains its zero state", async () => {
  const html = await renderEmptyDrafts(true);
  assert.match(html, /Aktuell sind weder unveröffentlichte API-Angebote noch verarbeitete Feed-Aufträge vorhanden/);
  assert.doesNotMatch(html, /Entwurfsbestand derzeit nicht prüfbar/);
});

test("an Inventory API offer and a processed feed are not shown as two confirmed Seller Hub drafts", async () => {
  const runtime = await productionRuntime();
  const source = runtime.slice(runtime.indexOf('  function renderDraftWorkspace('), runtime.indexOf('  function renderActiveWorkspace('));
  const draftTab = { innerHTML: "", querySelector() { return null; } };
  const context = vm.createContext({
    window: { __elyonSellerState: { draftsAvailable: true } },
    draftProducts: [
      { sku: "AMZ-B0D63HF7Z4", source: "elyon_inventory_draft", offerId: "243461011011", productMasterMatch: "matched" },
      { sku: "AMZ-B0BWND9WBR", source: "elyon_seller_hub_feed", feedVerification: "feed_processed_not_live_checked", productMasterMatch: "matched" },
    ],
    listingLoading: false,
    ensureListingWorkspaces: () => ({ draftTab }),
    escapeHtml: (value) => String(value),
    listingCard: (item) => `<article>${item.sku}</article>`,
  });
  vm.runInContext(source + '\nrenderDraftWorkspace("");', context);
  const html = draftTab.innerHTML;
  assert.match(html, /<small>eBay-Angebote<\/small><details class="elyon-metric-info">[\s\S]*?<strong>1<\/strong>/);
  assert.match(html, /<small>Importiert<\/small><details class="elyon-metric-info">[\s\S]*?<strong>1<\/strong>/);
  assert.match(html, /<small>Verknüpft<\/small><details class="elyon-metric-info">[\s\S]*?<strong>2<\/strong>/);
  assert.match(html, /Seller-Hub-Entwürfe<\/small><strong[^>]*>Nicht live prüfbar<\/strong>/);
});

test("each of the three short labels has keyboard and touch accessible info", async () => {
  const html = await (async () => {
    const runtime = await productionRuntime();
    const source = runtime.slice(runtime.indexOf('  function renderDraftWorkspace('), runtime.indexOf('  function renderActiveWorkspace('));
    const draftTab = { innerHTML: "", querySelector() { return null; } };
    const context = vm.createContext({
      window: { __elyonSellerState: { draftsAvailable: true } },
      draftProducts: [
        { source: "elyon_inventory_draft", productMasterMatch: "matched" },
        { source: "elyon_seller_hub_feed", feedVerification: "feed_processed_not_live_checked", productMasterMatch: "matched" },
      ],
      listingLoading: false,
      ensureListingWorkspaces: () => ({ draftTab }),
      escapeHtml: (value) => String(value),
      listingCard: () => "<article>Produkt</article>",
    });
    vm.runInContext(source + '\nrenderDraftWorkspace("");', context);
    return draftTab.innerHTML;
  })();
  assert.equal((html.match(/<details class="elyon-metric-info">/g) || []).length, 3);
  assert.match(html, /aria-label="Info zu eBay-Angeboten"/);
  assert.match(html, /aria-label="Info zu importierten Aufträgen"/);
  assert.match(html, /aria-label="Info zu verknüpften Produkten"/);
  assert.match(html, /nicht live bestätigt/);
  assert.match(html, /noch keine Freigabe zum Verkauf/);
  const runtime = await productionRuntime();
  assert.match(runtime, /elyon-metric-info summary:focus-visible/);
  assert.match(runtime, /elyon-metric-tip/);
  assert.match(runtime, /title="Unveröffentlichte eBay-API-Angebote/);
  assert.match(runtime, /title="Feed-Auftrag verarbeitet/);
  assert.match(runtime, /title="Company-OS-Produkt eindeutig zugeordnet/);
  assert.match(runtime, /elyon-metric-info\\[open\\]\\{flex:1 1 100%/);
  assert.match(runtime, /elyon-metric-tip\\{display:block;position:static/);
  assert.doesNotMatch(runtime, /elyon-metric-tip\\{position:absolute/);
});

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
  assert.match(runtime, /Elyon · Unveröffentlicht/);
  assert.match(runtime, /eBay Inventory API und verarbeitete Seller-Hub-Feed-Aufträge/);
  assert.match(runtime, /<small>eBay-Angebote<\/small>/);
  assert.match(runtime, /Aktuell sind weder unveröffentlichte API-Angebote noch verarbeitete Feed-Aufträge vorhanden/);
  assert.match(runtime, /Seller-Hub-Entwürfe.*Nicht live prüfbar/);
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
