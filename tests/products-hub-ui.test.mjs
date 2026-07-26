import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const hubSource = await readFile(new URL("../seller-products-hub.js", import.meta.url), "utf8");
const prepareSource = await readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8");

test("Products Hub keeps Product Import and Productboard in one clean area", () => {
  assert.match(hubSource, /Produkte-Zentrale/);
  assert.match(hubSource, /Produkt Import/);
  assert.match(hubSource, /Produktboard/);
  assert.match(hubSource, /data-products-hub-panel/);
});

test("Company OS imports link to existing board actions without replacing core logic", () => {
  assert.match(hubSource, /Im Produktboard öffnen/);
  assert.match(hubSource, /Produkt bearbeiten/);
  assert.match(hubSource, /winnerFilterBtn/);
  assert.match(hubSource, /toggleViewBtn/);
  assert.doesNotMatch(hubSource, /localStorage\.removeItem\(LOCAL_KEY\)/);
});

test("Vercel output includes the Products Hub after the existing import bridge", () => {
  const importPosition = prepareSource.indexOf("seller-product-import.js");
  const hubPosition = prepareSource.indexOf("seller-products-hub.js");
  assert.ok(importPosition >= 0, "Product Import script must remain included");
  assert.ok(hubPosition > importPosition, "Products Hub must load after Product Import");
  assert.match(prepareSource, /\["seller-products-hub\.js", "public\/seller-products-hub\.js"\]/);
});
