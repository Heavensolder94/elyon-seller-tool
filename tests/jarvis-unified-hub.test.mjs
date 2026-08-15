import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const source = (name) => readFile(new URL(name, root), "utf8");

test("simplified Jarvis hub is browser-valid and exposes only three primary areas", async () => {
  const hub = await source("seller-jarvis-hub.js");
  assert.doesNotThrow(() => new vm.Script(hub));
  const areasStart = hub.indexOf("const AREAS");
  const areasEnd = hub.indexOf("const SYSTEM_VIEWS", areasStart);
  const areas = hub.slice(areasStart, areasEnd);
  assert.match(areas, /id: "home", label: "JARVIS"/);
  assert.match(areas, /id: "brain", label: "Gehirn"/);
  assert.match(areas, /id: "system", label: "System"/);
  assert.doesNotMatch(areas, /id: "integrations"/);
  assert.doesNotMatch(areas, /id: "models"/);
  assert.match(hub, /window\.ElyonJarvisHub/);
  assert.match(hub, /SIMPLE CONTROL/);
  assert.doesNotMatch(hub, /setInterval\s*\(/);
});

test("hub keeps one top-level Jarvis route and removes the legacy Integration Center option", async () => {
  const hub = await source("seller-jarvis-hub.js");
  assert.match(hub, /TOP_TAB_ID = "jarvisCommandCenterTab"/);
  assert.match(hub, /INTEGRATION_TAB_ID = "jarvisIntegrationCenterTab"/);
  assert.match(hub, /option\[value=/);
  assert.match(hub, /option\.remove\(\)/);
  assert.match(hub, /jarvis\.textContent = "◉ JARVIS"/);
  assert.match(hub, /legacySelected/);
});

test("normal mode hides developer-heavy information and keeps technical details opt-in", async () => {
  const hub = await source("seller-jarvis-hub.js");
  assert.match(hub, /Technische Details/);
  assert.match(hub, /data-jarvis-toggle-advanced/);
  assert.match(hub, /data-jarvis-hub-advanced="0"/);
  assert.match(hub, /jarvis-cc-metrics\{display:none!important\}/);
  assert.match(hub, /jarvis-fm-health-grid/);
  assert.match(hub, /jarvis-fm-file-title code/);
  assert.match(hub, /jic-metrics/);
  assert.match(hub, /jic-route/);
});

test("Brain normal mode uses human labels while retaining existing edit and detail workflows", async () => {
  const hub = await source("seller-jarvis-hub.js");
  for (const label of ["Identität", "Elyon-Wissen", "Ziele", "Regeln", "Fähigkeiten", "Abläufe"]) assert.match(hub, new RegExp(label));
  assert.match(hub, /window\.ElyonJarvisFileManager\?\.refresh/);
  assert.match(hub, /window\.ElyonJarvisFileManagerActions\?\.bindRoot/);
  assert.match(hub, /data-jarvis-file-edit/);
  assert.match(hub, /button\.textContent = "Details"/);
});

test("System keeps APIs, models, routing, costs and logs behind technical details", async () => {
  const hub = await source("seller-jarvis-hub.js");
  for (const label of ["Status", "Integrationen", "KI-Modelle", "Routing", "Kosten", "Logs"]) assert.match(hub, new RegExp(label));
  assert.match(hub, /window\.ElyonJarvisIntegrationCenter/);
  assert.match(hub, /data-jic-tab/);
  assert.match(hub, /state\.advanced\.system/);
  assert.match(hub, /state\.systemView = "overview"/);
});

test("home normal mode keeps command, attention and last activity while hiding metrics, agents and pipeline", async () => {
  const hub = await source("seller-jarvis-hub.js");
  assert.match(hub, /Was soll ich tun\?/);
  assert.match(hub, /Braucht deine Aufmerksamkeit/);
  assert.match(hub, /Letzte Aktionen/);
  assert.match(hub, /jarvis-cc-grid>.jarvis-cc-card:nth-child\(2\)/);
  assert.match(hub, /jarvis-cc-grid>.jarvis-cc-card:nth-child\(4\)/);
  assert.match(hub, /jarvis-cc>.jarvis-cc-card\{display:none!important\}/);
});

test("bootstrap loads the hub after Integration Center and production preparation copies it", async () => {
  const [bootstrap, prepare] = await Promise.all([
    source("seller-jarvis-bootstrap.js"),
    source("scripts/prepare-agent-registry.mjs"),
  ]);
  const integrationIndex = bootstrap.indexOf('"/seller-jarvis-integration-center.js"');
  const hubIndex = bootstrap.indexOf('"/seller-jarvis-hub.js"');
  assert.ok(integrationIndex >= 0 && hubIndex > integrationIndex);
  assert.match(bootstrap, /ElyonJarvisHub\?\.mount/);
  assert.match(prepare, /"seller-jarvis-hub\.js"/);
  assert.match(prepare, /normalizeJarvisMenu/);
  assert.doesNotMatch(prepare, /<option value=\"\$\{value\}\">11\. ⌘ Jarvis Integration Center<\/option>/);
});

test("hub visibility reuses existing render trees instead of moving command center or Brain Control DOM", async () => {
  const hub = await source("seller-jarvis-hub.js");
  assert.match(hub, /data-jarvis-hub-area=\"home\"/);
  assert.match(hub, /data-jarvis-hub-area=\"brain\"/);
  assert.match(hub, /data-jarvis-hub-area=\"system\"/);
  assert.match(hub, /display:block!important/);
  assert.doesNotMatch(hub, /appendChild\(.*jarvis-cc/);
  assert.doesNotMatch(hub, /appendChild\(.*jarvisFileManagerPanel/);
});
