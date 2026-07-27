import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const visibilitySource = await readFile(new URL("../seller-selling-flow-visibility-fix.js", import.meta.url), "utf8");
const mobileEntrySource = await readFile(new URL("../mobile-selling-entry.js", import.meta.url), "utf8");
const buildSource = await readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8");

test("repairs the Seller selling flow after legacy role-policy refreshes", () => {
  assert.match(visibilitySource, /ElyonSellerSellingFlow/);
  assert.match(visibilitySource, /typeof flow\.render !== "function"/);
  assert.match(visibilitySource, /flow\.render\(\)/);
  assert.match(visibilitySource, /ElyonSellerSellingFlowCapture\?\.restore/);
});

test("keeps the user-facing menu and launcher labelled Verkaufen", () => {
  assert.match(visibilitySource, /\. Verkaufen/);
  assert.match(visibilitySource, /🛒 Verkaufen/);
  assert.match(visibilitySource, /Listing Designer, Auto Lister und Abschluss/);
});

test("repairs the flow after product, storage and navigation events", () => {
  assert.match(visibilitySource, /elyon:seller-product-selected/);
  assert.match(visibilitySource, /window\.addEventListener\("storage"/);
  assert.match(visibilitySource, /addEventListener\("change"/);
  assert.match(visibilitySource, /MutationObserver/);
});

test("opens the selling tab from the stable direct link", () => {
  assert.match(visibilitySource, /params\.get\("open"\) === "selling"/);
  assert.match(visibilitySource, /window\.location\.hash === "#verkaufen"/);
  assert.match(visibilitySource, /menu\.value = TAB_ID/);
  assert.match(visibilitySource, /candidate\.classList\.toggle\("active"/);
  assert.match(visibilitySource, /setActivePanel\?\.\("designer"\)/);
});

test("shows a selling action in the mobile PWA", () => {
  assert.match(mobileEntrySource, /mobileSellingQuickAction/);
  assert.match(mobileEntrySource, /mobileSellingSheetAction/);
  assert.match(mobileEntrySource, /\?open=selling#verkaufen/);
  assert.match(mobileEntrySource, /Listing Designer, Auto Lister und Abschluss/);
});

test("ships desktop visibility repair and mobile selling entry", () => {
  const resilienceIndex = buildSource.indexOf("seller-selling-flow-resilience.js");
  const visibilityIndex = buildSource.indexOf("seller-selling-flow-visibility-fix.js");
  assert.ok(resilienceIndex >= 0);
  assert.ok(visibilityIndex > resilienceIndex);
  assert.match(buildSource, /seller-selling-flow-visibility-fix\.js", "public\/seller-selling-flow-visibility-fix\.js/);
  assert.match(buildSource, /"mobile-selling-entry\.js"/);
  assert.match(buildSource, /mobile-selling-entry\.js", "public\/mobile-selling-entry\.js/);
});
