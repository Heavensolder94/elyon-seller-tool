import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { archiveProcessedFeedRecord, reconcileElyonDraftRecords } from "../lib/ebay-draft-registry.js";

const sku = "AMZ-B0BWND9WBR";
const task = "feed-task-dreamzie-123";
const at = "2026-11-19T00:00:00.000Z";
const feed = {
  sku, offerId: "", environment: "production", visibilityMode: "seller_hub_feed",
  state: "draft", externalTaskId: task, externalDraftStatus: "confirmed",
  draftTitle: "Dreamzie Kissenbezug 80x80 2er-Set",
  feedStatusCheckedAt: "2026-11-18T22:00:00.000Z",
  sourceProductId: "ELY-000004",
};

test("Dreamzie local archive removes only the processed feed from current drafts, preserving full evidence", () => {
  const initial = reconcileElyonDraftRecords([feed], { environment: "production" });
  assert.equal(initial.drafts.length, 1);
  assert.equal(initial.drafts[0].source, "elyon_seller_hub_feed");
  const archived = archiveProcessedFeedRecord([feed], { environment: "production", sku, externalTaskId: task }, at);
  assert.equal(archived.ok, true);
  assert.equal(archived.alreadyArchived, false);
  assert.equal(archived.records.length, 1);
  assert.equal(archived.record.state, "archived");
  assert.equal(archived.record.archivedAt, at);
  assert.equal(archived.record.sourceProductId, "ELY-000004");
  assert.equal(archived.record.externalTaskId, task);
  assert.equal(archived.record.externalDraftStatus, "confirmed");
  assert.equal(archived.record.feedStatusCheckedAt, feed.feedStatusCheckedAt);
  const next = reconcileElyonDraftRecords(archived.records, { environment: "production", timestamp: "2026-11-19T01:00:00.000Z" });
  assert.equal(next.drafts.length, 0);
  assert.equal(next.counts.archived, 1);
  assert.equal(next.counts.draft, 0);
  assert.equal(next.records[0].state, "archived", "a refreshed seller state must not restore an old processed Feed");
  assert.equal(next.records[0].externalTaskId, task);
});

test("archive is not a seller-hub removal claim or remote deletion", () => {
  const archived = archiveProcessedFeedRecord([feed], { environment: "production", sku, externalTaskId: task }, at);
  assert.equal(archived.record.removedAt, "");
  assert.equal(archived.record.withdrawnAt, "");
  assert.equal(archived.record.endedAt, "");
  assert.equal(archived.record.previousState, "draft");
  const inventory = reconcileElyonDraftRecords(archived.records, {
    environment: "production",
    inventoryItems: [{ sku, offerId: "real-new-api-offer", status: "UNPUBLISHED" }],
  });
  assert.equal(inventory.drafts.length, 1, "real API offers are never hidden by historical Feed archiving");
  assert.equal(inventory.drafts[0].source, "elyon_inventory_draft");
});

test("archive rejects missing or mismatched task ID, non-feed and non-confirmed records", () => {
  const other = { ...feed, sku: "AMZ-B0D63HF7Z4" };
  const records = [feed, other];
  for (const input of [
    { environment: "production", sku, externalTaskId: "" },
    { environment: "production", sku, externalTaskId: "not-this-task" },
    { environment: "sandbox", sku, externalTaskId: task },
  ]) {
    const result = archiveProcessedFeedRecord(records, input, at);
    assert.equal(result.ok, false);
    assert.equal(records[0].state, "draft");
  }
  for (const candidate of [
    { ...feed, visibilityMode: "inventory_offer" },
    { ...feed, externalDraftStatus: "processing" },
    { ...feed, state: "published" },
    { ...feed, offerId: "confirmed-api-offer" },
  ]) {
    const result = archiveProcessedFeedRecord([candidate], { environment: "production", sku, externalTaskId: task }, at);
    assert.equal(result.ok, false);
  }
});

test("archiving the same historical task twice is idempotent", () => {
  const first = archiveProcessedFeedRecord([feed], { environment: "production", sku, externalTaskId: task }, at);
  const second = archiveProcessedFeedRecord(first.records, { environment: "production", sku, externalTaskId: task }, "2026-11-20T00:00:00.000Z");
  assert.equal(second.ok, true);
  assert.equal(second.alreadyArchived, true);
  assert.equal(second.record.archivedAt, at);
});

test("seller-state exposes archived history separately and client displays it as a collapsed panel", async () => {
  const seller = await readFile(new URL("../api/ebay/seller-state.js", import.meta.url), "utf8");
  assert.match(seller, /feedHistory:\s*\{\s*archived: archivedFeedHistory\.length/);
  assert.match(seller, /record\.visibilityMode === "seller_hub_feed" && record\.state === "archived"/);
  const moduleSource = await readFile(new URL("../public/seller-feed-archive.js", import.meta.url), "utf8");
  const box = { window: {} };
  vm.runInNewContext(moduleSource, box);
  const html = box.window.ElyonFeedArchive.renderHistory([
    { sku, title: feed.draftTitle, externalTaskId: task, archivedAt: at },
  ]);
  assert.match(html, /Feed-Verlauf · 1 archiviert/);
  assert.match(html, /Dreamzie Kissenbezug/);
  assert.match(html, /feed-task-dreamzie-123/);
  assert.match(html, /Lokaler ELYON-Verlauf/);
  assert.equal(box.window.ElyonFeedArchive.renderHistory([]), "");
});

test("archive endpoint only updates registry after explicit Dreamzie confirmation and does not call eBay", async () => {
  const server = await readFile(new URL("../api/ebay/archive-processed-feed.js", import.meta.url), "utf8");
  assert.match(server, /requireSellerAccess\(req, res/);
  assert.match(server, /isSameOriginSellerMutation\(req\.headers/);
  assert.match(server, /sku !== DREAMZIE_SKU/);
  assert.match(server, /confirmation !== "ARCHIVE_FEED_LOCALLY"/);
  assert.match(server, /archiveElyonProcessedFeed\(\{ sku, externalTaskId, environment: "production" \}\)/);
  assert.doesNotMatch(server, /deleteOffer|publishEbayOffer|callEbayJson|\/sell\/inventory\/v1/);
  const loader = await readFile(new URL("../seller-runtime-loader.js", import.meta.url), "utf8");
  const moduleSource = await readFile(new URL("../public/seller-feed-archive.js", import.meta.url), "utf8");
  assert.match(loader, /draftsTab: \[\{ src: "\/seller-feed-archive\.js" \}\]/);
  assert.match(loader, /window\.__elyonSellerStateLoadedAt = 0/);
  assert.match(moduleSource, /window\.confirm\(/);
  assert.match(moduleSource, /\/api\/ebay\/archive-processed-feed/);
  assert.match(moduleSource, /const SKU = "AMZ-B0BWND9WBR"/);
});
