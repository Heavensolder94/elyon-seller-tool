import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { optimizeCompanyEntryRuntime } from "../scripts/workforce-company-entry-runtime-optimization.mjs";

const entryUrl = new URL("../seller-ai-workforce-company-entry-preview.js", import.meta.url);
const finalizerUrl = new URL("../scripts/finalize-seller-os.mjs", import.meta.url);

test("virtual employees has one visible owner and isolates legacy technical renderers", async () => {
  const source = await readFile(entryUrl, "utf8");
  const optimized = optimizeCompanyEntryRuntime(source);

  assert.doesNotThrow(() => new vm.Script(optimized));
  assert.match(optimized, /ROOT_ID = "virtualAgentsSettingsRoot"/);
  assert.match(optimized, /COMPANY_HOST_ID = "elyonWorkforceCompanyHost"/);
  assert.match(optimized, /ADVANCED_HOST_ID = "elyonWorkforceAdvancedHost"/);
  assert.match(optimized, /function adoptLegacySurfaces\(\)/);
  assert.match(optimized, /advanced\.appendChild\(node\)/);
  assert.match(optimized, /target\.dataset\.workforceOwner = "company"/);
  assert.match(optimized, /target\.dataset\.workforceOwner = "advanced"/);
  assert.match(optimized, /ElyonAIWorkforceOrgchartV1\?\.render\?\.\(\)/);
  assert.match(optimized, /data-company-view="company"/);
  assert.match(optimized, /data-workforce-owner="company"/);
  assert.match(optimized, /data-workforce-owner="advanced"/);
  assert.match(optimized, /elyon-jarvis-floating\.minimized/);
  assert.doesNotMatch(optimized, /\[0, 80, 250, 700\]/);
  assert.doesNotMatch(optimized, /teamButton/);
});

test("Seller OS finalizer validates company entry before publishing", async () => {
  const source = await readFile(finalizerUrl, "utf8");
  assert.match(source, /optimizeCompanyEntryRuntime/);
  assert.match(source, /optimizeCompanyEntryRuntime\(companyEntrySource\)/);
});
