import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const centerUrl = new URL("../seller-jarvis-command-center.js", import.meta.url);
const bootstrapUrl = new URL("../seller-jarvis-bootstrap.js", import.meta.url);
const prepareUrl = new URL("../scripts/prepare-agent-registry.mjs", import.meta.url);

test("Jarvis D2 command center is valid browser JavaScript", async () => {
  const source = await readFile(centerUrl, "utf8");
  assert.doesNotThrow(() => new vm.Script(source));
  assert.match(source, /window\.ElyonJarvisCommandCenter/);
  assert.match(source, /jarvisCommandCenterTab/);
  assert.match(source, /JARVIS Command Center/);
});

test("D2 creates a real Jarvis workspace without replacing Virtual Employees", async () => {
  const source = await readFile(centerUrl, "utf8");
  assert.match(source, /const TAB_ID = "jarvisCommandCenterTab"/);
  assert.match(source, /virtualAgentsTab/);
  assert.match(source, /Mitarbeiter verwalten/);
  assert.match(source, /activateTab\("virtualAgentsTab"\)/);
  assert.doesNotMatch(source, /remove\(.*virtualAgentsTab|virtualAgentsTab.*\.remove\(/);
});

test("D2 replaces only the old panel-only menu shortcut with a real Jarvis tab", async () => {
  const source = await readFile(centerUrl, "utf8");
  assert.match(source, /LEGACY_MENU_VALUE = "__elyon_jarvis_panel__"/);
  assert.match(source, /option\.value = TAB_ID/);
  assert.match(source, /option\.textContent = "◉ JARVIS"/);
  assert.match(source, /LEGACY_MENU_VALUE.*remove/s);
});

test("D2 dashboard uses real registry and workforce task data with no demo feed", async () => {
  const source = await readFile(centerUrl, "utf8");
  assert.match(source, /window\.ElyonJarvis\.status\(\)/);
  assert.match(source, /elyon_ai_workforce_tasks/);
  assert.match(source, /Es werden keine Demo-Ereignisse erzeugt/);
  assert.match(source, /aus echten Task-Statuswerten/);
  assert.doesNotMatch(source, /Math\.random\(|setInterval\(|MutationObserver/);
});

test("D2 exposes the agreed command-center sections", async () => {
  const source = await readFile(centerUrl, "utf8");
  for (const label of ["Meine Aufmerksamkeit", "Live-Aktivität", "Agenten", "Jobs", "Pipeline", "Jarvis Chat & Ergebnisse"]) {
    assert.match(source, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(source, /Aufträge heute/);
});

test("D2 keeps plan-first keyboard behavior and explicit execution", async () => {
  const source = await readFile(centerUrl, "utf8");
  assert.match(source, /data-jarvis-cc-plan/);
  assert.match(source, /data-jarvis-cc-execute/);
  assert.match(source, /runCommand\(false\)/);
  assert.match(source, /runCommand\(true\)/);
  assert.match(source, /event\.target\?\.matches\?\.\("\[data-jarvis-cc-form\]"\)/);
});

test("D2 sends commands only through the protected Jarvis client", async () => {
  const source = await readFile(centerUrl, "utf8");
  assert.match(source, /window\.ElyonJarvis\.plan/);
  assert.match(source, /window\.ElyonJarvis\.execute/);
  assert.doesNotMatch(source, /\/api\/ai-agent-run-registry|\/api\/ai-agent-run-custom|\/api\/ebay\/create-draft/);
  assert.doesNotMatch(source, /publish_listing|place_supplier_order|issue_refund|send_customer_message|change_legal_data/);
});

test("D2 reduces task context before Jarvis delegation", async () => {
  const source = await readFile(centerUrl, "utf8");
  assert.match(source, /function boundedTask/);
  assert.match(source, /rawTasks\(\)\.slice\(0, 20\)\.map\(boundedTask\)/);
  assert.match(source, /blockers:.*slice\(0, 12\)/s);
  assert.match(source, /warnings:.*slice\(0, 12\)/s);
  assert.doesNotMatch(source, /buyerEmail|shippingAddress|phoneNumber/);
});

test("D2 stays inside the existing one-script Jarvis bootstrap budget", async () => {
  const bootstrap = await readFile(bootstrapUrl, "utf8");
  const prepare = await readFile(prepareUrl, "utf8");
  assert.match(bootstrap, /seller-jarvis-command-center\.js/);
  assert.match(bootstrap, /phase-d2-v1/);
  assert.match(prepare, /seller-jarvis-command-center\.js/);
  assert.match(prepare, /one-script Jarvis D1\/D2 bootstrap/);
  assert.match(prepare, /const content = `<script defer src="\/\$\{jarvisBootstrapName\}/);
});
