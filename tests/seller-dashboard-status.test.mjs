import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../seller-dashboard-v2.js", import.meta.url), "utf8");
const functionSource = source.slice(source.indexOf("function productMasterStatus"), source.indexOf("function dashboardMarkup"));
const context = vm.createContext({});
vm.runInContext(`${functionSource}; this.productMasterStatus = productMasterStatus;`, context);

test("Product Master zeigt Verbunden bei erfolgreicher Produktantwort", () => {
  assert.equal(context.productMasterStatus({ products: [{ id: "p1" }] }), "Verbunden");
});

test("Product Master bleibt Fehler bei fehlgeschlagener Anfrage", () => {
  assert.equal(context.productMasterStatus({ products: [{ id: "p1" }] }, "timeout"), "Fehler");
});

test("Unbekannt bleibt nur ohne verwertbare Antwort", () => {
  assert.equal(context.productMasterStatus(null), "Unbekannt");
});
