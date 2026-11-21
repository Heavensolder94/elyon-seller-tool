import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [ui,css,core]=await Promise.all([
  readFile(new URL("../seller-orders-v2.js", import.meta.url),"utf8"),
  readFile(new URL("../seller-orders-v2.css", import.meta.url),"utf8"),
  readFile(new URL("../seller-orders-v2-core.js", import.meta.url),"utf8"),
]);

test("business compact orders use structured five-column rows without game-like icons",()=>{
  const section=ui.slice(ui.indexOf("function rowMarkup(order) {"),ui.indexOf("const SECTION_TABS"));
  assert.match(section,/ocv4-order-row/);
  assert.match(section,/ocv4-order-product/);
  assert.match(section,/ocv4-buyer/);
  assert.match(section,/ocv4-date/);
  assert.match(section,/ocv4-amount/);
  assert.match(section,/ocv4-status/);
  assert.match(section,/ocv4-status-dot/);
  assert.doesNotMatch(section,/ocv3-order-icon|ocv3-order-arrow|ocv2-state--/);
  assert.match(section,/data-order-open/);
  assert.match(ui,/ocv4-order-head/);
  for (const title of ["Bestellung / Artikel","Käufer","Bestelldatum","Betrag","Status"]) assert.ok(ui.includes(title),title);
});

test("business compact CSS has an ERP-like density, neutral status text and small markers",()=>{
  assert.match(css,/ELYON Bestellzentrale Business Compact 3\.1/);
  assert.match(css,/min-height:55px/);
  assert.match(css,/border-radius:0; background:transparent/);
  assert.match(css,/\.ocv4-status-dot \{[^}]*width:6px; height:6px/);
  assert.match(css,/font-variant-numeric:tabular-nums/);
  assert.match(css,/\.ocv2-header h2 \{ font-size:clamp\(23px,2vw,28px\)/);
  assert.match(css,/button\.ocv2-stat \{ display:flex/);
  assert.match(css,/\.ocv3-drawer-content \{ width:min\(100%,555px\)/);
});

test("compact row remains readable on smaller screens without hiding the key purchase info",()=>{
  assert.match(css,/@media \(max-width:780px\)/);
  assert.match(css,/@media \(max-width:470px\)/);
  assert.match(css,/\.ocv4-mobile-meta \{ display:block!important/);
  assert.match(css,/grid-template-columns:minmax\(116px,1fr\) 77px 96px/);
});

test("no sales workflows or invoice integration are removed",()=>{
  for(const required of [
    "function detailsMarkup(order)", "function demoModalMarkup()", "function submitDemoShipping(",
    'data-order-shipping','data-order-invoice',"function save(form)", "function refresh()",
    "suggestRecordedCosts(op, costHints)", "actualOrderProfit(order, calculatedOp)",
    "function closeOrderDrawer()", "data-ocv3-drawer-close",
  ]) assert.ok(ui.includes(required),required);
  assert.match(core,/export function actualOrderProfit\(/);
  assert.match(ui,/state\.demoMode \? DEMO\.orders : state\.orders/);
});
