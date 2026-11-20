import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [ui, css, api, prepare] = await Promise.all([
  readFile(new URL("../seller-orders-v2.js", import.meta.url), "utf8"),
  readFile(new URL("../seller-orders-v2.css", import.meta.url), "utf8"),
  readFile(new URL("../api/orders/operations.js", import.meta.url), "utf8"),
  readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8"),
]);

test("demo orders are generated only in the browser and carry visible, non-real identifiers", () => {
  assert.match(ui, /const DEMO = \{/);
  for (const key of ["DEMO-1001", "DEMO-1002", "DEMO-1003"]) assert.ok(ui.includes(key));
  assert.match(ui, /INTERAKTIVE DEMO/);
  assert.match(ui, /Demo beenden/);
  assert.match(ui, /Demo ausprobieren/);
  assert.match(ui, /Alle Bestellungen und Kunden sind erfunden/);
});

test("demo path returns before any server save and server rejects demo order IDs", () => {
  const beginning = ui.indexOf("async function save(form)");
  const guard = ui.indexOf("if (state.demoMode)", beginning);
  const post = ui.indexOf('json("/api/orders/operations"', beginning);
  assert.ok(beginning >= 0 && guard > beginning && post > guard);
  assert.ok(ui.slice(guard, post).includes("return;"), "demo branch must return before POST");
  assert.match(api, /\^DEMO-/);
  assert.match(api, /demo_order_blocked/);
  assert.match(ui, /if \(state\.demoMode\) return;/);
});

test("a guided, clickable timeline and responsive section tabs exist", () => {
  assert.match(ui, /function progressMarkup\(/);
  assert.match(ui, /data-ocv2-phase/);
  assert.match(ui, /function choosePhase\(/);
  assert.match(ui, /function sectionNav\(/);
  assert.match(ui, /data-ocv2-section/);
  assert.match(ui, /function changeSection\(/);
  assert.match(ui, /function nextActionMarkup\(/);
  assert.match(css, /\.ocv2-pane\[hidden\]/);
  assert.match(css, /\.ocv2-detail-tabs/);
  assert.match(css, /\.ocv2-progress/);
});

test("the simulation is manual, order IDs stay separate from real orders, and unpaid supplier progression is blocked", () => {
  assert.match(ui, /const ordersNow = \(\) => state\.demoMode \? DEMO\.orders : state\.orders/);
  assert.match(ui, /const operationsNow = \(\) => state\.demoMode \? DEMO\.operations : state\.operations/);
  assert.match(ui, /if \(!paymentConfirmed\(order\)/);
  assert.match(ui, /state\.drafts\[order\.id\]/);
  assert.match(ui, /Interner Status vorgemerkt/);
  assert.match(ui, /function closeDemo\(/);
  assert.match(ui, /state\.demoMode = false;/);
});

test("demo launch is lazy and the startup budget remains unchanged", () => {
  assert.match(prepare, /seller-orders-v2-loader\.js/);
  assert.doesNotMatch(prepare, /<script type="module" src="\/seller-orders-v2\.js/);
});
