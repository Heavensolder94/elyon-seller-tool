import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("canonical listing snapshot enumerates inventory SKUs before requesting offers", async () => {
  const sourceUrl = new URL("../api/ebay/listings.js", import.meta.url);
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /sell\/inventory\/v1\/inventory_item\?limit=/);
  assert.match(source, /sell\/inventory\/v1\/offer\?sku=\$\{encodeURIComponent\(sku\)\}/);
  assert.match(source, /listing\.listingId \|\| offer\?\.listingId/);
  assert.match(source, /status === "PUBLISHED"/);
  assert.match(source, /status === "UNPUBLISHED"/);
  assert.match(source, /source: "ebay_inventory_api"/);
  assert.match(source, /requireSellerAccess/);
  execFileSync(process.execPath, ["--check", fileURLToPath(sourceUrl)]);
});

test("legacy listing sync still updates only uniquely matched Product Master records", async () => {
  const source = await readFile(new URL("../internal/ebay/index.js", import.meta.url), "utf8");
  assert.match(source, /async function handleListings/);
  assert.match(source, /async function handleSyncListings/);
  assert.match(source, /Nur eindeutig zuordenbare bestehende Produkte/);
  assert.match(source, /ambiguousItems/);
  assert.match(source, /counts/);
});

test("listing sync UI is secret-free and uses the protected listings endpoint", async () => {
  const source = await readFile(new URL("../seller-ebay-listing-sync.js", import.meta.url), "utf8");
  assert.match(source, /\/api\/ebay\?action=listings/);
  assert.match(source, /Aktive Angebote/);
  assert.match(source, /Unveröffentlichte Entwürfe/);
  assert.match(source, /sync-listings/);
  assert.match(source, /nicht angelegt/);
  assert.doesNotMatch(source, /access_token|refresh_token|client_secret/i);
  execFileSync(process.execPath, ["--check", fileURLToPath(new URL("../seller-ebay-listing-sync.js", import.meta.url))]);
});
