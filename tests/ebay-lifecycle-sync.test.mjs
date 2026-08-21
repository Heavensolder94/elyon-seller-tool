import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { reconcileElyonDraftRecords } from "../lib/ebay-draft-registry.js";

const base = {
  offerId: "offer-1",
  sku: "ELY-000001",
  environment: "production",
  state: "draft",
  sourceProductId: "product-1",
  createdAt: "2026-08-21T10:00:00.000Z",
  updatedAt: "2026-08-21T10:00:00.000Z",
};

function reconcile(records, overrides = {}) {
  return reconcileElyonDraftRecords(records, {
    environment: "production",
    inventoryItems: [],
    activeListings: [],
    timestamp: "2026-08-21T11:00:00.000Z",
    ...overrides,
  });
}

test("one successful snapshot without a known draft does not mark it removed", () => {
  const result = reconcile([base]);
  assert.equal(result.records[0].state, "draft");
  assert.equal(result.records[0].missingCount, 1);
  assert.equal(result.records[0].removedAt, "");
  assert.equal(result.changes.length, 0);
});

test("two consecutive successful snapshots without a draft confirm removed while preserving history", () => {
  const first = reconcile([base]);
  const second = reconcile(first.records, { timestamp: "2026-08-21T11:05:00.000Z" });
  const record = second.records[0];

  assert.equal(record.state, "removed");
  assert.equal(record.previousState, "draft");
  assert.equal(record.sourceProductId, "product-1");
  assert.equal(record.offerId, "offer-1");
  assert.equal(record.sku, "ELY-000001");
  assert.equal(record.missingCount, 2);
  assert.equal(record.removedAt, "2026-08-21T11:05:00.000Z");
  assert.equal(second.records.length, 1, "lifecycle reconciliation must never hard-delete the product history");
});

test("a removed draft that reappears as UNPUBLISHED is revived and its missing counter is reset", () => {
  const removed = {
    ...base,
    state: "removed",
    previousState: "draft",
    removedAt: "2026-08-21T11:05:00.000Z",
    missingCount: 2,
    missingSince: "2026-08-21T11:00:00.000Z",
  };
  const result = reconcile([removed], {
    inventoryItems: [{ offerId: "offer-1", sku: "ELY-000001", status: "UNPUBLISHED" }],
  });

  assert.equal(result.records[0].state, "draft");
  assert.equal(result.records[0].previousState, "removed");
  assert.equal(result.records[0].missingCount, 0);
  assert.equal(result.records[0].missingSince, "");
  assert.equal(result.records[0].removedAt, "");
  assert.equal(result.drafts.length, 1);
});

test("published listing becomes ended only after two successful snapshots without active or published evidence", () => {
  const active = reconcile([base], {
    activeListings: [{ listingId: "item-77", sku: "ELY-000001", status: "PUBLISHED" }],
  });
  assert.equal(active.records[0].state, "published");
  assert.equal(active.records[0].listingId, "item-77");

  const firstMiss = reconcile(active.records, { timestamp: "2026-08-21T11:05:00.000Z" });
  assert.equal(firstMiss.records[0].state, "published");
  assert.equal(firstMiss.records[0].missingCount, 1);

  const secondMiss = reconcile(firstMiss.records, { timestamp: "2026-08-21T11:10:00.000Z" });
  assert.equal(secondMiss.records[0].state, "ended");
  assert.equal(secondMiss.records[0].previousState, "published");
  assert.equal(secondMiss.records[0].endedAt, "2026-08-21T11:10:00.000Z");
});

test("matching uses stable eBay identity/SKU and never a title", () => {
  const result = reconcile([base], {
    inventoryItems: [{ offerId: "different", sku: "ELY-000001", status: "UNPUBLISHED", title: "Completely different title" }],
  });
  assert.equal(result.records[0].state, "draft");
  assert.equal(result.records[0].missingCount, 0);
  assert.equal(result.drafts.length, 1);
});

test("seller-state only reconciles missing records when inventory snapshot succeeded and passes active listings", () => {
  const source = fs.readFileSync(new URL("../api/ebay/seller-state.js", import.meta.url), "utf8");
  assert.match(source, /if \(inventoryResult\.status === "fulfilled"\)/);
  assert.match(source, /activeListings,/);
  assert.match(source, /absence_requires_two_successful_snapshots/);
});
