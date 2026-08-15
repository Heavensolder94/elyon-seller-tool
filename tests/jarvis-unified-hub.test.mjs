import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const source = (name) => readFile(new URL(name, root), "utf8");

test("unified Jarvis hub is browser-valid and exposes five internal areas", async () => {
  const hub = await source("seller-jarvis-hub.js");
  assert.doesNotThrow(() => new vm.Script(hub));
  for (const label of ["Übersicht", "Brain", "Integrationen", "Modelle", "System"]) assert.match(hub, new RegExp(label));
  assert.match(hub, /window\.ElyonJarvisHub/);
  assert.match(hub, /Elyon Intelligence & Automation Core/);
  assert.doesNotMatch(hub, /setInterval\s*\(/);
});

test("hub keeps one top-level Jarvis route and removes the legacy Integration Center option", async () => {
  const hub = await source("seller-jarvis-hub.js");
  assert.match(hub, /TOP_TAB_ID = "jarvisCommandCenterTab"/);
  assert.match(hub, /INTEGRATION_TAB_ID = "jarvisIntegrationCenterTab"/);
  assert.match(hub, /option\[value=/);
  assert.match(hub, /option\.remove\(\)/);
  assert.match(hub, /jarvis\.textContent = "◉ JARVIS"/);
  assert.match(hub, /reconcileLegacyActivation/);
});

test("hub reuses Brain Control and Integration Center instead of duplicating their business logic", async () => {
  const hub = await source("seller-jarvis-hub.js");
  assert.match(hub, /jarvisBrainControlPersistentHost/);
  assert.match(hub, /window\.ElyonJarvisFileManager\?\.refresh/);
  assert.match(hub, /window\.ElyonJarvisIntegrationCenter/);
  assert.match(hub, /data-jic-tab/);
  assert.match(hub, /APIs & Provider/);
  assert.match(hub, /Routing/);
  assert.match(hub, /Status/);
  assert.match(hub, /Logs/);
  assert.match(hub, /Kosten/);
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

test("hub visibility does not move command center or Brain Control DOM between render trees", async () => {
  const hub = await source("seller-jarvis-hub.js");
  assert.match(hub, /data-jarvis-hub-area=\"overview\"/);
  assert.match(hub, /data-jarvis-hub-area=\"brain\"/);
  assert.match(hub, /display:block!important/);
  assert.doesNotMatch(hub, /appendChild\(.*jarvis-cc/);
  assert.doesNotMatch(hub, /appendChild\(.*jarvisFileManagerPanel/);
});
