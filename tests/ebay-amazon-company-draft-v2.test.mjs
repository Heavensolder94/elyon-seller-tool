import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import { fetchCompanyOsAmazonDraftFile, SELLER_HUB_DRAFT_FEED_TYPE } from "../lib/ebay-seller-hub-drafts.js";

const input = {
  sku: "AMZ-B0BWND9WBR",
  title: "Amazon Produkt fuer ELYON",
  description: "<p>Arbeitsentwurf</p>",
  price: 28.75,
  categoryId: "47140",
  conditionEnum: "NEW",
  images: ["https://example.com/image.jpg"],
  itemSpecifics: { Marke: ["Beispiel"] },
};
const env = {
  ELYON_COMPANY_OS_SYNC_CODE: "test-server-only-sync",
  ELYON_COMPANY_OS_URL: "https://company-os.example.test",
};
const bytes = Buffer.from("\uFEFF#INFO;Official\r\nAction(...);Title\r\nDraft;Example\r\n", "utf8");
const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
const good = {
  ok: true,
  action: "Draft",
  feedType: "FX_DRAFT",
  published: false,
  uploaded: false,
  fileName: "ebay-draft-template.csv",
  byteLength: bytes.length,
  sha256,
  contentBase64: bytes.toString("base64"),
  summary: { action: "Draft", sku: input.sku },
};
const mock = (data, status = 200) => async () => ({
  ok: status === 200, status, json: async () => data,
});

test("Seller Tool delegates CSV generation only through server-authorized Company OS bridge", async () => {
  const calls = [];
  const result = await fetchCompanyOsAmazonDraftFile(input, {
    env, fetchClient: async (url, init) => {
      calls.push({ url, init });
      return mock(good)();
    },
  });
  assert.equal(SELLER_HUB_DRAFT_FEED_TYPE, "FX_DRAFT");
  assert.equal(result.sku, input.sku);
  assert.ok(result.bytes.equals(bytes));
  assert.equal(result.fileName, good.fileName);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://company-os.example.test/api/auto-lister-seller-hub");
  assert.equal(calls[0].init.method, "POST");
  const request = JSON.parse(calls[0].init.body);
  assert.equal(request.action, "build_external_csv");
  assert.equal(request.syncCode, env.ELYON_COMPANY_OS_SYNC_CODE);
  assert.equal(request.confirmation, "draft_only");
  assert.equal(request.publish, false);
  assert.equal(request.draft.condition, "NEW");
  assert.equal(request.draft.sku, input.sku);
  assert.equal(request.draft.itemSpecifics.Marke[0], "Beispiel");
});

test("bridge checks integrity, identity, draft-only status and fail-closed behavior", async () => {
  for (const change of [
    { sha256: "0".repeat(64) },
    { byteLength: bytes.length + 1 },
    { feedType: "FX_LISTING" },
    { published: true },
    { uploaded: true },
    { contentBase64: "bad" },
  ]) {
    await assert.rejects(fetchCompanyOsAmazonDraftFile(input, {
      env, fetchClient: mock({ ...good, ...change }),
    }));
  }
});

test("bridge refuses missing auth, unconfirmed condition and invalid source SKU", async () => {
  await assert.rejects(fetchCompanyOsAmazonDraftFile(input, {
    env: {}, fetchClient: () => { throw Error("must not fetch"); },
  }), /Sync-Code/);
  await assert.rejects(fetchCompanyOsAmazonDraftFile({ ...input, conditionEnum: "" }, {
    env, fetchClient: () => { throw Error("must not fetch"); },
  }), /Zustand/);
  await assert.rejects(fetchCompanyOsAmazonDraftFile({ ...input, sku: "ELY-000001" }, {
    env, fetchClient: () => { throw Error("must not fetch"); },
  }), /Amazon-SKU/);
});

test("bridge does not silently revert to legacy FX_LISTING after Company OS errors", async () => {
  await assert.rejects(fetchCompanyOsAmazonDraftFile(input, {
    env, fetchClient: mock({ ok: false, error: "ebay_official_draft_template_missing",
      message: "Vorlage fehlt" }, 409),
  }), /Vorlage fehlt/);
});
