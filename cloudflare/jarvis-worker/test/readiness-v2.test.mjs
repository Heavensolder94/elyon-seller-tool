import assert from "node:assert/strict";
import test from "node:test";
import { determineListingReadiness, productMasterReadinessReasons, recommendationFromReadiness } from "../src/index.js";

test("legacy product identity requires more data before listing", () => {
  const product = {
    articleNumber: null,
    sku: null,
    identity: { status: "missing_elyon_article_number" },
    approval: { companyOsApproved: false },
    logistics: { returnAddress: "" },
    listing: { itemSpecifics: {}, conditionId: "" },
    readiness: { state: "not_ready", blockers: ["identity missing"] },
  };

  const reasons = productMasterReadinessReasons(product);
  assert.ok(reasons.includes("missing_elyon_article_number"));
  assert.ok(reasons.includes("company_os_approval_missing"));

  const readiness = determineListingReadiness({
    product,
    dataQuality: { score: 82, missingFields: ["manufacturer"], warnings: [] },
    economics: { status: "pass" },
    compliance: { risk: "medium", missing: ["manufacturer"], warnings: [] },
  });

  assert.equal(readiness.status, "needs_data");
  assert.ok(readiness.reasons.includes("missing_elyon_article_number"));
  assert.ok(readiness.reasons.includes("missing_compliance_data"));

  const recommendation = recommendationFromReadiness(readiness);
  assert.equal(recommendation.decision, "review");
  assert.equal(recommendation.blocking, true);
});

test("canonical Elyon identity does not add legacy identity reasons", () => {
  const reasons = productMasterReadinessReasons({
    articleNumber: "ELY-000123",
    sku: "ELY-000123",
    identity: { status: "ready", articleNumber: "ELY-000123" },
  });
  assert.deepEqual(reasons, []);
});