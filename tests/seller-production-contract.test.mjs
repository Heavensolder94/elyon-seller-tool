import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  alignSellerProductionNavigation,
  ensureVirtualEmployeesCompanyActivation,
} from "../scripts/seller-production-contract-transform.mjs";
import { transformSellerRuntimeLoader } from "../scripts/seller-listing-parity-transform.mjs";

const rolePolicyUrl = new URL("../seller-role-policy.js", import.meta.url);
const runtimeUrl = new URL("../seller-runtime-loader.js", import.meta.url);
const finalizerUrl = new URL("../scripts/finalize-seller-os.mjs", import.meta.url);

test("production menu follows the documented post-eBay Seller Tool workflow without number gaps", async () => {
  const source = await readFile(rolePolicyUrl, "utf8");
  const output = alignSellerProductionNavigation(source);
  const activeBlock = output.match(/const ACTIVE_MODULES = \[([\s\S]*?)\n  \];/)?.[1] || "";

  const expectedOrder = [
    "dashboardTab",
    "draftsTab",
    "activeListingsTab",
    "ordersTab",
    "financeTab",
    "automationTab",
    "returnsTab",
    "settingsTab",
    "virtualAgentsTab",
    "jarvisCommandCenterTab",
    "jarvisIntegrationCenterTab",
  ];

  let cursor = -1;
  for (const id of expectedOrder) {
    const next = activeBlock.indexOf(`id: "${id}"`);
    assert.ok(next > cursor, `${id} must appear in production menu order`);
    cursor = next;
  }

  assert.doesNotMatch(activeBlock, /id: "productListTab"/);
  assert.doesNotMatch(activeBlock, /id: "ebayListingTab"/);
  assert.doesNotMatch(activeBlock, /id: "invoiceTab"/);
  assert.doesNotMatch(output, /id: "financeTab", label: "Vorab-Kalkulation"/);
});

test("production runtime explicitly restores the company cockpit when virtual employees opens", async () => {
  const runtime = transformSellerRuntimeLoader(await readFile(runtimeUrl, "utf8"));
  const output = ensureVirtualEmployeesCompanyActivation(runtime);
  const teamIndex = output.indexOf("window.ElyonAIWorkforceTeamV6?.render?.();");
  const companyIndex = output.indexOf("window.ElyonAIWorkforceCompanyEntry?.showCompany?.();");

  assert.ok(teamIndex >= 0);
  assert.ok(companyIndex > teamIndex);
});

test("finalizer versions both runtime loader and role policy for the repaired production contract", async () => {
  const source = await readFile(finalizerUrl, "utf8");
  assert.match(source, /SELLER_OS_VERSION = "20260823-workforce-cockpit-7"/);
  assert.match(source, /WORKFORCE_ASSET_VERSION = "workforce-cockpit-20260823-5"/);
  assert.match(source, /alignSellerProductionNavigation\(rolePolicySource\)/);
  assert.match(source, /ensureVirtualEmployeesCompanyActivation/);
  assert.match(source, /seller-role-policy\.js\?v=\$\{SELLER_OS_VERSION\}/);
});
