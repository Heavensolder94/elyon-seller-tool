import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const interfaceUrl = new URL("../seller-ai-workforce-interface-v4.js", import.meta.url);
const buildUrl = new URL("../scripts/prepare-vercel.mjs", import.meta.url);

test("virtual employee interface v4 is valid browser JavaScript", async () => {
  const source = await readFile(interfaceUrl, "utf8");
  assert.doesNotThrow(() => new vm.Script(source));
  assert.match(source, /window\.ElyonAIWorkforceInterfaceV4/);
  assert.match(source, /Arbeitsablauf/);
  assert.match(source, /Neuer Auftrag/);
  assert.match(source, /Team anzeigen/);
});

test("legacy empty assignment is converted to Elyon Manager routing", async () => {
  const source = await readFile(interfaceUrl, "utf8");
  assert.match(source, /LEGACY_MANAGER_ID = "soul-operations"/);
  assert.match(source, /blankOption\.value = LEGACY_MANAGER_ID/);
  assert.match(source, /select\.value = LEGACY_MANAGER_ID/);
  assert.match(source, /Elyon Manager – automatisch zuweisen/);
  assert.doesNotMatch(source, />Ohne Agent</);
});

test("modern task composer defaults navigation assignments to Elyon Manager", async () => {
  const source = await readFile(interfaceUrl, "utf8");
  assert.match(source, /BUILDER_MANAGER_ID = "elyon-operations-manager"/);
  assert.match(source, /ElyonAIAgentBuilder\?\.assign\?\.\(BUILDER_MANAGER_ID\)/);
  assert.match(source, /data-agent-builder-assign/);
  assert.match(source, /stopImmediatePropagation/);
});

test("legacy task form is made work-friendly without changing stored task values", async () => {
  const source = await readFile(interfaceUrl, "utf8");
  for (const value of ["product_analysis", "listing_review", "margin_check", "customer_reply_draft", "supplier_check", "research", "seo_audit", "risk_audit", "support_summary", "operations_check"]) {
    assert.match(source, new RegExp(`${value}:`));
  }
  assert.match(source, /Arbeitsauftrag \/ Aufgaben-Prompt/);
  assert.match(source, /Auftragstitel/);
  assert.match(source, /Zuständigkeit/);
  assert.match(source, /Aufgabentyp/);
  assert.match(source, /textarea\.rows = 4/);
  assert.match(source, /Auftrag erstellen/);
});

test("workspace polish adds clear work flow and operational counts", async () => {
  const source = await readFile(interfaceUrl, "utf8");
  assert.match(source, /1 · Auftrag geben/);
  assert.match(source, /2 · Manager verteilt/);
  assert.match(source, /3 · Fachagent arbeitet/);
  assert.match(source, /4 · Freigaben prüfen/);
  assert.match(source, /Offene Aufgaben/);
  assert.match(source, /Eigene Mitarbeiter/);
  assert.match(source, /managerMode/);
});

test("interface observer stays scoped to the virtual employees area", async () => {
  const source = await readFile(interfaceUrl, "utf8");
  assert.match(source, /document\.getElementById\(TAB_ID\) \|\| document\.getElementById\("elyonAiWorkforce"\)/);
  assert.match(source, /state\.observer\.observe\(scope/);
  assert.doesNotMatch(source, /observe\(document\.documentElement/);
  assert.doesNotMatch(source, /observe\(document\.body/);
});

test("vercel build mirrors and lazy-loads interface v4 after agent builder", async () => {
  const build = await readFile(buildUrl, "utf8");
  assert.match(build, /seller-ai-workforce-agent-builder\.js/);
  assert.match(build, /seller-ai-workforce-interface-v4\.js/);
  assert.match(build, /ElyonAIWorkforceInterfaceV4\?\.refresh/);
  const builderIndex = build.indexOf('{ src: "/seller-ai-workforce-agent-builder.js" }');
  const interfaceIndex = build.indexOf('{ src: "/seller-ai-workforce-interface-v4.js" }');
  assert.ok(builderIndex >= 0 && interfaceIndex > builderIndex);
  assert.match(build, /manager-default task routing/);
});
