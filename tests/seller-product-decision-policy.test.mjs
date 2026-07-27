import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  productDecisionStatus,
  productHealthReadiness,
} from "../seller-product-health-core.js";

test("empty draft is unrated and remains editable", () => {
  const decision = productDecisionStatus(
    { name: "Neuer Draft", status: "Draft" },
    { key: "no", cls: "bad", label: "🔴 Nicht geeignet" },
  );

  assert.equal(decision.key, "unrated");
  assert.equal(decision.label, "⚪ Noch nicht bewertet");
  assert.equal(decision.blocking, false);
  assert.equal(decision.canEdit, true);
  assert.equal(decision.canPrepareListing, true);
  assert.equal(decision.canPublishManually, true);
});

test("partially filled product is incomplete instead of unsuitable", () => {
  const product = { buy: 8.5, sell: 24.99 };
  const readiness = productHealthReadiness(product);
  const decision = productDecisionStatus(product, { key: "no", cls: "bad" });

  assert.equal(readiness.state, "incomplete");
  assert.equal(decision.key, "incomplete");
  assert.equal(decision.label, "🔵 Unvollständig");
  assert.match(decision.text, /Lieferzeit/);
  assert.equal(decision.blocking, false);
});

test("complete low-score product is a warning and not a technical block", () => {
  const product = {
    buy: 15,
    sell: 17.99,
    delivery: 18,
    supplierLink: "https://supplier.example/item",
    competition: 95,
  };
  const decision = productDecisionStatus(product, {
    key: "no",
    cls: "bad",
    label: "🔴 Nicht geeignet",
  });

  assert.equal(decision.key, "no");
  assert.equal(decision.label, "🔴 Rechnerisch schwach");
  assert.equal(decision.blocking, false);
  assert.equal(decision.canEdit, true);
  assert.equal(decision.canPrepareListing, true);
  assert.equal(decision.canOpenListingPackage, true);
  assert.equal(decision.canPublishManually, true);
  assert.equal(decision.requiresFinalComplianceCheck, true);
  assert.match(decision.text, /keine technische Sperre/);
});

test("complete good product remains a good candidate", () => {
  const product = {
    buy: 7,
    sell: 29.99,
    delivery: 5,
    supplierId: "SUP-1",
    sales: 25,
  };
  const decision = productDecisionStatus(product, {
    key: "go",
    cls: "good",
    label: "🟢 Listing-Kandidat",
  });

  assert.equal(decision.key, "go");
  assert.equal(decision.label, "🟢 Guter Kandidat");
  assert.equal(decision.blocking, false);
});

test("browser policy visibly explains warning without enabling automatic publishing", async () => {
  const source = await readFile(new URL("../seller-product-health-state.js", import.meta.url), "utf8");

  assert.match(source, /Bewertung ist eine Empfehlung, keine Sperre/);
  assert.match(source, /Listing-Paket trotzdem anzeigen/);
  assert.match(source, /Trotz Warnung für eBay vorbereiten/);
  assert.match(source, /eBay-Pflichtangaben und rechtliche Angaben/);
  assert.doesNotMatch(source, /automatic.*publish|auto.*publish/i);
});
