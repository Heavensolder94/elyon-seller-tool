import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { optimizeCompanyEntryRuntime } from "../scripts/workforce-company-entry-runtime-optimization.mjs";

const entryUrl = new URL("../seller-ai-workforce-company-entry-preview.js", import.meta.url);
const finalizerUrl = new URL("../scripts/finalize-seller-os.mjs", import.meta.url);

test("production company entry coalesces activation and owns a dedicated company host", async () => {
  const source = await readFile(entryUrl, "utf8");
  const optimized = optimizeCompanyEntryRuntime(source);

  assert.doesNotThrow(() => new vm.Script(optimized));
  assert.match(optimized, /activationQueued: false/);
  assert.match(optimized, /requestAnimationFrame\(activateCompanyView\)/);
  assert.match(optimized, /COMPANY_HOST_ID = "elyonWorkforceCompanyHost"/);
  assert.match(optimized, /function ensureCompanyHost\(\)/);
  assert.match(optimized, /shell\.classList\.add\("aiw-company-view"\)/);
  assert.match(optimized, /ElyonAIWorkforceOrgchartV1\?\.render\?\.\(\)/);
  assert.match(optimized, /#virtualAgentsSettingsRoot:has\(>#elyonAiWorkforce\.aiw-company-view\)>:not\(#elyonAiWorkforce\)/);
  assert.match(optimized, /#virtualAgentsTab:has\(#elyonAiWorkforce\.aiw-company-view\)>\.card>\.settings-agents-header/);
  assert.match(optimized, /body:has\(#virtualAgentsTab\.active\) \.elyon-jarvis-floating\.minimized/);
  assert.doesNotMatch(optimized, /if \(!teamButton\) return false/);
  assert.doesNotMatch(optimized, /\[0, 80, 250, 700\]/);
  assert.doesNotMatch(optimized, /window\.setTimeout\(renderCompanyTree, 35\)/);
});

test("Seller OS finalizer applies company entry runtime optimization before publishing", async () => {
  const source = await readFile(finalizerUrl, "utf8");
  assert.match(source, /optimizeCompanyEntryRuntime/);
  assert.match(source, /optimizeCompanyEntryRuntime\(companyEntrySource\)/);
});
