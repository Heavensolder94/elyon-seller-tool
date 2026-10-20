import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("order mapping counts the quantity of every line item", () => {
  assert.match(source, /const lineItems = Array\.isArray\(order\.lineItems\) \? order\.lineItems : \[\];/);
  assert.match(source, /lineItems\.reduce\(function\(sum, item\)\{ return sum \+ \(parseFloat\(item && item\.quantity\) \|\| 0\); \}, 0\)/);
  assert.match(source, /const qty = lineQuantitySum \|\| parseFloat\(order\.quantity \|\| 1\) \|\| 1;/);
});

test("the first line item quantity is no longer used as the whole order quantity", () => {
  assert.doesNotMatch(source, /const qty = parseFloat\(lineItem\.quantity \|\| order\.quantity \|\| 1\) \|\| 1;/);
});

test("multi item orders are labelled instead of silently showing only the first product", () => {
  assert.match(source, /const extraItems = Math\.max\(0, lineItems\.length - 1\);/);
  assert.match(source, /weiterer Artikel/);
  assert.match(source, /weitere Artikel/);
});

test("order dedupe still keys on the eBay order number", () => {
  assert.match(source, /String\(existing\.orderNo\|\|''\) === String\(s\.orderNo\)/);
});

test("a sale row still derives the unit price from the order total", () => {
  assert.match(source, /price: qty \? totalValue \/ qty : totalValue,/);
});
