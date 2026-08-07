import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../seller-ai-workforce-team-v6.js", import.meta.url);
const publicUrl = new URL("../public/seller-ai-workforce-team-v6.js", import.meta.url);
const loaderUrl = new URL("../seller-runtime-loader.js", import.meta.url);
const promptUrl = new URL("../seller-ai-task-prompt-helper.js", import.meta.url);

test("stable team v6 is valid browser JavaScript and public asset is identical", async () => {
  const [source, publicSource] = await Promise.all([readFile(sourceUrl, "utf8"), readFile(publicUrl, "utf8")]);
  assert.doesNotThrow(() => new vm.Script(source));
  assert.equal(publicSource, source);
  assert.match(source, /window\.ElyonAIWorkforceTeamV6/);
});

test("team v6 keeps exactly five business-facing employees", async () => {
  const source = await readFile(sourceUrl, "utf8");
  for (const name of ["Elyon Manager", "Product Manager", "Listing Manager", "Operations Manager", "Customer Care"]) {
    assert.match(source, new RegExp(`name: ["']${name}["']`));
  }
  const block = source.match(/const TEAM = \[(.*?)\n  \];/s)?.[1] || "";
  assert.equal((block.match(/\n      id: /g) || []).length, 5);
});

test("team v6 uses delegated click routing instead of per-render button listeners", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /document\.addEventListener\("click", handleClick, true\)/);
  for (const selector of ["data-v6-assign", "data-v6-details", "data-v6-create-custom", "data-v6-custom-assign", "data-v6-custom-edit", "data-v6-panel-assign", "data-v6-skill-settings", "data-v6-skill-autonomy", "data-v6-run"]) {
    assert.match(source, new RegExp(selector));
  }
  assert.doesNotMatch(source, /querySelectorAll\([^\n]*data-v6[^\n]*addEventListener/);
});

test("team v6 has no mutation observer or polling render loop", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.doesNotMatch(source, /MutationObserver/);
  assert.doesNotMatch(source, /setInterval\(/);
  assert.match(source, /section\.dataset\.aiwV6Signature === nextSignature/);
  assert.match(source, /elyon:ai-workforce-v2-task-updated/);
  assert.match(source, /elyon:runtime-group-loaded/);
});

test("runtime loads v6 and does not load observer-based v5", async () => {
  const loader = await readFile(loaderUrl, "utf8");
  const virtualGroup = loader.match(/virtualAgentsTab:\s*\[([\s\S]*?)\n\s*\],/)?.[1] || "";
  assert.match(virtualGroup, /seller-ai-workforce-team-v6\.js/);
  assert.doesNotMatch(virtualGroup, /seller-ai-workforce-team-v5\.js/);
  assert.match(loader, /ElyonAIWorkforceTeamV6\?\.render/);
});

test("DeepSeek prompt helper supports the stable v6 composer", async () => {
  const source = await readFile(promptUrl, "utf8");
  assert.match(source, /elyonAiWorkforceTeamV6Composer/);
  assert.match(source, /data-v6-field=\"prompt\"/);
  assert.match(source, /data-v6-field=\"title\"/);
  assert.match(source, /elyon:ai-workforce-team-v6-rendered/);
});

test("department workflow remains internal and blocker-aware", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /\/api\/ai-agent-run-advanced/);
  assert.match(source, /function isHardStop/);
  assert.match(source, /ElyonAIWorkforceV2\?\.runAgent\?\.\(visibleId\)/);
  assert.match(source, /Externe Aktionen werden dadurch nicht automatisch freigeschaltet/);
  assert.doesNotMatch(source, /publishListing\s*\(/);
  assert.doesNotMatch(source, /placeSupplierOrder\s*\(/);
  assert.doesNotMatch(source, /issueRefund\s*\(/);
});
