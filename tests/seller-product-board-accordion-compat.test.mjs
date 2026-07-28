import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

function syntaxCheck(relativePath) {
  execFileSync(process.execPath, ["--check", fileURLToPath(new URL(`../${relativePath}`, import.meta.url))], { stdio: "pipe" });
}

test("grouped Product Board cards are discovered below status wrappers", async () => {
  const source = await readFile(new URL("../seller-product-board-accordion-compat.js", import.meta.url), "utf8");
  assert.match(source, /list\.querySelectorAll\(CARD_SELECTOR\)/);
  assert.match(source, /list\.contains\(card\)/);
  assert.doesNotMatch(source, /\[\.\.\.list\.children\]/);
});

test("compat accordion intercepts clicks before legacy handlers", async () => {
  const source = await readFile(new URL("../seller-product-board-accordion-compat.js", import.meta.url), "utf8");
  assert.match(source, /window\.addEventListener\("click", handleClick, true\)/);
  assert.match(source, /stopImmediatePropagation\(\)/);
  assert.match(source, /toggle\.closest\("\.product-card"\)/);
});

test("collapsed cards hide detailed score content but retain compact score elements", async () => {
  const source = await readFile(new URL("../seller-product-board-accordion-compat.js", import.meta.url), "utf8");
  assert.match(source, /\.score-wrap>\*\{display:none!important\}/);
  assert.match(source, /\.score-wrap>\.score-top\{display:flex!important/);
  assert.match(source, /\.score-wrap>\.progress\{display:block!important/);
  assert.match(source, /\.score-wrap>\.pill-row\{display:flex!important/);
  assert.match(source, /elyon-product-decision-note\{display:none!important\}/);
});

test("new compact default resets earlier expanded-state versions", async () => {
  const source = await readFile(new URL("../seller-product-board-accordion-compat.js", import.meta.url), "utf8");
  assert.match(source, /elyonProductBoardExpandedCardsV3/);
  assert.match(source, /elyonProductBoardExpandedCardsV1/);
  assert.match(source, /elyonProductBoardExpandedCardsV2/);
  assert.match(source, /LEGACY_STORAGE_KEYS\.forEach\(\(key\) => localStorage\.removeItem\(key\)\)/);
});

test("global expand and collapse include grouped and direct cards", async () => {
  const source = await readFile(new URL("../seller-product-board-accordion-compat.js", import.meta.url), "utf8");
  assert.match(source, /setAll\(true\)/);
  assert.match(source, /setAll\(false\)/);
  assert.match(source, /cards\.forEach\(\(card\) => setExpanded\(card, expanded, false\)\)/);
});

test("Vercel build ships one active accordion observer after its observer-free foundation", async () => {
  const source = await readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8");
  const foundationIndex = source.indexOf('seller-product-board-accordion-foundation.js');
  const compatIndex = source.indexOf('seller-product-board-accordion-compat.js');
  const legacyIndex = source.indexOf('seller-product-board-accordion.js');
  assert.ok(foundationIndex > 0);
  assert.ok(compatIndex > foundationIndex);
  assert.equal(legacyIndex, -1);
  assert.match(source, /\["seller-product-board-accordion-foundation\.js", "public\/seller-product-board-accordion-foundation\.js"\]/);
  assert.match(source, /\["seller-product-board-accordion-compat\.js", "public\/seller-product-board-accordion-compat\.js"\]/);
});

test("grouped accordion compatibility scripts remain valid JavaScript", () => {
  syntaxCheck("seller-product-board-accordion-compat.js");
  syntaxCheck("seller-product-board-accordion-foundation.js");
  syntaxCheck("scripts/prepare-vercel.mjs");
});