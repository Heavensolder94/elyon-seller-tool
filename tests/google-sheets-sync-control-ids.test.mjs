import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = ["index.html", "public/index.html"];

for (const file of files) {
  test(`${file} keeps the Sales and InventoryTracker Google Sheets controls uniquely addressable`, async () => {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    const salesIds = source.match(/id="syncSalesGoogleSheetsBtn"/g) || [];
    const trackerIds = source.match(/id="syncInventoryTrackerGoogleSheetsBtn"/g) || [];

    assert.equal(salesIds.length, 1);
    assert.equal(trackerIds.length, 1);
    assert.match(source, /id="syncInventoryTrackerGoogleSheetsBtn"[^>]*>InventarTracker synchronisieren/);
    assert.match(source, /bind\('syncInventoryTrackerGoogleSheetsBtn','click',syncSalesToGoogleSheet\)/);
  });
}
