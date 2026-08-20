import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

function syntaxCheck(relativePath) {
  execFileSync(process.execPath, ["--check", fileURLToPath(new URL(`../${relativePath}`, import.meta.url))], { stdio: "pipe" });
}

test("legacy Product Board compat entry point delegates to the base accordion", async () => {
  const source = await readFile(new URL("../seller-product-board-accordion-compat.js", import.meta.url), "utf8");
  assert.match(source, /const accordion = window\.ElyonProductBoardAccordion/);
  assert.match(source, /delegated: true/);
  assert.match(source, /refresh: \(\) => accordion\.refresh\?\.\(\)/);
});

test("compat shim cannot create a second observer, retry loop, or click handler", async () => {
  const source = await readFile(new URL("../seller-product-board-accordion-compat.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /new MutationObserver/);
  assert.doesNotMatch(source, /setInterval/);
  assert.doesNotMatch(source, /addEventListener\("click"/);
  assert.doesNotMatch(source, /requestAnimationFrame/);
});

test("compat shim remains fail-safe when the base accordion is unavailable", async () => {
  const source = await readFile(new URL("../seller-product-board-accordion-compat.js", import.meta.url), "utf8");
  assert.match(source, /if \(!accordion\)/);
  assert.match(source, /compat shim stayed passive/);
  assert.match(source, /return;/);
});

test("Vercel build keeps the legacy compat artifact after the canonical accordion", async () => {
  const source = await readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8");
  const baseIndex = source.indexOf('seller-product-board-accordion.js');
  const compatIndex = source.indexOf('seller-product-board-accordion-compat.js');
  assert.ok(baseIndex > 0);
  assert.ok(compatIndex > baseIndex);
  assert.match(source, /\["seller-product-board-accordion-compat\.js", "public\/seller-product-board-accordion-compat\.js"\]/);
});

test("single-observer accordion scripts remain valid JavaScript", () => {
  syntaxCheck("seller-product-board-accordion.js");
  syntaxCheck("seller-product-board-accordion-compat.js");
  syntaxCheck("scripts/prepare-vercel.mjs");
});
