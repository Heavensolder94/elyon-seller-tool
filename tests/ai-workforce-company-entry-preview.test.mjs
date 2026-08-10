import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const entryUrl = new URL("../seller-ai-workforce-company-entry-preview.js", import.meta.url);
const finalizerUrl = new URL("../scripts/finalize-seller-os.mjs", import.meta.url);
const vercelUrl = new URL("../vercel.json", import.meta.url);

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

test("company view is a focus workspace without the legacy side columns", async () => {
  const source = await readFile(entryUrl, "utf8");
  assert.match(source, /aiw-company-view/);
  assert.match(source, /:has\(\.aiw-org\)/);
  assert.match(source, /aiw-v3-nav[\s\S]*aiw-v3-side[\s\S]*display:none!important/);
  assert.match(source, /aiw-v3-layout[\s\S]*display:block!important/);
  assert.match(source, /openAdvanced/);
  assert.doesNotMatch(source, /data-org-advanced-view/);
});

test("company entry uses only bounded activation retries", async () => {
  const source = await readFile(entryUrl, "utf8");
  assert.doesNotMatch(source, /MutationObserver/);
  assert.doesNotMatch(source, /setInterval\(/);
  assert.match(source, /\[0, 80, 250, 700\]/);
});

test("production finalizer keeps company UI lazy and exposes production asset names", async () => {
  const source = await readFile(finalizerUrl, "utf8");
  assert.match(source, /seller-ai-workforce-team-v6\.js/);
  assert.match(source, /seller-ai-workforce-orgchart-v1\.js/);
  assert.match(source, /seller-ai-workforce-company-entry\.js/);
  assert.match(source, /ElyonAIWorkforceCompanyEntry/);
  assert.doesNotMatch(source, /<script defer src=.*seller-ai-workforce-orgchart-v1/);
  assert.doesNotMatch(source, /setInterval\(/);
  assert.doesNotMatch(source, /MutationObserver/);
});

test("Vercel production build uses Seller OS finalizer without branch-only ignore rules", async () => {
  const source = await readFile(vercelUrl, "utf8");
  assert.match(source, /scripts\/finalize-seller-os\.mjs/);
  assert.doesNotMatch(source, /inject-preview-design/);
  assert.doesNotMatch(source, /ignoreCommand/);
});
