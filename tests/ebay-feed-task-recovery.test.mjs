import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { feedCsvProductForSku, findRecentSellerHubFeedForSku } from "../lib/ebay-feed-task-recovery.js";

const sku = "AMZ-B0BWND9WBR";
const csv = [
  "#INFO Created=1794928260000",
  "#INFO Version=1.0 Template=fx_draft_template_EBAY",
  "#INFO",
  "*Action(SiteID=Germany|Country=DE|Currency=EUR|Version=1193|CC=UTF-8),Custom label (SKU),Category ID,Title,UPC,Price,Quantity,Item photo URL,Condition ID,Description,Format",
  "Draft," + sku + ',1234,"Dreamzie Kissenbezug 80x80, Beige",,20.99,1,https://example.org/image.jpg,,Description,FixedPrice',
].join("\r\n");

function mocks(tasks, files = {}) {
  const calls = [];
  const fetchClient = async (url, options) => {
    calls.push({ url, options });
    if (url.includes("/download_input_file")) {
      const taskId = url.split("/task/")[1].split("/")[0];
      const file = files[taskId];
      if (!file) return { ok: false, status: 404 };
      const bytes = Buffer.isBuffer(file) ? file : Buffer.from(file);
      return {
        ok: true, status: 200,
        headers: { get: () => String(bytes.length) },
        arrayBuffer: async () => bytes,
      };
    }
    const u = new URL(url);
    assert.equal(u.searchParams.get("feed_type"), "FX_DRAFT");
    assert.equal(u.searchParams.get("look_back_days"), "7");
    assert.equal(u.searchParams.get("limit"), "25");
    return { ok: true, status: 200, json: async () => ({ tasks, total: tasks.length }) };
  };
  return {
    calls, fetchClient,
    getSession: async () => ({ environment: "production", accessToken: "test-only" }),
  };
}

test("CSV identity parser matches exact SKU and extracts original title/price", () => {
  const product = feedCsvProductForSku(csv, sku);
  assert.equal(product.title, "Dreamzie Kissenbezug 80x80, Beige");
  assert.equal(product.price, 20.99);
  assert.deepEqual(product.images, ["https://example.org/image.jpg"]);
  assert.equal(feedCsvProductForSku(csv, "AMZ-B0D63HF7Z4"), null);
  assert.equal(feedCsvProductForSku(csv, "AMZ-B0BWND9WBR-EXTRA"), null);
});

test("recovers a completed FX_DRAFT from its original uploaded file with read-only eBay requests", async () => {
  const mock = mocks([{ taskId: "task-dreamzie", feedType: "FX_DRAFT", status: "COMPLETED" }], {
    "task-dreamzie": csv,
  });
  const result = await findRecentSellerHubFeedForSku({ sku, ...mock });
  assert.equal(result.found, true);
  assert.equal(result.record.taskId, "task-dreamzie");
  assert.equal(result.record.sku, sku);
  assert.equal(result.record.price, 20.99);
  assert.equal(mock.calls.length, 2);
  assert.ok(mock.calls.every((call) => !call.options.method || call.options.method === "GET"));
  assert.ok(mock.calls.every((call) => !call.options.body));
});

test("recovers gzip encoded eBay input file without constructing an eBay draft", async () => {
  const mock = mocks([{ taskId: "task-gzip", feedType: "FX_DRAFT", status: "COMPLETED" }], {
    "task-gzip": gzipSync(Buffer.from(csv)),
  });
  const result = await findRecentSellerHubFeedForSku({ sku, ...mock });
  assert.equal(result.record.taskId, "task-gzip");
});

test("refuses pending, mismatched and ambiguous Feed history instead of guessing", async () => {
  const pending = mocks([{ taskId: "pending", feedType: "FX_DRAFT", status: "IN_PROCESS" }], { pending: csv });
  assert.equal((await findRecentSellerHubFeedForSku({ sku, ...pending })).found, false);
  const mismatch = mocks([{ taskId: "other", feedType: "FX_DRAFT", status: "COMPLETED" }], {
    other: csv.replace("AMZ-B0BWND9WBR", "AMZ-B0D63HF7Z4"),
  });
  assert.equal((await findRecentSellerHubFeedForSku({ sku, ...mismatch })).found, false);
  const ambiguous = mocks([
    { taskId: "a", feedType: "FX_DRAFT", status: "COMPLETED" },
    { taskId: "b", feedType: "FX_DRAFT", status: "COMPLETED" },
  ], { a: csv, b: csv });
  await assert.rejects(findRecentSellerHubFeedForSku({ sku, ...ambiguous }), /Mehrere abgeschlossene/);
});

test("fails closed on unsupported SKU and malformed Feed response", async () => {
  const mock = mocks([]);
  await assert.rejects(findRecentSellerHubFeedForSku({ sku: "not-amazon", ...mock }), /gültige Amazon-SKU/);
  assert.equal(mock.calls.length, 0);
  const bad = { getSession: mock.getSession, fetchClient: async () => ({ ok: true, json: async () => ({}) }) };
  await assert.rejects(findRecentSellerHubFeedForSku({ sku, ...bad }), /kein gültiges Feed-Task-Verzeichnis/);
});

test("API exposes recovery only through authenticated extension action without create-draft", async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile(new URL("../api/ebay/extension-action.js", import.meta.url), "utf8");
  const start = source.indexOf('if (action === "recover-draft")');
  const end = source.indexOf('if (action === "listing-ai")', start);
  assert.ok(start > 0 && end > start);
  const branch = source.slice(start, end);
  assert.match(branch, /findRecentSellerHubFeedForSku/);
  assert.match(branch, /getSellerHubDraftTask/);
  assert.match(branch, /task\.draftVisible !== true/);
  assert.match(branch, /saveExternalDraft/);
  assert.doesNotMatch(branch, /createSellerHubDraft/);
  assert.doesNotMatch(branch, /publishEbayOffer/);
});
