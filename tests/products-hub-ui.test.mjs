import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const policySource = await readFile(new URL("../seller-role-policy.js", import.meta.url), "utf8");
const inboxSource = await readFile(new URL("../seller-company-os-inbox.js", import.meta.url), "utf8");
const prepareSource = await readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8");

test("Seller role policy keeps only operational modules active", () => {
  assert.match(policySource, /Seller Tool = Betrieb nach der Company-OS-Freigabe/);
  assert.match(policySource, /productSearchTab/);
  assert.match(policySource, /virtualAgentsTab/);
  assert.match(policySource, /shopifyTab/);
  assert.match(policySource, /elyon-role-hidden/);
  assert.match(policySource, /Listing-Paket \/ eBay-Freigabe/);
});

test("Company OS inbox requires an explicit working-copy action", () => {
  assert.match(inboxSource, /Erst dein Klick erstellt eine lokale Arbeitskopie/);
  assert.match(inboxSource, /Arbeitskopie übernehmen/);
  assert.match(inboxSource, /Listing-Paket öffnen/);
  assert.match(inboxSource, /product\?\.source === "elyon_company_os" && product\?\.approval\?\.companyOsApproved === true/);
  assert.doesNotMatch(inboxSource, /localStorage\.setItem\(LOCAL_KEY[^\n]+refresh/);
});

test("Vercel output loads the role policy and approved Company OS inbox only", () => {
  const policyPosition = prepareSource.indexOf("seller-role-policy.js");
  const inboxPosition = prepareSource.indexOf("seller-company-os-inbox.js");
  assert.ok(policyPosition >= 0, "Seller role policy must be included");
  assert.ok(inboxPosition > policyPosition, "Company OS inbox must load after role policy");
  assert.doesNotMatch(prepareSource, /<script defer src="\/seller-product-import\.js/);
  assert.doesNotMatch(prepareSource, /<script defer src="\/seller-products-hub\.js/);
});
