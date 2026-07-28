import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

function syntaxCheck(relativePath) {
  execFileSync(process.execPath, ["--check", fileURLToPath(new URL(`../${relativePath}`, import.meta.url))], { stdio: "pipe" });
}

test("Product Board card currently emits unsafe unquoted IDs for legacy delete handler", async () => {
  const source = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(source, /onclick="removeProduct\(' \+ p\.id \+ '\)"/);
});

test("delete repair captures old inline buttons before their unsafe handler runs", async () => {
  const source = await readFile(new URL("../seller-product-delete.js", import.meta.url), "utf8");
  assert.match(source, /document\.addEventListener\("click", clickHandler, true\)/);
  assert.match(source, /stopImmediatePropagation\(\)/);
  assert.match(source, /parseInlineId/);
  assert.match(source, /button\.removeAttribute\("onclick"\)/);
});

test("delete repair supports UUID and Product Master identities", async () => {
  const source = await readFile(new URL("../seller-product-delete.js", import.meta.url), "utf8");
  assert.match(source, /sourceImportId/);
  assert.match(source, /companyOsProductId/);
  assert.match(source, /sellerToolMasterProductId/);
  assert.match(source, /supplierLink/);
  assert.match(source, /productIdentifiers/);
});

test("delete repair removes server record before local working copy", async () => {
  const source = await readFile(new URL("../seller-product-delete.js", import.meta.url), "utf8");
  const serverIndex = source.indexOf("await deleteServerProduct(deleteId)");
  const localIndex = source.indexOf("removeLocalProduct(product)", serverIndex);
  assert.ok(serverIndex > 0);
  assert.ok(localIndex > serverIndex);
  assert.match(source, /method: "DELETE"/);
  assert.match(source, /\/api\/products/);
  assert.match(source, /elyon:product-deleted/);
});

test("collapsed product cards expose a dedicated confirmed delete action", async () => {
  const source = await readFile(new URL("../seller-product-delete.js", import.meta.url), "utf8");
  assert.match(source, /elyon-board-delete-quick/);
  assert.match(source, /Artikel löschen/);
  assert.match(source, /window\.confirm/);
  assert.match(source, /Product Board und dem Seller Product Master/);
});

test("Product Board exposes a right-aligned delete-all button with two-step confirmation", async () => {
  const source = await readFile(new URL("../seller-product-delete.js", import.meta.url), "utf8");
  assert.match(source, /data-elyon-delete-all-products/);
  assert.match(source, /🗑️ Alles löschen/);
  assert.match(source, /margin-left:auto/);
  assert.match(source, /window\.confirm/);
  assert.match(source, /window\.prompt/);
  assert.match(source, /ALLE LÖSCHEN/);
  assert.match(source, /elyonDeleteAllProducts/);
});

test("bulk delete uses one protected Product Master API request before clearing local data", async () => {
  const source = await readFile(new URL("../seller-product-delete.js", import.meta.url), "utf8");
  const serverIndex = source.indexOf("await deleteServerProducts(uniqueIds)");
  const localIndex = source.indexOf("clearLocalProducts()", serverIndex);
  assert.ok(serverIndex > 0);
  assert.ok(localIndex > serverIndex);
  assert.match(source, /DELETE_SELECTED_PRODUCTS/);
  assert.match(source, /body: JSON\.stringify\(\{ ids, confirmation: DELETE_ALL_CONFIRMATION \}\)/);
  assert.match(source, /elyon:products-bulk-deleted/);
});

test("Product API validates and executes bounded bulk deletion in one persisted write", async () => {
  const source = await readFile(new URL("../api/products/index.js", import.meta.url), "utf8");
  assert.match(source, /BULK_DELETE_CONFIRMATION = "DELETE_SELECTED_PRODUCTS"/);
  assert.match(source, /MAX_BULK_DELETE_ITEMS = 500/);
  assert.match(source, /requestedBulkDeleteIds/);
  assert.match(source, /bulk_delete_confirmation_required/);
  assert.match(source, /bulk_delete_limit_exceeded/);
  assert.match(source, /ids\.forEach/);
  assert.match(source, /bulk: true/);
});

test("Vercel build mirrors and loads delete repair after the accordion", async () => {
  const source = await readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8");
  assert.match(source, /seller-product-delete\.js/);
  assert.ok(source.indexOf('seller-product-board-accordion.js') < source.indexOf('seller-product-delete.js'));
});

test("delete repair is valid JavaScript", () => {
  syntaxCheck("seller-product-delete.js");
  syntaxCheck("api/products/index.js");
  syntaxCheck("scripts/prepare-vercel.mjs");
});
