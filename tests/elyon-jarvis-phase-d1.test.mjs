import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const uiUrl = new URL("../seller-jarvis-ui.js", import.meta.url);
const bootstrapUrl = new URL("../seller-jarvis-bootstrap.js", import.meta.url);
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

test("Jarvis bootstrap is valid, event-driven, loads client before UI and tolerates isolated module failures", async () => {
  const source = await readFile(bootstrapUrl, "utf8");
  assert.doesNotThrow(() => new vm.Script(source));
  assert.match(source, /seller-jarvis-client\.js/);
  assert.match(source, /seller-jarvis-ui\.js/);
  const filesStart = source.indexOf("const FILES = [");
  const filesEnd = source.indexOf("];", filesStart);
  assert.ok(filesStart >= 0 && filesEnd > filesStart);
  const filesBlock = source.slice(filesStart, filesEnd);
  assert.ok(filesBlock.indexOf("seller-jarvis-client.js") < filesBlock.indexOf("seller-jarvis-ui.js"));
  assert.match(source, /for \(const file of FILES\)/);
  assert.match(source, /try \{[\s\S]*await load\(file\)/);
  assert.match(source, /installBrainControlGuard/);
  assert.match(source, /MutationObserver/);
  assert.doesNotMatch(source, /setInterval\s*\(/);
});

test("desktop build uses exactly one Jarvis D1 startup script", async () => {
  const source = await readFile(prepareUrl, "utf8");
  assert.match(source, /const jarvisBootstrapName = "seller-jarvis-bootstrap\.js"/);
  assert.match(source, /function injectDesktopHtml/);
  assert.match(source, /const content = `<script defer src="\/\$\{jarvisBootstrapName\}\?v=\$\{Date\.now\(\)\}"><\/script>`/);
  assert.doesNotMatch(source, /function injectDesktopHtml[\s\S]{0,400}jarvisClientNames\.map/);
  assert.match(source, /ELYON_JARVIS_D1/);
});

test("registry remains workforce-lazy while D1 bootstrap is global", async () => {
  const source = await readFile(prepareUrl, "utf8");
  assert.match(source, /const registryClientName = "seller-ai-agent-registry-client\.js"/);
  assert.match(source, /function injectRuntimeLoader/);
  assert.match(source, /registryClientName/);
  assert.doesNotMatch(source, /runtimeEntries/);
});

test("mobile build uses registry plus one Jarvis bootstrap tag", async () => {
  const source = await readFile(prepareUrl, "utf8");
  assert.match(source, /const injectedNames = \[registryClientName, jarvisBootstrapName\]/);
  assert.match(source, /injectedNames\.map/);
});

test("prepare script mirrors bootstrap, client and UI assets", async () => {
  const source = await readFile(prepareUrl, "utf8");
  assert.match(source, /const clientNames = \[registryClientName, jarvisBootstrapName, \.\.\.jarvisClientNames\]/);
  assert.match(source, /copyFile\(path\.join\(appRoot, name\), path\.join\(publicRoot, name\)\)/);
  assert.match(source, /one-script Jarvis D1\/D2\/D3\/E1\/E4\/E5 bootstrap/);
});