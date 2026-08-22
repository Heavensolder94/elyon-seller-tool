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

test("delete repair removes only the local working copy", async () => {
  const source = await readFile(new URL("../seller-product-delete.js", import.meta.url), "utf8");
  assert.equal(source.includes("deleteServerProduct"), false);
  assert.equal(source.includes("deleteServerProducts"), false);
  assert.match(source, /removeLocalProduct\(product\)/);
  assert.match(source, /Company-OS-Product-Master-Datensatz bleibt unverändert/);
  assert.match(source, /elyon:product-deleted/);
});

test("collapsed product cards expose a dedicated confirmed delete action", async () => {
  const source = await readFile(new URL("../seller-product-delete.js", import.meta.url), "utf8");
  assert.match(source, /elyon-board-delete-quick/);
  assert.match(source, /Artikel löschen/);
  assert.match(source, /window\.confirm/);
  assert.match(source, /lokale Seller-Arbeitskopie/);
  assert.match(source, /Company OS Product Master bleibt unverändert/);
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

test("bulk delete clears local working copies without a Product Master API request", async () => {
  const source = await readFile(new URL("../seller-product-delete.js", import.meta.url), "utf8");
  assert.equal(source.includes("deleteServerProducts"), false);
  assert.match(source, /clearLocalProducts\(\)/);
  assert.match(source, /Company OS Product Master bleibt unverändert/);
  assert.match(source, /elyon:products-bulk-deleted/);
});

test("Product API rejects all Product Master writes as read-only", async () => {
  const source = await readFile(new URL("../api/products/index.js", import.meta.url), "utf8");
  assert.match(source, /product_master_read_only/);
  assert.match(source, /ownerSystem: "elyon_company_os"/);
  assert.match(source, /createsIdentity: false/);
  assert.equal(source.includes("writeProductMasterList"), false);
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
