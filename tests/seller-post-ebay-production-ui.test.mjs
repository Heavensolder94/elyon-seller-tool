import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const compatSource = await readFile(new URL("../seller-dashboard-compat.js", import.meta.url), "utf8");
const rolePolicySource = await readFile(new URL("../seller-role-policy.js", import.meta.url), "utf8");
const prepareSource = await readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8");

test("production compatibility layer retires every pre-eBay workspace", () => {
  for (const tabId of ["productSearchTab", "productAnalysisTab", "productListTab", "ebayListingTab"]) {
    assert.match(compatSource, new RegExp(`\\"${tabId}\\"`), `${tabId} must be retired by the early production compatibility layer`);
  }
  assert.match(compatSource, /RETIRED_PRE_EBAY_TABS\.forEach\(\(id\) => hideNode/);
  assert.match(compatSource, /RETIRED_PRE_EBAY_TABS\.has\(String\(menu\.value/);
  assert.match(compatSource, /RETIRED_PRE_EBAY_TABS\.has\(String\(option\?\.value \|\| ""\)\)/);
  assert.match(compatSource, /removeOption\(menu, option\)/);
});

test("legacy pre-eBay launchers cannot reopen retired workspaces", () => {
  for (const launcherId of ["launcherNewProduct", "launcherBoard", "launcherGenerator"]) {
    assert.match(compatSource, new RegExp(`\\"${launcherId}\\"`));
  }
  assert.match(compatSource, /RETIRED_PRE_EBAY_LAUNCHERS\.forEach\(\(id\) => hideNode/);
});

test("role policy independently classifies sourcing and analysis as inactive", () => {
  assert.match(rolePolicySource, /id: "productSearchTab"[^\n]+Aufgabe von Elyon Nova und Company OS/);
  assert.match(rolePolicySource, /id: "productAnalysisTab"[^\n]+Aufgabe der Company-OS-Produktprüfung/);
});

test("compatibility cleanup still runs before role policy in Vercel output", () => {
  const compatIndex = prepareSource.indexOf("/seller-dashboard-compat.js");
  const roleIndex = prepareSource.indexOf("/seller-role-policy.js");
  assert.ok(compatIndex >= 0);
  assert.ok(roleIndex > compatIndex);
});
