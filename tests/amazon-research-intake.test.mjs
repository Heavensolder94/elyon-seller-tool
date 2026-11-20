import test from "node:test";
import assert from "node:assert/strict";
import { submitAmazonResearchReview } from "../api/products/review-intake.js";

const product = { asin: "B012345678", title: "Beispielprodukt", originalTitle: "Originaltitel", originalDescription: "Originalbeschreibung", sourceUrl: "https://www.amazon.de/dp/B012345678", amazonReferencePrice: 12.34, currency: "EUR", images: Array.from({length:12},(_,i)=>`https://example.test/${i}.jpg`), details: { Material: "Baumwolle" }, selectedVariations: { Farbe: "Blau", Größe: "M" }, bullets: ["Eigenschaft"], breadcrumbs: ["Kategorie"], itemSpecifics: { Marke: ["Beispiel"] } };
const env = { COMPANY_OS_SYNC_CODE: "test-sync-code", COMPANY_OS_URL: "https://company.example" };
function setup(records = []) {
  const calls = [];
  return { env, calls, getMaster: async () => ({ records }), fetchImpl: async (url, options) => {
    const body = JSON.parse(options.body); calls.push({ url: String(url), body });
    if (body.transition === "read_workflow") return { ok: true, status: 200, json: async () => ({ ok: true, transition: "read_workflow", capabilities: { createOnlyReview: true } }) };
    return { ok: true, status: 200, json: async () => ({ ok: true, result: { product: { articleNumber: "ELY-000123", sourceImportId: body.product.sourceImportId, workflowStage: "product_review" } } }) };
  } };
}

test("Amazon research reaches Company OS before eBay and retains price as unverified evidence", async () => {
  const mock = setup();
  const result = await submitAmazonResearchReview({ product, ...mock });
  assert.equal(result.status, 200); assert.equal(result.body.articleNumber, "ELY-000123");
  assert.equal(mock.calls.length, 2); assert.equal(mock.calls[0].url, "https://company.example/api/company-os-workflow");
  assert.equal(mock.calls[0].body.transition, "read_workflow");
  const request = mock.calls[1].body;
  assert.equal(request.transition, "move_to_review"); assert.equal(request.createOnly, true);
  assert.equal(request.product.costPrice, null); assert.equal(request.product.salePrice, null);
  assert.equal(request.product.meta.amazonReferencePrice, 12.34); assert.equal(request.product.meta.supplierCostVerified, false);
  assert.equal(request.product.meta.imageRightsVerified, false); assert.equal(request.product.meta.amazonDetails.Material, "Baumwolle");
  assert.equal(request.product.images.length, 12);
  assert.equal(request.product.meta.amazonOriginalTitle, "Originaltitel");
  assert.equal(request.product.meta.amazonOriginalDescription, "Originalbeschreibung");
  assert.deepEqual(request.product.meta.amazonSelectedVariations, { Farbe: "Blau", Größe: "M" });
  assert.deepEqual(request.product.meta.amazonBullets, ["Eigenschaft"]);
  assert.deepEqual(request.product.meta.researchAttributes.itemSpecifics.Marke, ["Beispiel"]);
});

test("duplicate, mismatched ASIN, unavailable master, and unconfirmed write fail closed", async () => {
  const duplicate = setup([{ identity: { supplierSku: "AMZ-B012345678", articleNumber: "ELY-000001" } }]);
  assert.equal((await submitAmazonResearchReview({ product, ...duplicate })).status, 409); assert.equal(duplicate.calls.length, 0);
  const mismatch = setup();
  assert.equal((await submitAmazonResearchReview({ product: { ...product, sourceUrl: "https://www.amazon.de/dp/B087654321" }, ...mismatch })).status, 400);
  assert.equal(mismatch.calls.length, 0);
  await assert.rejects(submitAmazonResearchReview({ product, ...setup(), getMaster: async () => ({}) }), /product_master_unavailable/);
  const noCapability = setup(); noCapability.fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, transition: "read_workflow" }) });
  assert.equal((await submitAmazonResearchReview({ product, ...noCapability })).body.error, "company_os_create_only_unavailable");
  const unconfirmed = setup(); let count = 0; unconfirmed.fetchImpl = async () => ({ ok: true, status: 200, json: async () => ++count === 1 ? ({ ok: true, transition: "read_workflow", capabilities: { createOnlyReview: true } }) : ({ ok: true }) });
  assert.equal((await submitAmazonResearchReview({ product, ...unconfirmed })).body.error, "company_os_identity_not_verified");
});
