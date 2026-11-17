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

test("one successful snapshot without a known Inventory draft does not mark it removed", () => {
  const result = reconcile([base]);
  assert.equal(result.records[0].state, "draft");
  assert.equal(result.records[0].missingCount, 1);
  assert.equal(result.records[0].removedAt, "");
  assert.equal(result.changes.length, 0);
});

test("two consecutive successful snapshots without an Inventory draft confirm removed while preserving history", () => {
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

test("Seller Hub Feed draft absence is never guessed as deletion because eBay exposes no later draft lookup", () => {
  const feedDraft = {
    ...base,
    offerId: "",
    visibilityMode: "seller_hub_feed",
    externalDraftId: "draft-123",
    externalTaskId: "task-123",
  };
  const first = reconcile([feedDraft]);
  const second = reconcile(first.records, { timestamp: "2026-08-21T11:05:00.000Z" });
  const third = reconcile(second.records, { timestamp: "2026-08-21T11:10:00.000Z" });

  assert.equal(third.records[0].state, "draft");
  assert.equal(third.records[0].missingCount, 0);
  assert.equal(third.records[0].removedAt, "");
});

test("Seller Hub Feed identity becomes published when the SKU appears active, then uses safe end detection", () => {
  const feedDraft = {
    ...base,
    offerId: "",
    visibilityMode: "seller_hub_feed",
  };
  const active = reconcile([feedDraft], {
    activeListings: [{ listingId: "item-feed-1", sku: "ELY-000001", status: "PUBLISHED" }],
  });
  assert.equal(active.records[0].state, "published");
  assert.equal(active.records[0].listingId, "item-feed-1");

  const firstMiss = reconcile(active.records, { timestamp: "2026-08-21T11:05:00.000Z" });
  const secondMiss = reconcile(firstMiss.records, { timestamp: "2026-08-21T11:10:00.000Z" });
  assert.equal(secondMiss.records[0].state, "ended");
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

test("Company OS lifecycle bridge requires explicit confirmation for a Feed draft deletion", () => {
  const source = fs.readFileSync(new URL("../api/integrations/company-os/ebay-lifecycle.js", import.meta.url), "utf8");
  assert.match(source, /confirmation !== "seller_hub_removed"/);
  assert.match(source, /automaticDraftDeletionObservable/);
  assert.match(source, /productHardDelete: false/);
  assert.doesNotMatch(source, /DELETE\s+FROM|deleteProduct|removeProductMaster/i);
});

test("confirmed Amazon Feed draft appears alongside Inventory drafts with truthful provenance", () => {
  const feed = {
    ...base, offerId: "", sku: "AMZ-DREAMZIE", sourceProductId: "amazon:B012345678",
    visibilityMode: "seller_hub_feed", externalTaskId: "task-dreamzie",
    externalDraftStatus: "confirmed", draftTitle: "Dreamzie Kissenbezug 80x80 2er Set",
    draftPrice: 29.99, draftCurrency: "EUR", draftImages: ["https://example.test/photo.jpg"],
  };
  const result = reconcile([base, feed], {
    inventoryItems: [{ sku: "ELY-000001", offerId: "offer-1", status: "UNPUBLISHED", title: "NOBIS Powerbank" }],
  });
  assert.equal(result.drafts.length, 2);
  const dreamzie = result.drafts.find((draft) => draft.sku === "AMZ-DREAMZIE");
  assert.ok(dreamzie);
  assert.equal(dreamzie.status, "UNPUBLISHED");
  assert.equal(dreamzie.title, feed.draftTitle);
  assert.equal(dreamzie.price, 29.99);
  assert.equal(dreamzie.externalTaskId, "task-dreamzie");
  assert.equal(dreamzie.feedVerification, "feed_processed_not_live_checked");
  assert.deepEqual(dreamzie.images, ["https://example.test/photo.jpg"]);
});

test("pending Feed tasks and unconfirmed legacy Feed identities never inflate confirmed draft count", () => {
  const pending = { ...base, offerId: "", visibilityMode: "seller_hub_feed", externalTaskId: "task-pending",
    externalDraftStatus: "processing" };
  const legacy = { ...pending, sku: "ELY-000002", externalTaskId: "task-legacy", externalDraftStatus: "" };
  const result = reconcile([pending, legacy]);
  assert.equal(result.drafts.length, 0);
  assert.equal(result.records.every((record) => record.state === "draft"), true);
});

test("Feed draft is deduplicated when Inventory observes same SKU and disappears from drafts upon publishing", () => {
  const feed = { ...base, offerId: "", visibilityMode: "seller_hub_feed", externalTaskId: "task-1",
    externalDraftStatus: "confirmed" };
  const inventory = reconcile([feed], {
    inventoryItems: [{ sku: feed.sku, offerId: "offer-1", status: "UNPUBLISHED" }],
  });
  assert.equal(inventory.drafts.length, 1);
  assert.equal(inventory.drafts[0].source, "elyon_inventory_draft");
  const active = reconcile([feed], {
    activeListings: [{ sku: feed.sku, listingId: "active-item", status: "PUBLISHED" }],
  });
  assert.equal(active.drafts.length, 0);
  assert.equal(active.records[0].state, "published");
});

test("extension Feed registration requires confirmed task status and does not submit a second eBay draft for status", () => {
  const source = fs.readFileSync(new URL("../api/ebay/extension-action.js", import.meta.url), "utf8");
  assert.match(source, /task\.draftVisible === true/);
  assert.match(source, /saveExternalDraft\(payload, task, "confirmed"\)/);
  assert.match(source, /saveExternalDraft\(payload, task, "processing"\)/);
  assert.match(source, /getSellerHubDraftTask\(payload, payload\.environment\)/);
  assert.match(source, /registration = \{ persisted: false/);
  assert.doesNotMatch(source, /deleteElyonDraft|publishEbayOffer/);
});
