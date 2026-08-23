import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../seller-ai-workforce-orgchart-v1.js", import.meta.url);
const finalizerUrl = new URL("../scripts/finalize-seller-os.mjs", import.meta.url);
const runtimeOptimizationUrl = new URL("../scripts/virtual-agents-runtime-optimization.mjs", import.meta.url);

test("workforce team cockpit is valid browser JavaScript", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.doesNotThrow(() => new vm.Script(source));
  assert.match(source, /window\.ElyonAIWorkforceOrgchartV1/);
});

test("team cockpit exposes the four business employees and their existing specialists", async () => {
  const source = await readFile(sourceUrl, "utf8");
  for (const name of ["Product Manager", "Listing Manager", "Operations Manager", "Customer Care"]) {
    assert.match(source, new RegExp(`name: ["']${name}["']`));
  }
  for (const specialist of [
    "Product Data Specialist",
    "Compliance Guard",
    "Profit Analyst",
    "Listing Specialist",
    "Draft Quality Guard",
    "Order Coordinator",
    "Customer Support Specialist",
    "Elyon Manager",
  ]) {
    assert.match(source, new RegExp(specialist));
  }
});

test("team cockpit uses the requested business-first navigation", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, />Übersicht<\/button>/);
  assert.match(source, />Aufgaben<\/button>/);
  assert.match(source, /Entscheidungen\$\{decisionCount/);
  assert.match(source, />Team<\/button>/);
  assert.match(source, /data-company-view="advanced">⚙ Einstellungen<\/button>/);
  assert.match(source, /state = \{ expanded: new Set\(\), queued: false, view: "overview", filter: "" \}/);
  assert.doesNotMatch(source, /elyon_ai_workforce_v7_view/);
});

test("overview metrics are derived from real workforce state without invented progress percentages", async () => {
  const source = await readFile(sourceUrl, "utf8");
  for (const label of ["Mitarbeiter aktiv", "Aufgaben laufen", "Entscheidungen", "Heute erledigt"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /TEAM\.filter\(\(item\) => item\.agents\.some\(\(id\) => rawMode\(id\) !== "off"\)\)/);
  assert.match(source, /all\.filter\(\(task\) => RUNNING\.has\(status\(task\)\)\)/);
  assert.match(source, /GOOD\.has\(status\(task\)\) && isToday\(task\)/);
  assert.doesNotMatch(source, /Math\.random/);
  assert.doesNotMatch(source, /progressPercent|progress:\s*\d+|72\s*%/);
});

test("employee cards provide stable assignment details and activity actions", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /data-v6-assign="\$\{item\.id\}"/);
  assert.match(source, /data-v6-details="\$\{item\.id\}"/);
  assert.match(source, /data-org-view="tasks" data-org-filter="\$\{item\.id\}"/);
  assert.match(source, />Auftrag geben<\/button>/);
  assert.match(source, />Details<\/button>/);
  assert.match(source, />Aktivität<\/button>/);
});

test("overview prioritizes decisions current work and completed work", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /🚨 Deine Entscheidungen/);
  assert.match(source, /⚡ Gerade in Arbeit/);
  assert.match(source, /✅ Zuletzt erledigt/);
  assert.match(source, /function decisions\(/);
  assert.match(source, /function currentWork\(/);
  assert.match(source, /function completed\(/);
});

test("team view preserves Elyon Manager company structure specialists and custom employees", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /Geschäftsleitung · Zentrale Steuerung/);
  assert.match(source, /data-org-toggle/);
  assert.match(source, /Team ansehen/);
  assert.match(source, /Eigene Mitarbeiter/);
  assert.match(source, /Mitarbeiter einstellen/);
  assert.match(source, /data-v6-create-custom/);
  assert.match(source, /data-v6-custom-assign/);
  assert.match(source, /data-v6-custom-edit/);
});

test("cockpit remains responsive with two-column laptop layout and four cards only on very wide screens", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /\.aiw-cockpit-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(source, /@media\(min-width:1500px\)/);
  assert.match(source, /\.aiw-cockpit-grid\{grid-template-columns:repeat\(4,minmax\(230px,1fr\)\)/);
  assert.match(source, /@media\(max-width:620px\)/);
});

test("cockpit reuses Team V6 execution paths instead of creating another agent runtime", async () => {
  const source = await readFile(sourceUrl, "utf8");
  for (const hook of ["data-v6-assign", "data-v6-details", "data-v6-create-custom", "data-v6-custom-assign", "data-v6-custom-edit"]) {
    assert.match(source, new RegExp(hook));
  }
  assert.doesNotMatch(source, /\/api\/ai-agent-run/);
  assert.doesNotMatch(source, /publishListing\s*\(/);
  assert.doesNotMatch(source, /fetch\s*\(/);
});

test("cockpit stays event-driven without polling or global mutation observers", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.doesNotMatch(source, /MutationObserver/);
  assert.doesNotMatch(source, /setInterval\(/);
  assert.match(source, /elyon:ai-workforce-team-v6-rendered/);
  assert.match(source, /elyon:ai-workforce-v2-task-updated/);
  assert.match(source, /elyon:tab-changed/);
  assert.match(source, /requestAnimationFrame/);
});

test("production finalizer still ships the cockpit lazily through the existing workforce runtime", async () => {
  const source = await readFile(finalizerUrl, "utf8");
  assert.match(source, /outputOrgchartPath/);
  assert.match(source, /seller-ai-workforce-orgchart-v1\.js/);
  assert.match(source, /teamMarker/);
  assert.match(source, /seller-ai-workforce-company-entry\.js/);
  assert.match(source, /data-elyon-seller-os-design/);
  assert.match(source, /data-elyon-seller-os-polish/);
});

test("workforce lazy assets are cache-busted for the cockpit release", async () => {
  const source = await readFile(runtimeOptimizationUrl, "utf8");
  assert.match(source, /WORKFORCE_ASSET_VERSION = "workforce-cockpit-20260823-1"/);
  assert.match(source, /`const VERSION = "\$\{WORKFORCE_ASSET_VERSION\}";`/);
  assert.doesNotMatch(source, /workforce-routing-20260813-1/);
});