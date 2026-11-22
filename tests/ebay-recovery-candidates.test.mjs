import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  feedCsvAmazonDraftCandidates,
  listRecentAmazonDraftRecoveryCandidates,
  findRecentSellerHubFeedForSku,
} from "../lib/ebay-feed-task-recovery.js";

const sku = "AMZ-B0BWND9WBR";
const csv = [
  "#INFO;Version=0.0.2;Template= eBay-draft-listings-template_DE",
  "Action(SiteID=Germany|Country=DE|Currency=EUR|Version=1193|CC=UTF-8);Custom label (SKU);Category ID;Title;UPC;Price;Quantity;Item photo URL;Condition ID;Description;Format",
  "Draft;" + sku + ";1234;Ein bestehender Amazon Entwurf;;24.99;1;https://example.com/image.jpg;NEW;Beschreibung;FixedPrice",
].join("\r\n");
const getSession = async () => ({ environment: "production", accessToken: "test-only" });

function mockEbay({ taskId = "draft123", feedType = "FX_DRAFT", status = "COMPLETED",
  input = csv, wrongId = false } = {}) {
  const calls = [];
  const fetchClient = async (url, options = {}) => {
    calls.push({ url, method: options.method || "GET", body: options.body });
    if (url.endsWith("/download_input_file")) {
      const bytes = Buffer.from("\uFEFF" + input);
      return { ok: true, status: 200, headers: { get: () => String(bytes.length) },
        arrayBuffer: async () => bytes };
    }
    if (url.endsWith("/task/" + taskId)) {
      return { ok: true, status: 200, json: async () => ({
        taskId: wrongId ? "different" : taskId, feedType, status,
      }) };
    }
    const req = new URL(url);
    assert.equal(req.searchParams.get("feed_type"), "FX_DRAFT");
    assert.equal(req.searchParams.get("look_back_days"), "7");
    return { ok: true, status: 200, json: async () => ({
      tasks: [{ taskId, status, feedType }], total: 1,
    }) };
  };
  return { calls, fetchClient, getSession };
}

test("read-only discovery extracts only Draft actions with valid Amazon identity", () => {
  assert.deepEqual(feedCsvAmazonDraftCandidates("\uFEFF" + csv).map(x => x.sku), [sku]);
  assert.deepEqual(feedCsvAmazonDraftCandidates(csv.replace("Draft;", "Add;")), []);
  assert.deepEqual(feedCsvAmazonDraftCandidates(csv.replace(sku, "NOT-ASIN")), []);
});

test("auth-bound discovery lists the original FX_DRAFT CSV without eBay mutations", async () => {
  const mock = mockEbay();
  const found = await listRecentAmazonDraftRecoveryCandidates({ ...mock });
  assert.equal(found.candidates.length, 1);
  assert.equal(found.candidates[0].taskId, "draft123");
  assert.equal(found.candidates[0].sku, sku);
  assert.equal(found.candidates[0].title, "Ein bestehender Amazon Entwurf");
  assert.equal(found.sellerHubVisibility, "not_verified");
  assert.ok(mock.calls.every(x => x.method === "GET" && x.body === undefined));
});

test("selected task is confirmed by eBay metadata and its original Draft CSV/SKU", async () => {
  const mock = mockEbay();
  const result = await findRecentSellerHubFeedForSku({ sku, taskId: "draft123", ...mock });
  assert.equal(result.found, true);
  assert.equal(result.scanned, 1);
  assert.equal(result.record.taskId, "draft123");
  assert.ok(mock.calls.every(x => x.method === "GET"));
  assert.equal(mock.calls.length, 2);
});

test("selected task never accepts another SKU, non-Draft action or wrong task metadata", async () => {
  for (const options of [
    { input: csv.replace(sku, "AMZ-B0D63HF7Z4") },
    { input: csv.replace("Draft;", "Add;") },
    { status: "IN_PROCESS" },
    { feedType: "OTHER" },
    { wrongId: true },
  ]) {
    const mock = mockEbay(options);
    await assert.rejects(findRecentSellerHubFeedForSku({ sku, taskId: "draft123", ...mock }));
    assert.ok(mock.calls.every(x => x.method === "GET"));
  }
});

test("recovery choice endpoint requires the existing seller session and contains no upload", async () => {
  const source = await readFile(new URL("../api/ebay/extension-action.js", import.meta.url), "utf8");
  assert.match(source, /applyExtensionSellerSession\(req\)/);
  const start = source.indexOf('if (action === "list-draft-recovery-candidates")');
  const end = source.indexOf('if (action === "recover-draft")', start);
  assert.ok(start > 0 && end > start);
  const branch = source.slice(start, end);
  assert.match(branch, /listRecentAmazonDraftRecoveryCandidates/);
  assert.doesNotMatch(branch, /createSellerHubDraft|uploadDraftCsv|publishEbayOffer|registerElyonExternalDraftIdentity/);
});
