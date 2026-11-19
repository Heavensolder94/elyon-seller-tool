import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { deleteRegisteredUnpublishedOffer, isSameOriginSellerMutation } from "../api/ebay/delete-unpublished-offer.js";

const offerId = "243461011011";
const sku = "AMZ-B0D63HF7Z4";
const input = { offerId, sku, confirmOfferId: offerId, confirm: "DELETE_UNPUBLISHED_OFFER" };
const registered = [{ offerId, sku, state: "draft", visibilityMode: "inventory_offer" }];

function harness(overrides = {}) {
  let exists = true;
  const calls = [];
  const changes = [];
  const dependencies = {
    records: async () => registered,
    session: async () => ({ environment: "production", accessToken: "fake-test-token" }),
    call: async (url, options) => {
      calls.push({ url, method: options.method });
      assert.match(url, /sell\/inventory\/v1\/offer\/243461011011$/);
      assert.equal(options.headers.Authorization, "Bearer fake-test-token");
      assert.equal(options.headers["Accept-Language"], "de-DE");
      assert.equal(options.headers["Content-Language"], "de-DE");
      assert.equal(options.headers["Content-Type"], "application/json");
      assert.equal(options.headers["X-EBAY-C-MARKETPLACE-ID"], "EBAY_DE");
      if (options.method === "GET") {
        if (!exists) throw Object.assign(new Error("offer not found"), { status: 404 });
        return { offerId, sku, status: "UNPUBLISHED" };
      }
      if (options.method === "DELETE") {
        exists = false;
        return {};
      }
      throw new Error("unexpected method");
    },
    mark: async (change) => {
      changes.push(change);
      return { persisted: true };
    },
    ...overrides,
  };
  return { calls, changes, dependencies };
}

test("deletes only the matching registered unpublished NOBIS offer and verifies its absence", async () => {
  const h = harness();
  const result = await deleteRegisteredUnpublishedOffer(input, h.dependencies);
  assert.deepEqual(h.calls.map((x) => x.method), ["GET", "DELETE", "GET"]);
  assert.deepEqual(h.changes, [{ offerId, environment: "production", state: "removed" }]);
  assert.deepEqual(result, {
    ok: true, deleted: true, verified: true, offerId, sku,
    registryUpdated: true,
    companyOsChanged: false, productMasterChanged: false, feedTasksChanged: false,
  });
});

test("deletion cannot proceed without exact repeated ID and explicit phrase", async () => {
  const h = harness();
  for (const invalid of [
    { ...input, confirm: "" },
    { ...input, confirmOfferId: "other-id" },
    { ...input, offerId: "bad/id" },
  ]) await assert.rejects(() => deleteRegisteredUnpublishedOffer(invalid, h.dependencies), /Löschbestätigung|Offer-ID/);
  assert.equal(h.calls.length, 0);
});

test("unregistered offers and Seller-Hub Feed tasks cannot be deleted", async () => {
  for (const records of [
    [],
    [{ ...registered[0], visibilityMode: "seller_hub_feed" }],
    [{ ...registered[0], sku: "AMZ-B0BWND9WBR" }],
  ]) {
    const h = harness({ records: async () => records });
    await assert.rejects(() => deleteRegisteredUnpublishedOffer(input, h.dependencies), /nicht als ELYON-Entwurf registriert/);
    assert.equal(h.calls.length, 0);
  }
});

test("live, published, renamed or mismatched offers never invoke delete", async () => {
  for (const payload of [
    { offerId, sku, status: "PUBLISHED" },
    { offerId, sku, status: "UNPUBLISHED", listingId: "1234" },
    { offerId, sku: "OTHER-SKU-321", status: "UNPUBLISHED" },
    { offerId: "different-offer", sku, status: "UNPUBLISHED" },
  ]) {
    const h = harness({ call: async (url, options) => {
      h.calls.push({ url, method: options.method });
      return payload;
    } });
    await assert.rejects(() => deleteRegisteredUnpublishedOffer(input, h.dependencies), /nicht mehr|stimmt nicht/);
    assert.deepEqual(h.calls.map((x) => x.method), ["GET"]);
    assert.equal(h.changes.length, 0);
  }
});

test("does not mark the registry removed until a 404 is verified", async () => {
  const h = harness({ call: async (url, options) => {
    h.calls.push({ url, method: options.method });
    return { offerId, sku, status: "UNPUBLISHED" };
  } });
  await assert.rejects(() => deleteRegisteredUnpublishedOffer(input, h.dependencies), /weiterhin zurückgegeben/);
  assert.deepEqual(h.calls.map((x) => x.method), ["GET", "DELETE", "GET"]);
  assert.equal(h.changes.length, 0);
});

test("frontend only shows delete button for the exact NOBIS API offer and requires user confirmation", async () => {
  const source = await readFile(new URL("../seller-runtime-loader.js", import.meta.url), "utf8");
  assert.match(source, /product\?\.source === "elyon_inventory_draft" && offerId === "243461011011" && sku === "AMZ-B0D63HF7Z4"/);
  assert.match(source, /window\.confirm\?\./);
  assert.match(source, /data-elyon-delete-offer/);
  assert.match(source, /method: "POST", credentials: "same-origin"/);
  const server = await readFile(new URL("../api/ebay/delete-unpublished-offer.js", import.meta.url), "utf8");
  assert.match(server, /requireSellerAccess\(req, res/);
  assert.match(server, /origin_denied/);
  assert.match(server, /input\.confirm !== "DELETE_UNPUBLISHED_OFFER"/);
  assert.doesNotMatch(server, /deleteProduct|deleteInventoryItem|CompanyOsWrite/);
});

test("same-origin Seller Tool POST accepts public alias even if Vercel forwarded host differs", () => {
  assert.equal(isSameOriginSellerMutation({
    origin: "https://elyonsellertool.vercel.app",
    host: "elyonsellertool.vercel.app",
    "x-forwarded-host": "elyon-seller-tool-deployment.vercel.app",
    "sec-fetch-site": "same-origin",
  }), true);
  assert.equal(isSameOriginSellerMutation({
    origin: "https://elyonsellertool.vercel.app",
    host: "elyon-seller-tool-deployment.vercel.app",
    "x-forwarded-host": "elyonsellertool.vercel.app",
    "sec-fetch-site": "same-origin",
  }), true);
});

test("destructive mutation still rejects cross-origin, missing origin, and unsafe schemes", () => {
  const base = { host: "elyonsellertool.vercel.app", "sec-fetch-site": "same-origin" };
  for (const headers of [
    { ...base },
    { ...base, origin: "https://attacker.example" },
    { ...base, origin: "http://elyonsellertool.vercel.app" },
    { ...base, origin: "https://elyonsellertool.vercel.app", "sec-fetch-site": "cross-site" },
    { ...base, origin: "https://elyonsellertool.vercel.app.evil.example" },
  ]) assert.equal(isSameOriginSellerMutation(headers), false);
});

test("deletion errors remain readable in Seller Tool instead of disappearing with an alert", async () => {
  const source = await readFile(new URL("../seller-runtime-loader.js", import.meta.url), "utf8");
  assert.match(source, /ebayDeleteFeedbackError/);
  assert.match(source, /role="alert"/);
  assert.match(source, /HTTP " \+ response\.status \+ " \/ "/);
  assert.match(source, /wurde NICHT als gelöscht bestätigt/);
});
