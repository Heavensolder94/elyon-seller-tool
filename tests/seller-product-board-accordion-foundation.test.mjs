import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

function syntaxCheck(relativePath) {
  execFileSync(process.execPath, ["--check", fileURLToPath(new URL(`../${relativePath}`, import.meta.url))], { stdio: "pipe" });
}

test("Product Board foundation preserves controls and compact business metrics", async () => {
  const source = await readFile(new URL("../seller-product-board-accordion-foundation.js", import.meta.url), "utf8");
  assert.match(source, /data-elyon-board-expand-all/);
  assert.match(source, /data-elyon-board-collapse-all/);
  assert.match(source, /EK\+Versand:/);
  assert.match(source, /Marge:/);
  assert.match(source, /Risiko:/);
});

test("Product Board foundation does not install another MutationObserver", async () => {
  const source = await readFile(new URL("../seller-product-board-accordion-foundation.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /MutationObserver/);
  assert.match(source, /tries >= 12/);
});

test("Product Board foundation remains valid JavaScript", () => {
  syntaxCheck("seller-product-board-accordion-foundation.js");
});