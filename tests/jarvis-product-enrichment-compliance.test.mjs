import assert from "node:assert/strict";
import test from "node:test";
import { classifyFindings } from "../cloudflare/jarvis-worker/src/product-enrichment.js";

test("high-confidence compliance findings remain review-only", () => {
  const result = classifyFindings({
    product: { listing: { itemSpecifics: {} } },
    rawProduct: {},
    findings: [
      { field: "material", value: "ABS", confidence: 0.97, complianceSensitive: false },
      { field: "manufacturer", value: "Example GmbH", confidence: 0.97, complianceSensitive: true },
    ],
  });
  assert.deepEqual(result.autoApply.map((item) => item.field), ["material"]);
  assert.deepEqual(result.pendingReview.map((item) => item.field), ["manufacturer"]);
});
