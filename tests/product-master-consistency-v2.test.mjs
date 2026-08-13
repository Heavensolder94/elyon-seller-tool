import assert from "node:assert/strict";
import test from "node:test";

import { normalizeProduct } from "../lib/product-master-active.js";

const rawAliExpressProduct = {
  id: "1005010346690326",
  source: "aliexpress",
  title: "3D selbstklebender Wandaufkleber Holzmaserung wasserdicht PVC Dekorstreifen",
  description: "Testbeschreibung",
  images: ["https://example.test/product.jpg"],
  supplierLink: "https://de.aliexpress.com/item/1005010346690326.html?skuId=12000052061773915",
  economics: {
    purchasePrice: 8.59,
    salePrice: 26.12,
    supplierShipping: 0,
    importCosts: 0,
    returnReserve: 0,
    otherCosts: 0,
    marketplaceFeePercent: 13,
    paymentFeePercent: 0,
    estimatedEbayFees: 0,
    realisticProfit: 0,
    marginPercent: 0,
  },
  logistics: {
    deliveryTime: "7-10 Werktage",
    returnAddress: "",
    variants: [],
  },
  compliance: {
    status: "needs_review",
  },
};

test("stale zero economics are recalculated and labeled as reconciled", () => {
  const product = normalizeProduct(rawAliExpressProduct);
  assert.equal(product.supplier.name, "AliExpress");
  assert.equal(product.pricing.estimatedFees, 3.4);
  assert.equal(product.pricing.profit, 14.13);
  assert.equal(product.pricing.marginPercent, 54.11);
  assert.equal(product.pricing.minimumRulePassed, true);
  assert.equal(product.pricing.calculationSource, "seller_validation_reconciled");
});

test("re-normalizing a reconciled Product Master record preserves reconciled provenance", () => {
  const first = normalizeProduct(rawAliExpressProduct);
  const second = normalizeProduct(first);
  assert.equal(second.pricing.estimatedFees, 3.4);
  assert.equal(second.pricing.profit, 14.13);
  assert.equal(second.pricing.marginPercent, 54.11);
  assert.equal(second.pricing.calculationSource, "seller_validation_reconciled");
});