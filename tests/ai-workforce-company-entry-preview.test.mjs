import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const entryUrl = new URL("../seller-ai-workforce-company-entry-preview.js", import.meta.url);
const injectorUrl = new URL("../scripts/inject-preview-design.mjs", import.meta.url);

test("company entry adapter is valid browser JavaScript", async () => {
  const source = await readFile(entryUrl, "utf8");
  assert.doesNotThrow(() => new vm.Script(source));
  assert.match(source, /ElyonAIWorkforceCompanyEntryPreview/);
});

test("virtual employees open directly into the company team view", async () => {
  const source = await readFile(entryUrl, "utf8");
  assert.match(source, /data-v3-view="team"/);
  assert.match(source, /teamButton\.click\(\)/);
  assert.match(source, /ElyonAIWorkforceTeamV6\?\.render/);
  assert.match(source, /ElyonAIWorkforceOrgchartV1\?\.render/);
  assert.match(source, /event\.detail\?\.tabId === TAB_ID/);
  assert.match(source, /event\.target\?\.id === "mainMenu"/);
});

test("virtual employees visibly expose company and advanced views", async () => {
  const source = await readFile(entryUrl, "utf8");
  assert.match(source, /elyonWorkforceCompanySwitcher/);
  assert.match(source, /🏢 Firmenstruktur/);
  assert.match(source, /⚙ Erweiterte Steuerung/);
  assert.match(source, /data-company-view="company"/);
  assert.match(source, /data-company-view="advanced"/);
  assert.match(source, /requestedView: "company"/);
});

test("company view becomes full-width but keeps advanced workforce reachable", async () => {
  const source = await readFile(entryUrl, "utf8");
  assert.match(source, /aiw-company-view/);
  assert.match(source, /aiw-v3-nav[^}]*display:none!important/s);
  assert.match(source, /aiw-v3-side[^}]*display:none!important/s);
  assert.match(source, /data-org-advanced-view/);
  assert.match(source, /openAdvanced/);
});

test("company entry uses only bounded activation retries", async () => {
  const source = await readFile(entryUrl, "utf8");
  assert.doesNotMatch(source, /MutationObserver/);
  assert.doesNotMatch(source, /setInterval\(/);
  assert.match(source, /\[0, 80, 250, 700\]/);
});

test("preview build ships org chart before the company entry adapter", async () => {
  const source = await readFile(injectorUrl, "utf8");
  const orgIndex = source.indexOf("seller-ai-workforce-orgchart-v1.js?v=");
  const entryIndex = source.indexOf("seller-ai-workforce-company-entry-preview.js?v=");
  assert.ok(orgIndex >= 0);
  assert.ok(entryIndex > orgIndex);
  assert.match(source, /copyFile\(companyEntrySourcePath, companyEntryOutputPath\)/);
});
