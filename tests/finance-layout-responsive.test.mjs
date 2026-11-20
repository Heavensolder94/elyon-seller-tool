import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../seller-finance.js", import.meta.url), "utf8");

test("finance layout responds to actual workspace width rather than viewport", () => {
  assert.match(source, /#financeTab\{[^}]*container-type:inline-size/);
  assert.match(source, /@container \(max-width:1170px\)/);
  assert.match(source, /@container \(max-width:820px\)/);
  assert.match(source, /@container \(max-width:620px\)/);
});

test("finance dashboard stays readable in narrow workspaces", () => {
  assert.match(source, /#financeTab \.ef-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(source, /#financeTab \.ef-columns\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(source, /#financeTab \.ef-period\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/);
  assert.match(source, /#financeTab \.ef-nav\{display:flex;flex-wrap:nowrap;/);
  assert.match(source, /#financeTab \.ef-table-wrap\{max-width:100%\}/);
});

test("finance navigation and guarded import actions remain available", () => {
  for (const action of ["ebay-preview", "confirm-ebay-preview", "load-server", "save-server"]) {
    assert.ok(source.includes('data-ef2-action="'+action+'"'), action + " should remain available");
  }
  for (const panel of ["dashboard", "transactions", "imports", "invoices", "settings"]) {
    assert.ok(source.includes('"'+panel+'"'), panel + " should remain available");
  }
});
