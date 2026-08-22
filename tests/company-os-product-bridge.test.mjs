import assert from "node:assert/strict";
import test from "node:test";

import { validateBridgeAccess } from "../lib/bridge-access.js";
import { isReviewedCompanyProduct } from "../api/integrations/company-os/products.js";

function req(secret, body = {}) {
  return { method: "POST", headers: { "x-elyon-bridge-secret": secret }, body };
}

test("bridge access accepts only the configured secret", () => {
  const env = { ELYON_BRIDGE_SECRET: "strong-test-secret" };
  assert.equal(validateBridgeAccess(req("strong-test-secret"), env).ok, true);
  const denied = validateBridgeAccess(req("wrong-secret"), env);
  assert.equal(denied.ok, false);
  assert.equal(denied.status, 403);
});

test("bridge remains closed when no server secret exists", () => {
  const result = validateBridgeAccess(req("anything"), {});
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
});

test("only finally approved Company OS products pass the bridge", () => {
  assert.equal(isReviewedCompanyProduct({ status: "neu", reviewStatus: "not_reviewed" }), false);
  assert.equal(isReviewedCompanyProduct({ reviewStatus: "in_review" }), false);
  assert.equal(isReviewedCompanyProduct({ companyOsSection: "pruefen" }), false);
  assert.equal(isReviewedCompanyProduct({ processingStatus: "sent_to_review" }), false);
  assert.equal(isReviewedCompanyProduct({ status: "prüfen" }), false);
  assert.equal(isReviewedCompanyProduct({ reviewApproved: true }), false);
  assert.equal(isReviewedCompanyProduct({ reviewStatus: "approved" }), false);
  assert.equal(isReviewedCompanyProduct({ processingStatus: "ready_for_seller_tool" }), false);
  assert.equal(isReviewedCompanyProduct({ status: "bereit_manuell_einstellen" }), false);
  assert.equal(isReviewedCompanyProduct({ listingPackage: { status: "completed" } }), false);
  assert.equal(isReviewedCompanyProduct({ reviewApproved: true, processingStatus: "ready_for_seller_tool" }), true);
  assert.equal(isReviewedCompanyProduct({ reviewStatus: "approved", status: "bereit_manuell_einstellen" }), true);
});

test("Company OS handoff no longer writes a competing Seller Product Master", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../api/integrations/company-os/products.js", import.meta.url), "utf8");
  assert.match(source, /product_master_read_only/);
  assert.match(source, /consumerRoute: "\/api\/products"/);
  assert.equal(source.includes("writeProductMasterList"), false);
  assert.equal(source.includes("upsertProductMasterItem"), false);
});
