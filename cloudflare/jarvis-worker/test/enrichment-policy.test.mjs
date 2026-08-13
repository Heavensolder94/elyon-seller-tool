import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAutoApplyPatch,
  buildProvenancePatch,
  classifyFindings,
  detectConcurrentConflicts,
  discoverEnrichmentTargets,
  snapshotTargetValues,
} from "../src/product-enrichment.js";

const product = {
  id: "product-123",
  articleNumber: "ELY-000123",
  sku: "ELY-000123",
  supplierSku: "SUP-1",
  supplier: { name: "AliExpress", url: "https://example.test/item/123" },
  logistics: { deliveryTime: "7-10 Werktage" },
  listing: { itemSpecifics: {} },
};

test("only missing supported fields are targeted", () => {
  assert.deepEqual(
    discoverEnrichmentTargets(product, {}, ["material", "deliveryTime", "supplierSku", "manufacturer"]),
    ["material", "manufacturer"]
  );
});

test("compliance remains review-only even with high confidence", () => {
  const result = classifyFindings({
    product,
    rawProduct: {},
    findings: [
      { field: "material", value: "ABS", confidence: 0.97, sourceType: "manufacturer", complianceSensitive: false },
      { field: "manufacturer", value: "Example GmbH", confidence: 0.97, sourceType: "manufacturer", complianceSensitive: true },
    ],
  });
  assert.deepEqual(result.autoApply.map((item) => item.field), ["material"]);
  assert.deepEqual(result.pendingReview.map((item) => item.field), ["manufacturer"]);
});

test("existing values are never silently overwritten", () => {
  const existing = { ...product, listing: { itemSpecifics: { Material: "Aluminium" } } };
  const result = classifyFindings({
    product: existing,
    rawProduct: {},
    findings: [{ field: "material", value: "ABS", confidence: 0.97, complianceSensitive: false }],
  });
  assert.equal(result.autoApply.length, 0);
  assert.equal(result.existingValueConflicts[0].existingValue, "Aluminium");
});

test("auto patch changes factual specifics but not product identity", () => {
  const result = buildAutoApplyPatch({
    product,
    findings: [{ field: "material", value: "ABS" }, { field: "color", value: "Schwarz" }],
  });
  assert.deepEqual(result.applied, ["material", "color"]);
  assert.equal(result.patch.listing.itemSpecifics.Material, "ABS");
  assert.equal(result.patch.listing.itemSpecifics.Farbe, "Schwarz");
  assert.equal("articleNumber" in result.patch, false);
  assert.equal("sku" in result.patch, false);
});

test("provenance persists confidence and review status", () => {
  const patch = buildProvenancePatch({
    product,
    now: "2026-08-14T00:00:00.000Z",
    findings: [{
      field: "manufacturer",
      value: "Example GmbH",
      confidence: 0.97,
      sourceType: "manufacturer",
      sourceUrl: "https://manufacturer.test/imprint",
      evidence: "Official manufacturer page",
      status: "pending_review",
      complianceSensitive: true,
    }],
  });
  assert.equal(patch.enrichment.fields.manufacturer.status, "pending_review");
  assert.equal(patch.enrichment.fields.manufacturer.confidence, 0.97);
  assert.equal(patch.enrichment.fields.manufacturer.complianceSensitive, true);
});

test("concurrent changes block stale auto apply", () => {
  const baseline = snapshotTargetValues(product, {}, ["material"]);
  const current = { ...product, listing: { itemSpecifics: { Material: "Aluminium" } } };
  const result = detectConcurrentConflicts({
    baseline,
    currentProduct: current,
    currentRawProduct: {},
    findings: [{ field: "material", value: "ABS", confidence: 0.97 }],
  });
  assert.equal(result.safeFindings.length, 0);
  assert.equal(result.conflicts[0].existingValue, "Aluminium");
});
