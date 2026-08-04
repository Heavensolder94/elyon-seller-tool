import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { configuredEbayScopes, EBAY_REQUIRED_SCOPES } from "../lib/ebay-production.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(path.join(root, file), "utf8");

const financeFiles = [
  "seller-finance-core.js",
  "seller-finance.js",
  "seller-order-invoices.js",
  "lib/finance-store.js",
  "internal/finance/index.js",
  "api/finance/index.js",
  "seller-runtime-loader.js",
  "scripts/run-vercel-tests.mjs",
];

test("all Elyon Finance runtime and server modules are valid JavaScript", () => {
  for (const file of financeFiles) {
    const result = spawnSync(process.execPath, ["--check", path.join(root, file)], { encoding: "utf8" });
    assert.equal(result.status, 0, `${file}: ${result.stderr || result.stdout}`);
  }
});

test("finance workspace stays lazy and is mirrored into the Vercel output", async () => {
  const [runtime, preparation] = await Promise.all([
    read("seller-runtime-loader.js"),
    read("scripts/prepare-vercel.mjs"),
  ]);
  assert.match(runtime, /financeTab/);
  assert.match(runtime, /seller-finance\.js/);
  assert.match(runtime, /ElyonSellerFinance/);
  assert.match(runtime, /seller-order-invoices\\.js/);
  assert.match(preparation, /seller-finance-core\.js/);
  assert.match(preparation, /seller-order-invoices\\.js/);
  assert.match(preparation, /seller-finance\.js/);
  assert.doesNotMatch(preparation, /<script[^>]+seller-finance\.js/);
});

test("finance UI contains all three stages and no destructive storage reset", async () => {
  const ui = await read("seller-finance.js");
  assert.match(ui, /eBay-CSV importieren/);
  assert.match(ui, /eBay Finances API/);
  assert.match(ui, /EÜR & Export/);
  assert.match(ui, /DATEV-Vorbereitung/);
  assert.match(ui, /Audit-Log/);
  assert.match(ui, /SHA-256/);
  assert.match(ui, /Storno/);
  const invoiceUi = await read("seller-order-invoices.js");
  assert.match(invoiceUi, /data-eoi-invoice/);
  assert.match(invoiceUi, /invoiceNumber/);
  assert.match(invoiceUi, /window\\.print/);
  assert.doesNotMatch(ui, /localStorage\.clear\s*\(/);
  assert.doesNotMatch(ui, /automatisch.{0,30}(buchen|übermitteln)/i);
});

test("finance API is seller-protected and uses read-only eBay Finances resources", async () => {
  const api = await read("internal/finance/index.js");
  assert.match(api, /requireSellerAccess/);
  assert.match(api, /sell\/finances\/v1\/transaction/);
  assert.match(api, /sell\/finances\/v1\/payout/);
  assert.match(api, /confirmation_required/);
  assert.doesNotMatch(api, /sell\/inventory\/v1\/(offer|inventory_item)/);
  assert.doesNotMatch(api, /publishOffer|withdrawOffer|createOffer/);
});

test("finance OAuth scope augments all existing required eBay scopes", async () => {
  const previous = process.env.EBAY_SCOPES;
  try {
    process.env.EBAY_SCOPES = "";
    await import(`../api/finance/index.js?scope-test=${Date.now()}`);
    const scopes = configuredEbayScopes();
    for (const scope of EBAY_REQUIRED_SCOPES) assert.ok(scopes.includes(scope));
    assert.ok(scopes.includes("https://api.ebay.com/oauth/api_scope/sell.finances"));
  } finally {
    if (previous === undefined) delete process.env.EBAY_SCOPES;
    else process.env.EBAY_SCOPES = previous;
  }
});

test("normalized finance originals exclude buyer identity fields", async () => {
  const core = await read("seller-finance-core.js");
  assert.match(core, /function safeOriginal/);
  assert.doesNotMatch(core, /buyerUsername|buyerEmail|buyerAddress|shippingAddress/);
});

test("Vercel deployment runs tests before creating output", async () => {
  const vercel = JSON.parse(await read("vercel.json"));
  assert.match(vercel.buildCommand, /^npm test &&/);
});
