import assert from "node:assert/strict";
import test from "node:test";

import {
  inspectSellerTestIdentityReset,
  removeSellerTestIdentityProducts,
} from "../api/integrations/company-os/test-identity-reset.js";

test("seller test reset removes only Elyon-numbered test products", () => {
  const products = [
    { id: "a", articleNumber: "ELY-000017", sku: "ELY-000017", title: "Test A" },
    { id: "b", sku: "ELY-000018", title: "Test B" },
    { id: "legacy", sku: "SUP-123", title: "Legacy" },
  ];
  const result = removeSellerTestIdentityProducts(products);
  assert.equal(result.removed.length, 2);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, "legacy");
});

test("seller test reset is blocked by real eBay or order references", () => {
  const report = inspectSellerTestIdentityReset([
    { id: "a", articleNumber: "ELY-000017", ebayItemId: "123456789" },
  ], {});
  assert.equal(report.blockerCount, 1);
  assert.equal(report.ready, false);
  assert.equal(report.blockers[0].field, "ebayItemId");
});

test("seller test reset allows Company OS transfer timestamps during explicit test cleanup", () => {
  const report = inspectSellerTestIdentityReset([
    {
      id: "a",
      articleNumber: "ELY-000017",
      sellerToolReceivedAt: "2026-08-18T10:00:00.000Z",
      processingStatus: "sent_to_seller_tool",
      listingStatus: "draft",
    },
  ], {});
  assert.equal(report.blockerCount, 0);
  assert.equal(report.ready, true);
});

test("seller test reset can be disabled server-side", () => {
  const report = inspectSellerTestIdentityReset([
    { id: "a", articleNumber: "ELY-000017" },
  ], { ELYON_TEST_IDENTITY_RESET_ENABLED: "false" });
  assert.equal(report.enabled, false);
  assert.equal(report.ready, false);
});
