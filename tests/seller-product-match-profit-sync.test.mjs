import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { adaptProductMasterForSeller } from "../lib/product-master-consumer.js";
import { transformSellerRuntimeLoader } from "../scripts/seller-listing-parity-transform.mjs";

const runtimeSource = await readFile(new URL("../seller-runtime-loader.js", import.meta.url), "utf8");
const logicStart = runtimeSource.indexOf("  function listingStatus(");
const logicEnd = runtimeSource.indexOf("  function installListingStyles(", logicStart);
if (logicStart < 0 || logicEnd <= logicStart) throw new Error("Listing matcher could not be isolated");
const context = vm.createContext({
  text: (value) => String(value ?? "").trim(),
  escapeHtml: (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
  numberValue: (value) => Number(value) || 0,
  money: (value) => Number(value).toFixed(2).replace(".", ",") + " €",
});
vm.runInContext(runtimeSource.slice(logicStart, logicEnd), context);
const viewStart = runtimeSource.indexOf("  function matchLabel(");
const viewEnd = runtimeSource.indexOf("  function renderDraftWorkspace(", viewStart);
if (viewStart < 0 || viewEnd <= viewStart) throw new Error("Listing card could not be isolated");
vm.runInContext(runtimeSource.slice(viewStart, viewEnd), context);

const sku = "AMZ-B0BWND9WBR";
const dreamzie = { sku, title: "Dreamzie Kissenbezug 80x80 Baumwolle", price: 20.99,
  images: ["https://images.example.test/from-ebay.jpg"],
  status: "UNPUBLISHED", feedVerification: "feed_processed_not_live_checked" };

function canonical(overrides = {}) {
  return {
    schemaVersion: "elyon-product-master-v2",
    identity: {
      productId: "product-dreamzie",
      companyOsProductId: "product-dreamzie",
      articleNumber: "ELY-000901",
      sku: "ELY-000901",
      supplierSku: sku,
      sourceImportId: "nova_import_dreamzie",
      ...(overrides.identity || {}),
    },
    product: {
      title: "Dreamzie Supplier Record",
      supplier: { name: "Supplier Verified", url: "https://supplier.example.test/dreamzie" },
      images: ["https://supplier.example.test/master.jpg"],
    },
    economics: {
      buyPrice: 13.7, shippingCost: 2, fees: 3.5, salePrice: 20.99,
      profit: 1.79, marginPercent: 8.53, source: "company_os",
      ...(overrides.economics || {}),
    },
    workflow: { stage: "product_review", active: true },
    channels: { ebay: { status: "NOT_STARTED" } },
  };
}
function adapt(overrides = {}) {
  return adaptProductMasterForSeller(canonical(overrides));
}
function enrich(item, products) {
  return context.enrichEbayListing(item, products);
}

test("matches existing Dreamzie Amazon Feed draft using canonical supplier SKU while retaining ELY identity", () => {
  const record = adapt();
  const view = enrich(dreamzie, [record]);
  assert.equal(record.sku, "ELY-000901");
  assert.equal(view.productMasterMatch, "matched");
  assert.equal(view.productMasterArticleNumber, "ELY-000901");
  assert.equal(view.supplierName, "Supplier Verified");
  assert.equal(view.pricing.buyPrice, 13.7);
  assert.equal(view.pricing.salePrice, 20.99);
  assert.equal(view.pricing.estimatedFees, 3.5);
  assert.equal(view.pricing.supplierShipping, 2);
  assert.equal(view.pricing.profit, 1.79);
  assert.equal(view.pricing.marginPercent, 8.53);
  assert.equal(view.pricing.profitSource, "company_os");
  assert.equal(view.feedVerification, "feed_processed_not_live_checked");
  assert.equal(view.images[0], dreamzie.images[0]);
  assert.equal(view.status, "UNPUBLISHED");
  const html = context.listingCard(view, "draft");
  assert.match(html, /ELY-000901/);
  assert.match(html, /Company-OS-EK 13,70 €.*Company-OS-Prognose 1,79 €/s);
  assert.match(html, /8,5 % Marge/);
  assert.match(html, /Feed verarbeitet · Seller Hub bitte prüfen/);
});

test("matches SourceImportId amazon:ASIN and variant supplier-SKU by exact normalized identity", () => {
  const bySource = adapt({ identity: { supplierSku: "SUP-VARIANT", sourceImportId: "amazon:B0BWND9WBR" } });
  const byVariant = adapt({ identity: { supplierSku: "SUP-NOT-THE-SAME", sourceImportId: "nova-2" } });
  byVariant.variants = [{ sku: "ELY-000901-01", supplierSku: sku }];
  assert.equal(enrich(dreamzie, [bySource]).productMasterMatch, "matched");
  assert.equal(enrich(dreamzie, [byVariant]).productMasterMatch, "matched");
});

test("NOBIS Inventory offer and its Company OS eBay channel identifiers match without changing offer ID", () => {
  const record = adapt({ identity: { supplierSku: "SUP-OTHER" } });
  record.channels.ebay.offerId = "243461011011";
  const result = enrich({ sku: "AMZ-B0D63HF7Z4", offerId: "243461011011", title: "NOBIS Power Bank", price: 41.99, status: "UNPUBLISHED" }, [record]);
  assert.equal(result.productMasterMatch, "matched");
  assert.equal(result.offerId, "243461011011");
  assert.equal(result.pricing.salePrice, 41.99);
  assert.equal(result.pricing.profit, null);
});

test("unreviewed or absent Company OS products never get an invented match from title or Amazon price", () => {
  const other = adapt({ identity: { supplierSku: "SUP-OTHER", sourceImportId: "nova-other" } });
  const view = enrich(dreamzie, [other]);
  assert.equal(view.productMasterMatch, "unmatched");
  assert.equal(view.pricing.buyPrice, null);
  assert.equal(view.pricing.profit, null);
  assert.equal(view.pricing.salePrice, 20.99);
  const html = context.listingCard(view, "draft");
  assert.match(html, /Product-Master-Match/);
  assert.match(html, /Produktprüfung/);
  assert.doesNotMatch(html, /EK 0,00/);
  assert.doesNotMatch(html, /Gewinn 0,00/);
});

test("multiple master products with the same external SKU must stay ambiguous", () => {
  const left = adapt();
  const right = adapt({ identity: { articleNumber: "ELY-000902", sku: "ELY-000902", productId: "other-master", companyOsProductId: "other-master" } });
  const view = enrich(dreamzie, [left, right]);
  assert.equal(view.productMasterMatch, "ambiguous");
  assert.equal(view.productMasterArticleNumber, "");
  assert.equal(view.pricing.profit, null);
  assert.match(context.listingCard(view, "draft"), /Mehrdeutiger Product-Master-Match/);
});

test("changed actual eBay price suppresses outdated Company OS profit and margin", () => {
  const view = enrich({ ...dreamzie, price: 25.99 }, [adapt()]);
  assert.equal(view.pricing.salePrice, 25.99);
  assert.equal(view.pricing.companyOsSalePrice, 20.99);
  assert.equal(view.pricing.profit, null);
  assert.equal(view.pricing.marginPercent, null);
  assert.equal(view.pricing.profitSource, "not_verified");
  const html = context.listingCard(view, "draft");
  assert.match(html, /Preisabweichung/);
  assert.match(html, /Gewinn\/Marge offen/);
  assert.doesNotMatch(html, /1,79 €/);
});

test("missing or stale costs are not converted into fictitious zero-profit estimates", () => {
  const missingCost = adapt({ economics: { buyPrice: null, fees: null, shippingCost: null, profit: 8, marginPercent: 38 } });
  const missing = enrich(dreamzie, [missingCost]);
  assert.equal(missing.pricing.buyPrice, null);
  assert.equal(missing.pricing.supplierShipping, null);
  assert.equal(missing.pricing.estimatedFees, null);
  assert.equal(missing.pricing.profit, null);
  assert.match(context.listingCard(missing, "draft"), /EK offen.*Gebühren offen.*Gewinn\/Marge offen/s);
  const stale = adapt();
  stale.sellerView.freshness = "stale";
  const cached = enrich(dreamzie, [stale]);
  assert.equal(cached.pricing.profit, null);
  assert.match(context.listingCard(cached, "draft"), /veralteten Cache/);
});

test("negative Company OS profit and margin are preserved as loss, not silently hidden", () => {
  const loss = enrich(dreamzie, [adapt({ economics: { profit: -2.1, marginPercent: -10.0 } })]);
  assert.equal(loss.pricing.profit, -2.1);
  assert.equal(loss.pricing.marginPercent, -10.0);
  assert.match(context.listingCard(loss, "draft"), /-2,10 €.*-10 % Marge/s);
});

test("Seller Tool remains a read-only Company OS consumer and refreshes matches on demand", async () => {
  const transformed = transformSellerRuntimeLoader(runtimeSource);
  assert.match(transformed, /getJson\("\/api\/products"\)/);
  assert.match(transformed, /getJson\("\/api\/ebay\/seller-state\?environment=production"\)/);
  assert.match(transformed, /items\.map\(\(item\) => enrichEbayListing\(item, products\)\)/);
  assert.match(transformed, /refreshListingWorkspaces\(true, DRAFT_TAB_ID\)/);
  assert.doesNotMatch(transformed, /fetch\([^)]*\/api\/products[^)]*method:\s*["']POST/s);
});
