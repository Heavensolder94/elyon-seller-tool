import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

function syntaxCheck(relativePath) {
  execFileSync(process.execPath, ["--check", fileURLToPath(new URL(`../${relativePath}`, import.meta.url))], { stdio: "pipe" });
}

test("legacy Product Board contains actions whose unquoted IDs need stable routing", async () => {
  const source = await readFile(new URL("../index.html", import.meta.url), "utf8");
  for (const action of ["editProduct", "toggleShopifyCandidate", "duplicateProduct", "productDecisionReport", "stopProduct"]) {
    assert.match(source, new RegExp(`onclick="${action}\\(' \\+ p\\.id \\+ '\\)"`));
  }
});

test("button integrity router captures all important product actions before inline JavaScript", async () => {
  const source = await readFile(new URL("../seller-button-integrity.js", import.meta.url), "utf8");
  for (const action of [
    "editProduct",
    "toggleShopifyCandidate",
    "duplicateProduct",
    "productDecisionReport",
    "stopProduct",
    "removeProduct",
    "prepareProductForEbayDraft",
    "triggerProductDecision",
  ]) {
    assert.match(source, new RegExp(`"${action}"`));
  }
  assert.match(source, /button\.removeAttribute\("onclick"\)/);
  assert.match(source, /document\.addEventListener\("click", captureClick, true\)/);
  assert.match(source, /stopImmediatePropagation\(\)/);
  assert.match(source, /nativeProductId/);
  assert.match(source, /window\.elyonDeleteProduct/);
});

test("Product Hub file import chooses one target instead of running both fallbacks", async () => {
  const source = await readFile(new URL("../seller-button-integrity.js", import.meta.url), "utf8");
  assert.match(source, /firstExisting\(ids\)/);
  assert.match(source, /\["localCsvImportBtn", "importBtn"\]/);
  assert.doesNotMatch(source, /clickTarget\(\["localCsvImportBtn"\].*\|\|/s);
  assert.match(source, /#elyonProductsHub button\[data-hub-action\]/);
});

test("selling flow uses scoped listeners without patching EventTarget globally", async () => {
  const guard = await readFile(new URL("../seller-selling-flow-event-guard.js", import.meta.url), "utf8");
  const designer = await readFile(new URL("../seller-listing-visual-designer.js", import.meta.url), "utf8");
  const parity = await readFile(new URL("../seller-auto-lister-parity.js", import.meta.url), "utf8");
  assert.match(guard, /scoped_abort_controller/);
  assert.match(guard, /prototypePatched:\s*false/);
  assert.doesNotMatch(guard, /EventTarget\.prototype\./);
  assert.match(designer, /_svdEventController\?\.abort\(\)/);
  assert.match(parity, /_salpEventController\?\.abort\(\)/);
});

test("desktop build loads button integrity after delete and mirrors both files", async () => {
  const source = await readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8");
  const deleteIndex = source.indexOf('<script defer src="/seller-product-delete.js"></script>');
  const integrityIndex = source.indexOf('<script defer src="/seller-button-integrity.js"></script>');
  assert.ok(deleteIndex > 0);
  assert.ok(integrityIndex > deleteIndex);
  assert.match(source, /\["seller-button-integrity\.js", "public\/seller-button-integrity\.js"\]/);
  assert.match(source, /\["seller-selling-flow-event-guard\.js", "public\/seller-selling-flow-event-guard\.js"\]/);
});

test("button integrity files are valid JavaScript", () => {
  syntaxCheck("seller-button-integrity.js");
  syntaxCheck("seller-selling-flow-event-guard.js");
  syntaxCheck("scripts/prepare-vercel.mjs");
});
