import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("eBay listing sync exposes active and unpublished offer counts", async () => {
  const source = await readFile(new URL("../internal/ebay/index.js", import.meta.url), "utf8");
  assert.match(source, /async function handleListings/);
  assert.match(source, /sell\/inventory\/v1\/offer\?limit=/);
  assert.match(source, /status === "PUBLISHED"/);
  assert.match(source, /status === "UNPUBLISHED"/);
  assert.match(source, /counts/);
});

test("listing sync UI is secret-free and uses the protected listings endpoint", async () => {
  const source = await readFile(new URL("../seller-ebay-listing-sync.js", import.meta.url), "utf8");
  assert.match(source, /\/api\/ebay\?action=listings/);
  assert.match(source, /Aktive Angebote/);
  assert.match(source, /Unveröffentlichte Entwürfe/);
  assert.doesNotMatch(source, /access_token|refresh_token|client_secret/i);
  execFileSync(process.execPath, ["--check", fileURLToPath(new URL("../seller-ebay-listing-sync.js", import.meta.url))]);
});
