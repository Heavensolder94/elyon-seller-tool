import test from "node:test";
import assert from "node:assert/strict";

import {
  pendingProductHealth,
  productHealthReadiness,
} from "../seller-product-health-core.js";

test("empty draft is not rated instead of critical", () => {
  const readiness = productHealthReadiness({ name: "Neuer Artikel", status: "Draft" });
  assert.equal(readiness.state, "unrated");
  assert.equal(readiness.ready, false);

  const health = pendingProductHealth(readiness);
  assert.equal(health.label, "⚪ Noch nicht bewertet");
  assert.equal(health.cls, "info");
  assert.equal(health.score, "—");
});

test("partially filled product is marked incomplete", () => {
  const readiness = productHealthReadiness({
    name: "Teilweise ausgefüllt",
    buy: 7.5,
    sell: 19.99,
  });

  assert.equal(readiness.state, "incomplete");
  assert.deepEqual(readiness.missingLabels, [
    "Lieferzeit",
    "Supplier/Produktquelle",
    "Markt- oder Prüfdaten",
  ]);

  const health = pendingProductHealth(readiness);
  assert.equal(health.label, "🔵 Unvollständig");
  assert.match(health.text, /Lieferzeit/);
});

test("complete product remains eligible for existing health calculation", () => {
  const readiness = productHealthReadiness({
    buy: 7.5,
    sell: 24.99,
    delivery: 6,
    supplierLink: "https://supplier.example/product",
    competition: 12,
  });

  assert.equal(readiness.state, "ready");
  assert.equal(readiness.ready, true);
  assert.deepEqual(readiness.missingLabels, []);
});

test("stored AI decision counts as product check data", () => {
  const readiness = productHealthReadiness({
    buy: 7.5,
    sell: 24.99,
    delivery: 6,
    supplierId: "SUP-1",
    aiDecision: { decision: "TEST", score: 55 },
  });

  assert.equal(readiness.ready, true);
});
