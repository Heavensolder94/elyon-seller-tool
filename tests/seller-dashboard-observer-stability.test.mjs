import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../seller-dashboard-compat.js", import.meta.url), "utf8");

test("dashboard compatibility observers disconnect while normalizing their own DOM", () => {
  assert.match(source, /observer\.disconnect\(\);[\s\S]*normalizePostEbayDashboard\(doc\)[\s\S]*observer\.observe\(host, config\)/);
  assert.match(source, /observer\.disconnect\(\);[\s\S]*normalizeFinanceNavigation\(doc\)[\s\S]*normalizePostEbayNavigation\(doc\)[\s\S]*observer\.observe\(menu, config\)/);
});

test("dashboard compatibility rewrites text only when it actually changed", () => {
  assert.match(source, /function setTextIfChanged/);
  assert.match(source, /setTextIfChanged\(copy, "eBay ist die Quelle für Entwürfe, aktive Listings/);
  assert.match(source, /setTextIfChanged\(roleStrong, "Seller Tool = Betrieb ab eBay"\)/);
  assert.doesNotMatch(source, /characterData:\s*true/);
});

test("navigation observer does not rerun dashboard normalization for menu-only changes", () => {
  const observeNavigation = source.slice(source.indexOf("function observeNavigation"), source.indexOf("function observeDashboard"));
  assert.doesNotMatch(observeNavigation, /normalizeAll\(doc\)/);
  assert.match(observeNavigation, /normalizeFinanceNavigation\(doc\)/);
  assert.match(observeNavigation, /normalizePostEbayNavigation\(doc\)/);
});
