import test from "node:test";
import assert from "node:assert/strict";
import { applyCompanyOsApprovalCompat } from "../lib/company-os-approval-compat.js";

test("ready_for_seller_tool becomes documented approval", () => {
  const body = applyCompanyOsApprovalCompat({
    action: "analyze_product",
    input: {
      product: {
        id: "P-1",
        status: "ready_for_seller_tool",
      },
    },
  });

  assert.deepEqual(body.input.product.companyOsApproval, {
    status: "ready_for_seller_tool",
    approved: true,
    source: "product-status",
  });
});

test("bereit_manuell_einstellen becomes documented approval", () => {
  const body = applyCompanyOsApprovalCompat({
    input: { product: { status: "bereit_manuell_einstellen" } },
  });
  assert.equal(body.input.product.companyOsApproval.approved, true);
});

test("unknown status remains documented but not approved", () => {
  const body = applyCompanyOsApprovalCompat({
    input: { product: { status: "draft" } },
  });
  assert.equal(body.input.product.companyOsApproval.status, "draft");
  assert.equal(body.input.product.companyOsApproval.approved, false);
});

test("existing explicit approval is never overwritten", () => {
  const body = applyCompanyOsApprovalCompat({
    input: {
      product: {
        status: "draft",
        companyOsApproval: {
          status: "approved",
          approved: true,
          source: "product-master",
        },
      },
    },
  });
  assert.deepEqual(body.input.product.companyOsApproval, {
    status: "approved",
    approved: true,
    source: "product-master",
  });
});
