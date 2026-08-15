import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const visibility = await readFile(new URL("../seller-selling-flow-visibility-fix.js", import.meta.url), "utf8");
const productionUiSource = await readFile(new URL("../seller-ebay-production-readiness.js", import.meta.url), "utf8");
const productionUi = await readFile(new URL("../public/seller-ebay-production-readiness.js", import.meta.url), "utf8");

test("the deployed eBay production module is kept in sync with its source", () => {
  assert.equal(
    productionUi,
    productionUiSource,
    "The lazy eBay production module must be mirrored to public during the Vercel build."
  );
});

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

test("live publishing stays approval-gated for manual and Auto-Live modes", () => {
  assert.match(productionUi, /PUBLISH_EBAY_OFFER/);
  assert.match(productionUi, /WITHDRAW_EBAY_OFFER/);
  assert.match(productionUi, /kostenpflichtig und öffentlich/i);
  assert.match(productionUi, /window\.confirm/);
  assert.match(productionUi, /autoPublishEnabled/);
  assert.match(productionUi, /Automatisch live veröffentlichen/);
  assert.match(productionUi, /if \(readSelections\(\)\.autoPublishEnabled === true\)/);
  assert.match(productionUi, /manualApprovalRequired: !autoPublishEnabled/);
  assert.match(productionUi, /automaticPublishingAllowed: autoPublishEnabled/);
  assert.match(productionUi, /autonomousPostingAllowed: false/);
  assert.match(productionUi, /publishingMode: autoPublishEnabled \? "auto_after_readiness" : "manual_approval"/);
  assert.doesNotMatch(productionUi, /setInterval\([^)]*publish/i);
});

test("draft, publish and withdraw are separate controlled actions", () => {
  assert.match(productionUi, /create-draft/);
  assert.match(productionUi, /api\("publish"/);
  assert.match(productionUi, /api\("withdraw"/);
  assert.match(productionUi, /eBay-Entwurf erstellen/);
  assert.match(productionUi, /Kostenpflichtig veröffentlichen/);
  assert.match(productionUi, /Angebot zurücknehmen/);
});