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

test("Vercel build mirrors and loads delete repair after the accordion", async () => {
  const source = await readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8");
  assert.match(source, /seller-product-delete\.js/);
  assert.ok(source.indexOf('seller-product-board-accordion.js') < source.indexOf('seller-product-delete.js'));
});

test("delete repair is valid JavaScript", () => {
  syntaxCheck("seller-product-delete.js");
  syntaxCheck("scripts/prepare-vercel.mjs");
});
