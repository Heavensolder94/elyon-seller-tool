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

test("Product Board accordion remains valid JavaScript and part of the Vercel build", async () => {
  syntaxCheck("seller-product-board-accordion.js");
  const buildSource = await readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8");
  assert.match(buildSource, /seller-product-board-accordion\.js/);
});
