import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import {
  injectDesktopHtml,
  injectMobileHtml,
  injectRuntimeLoader,
} from "../scripts/prepare-agent-registry.mjs";

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
  assert.match(source, /option\[value=\\"virtualAgentsTab\\"\]/);
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

test("desktop build injects Jarvis globally while registry client stays workforce-lazy", () => {
  const desktop = injectDesktopHtml("<html><body><main></main></body></html>");
  assert.match(desktop, /ELYON_JARVIS_D1/);
  assert.match(desktop, /seller-jarvis-client\.js/);
  assert.match(desktop, /seller-jarvis-ui\.js/);
  assert.doesNotMatch(desktop, /seller-ai-agent-registry-client\.js/);

  const runtime = injectRuntimeLoader(`const GROUPS={virtualAgentsTab:[\n      { src: "/seller-ai-workforce-agent-builder.js" },\n]};`);
  assert.match(runtime, /seller-ai-agent-registry-client\.js/);
  assert.doesNotMatch(runtime, /seller-jarvis-ui\.js/);
});

test("mobile build includes registry plus Jarvis client and D1 UI before agent builder", () => {
  const source = '<html><body><script defer src="/seller-ai-workforce-agent-builder.js?v=123"></script></body></html>';
  const output = injectMobileHtml(source);
  const registry = output.indexOf("seller-ai-agent-registry-client.js");
  const client = output.indexOf("seller-jarvis-client.js");
  const ui = output.indexOf("seller-jarvis-ui.js");
  const builder = output.indexOf("seller-ai-workforce-agent-builder.js");
  assert.ok(registry >= 0 && registry < builder);
  assert.ok(client >= 0 && client < builder);
  assert.ok(ui >= 0 && ui < builder);
});

test("prepare script explicitly mirrors the D1 UI", async () => {
  const source = await readFile(prepareUrl, "utf8");
  assert.match(source, /seller-jarvis-ui\.js/);
  assert.match(source, /injectDesktopHtml/);
  assert.match(source, /globally available Jarvis D1 UI/);
});
