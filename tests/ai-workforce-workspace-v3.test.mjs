import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../seller-ai-workforce-workspace-v3.js", import.meta.url);
const buildUrl = new URL("../scripts/prepare-vercel.mjs", import.meta.url);

test("autonomy workspace v3 is valid browser JavaScript", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.doesNotThrow(() => new vm.Script(source));
  assert.match(source, /window\.ElyonAIWorkforceWorkspaceV3/);
  assert.match(source, /Elyon Arbeitszentrale/);
});

test("all six autonomy levels are present", async () => {
  const source = await readFile(sourceUrl, "utf8");
  for (const mode of ["off", "manual", "assisted", "semi", "auto_internal", "auto_external"]) {
    assert.match(source, new RegExp(`id: ["']${mode}["']`));
  }
  assert.match(source, /Vollautomatisch intern/);
  assert.match(source, /Vollautomatisch extern/);
});

test("internal automation has workflow controls and safe stop conditions", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /startWorkflow/);
  assert.match(source, /pauseWorkflow/);
  assert.match(source, /resumeWorkflow/);
  assert.match(source, /stopWorkflow/);
  assert.match(source, /stopOnBlocker/);
  assert.match(source, /stopOnLowConfidence/);
  assert.match(source, /maximumCostPerWorkflow/);
  assert.match(source, /runWithRecovery/);
});

test("external automation is separately locked and permission gated", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /ELYON EXTERN FREIGEBEN/);
  assert.match(source, /externalAutomation/);
  assert.match(source, /createEbayDraft/);
  assert.match(source, /publishListing/);
  assert.match(source, /sendCustomerMessage/);
  assert.match(source, /placeSupplierOrder/);
  assert.match(source, /issueRefund/);
  assert.match(source, /Kein ausführender Connector verbunden/);
  assert.doesNotMatch(source, /fetch\([^\n]*(publish|refund|supplier-order|customer-message)/i);
});

test("workspace presents a focused three-column work surface", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /grid-template-columns:190px minmax\(0,1fr\) 270px/);
  assert.match(source, /Produktworkflow/);
  assert.match(source, /Laufender Betrieb/);
  assert.match(source, /Mitarbeiterteam/);
  assert.match(source, /Blocker/);
  assert.match(source, /Freigaben & Hinweise/);
  assert.match(source, /Letzte Aktivität/);
});

test("vercel build mirrors and lazy-loads workspace v3", async () => {
  const build = await readFile(buildUrl, "utf8");
  assert.match(build, /seller-ai-workforce-workspace-v3\.js/);
  assert.match(build, /ElyonAIWorkforceWorkspaceV3\?\.render/);
  assert.match(build, /lazy-loaded Elyon autonomy workspace v3/);
});
