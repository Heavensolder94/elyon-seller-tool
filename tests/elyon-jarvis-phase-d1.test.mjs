import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const uiUrl = new URL("../seller-jarvis-ui.js", import.meta.url);
const prepareUrl = new URL("../scripts/prepare-agent-registry.mjs", import.meta.url);

test("Jarvis D1 UI remains valid browser JavaScript", async () => {
  const source = await readFile(uiUrl, "utf8");
  assert.doesNotThrow(() => new vm.Script(source));
  assert.match(source, /window\.ElyonJarvisUI/);
  assert.match(source, /elyonJarvisDock/);
  assert.match(source, /elyonJarvisPanel/);
  assert.match(source, /Frag Jarvis oder gib einen Auftrag/);
});

test("global command bar is plan-first and execution stays explicit", async () => {
  const source = await readFile(uiUrl, "utf8");
  assert.match(source, /runCommand\(command, false\)/);
  assert.match(source, /data-jarvis-plan/);
  assert.match(source, /data-jarvis-execute/);
  assert.match(source, /Plan jetzt ausführen/);
  assert.doesNotMatch(source, /data-jarvis-dock-form[\s\S]{0,1500}runCommand\(command, true\)/);
});

test("Jarvis D1 integrates with existing mainMenu without inventing a second navigation system", async () => {
  const source = await readFile(uiUrl, "utf8");
  assert.match(source, /getElementById\("mainMenu"\)/);
  assert.match(source, /virtualAgentsTab/);
  assert.match(source, /◉ JARVIS/);
  assert.match(source, /stopImmediatePropagation/);
  assert.match(source, /openPanel\(\)/);
});

test("Jarvis D1 uses only the protected Jarvis browser client for commands", async () => {
  const source = await readFile(uiUrl, "utf8");
  assert.match(source, /window\.ElyonJarvis\.plan/);
  assert.match(source, /window\.ElyonJarvis\.execute/);
  assert.match(source, /window\.ElyonJarvis\.status/);
  assert.doesNotMatch(source, /\/api\/ai-agent-run-registry|\/api\/ai-agent-run-custom|\/api\/ebay\/create-draft/);
  assert.doesNotMatch(source, /publish_listing|place_supplier_order|issue_refund|send_customer_message|change_legal_data/);
});

test("Jarvis D1 passes only a bounded current product and recent task context from the browser", async () => {
  const source = await readFile(uiUrl, "utf8");
  assert.match(source, /function contextSnapshot/);
  assert.match(source, /tasks\.slice\(0, 20\)/);
  assert.match(source, /selectedProduct\(\)/);
  assert.doesNotMatch(source, /buyerEmail|shippingAddress|phoneNumber/);
});

test("desktop build contract makes Jarvis global while registry remains workforce-lazy", async () => {
  const source = await readFile(prepareUrl, "utf8");
  assert.match(source, /const registryClientName = "seller-ai-agent-registry-client\.js"/);
  assert.match(source, /const jarvisClientNames = \[/);
  assert.match(source, /seller-jarvis-client\.js/);
  assert.match(source, /seller-jarvis-ui\.js/);
  assert.match(source, /function injectDesktopHtml/);
  assert.match(source, /ELYON_JARVIS_D1/);
  assert.match(source, /function injectRuntimeLoader/);
  assert.match(source, /registryClientName/);
  assert.doesNotMatch(source, /runtimeEntries/);
});

test("mobile build contract includes registry and both Jarvis scripts", async () => {
  const source = await readFile(prepareUrl, "utf8");
  assert.match(source, /function injectMobileHtml/);
  assert.match(source, /const clientNames = \[registryClientName, \.\.\.jarvisClientNames\]/);
  assert.match(source, /clientNames\.map\(\(name\) => `<script defer src=/);
});

test("prepare script explicitly mirrors the D1 UI and generated desktop HTML", async () => {
  const source = await readFile(prepareUrl, "utf8");
  assert.match(source, /copyFile\(path\.join\(appRoot, name\), path\.join\(publicRoot, name\)\)/);
  assert.match(source, /readFile\(desktopPath, "utf8"\)/);
  assert.match(source, /writeFile\(desktopPath, injectDesktopHtml\(desktopSource\), "utf8"\)/);
  assert.match(source, /globally available Jarvis D1 UI/);
});
