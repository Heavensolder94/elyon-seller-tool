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

test("virtual employees open directly into the single-owner company cockpit", async () => {
  const source = await readFile(entryUrl, "utf8");
  assert.match(source, /COMPANY_HOST_ID = "elyonWorkforceCompanyHost"/);
  assert.match(source, /ADVANCED_HOST_ID = "elyonWorkforceAdvancedHost"/);
  assert.match(source, /ElyonAIWorkforceOrgchartV1\?\.render/);
  assert.match(source, /handleTabEvent\(event\.detail\?\.tabId \|\| event\.detail\)/);
  assert.match(source, /event\.target\?\.id === "mainMenu"/);
  assert.match(source, /target\.dataset\.workforceOwner = "company"/);
  assert.doesNotMatch(source, /teamButton/);
  assert.doesNotMatch(source, /data-v3-view="team"/);
});

test("technical workforce controls are isolated in the explicit advanced host", async () => {
  const source = await readFile(entryUrl, "utf8");
  assert.match(source, /data-elyon-workforce-advanced-host/);
  assert.match(source, /Technische Workforce-Steuerung/);
  assert.match(source, /data-company-view="company"/);
  assert.match(source, /requestedView: "company"/);
  assert.match(source, /function adoptLegacySurfaces\(\)/);
  assert.match(source, /advanced\.appendChild\(node\)/);
  assert.match(source, /target\.dataset\.workforceOwner = "advanced"/);
  assert.match(source, /function openAdvanced/);
});

test("company view owns the tab shell while advanced controls remain recoverable", async () => {
  const source = await readFile(entryUrl, "utf8");
  assert.match(source, /data-workforce-owner="company"/);
  assert.match(source, /data-workforce-owner="advanced"/);
  assert.match(source, /settings-agents-header\{display:none!important\}/);
  assert.match(source, /openAdvanced/);
  assert.match(source, /refreshAdvancedSurfaces/);
});

test("company entry is event driven without polling or retry storms", async () => {
  const source = await readFile(entryUrl, "utf8");
  assert.doesNotMatch(source, /MutationObserver/);
  assert.doesNotMatch(source, /setInterval\(/);
  assert.doesNotMatch(source, /\[0, 80, 250, 700\]/);
  assert.match(source, /elyon:runtime-group-loaded/);
  assert.match(source, /elyon:tab-changed/);
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

test("Vercel build uses the production Seller OS finalizer and no preview injector", async () => {
  const source = await readFile(vercelUrl, "utf8");
  assert.match(source, /scripts\/finalize-seller-os\.mjs/);
  assert.doesNotMatch(source, /inject-preview-design/);
});
