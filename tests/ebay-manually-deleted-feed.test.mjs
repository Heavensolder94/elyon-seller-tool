import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { planManuallyDeletedSellerHubFeed, reconcileElyonDraftRecords } from "../lib/ebay-draft-registry.js";

const at = "2026-11-23T00:45:00.000Z";
const sku = "AMZ-B0D63HF7Z4";
const old = {
  sku, externalTaskId: "task-moxled-registry", environment: "production",
  visibilityMode: "seller_hub_feed", state: "draft",
  externalDraftStatus: "confirmed", offerId: "", listingId: "",
  draftTitle: "Moxled Lichterkette Weihnachtsbaum",
  sourceProductId: "amazon:B0D63HF7Z4",
};
const other = {
  ...old, sku: "AMZ-B0BWND9WBR", externalTaskId: "task-other",
  draftTitle: "Anderer Amazon-Entwurf",
};
const input = { sku, externalTaskId: old.externalTaskId, environment: "production" };

test("manually deleted Moxled feed is marked removed only by exact SKU and registered task ID", () => {
  const records = [other, old];
  const result = planManuallyDeletedSellerHubFeed(records, input, at);
  assert.equal(result.ok, true);
  assert.equal(result.records.length, 2);
  assert.deepEqual(result.records[0].sku, other.sku);
  assert.equal(result.records[0].state, "draft");
  assert.equal(result.records[1].state, "removed");
  assert.equal(result.records[1].previousState, "draft");
  assert.equal(result.records[1].externalTaskId, old.externalTaskId);
  assert.equal(result.records[1].removedAt, at);
  assert.equal(result.records[1].sourceProductId, old.sourceProductId);
  assert.equal(old.state, "draft", "pure planner does not mutate original records");
});

test("manual deletion is idempotent and never reactivates previously removed task", () => {
  const first = planManuallyDeletedSellerHubFeed([old], input, at);
  const again = planManuallyDeletedSellerHubFeed(first.records, input, "2026-11-23T01:00:00.000Z");
  assert.equal(again.ok, true);
  assert.equal(again.alreadyRemoved, true);
  assert.equal(again.record.removedAt, at);
});

test("wrong task, wrong SKU, duplicate active SKU or environment blocks removal", () => {
  for (const [records, request] of [
    [[old], { ...input, externalTaskId: "some-other-task" }],
    [[old], { ...input, sku: other.sku }],
    [[old, { ...old, externalTaskId: "active-conflict" }], input],
    [[old], { ...input, environment: "sandbox" }],
  ]) {
    const result = planManuallyDeletedSellerHubFeed(records, request, at);
    assert.equal(result.ok, false, "never guess a target");
  }
});

test("Inventory offers, published offers and linked Listing IDs remain untouched", () => {
  for (const record of [
    { ...old, visibilityMode: "inventory_offer", offerId: "offer1" },
    { ...old, state: "published", listingId: "listing1" },
    { ...old, offerId: "offer1" },
    { ...old, listingId: "listing1" },
    { ...old, externalDraftStatus: "" },
  ]) {
    assert.equal(planManuallyDeletedSellerHubFeed([record], input, at).ok, false);
  }
  assert.equal(planManuallyDeletedSellerHubFeed([old, { ...other, sku, state: "published" }], input, at).ok, false);
});

test("deleted Feed is no longer shown as an active ELYON draft after reconciliation", () => {
  const removed = planManuallyDeletedSellerHubFeed([old], input, at);
  const reconciled = reconcileElyonDraftRecords(removed.records, {
    environment: "production", inventoryItems: [], activeListings: [],
  });
  assert.equal(reconciled.drafts.length, 0);
  assert.equal(reconciled.records[0].state, "removed");
  assert.equal(reconciled.records[0].externalTaskId, old.externalTaskId);
});

test("extension cleanup requires explicit confirmation and does not call eBay create/delete/publish", async () => {
  const source = await readFile(new URL("../api/ebay/extension-action.js", import.meta.url), "utf8");
  assert.match(source, /applyExtensionSellerSession\(req\)/);
  const start = source.indexOf('if (action === "mark-deleted-feed")');
  const end = source.indexOf('if (action === "list-draft-recovery-candidates")', start);
  assert.ok(start > 0 && end > start);
  const segment = source.slice(start, end);
  assert.match(segment, /EBAY_DRAFT_ALREADY_DELETED/);
  assert.match(segment, /markManuallyDeletedSellerHubFeed/);
  assert.doesNotMatch(segment, /createSellerHubDraft|publishEbayOffer|deleteOffer|callEbayJson|uploadDraftCsv/);
});
