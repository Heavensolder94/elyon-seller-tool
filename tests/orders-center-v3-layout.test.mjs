import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [ui, css, core] = await Promise.all([
  readFile(new URL("../seller-orders-v2.js", import.meta.url), "utf8"),
  readFile(new URL("../seller-orders-v2.css", import.meta.url), "utf8"),
  readFile(new URL("../seller-orders-v2-core.js", import.meta.url), "utf8"),
]);

test("orders render a full-width list first, with no automatically selected order", () => {
  assert.match(ui, /selectedId: ""/);
  assert.match(ui, /state\.selectedId = ""; state\.activeSection = "overview"/);
  assert.match(ui, /if \(!state\.demoMode && state\.selectedId && !state\.orders\.some/);
  assert.match(ui, /Deine Bestellungen/);
  assert.match(ui, /ocv3-order-list-header/);
  assert.match(css, /\.ocv2-content \{ display:block; width:100%/);
  assert.match(css, /\.ocv3-drawer-closed \{ display:none !important;/);
});

test("clicking an order opens a true detail dialog and Escape/backdrop/close dismiss it", () => {
  assert.match(ui, /ocv3-drawer-open/);
  assert.match(ui, /role="dialog" aria-modal="true" aria-labelledby="ocv3DrawerLabel"/);
  assert.match(ui, /data-ocv3-drawer-close/);
  assert.match(ui, /function closeOrderDrawer\(/);
  assert.match(ui, /event\.key === "Escape" && state\.selectedId/);
  assert.match(ui, /querySelector\("\.ocv3-drawer-content"\)\?\.focus\(\)/);
  assert.match(css, /\.ocv3-drawer-open \{ display:flex; position:fixed; inset:0/);
  assert.match(css, /\.ocv3-drawer-content \{ position:relative; z-index:2; width:min\(100%,585px\)/);
});

test("detail drawer retains order workflow, supplier, shipping, finance and demo interactions", () => {
  for (const feature of [
    "progressMarkup(order, op)", "sectionNav()", "Lieferant und Bearbeitung",
    "Versand vorbereiten", "Kosten und Gewinn", "suggestRecordedCosts(op, costHints)",
    'data-order-shipping', 'data-order-invoice', "function demoModalMarkup()",
    "function submitDemoShipping(", 'id="ocv2OrderForm"', "function updateLiveProfit(",
  ]) assert.ok(ui.includes(feature), feature);
  assert.match(ui, /demoMode \? DEMO\.orders : state\.orders/);
  assert.match(core, /export function actualOrderProfit\(/);
});

test("layout stays within existing orders tab and is responsive", () => {
  assert.match(css, /#ordersTab #elyonOrdersV2Root \{ container-type: normal; \}/);
  assert.match(css, /@media \(max-width:680px\)/);
  assert.match(css, /\.ocv3-drawer-content \{ width:100%; padding:0 17px 24px/);
  assert.match(ui, /id="ocv2Details"/);
  assert.match(css, /#ordersTab\.elyon-orders-v2-active > :not\(#elyonOrdersV2Root\)/);
});

test("no finance or shipment server action is added to the new order-view flow", () => {
  assert.doesNotMatch(ui, /data-ocv3-drawer-close[^\n]*fetch\(/);
  assert.match(ui, /if \(state\.demoMode\) return openDemoModal\("invoice"\)/);
  assert.match(ui, /if \(state\.demoMode\) return openDemoModal\("shipping"\)/);
});
