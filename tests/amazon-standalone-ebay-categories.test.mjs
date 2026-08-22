import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("Amazon standalone eBay category lookup is read-only and independent from Seller session", async () => {
  const sourceUrl = new URL("../api/amazon-standalone/ebay-categories.js", import.meta.url);
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /commerce\/taxonomy\/v1/);
  assert.match(source, /get_category_suggestions/);
  assert.match(source, /get_item_aspects_for_category/);
  assert.match(source, /Access-Control-Allow-Origin/);
  assert.match(source, /readOnly:\s*true/);
  assert.match(source, /standalone:\s*true/);
  assert.match(source, /method === "OPTIONS"/);
  assert.match(source, /method !== "POST"/);
  assert.match(source, /RATE_LIMIT/);
  assert.doesNotMatch(source, /requireSellerAccess/);
  assert.doesNotMatch(source, /publishEbayOffer|createOrUpdateEbayDraft|orders|withdraw/);

  execFileSync(process.execPath, ["--check", fileURLToPath(sourceUrl)]);
});
