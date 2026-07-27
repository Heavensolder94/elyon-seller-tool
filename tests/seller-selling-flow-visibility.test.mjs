import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const visibilitySource = await readFile(new URL("../seller-selling-flow-visibility-fix.js", import.meta.url), "utf8");
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

test("ships the visibility repair after the resilience module", () => {
  const resilienceIndex = buildSource.indexOf("seller-selling-flow-resilience.js");
  const visibilityIndex = buildSource.indexOf("seller-selling-flow-visibility-fix.js");
  assert.ok(resilienceIndex >= 0);
  assert.ok(visibilityIndex > resilienceIndex);
  assert.match(buildSource, /seller-selling-flow-visibility-fix\.js", "public\/seller-selling-flow-visibility-fix\.js/);
});
