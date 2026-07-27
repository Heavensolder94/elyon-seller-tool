import assert from "node:assert/strict";
import test from "node:test";

import { normalizeProduct } from "../lib/product-master-active.js";

function approvedProduct(overrides = {}) {
  return {
    id: "company-product-ready",
    source: "elyon_company_os",
    reviewApproved: true,
    title: "Markenfreier Aufbewahrungshalter",
    description: "Vollständige und ehrliche Produktbeschreibung.",
    images: ["https://example.com/product.jpg"],
    supplierUrl: "https://supplier.example/product",
    economics: {
      purchasePrice: 10,
      supplierShipping: 2,
      importCosts: 0,
      estimatedEbayFees: 3,
      returnReserve: 1,
      otherCosts: 0,
      salePrice: 25,
      realisticProfit: 9,
      marginPercent: 36,
      marketplaceFeePercent: 12,
    },
    logistics: {
      deliveryTime: "3–5 Werktage",
      returnAddress: "Deutschland",
      variants: [],
    },
    compliance: { status: "approved", risks: [] },
    listingPackage: {
      status: "completed",
      schemaVersion: "elyon-listing-package-v1",
      title: "Aufbewahrungshalter praktisch kompakt neu",
      descriptionHtml: "<p>Vollständige Beschreibung</p>",
      itemSpecifics: { Material: "Kunststoff" },
      conditionId: "1000",
      images: ["https://example.com/product.jpg"],
    },
    ...overrides,
  };
}

test("a complete approved Company OS package becomes ready for manual listing", () => {
  const product = normalizeProduct(approvedProduct());
  assert.equal(product.approval.companyOsApproved, true);
  assert.deepEqual(product.readiness.blockers, [], `Unexpected blockers: ${JSON.stringify(product.readiness.blockers)}`);
  assert.equal(product.readiness.state, "ready_for_manual_listing");
  assert.equal(product.pricing.minimumRulePassed, true);
  assert.equal(product.listing.conditionId, "1000");
  assert.equal(product.supplier.url, "https://supplier.example/product");
});

test("Seller Tool never interprets a sell price as purchase price", () => {
  const product = normalizeProduct({
    reviewApproved: true,
    title: "Testprodukt",
    description: "Beschreibung",
    images: ["https://example.com/a.jpg"],
    supplierUrl: "https://supplier.example/a",
    sellPrice: 29.99,
  });
  assert.equal(product.pricing.buyPrice, 0);
  assert.match(product.readiness.blockers.join(" "), /Einkaufspreis fehlt/);
});

test("Elyon minimum rule accepts either 20 percent margin or 5 euro profit", () => {
  const marginPass = normalizeProduct(approvedProduct({
    economics: {
      purchasePrice: 15,
      supplierShipping: 1,
      importCosts: 0,
      estimatedEbayFees: 2,
      returnReserve: 0,
      otherCosts: 0,
      salePrice: 20,
      realisticProfit: 4,
      marginPercent: 20,
      marketplaceFeePercent: 10,
    },
  }));
  assert.equal(marginPass.pricing.minimumRulePassed, true);
  assert.doesNotMatch(marginPass.readiness.blockers.join(" "), /Mindestregel/);

  const profitPass = normalizeProduct(approvedProduct({
    economics: {
      purchasePrice: 20,
      supplierShipping: 1,
      importCosts: 0,
      estimatedEbayFees: 3,
      returnReserve: 0,
      otherCosts: 0,
      salePrice: 30,
      realisticProfit: 6,
      marginPercent: 10,
      marketplaceFeePercent: 10,
    },
  }));
  assert.equal(profitPass.pricing.minimumRulePassed, true);
  assert.doesNotMatch(profitPass.readiness.blockers.join(" "), /Mindestregel/);
});

test("missing handoff duties and weak economics remain blocked", () => {
  const product = normalizeProduct(approvedProduct({
    economics: {
      purchasePrice: 20,
      supplierShipping: 2,
      importCosts: 0,
      estimatedEbayFees: 3,
      returnReserve: 1,
      otherCosts: 0,
      salePrice: 28,
      realisticProfit: 2,
      marginPercent: 7.14,
      marketplaceFeePercent: 10,
    },
    logistics: { deliveryTime: "5 Werktage", returnAddress: "" },
  }));
  assert.equal(product.readiness.state, "not_ready");
  assert.match(product.readiness.blockers.join(" "), /Rücksendeadresse fehlt/);
  assert.match(product.readiness.blockers.join(" "), /Mindestregel/);
});
