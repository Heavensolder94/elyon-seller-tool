import assert from "node:assert/strict";
import test from "node:test";
import { planExternalFeedRegistration, feedRegistrationFailureMessage } from "../lib/ebay-external-feed-identity.js";

const sku = "AMZ-B0BWND9WBR";
const base = {
  sku,
  environment: "production",
  sourceProductId: "amazon:B0BWND9WBR",
  state: "draft",
  visibilityMode: "seller_hub_feed",
  externalTaskId: "FX-DRAFT-NEW",
};
const input = { ...base };

test("recovering the existing verified FX_DRAFT task is idempotent", () => {
  assert.deepEqual(planExternalFeedRegistration([base], input), {
    ok: true, reason: "same_verified_task", index: 0,
  });
});

test("historical archived FX_LISTING task does not block newly verified FX_DRAFT", () => {
  const old = { ...base, externalTaskId: "FX-LISTING-OLD", state: "archived",
    externalDraftStatus: "confirmed", archivedAt: "2026-11-20T10:00:00Z" };
  const before = structuredClone(old);
  const result = planExternalFeedRegistration([old], input);
  assert.deepEqual(result, { ok: true, reason: "new_verified_task", index: -1 });
  assert.deepEqual(old, before, "older task metadata must not change");
});

test("removed/ended historical tasks preserve their identities and allow a new task", () => {
  for (const state of ["removed", "ended"]) {
    const prior = { ...base, externalTaskId: "OLD", state, visibilityMode: "inventory_offer" };
    assert.equal(planExternalFeedRegistration([prior], input).ok, true);
    assert.equal(planExternalFeedRegistration([prior], input).index, -1);
  }
});

test("an active Draft belonging to another task or Inventory offer is never overwritten", () => {
  for (const existing of [
    { ...base, externalTaskId: "FX-DRAFT-OTHER" },
    { ...base, externalTaskId: "", visibilityMode: "inventory_offer", offerId: "offer-1" },
    { ...base, externalTaskId: "FX-DRAFT-OLD", state: "published" },
  ]) {
    const result = planExternalFeedRegistration([existing], input);
    assert.equal(result.ok, false);
    assert.equal(result.index, -1);
  }
});

test("same task but different SKU, archived same task, and ambiguous task IDs are blocked", () => {
  assert.equal(planExternalFeedRegistration([{ ...base, sku: "AMZ-B0D63HF7Z4" }], input).reason,
    "feed_task_sku_mismatch");
  assert.equal(planExternalFeedRegistration([{ ...base, state: "archived" }], input).reason,
    "feed_record_no_longer_draft");
  assert.equal(planExternalFeedRegistration([base, { ...base }], input).reason,
    "feed_task_identity_ambiguous");
});

test("a pending unassigned Feed may adopt only the same Amazon source identity", () => {
  const pending = { ...base, externalTaskId: "" };
  assert.equal(planExternalFeedRegistration([pending], input).index, 0);
  assert.equal(planExternalFeedRegistration([{ ...pending, sourceProductId: "amazon:OTHER" }], input).ok, false);
});

test("other environment and terminal histories do not block real task", () => {
  const old = { ...base, environment: "sandbox", externalTaskId: "FX-DRAFT-NEW" };
  const archived = { ...base, externalTaskId: "OLDER", state: "archived" };
  const result = planExternalFeedRegistration([old, archived], input);
  assert.equal(result.ok, true);
  assert.equal(result.index, -1);
});

test("registration reasons are safe, actionable messages in extension response", () => {
  const reason = feedRegistrationFailureMessage("existing_sku_belongs_to_another_draft");
  assert.match(reason, /ander(?:en|em) aktiven Entwurf/);
  assert.match(feedRegistrationFailureMessage("storage_confirmation_missing"), /Speicher/);
  assert.doesNotMatch(reason, /token|password|secret|authorization/i);
});

test("existing extension recovery remains read-only toward eBay and retains task id", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../api/ebay/extension-action.js", import.meta.url), "utf8");
  const from = source.indexOf('if (action === "recover-draft")');
  const until = source.indexOf('if (action === "listing-ai")', from);
  const recovery = source.slice(from, until);
  assert.ok(from > 0 && until > from);
  assert.match(recovery, /findRecentSellerHubFeedForSku/);
  assert.match(recovery, /getSellerHubDraftTask/);
  assert.match(recovery, /saveExternalDraft/);
  assert.match(recovery, /feedRegistrationFailureMessage\(registration.reason\)/);
  assert.doesNotMatch(recovery, /createSellerHubDraft|publishEbayOffer|deleteOffer|uploadDraftCsv/);
});
