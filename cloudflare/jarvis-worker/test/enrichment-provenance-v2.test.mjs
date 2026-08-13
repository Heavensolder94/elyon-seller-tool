import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPreservingEnrichmentPatch,
  collectEnrichmentLayers,
  existingEnrichmentFields,
} from "../src/enrichment-provenance-v2.js";

test("collects enrichment metadata from nested raw layers", () => {
  const product = {
    raw: {
      enrichment: {
        version: "v1",
        fields: {
          material: { value: "ABS", confidence: 0.97, status: "auto_apply" },
        },
      },
      raw: {
        enrichment: {
          version: "older",
          fields: {
            color: { value: "Schwarz", confidence: 0.93, status: "auto_apply" },
          },
        },
      },
    },
  };
  assert.equal(collectEnrichmentLayers(product).length, 2);
  const fields = existingEnrichmentFields(product);
  assert.equal(fields.material.value, "ABS");
  assert.equal(fields.color.value, "Schwarz");
});

test("new provenance merges instead of dropping previous fields", () => {
  const product = {
    raw: {
      enrichment: {
        version: "v1",
        fields: {
          material: { value: "ABS", confidence: 0.97, status: "auto_apply" },
        },
      },
    },
  };
  const patch = buildPreservingEnrichmentPatch({
    product,
    version: "jarvis-product-enrichment-v1.1",
    now: "2026-08-14T00:00:00.000Z",
    findings: [{
      field: "manufacturer",
      value: "Example GmbH",
      confidence: 0.97,
      sourceType: "manufacturer",
      sourceUrl: "https://manufacturer.test/",
      evidence: "Official manufacturer page",
      status: "pending_review",
      complianceSensitive: true,
    }],
  });
  assert.equal(patch.enrichment.fields.material.value, "ABS");
  assert.equal(patch.enrichment.fields.manufacturer.status, "pending_review");
  assert.equal(patch.enrichment.fields.manufacturer.complianceSensitive, true);
});
