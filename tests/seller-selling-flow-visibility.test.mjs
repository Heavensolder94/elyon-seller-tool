import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const visibilitySource = await readFile(new URL("../seller-selling-flow-visibility-fix.js", import.meta.url), "utf8");
const mobileEntrySource = await readFile(new URL("../mobile-selling-entry.js", import.meta.url), "utf8");
const compatSource = await readFile(new URL("../seller-dashboard-compat.js", import.meta.url), "utf8");
const buildSource = await readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8");

test("keeps the legacy Seller selling flow technically recoverable", () => {
  assert.match(visibilitySource, /ElyonSellerSellingFlow/);
  assert.match(visibilitySource, /typeof flow\.render !== "function"/);
  assert.match(visibilitySource, /flow\.render\(\)/);
  assert.match(visibilitySource, /ElyonSellerSellingFlowCapture\?\.restore/);
});

test("legacy selling compatibility still has its old labels but normal navigation hides it", () => {
  assert.match(visibilitySource, /\. Verkaufen/);
  assert.match(visibilitySource, /🛒 Verkaufen/);
  assert.match(visibilitySource, /Listing Designer, Auto Lister und Abschluss/);
  assert.match(compatSource, /RETIRED_PRE_EBAY_TABS/);
  assert.match(compatSource, /ebayListingTab/);
  assert.match(compatSource, /launcherGenerator/);
});

test("legacy selling flow can still repair itself if explicitly loaded", () => {
  assert.match(visibilitySource, /elyon:seller-product-selected/);
  assert.match(visibilitySource, /window\.addEventListener\("storage"/);
  assert.match(visibilitySource, /addEventListener\("change"/);
  assert.match(visibilitySource, /MutationObserver/);
});

test("legacy direct selling link remains recoverable but is no longer advertised", () => {
  assert.match(visibilitySource, /params\.get\("open"\) === "selling"/);
  assert.match(visibilitySource, /window\.location\.hash === "#verkaufen"/);
  assert.match(visibilitySource, /menu\.value = TAB_ID/);
  assert.match(visibilitySource, /setActivePanel\?\.\("designer"\)/);
});

test("removes the pre-eBay selling action from the mobile PWA", () => {
  assert.match(mobileEntrySource, /LEGACY_IDS/);
  assert.match(mobileEntrySource, /removeLegacySellingActions/);
  assert.match(mobileEntrySource, /retired: true/);
  assert.match(mobileEntrySource, /Listing-Erstellung und Auto Lister liegen im Company OS/);
  assert.doesNotMatch(mobileEntrySource, /\?open=selling#verkaufen/);
  assert.doesNotMatch(mobileEntrySource, /<b>Verkaufen<\/b>/);
});

test("ships legacy recovery assets without exposing a mobile selling shortcut", () => {
  const resilienceIndex = buildSource.indexOf("seller-selling-flow-resilience.js");
  const visibilityIndex = buildSource.indexOf("seller-selling-flow-visibility-fix.js");
  assert.ok(resilienceIndex >= 0);
  assert.ok(visibilityIndex > resilienceIndex);
  assert.match(buildSource, /seller-selling-flow-visibility-fix\.js", "public\/seller-selling-flow-visibility-fix\.js/);
  assert.match(buildSource, /"mobile-selling-entry\.js"/);
  assert.match(buildSource, /mobile-selling-entry\.js", "public\/mobile-selling-entry\.js/);
});
