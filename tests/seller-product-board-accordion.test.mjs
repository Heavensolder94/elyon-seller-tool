import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

function syntaxCheck(relativePath) {
  execFileSync(process.execPath, ["--check", fileURLToPath(new URL(`../${relativePath}`, import.meta.url))], { stdio: "pipe" });
}

test("Product Board accordion uses one delegated capture click handler", async () => {
  const source = await readFile(new URL("../seller-product-board-accordion.js", import.meta.url), "utf8");
  assert.match(source, /document\.addEventListener\("click", handleAccordionClick, true\)/);
  assert.match(source, /target\.closest\(TOGGLE_SELECTOR\)/);
  assert.match(source, /toggle\.closest\("\.product-card"\)/);
  assert.doesNotMatch(source, /toggle\.addEventListener\("click"/);
});

test("Product Board accordion supports grouped cards without a second compatibility observer", async () => {
  const source = await readFile(new URL("../seller-product-board-accordion.js", import.meta.url), "utf8");
  assert.match(source, /const CARD_SELECTOR = "\.product-card:not\(\.small-card\)"/);
  assert.match(source, /list\.querySelectorAll\(CARD_SELECTOR\)/);
  assert.match(source, /list\.contains\(card\)/);
  assert.match(source, /card\.closest\("\.kanban-board, \.kanban-column, \.kanban-shell"\)/);
  assert.doesNotMatch(source, /return \[\.\.\.list\.children\]/);
});

test("Product Board accordion keeps the current V3 expansion state and clears only legacy versions", async () => {
  const source = await readFile(new URL("../seller-product-board-accordion.js", import.meta.url), "utf8");
  assert.match(source, /EXPANDED_STORAGE_KEY = "elyonProductBoardExpandedCardsV3"/);
  assert.match(source, /elyonProductBoardExpandedCardsV1/);
  assert.match(source, /elyonProductBoardExpandedCardsV2/);
  assert.match(source, /LEGACY_STORAGE_KEYS\.forEach\(\(key\) => localStorage\.removeItem\(key\)\)/);
});

test("Product Board accordion avoids observer feedback and removes startup polling", async () => {
  const source = await readFile(new URL("../seller-product-board-accordion.js", import.meta.url), "utf8");
  assert.match(source, /new MutationObserver\(scheduleDecorate\)/);
  assert.match(source, /observer\?\.disconnect\(\)/);
  assert.match(source, /finally \{\s*startObserver\(\);\s*\}/s);
  assert.match(source, /observer\.observe\(list, \{ childList: true, subtree: true \}\)/);
  assert.doesNotMatch(source, /setInterval/);
  assert.doesNotMatch(source, /tries\s*\+=\s*1/);
});

test("collapsed Product Board cards preserve the compact grouped-card preview", async () => {
  const source = await readFile(new URL("../seller-product-board-accordion.js", import.meta.url), "utf8");
  assert.match(source, /grid-template-columns:minmax\(0,1fr\) minmax\(132px,170px\)!important/);
  assert.match(source, /\.score-wrap>\*\{display:none!important\}/);
  assert.match(source, /\.score-wrap>\.score-top\{display:flex!important/);
  assert.match(source, /\.score-wrap>\.progress\{display:block!important/);
  assert.match(source, /elyon-product-decision-note\{display:none!important\}/);
  assert.match(source, /kompakte Vorschau mit Titel, Kennzahlen, Status und Score/);
});

test("Product Board accordion keeps essential pills and global controls", async () => {
  const source = await readFile(new URL("../seller-product-board-accordion.js", import.meta.url), "utf8");
  assert.match(source, /ensureEssentialPills\(card\)/);
  assert.match(source, /data-elyon-board-expand-all/);
  assert.match(source, /data-elyon-board-collapse-all/);
  assert.match(source, /setAllCards\(true\)/);
  assert.match(source, /setAllCards\(false\)/);
});

test("Product Board accordion publishes the single-observer implementation marker", async () => {
  const source = await readFile(new URL("../seller-product-board-accordion.js", import.meta.url), "utf8");
  assert.match(source, /implementation: "single-observer-v3"/);
});

test("Product Board accordion remains valid JavaScript and part of the Vercel build", async () => {
  syntaxCheck("seller-product-board-accordion.js");
  const buildSource = await readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8");
  assert.match(buildSource, /seller-product-board-accordion\.js/);
});
