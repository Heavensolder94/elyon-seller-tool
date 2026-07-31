import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const visibility = await readFile(new URL("../seller-selling-flow-visibility-fix.js", import.meta.url), "utf8");
const productionUi = await readFile(new URL("../public/seller-ebay-production-readiness.js", import.meta.url), "utf8");

test("selling workspace lazily loads the controlled eBay production module", () => {
  assert.match(visibility, /seller-ebay-production-readiness\.js/);
  assert.match(visibility, /ElyonEbayProductionReadiness/);
  assert.match(visibility, /loadProductionModule/);
});

test("selected eBay policies are restored after selling-flow rerenders", () => {
  assert.match(visibility, /elyonEbayProductionSelectionV1/);
  assert.match(visibility, /productionSelectionsNeedRefresh/);
  assert.match(visibility, /restoreProductionSelections/);
  assert.match(visibility, /checkSetup/);
});

test("live publishing remains manual and explicitly confirmed", () => {
  assert.match(productionUi, /PUBLISH_EBAY_OFFER/);
  assert.match(productionUi, /WITHDRAW_EBAY_OFFER/);
  assert.match(productionUi, /kostenpflichtig und öffentlich/i);
  assert.match(productionUi, /confirm\(/);
  assert.doesNotMatch(productionUi, /setInterval\([^)]*publish/i);
});

test("draft, publish and withdraw are separate user actions", () => {
  assert.match(productionUi, /create-draft/);
  assert.match(productionUi, /api\("publish"/);
  assert.match(productionUi, /api\("withdraw"/);
  assert.match(productionUi, /eBay-Entwurf erstellen/);
  assert.match(productionUi, /Kostenpflichtig veröffentlichen/);
  assert.match(productionUi, /Angebot zurücknehmen/);
});
