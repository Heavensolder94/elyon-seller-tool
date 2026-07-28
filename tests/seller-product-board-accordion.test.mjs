import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

function syntaxCheck(relativePath) {
  execFileSync(process.execPath, ["--check", fileURLToPath(new URL(`../${relativePath}`, import.meta.url))], { stdio: "pipe" });
}

test("Product Board accordion uses delegated capture clicks for dynamic cards", async () => {
  const source = await readFile(new URL("../seller-product-board-accordion.js", import.meta.url), "utf8");
  assert.match(source, /document\.addEventListener\("click", handleAccordionClick, true\)/);
  assert.match(source, /data-elyon-board-toggle/);
  assert.match(source, /target\.closest\(TOGGLE_SELECTOR\)/);
  assert.doesNotMatch(source, /toggle\.addEventListener\("click"/);
});

test("Product Board accordion persists the intended state before mutating the card", async () => {
  const source = await readFile(new URL("../seller-product-board-accordion.js", import.meta.url), "utf8");
  const functionStart = source.indexOf("function setCardExpanded");
  const functionEnd = source.indexOf("function addToggle", functionStart);
  const body = source.slice(functionStart, functionEnd);
  const saveIndex = body.indexOf("saveExpandedKeys(keys)");
  const classIndex = body.indexOf("card.classList.toggle(EXPANDED_CLASS, expanded)");
  assert.ok(saveIndex > 0);
  assert.ok(classIndex > saveIndex);
});

test("Product Board cards use a fresh storage version and start collapsed by default", async () => {
  const source = await readFile(new URL("../seller-product-board-accordion.js", import.meta.url), "utf8");
  assert.match(source, /elyonProductBoardExpandedCardsV2/);
  assert.match(source, /LEGACY_EXPANDED_STORAGE_KEY = "elyonProductBoardExpandedCardsV1"/);
  assert.match(source, /localStorage\.removeItem\(LEGACY_EXPANDED_STORAGE_KEY\)/);
  assert.match(source, /localStorage\.getItem\(EXPANDED_STORAGE_KEY\) \|\| "\[\]"/);
});

test("collapsed Product Board cards render a small preview", async () => {
  const source = await readFile(new URL("../seller-product-board-accordion.js", import.meta.url), "utf8");
  assert.match(source, /grid-template-columns:minmax\(0,1fr\) minmax\(132px,170px\)/);
  assert.match(source, /-webkit-line-clamp:1/);
  assert.match(source, /\.score-wrap \.score-number\{font-size:22px\}/);
  assert.match(source, /\.elyon-board-delete-quick\{display:none!important\}/);
  assert.match(source, /Titel, Kennzahlen und Status bleiben sichtbar/);
});

test("Product Board accordion avoids observer feedback while decorating", async () => {
  const source = await readFile(new URL("../seller-product-board-accordion.js", import.meta.url), "utf8");
  assert.match(source, /observer\?\.disconnect\(\)/);
  assert.match(source, /finally \{\s*startObserver\(\);\s*\}/s);
  assert.match(source, /observer\.observe\(list, \{ childList: true, subtree: true \}\)/);
});

test("Product Board accordion keeps global expand and collapse controls delegated", async () => {
  const source = await readFile(new URL("../seller-product-board-accordion.js", import.meta.url), "utf8");
  assert.match(source, /data-elyon-board-expand-all/);
  assert.match(source, /data-elyon-board-collapse-all/);
  assert.match(source, /setAllCards\(true\)/);
  assert.match(source, /setAllCards\(false\)/);
});

test("legacy direct-child accordion remains valid but is not shipped in production", async () => {
  syntaxCheck("seller-product-board-accordion.js");
  const buildSource = await readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(buildSource, /seller-product-board-accordion\.js/);
  assert.match(buildSource, /seller-product-board-accordion-compat\.js/);
});