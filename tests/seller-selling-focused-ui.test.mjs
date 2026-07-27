import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../seller-selling-flow-focused-ui.js", import.meta.url), "utf8");
const buildSource = await readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8");

test("uses one focused three-step selling wizard", () => {
  assert.match(source, /Listing erstellen/);
  assert.match(source, /Pflichtangaben prüfen/);
  assert.match(source, /Abschluss/);
  assert.match(source, /STEP_TO_PANEL = \{ 1: "designer", 2: "auto", 3: "ready" \}/);
  assert.match(source, /ElyonSellerSellingFlow\?\.setActivePanel/);
});

test("keeps legacy designer and auto-lister tools available but collapsed", () => {
  assert.match(source, /focused-show-advanced-designer/);
  assert.match(source, /focused-show-advanced-auto/);
  assert.match(source, /Erweiterte Werkzeuge öffnen/);
  assert.match(source, /Erweiterte eBay-Daten öffnen/);
  assert.doesNotMatch(source, /removeChild\(.*sellerDesigner/);
});

test("preserves manual publishing safety", () => {
  assert.match(source, /Eine automatische eBay-Veröffentlichung bleibt gesperrt/);
  assert.match(source, /Keine eBay-Live-Aktion/);
  assert.match(source, /buildInternalAutoListerDraft/);
  assert.match(source, /mergeSellerProductWithDraft/);
  assert.doesNotMatch(source, /publishOffer|createOffer|bulkPublishOffer/);
});

test("uses protected DeepSeek route without automatic save", () => {
  assert.match(source, /fetch\("\/api\/seller-listing-ai"/);
  assert.match(source, /Bitte Aussagen kontrollieren und anschließend speichern/);
});

test("ships the focused module after the existing selling modules", () => {
  const visibilityIndex = buildSource.indexOf("seller-selling-flow-visibility-fix.js");
  const focusedIndex = buildSource.indexOf("seller-selling-flow-focused-ui.js");
  assert.ok(visibilityIndex >= 0);
  assert.ok(focusedIndex > visibilityIndex);
  assert.match(buildSource, /seller-selling-flow-focused-ui\.js", "public\/seller-selling-flow-focused-ui\.js/);
});