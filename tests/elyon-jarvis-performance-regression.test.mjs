import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const bootstrapUrl = new URL("../seller-jarvis-bootstrap.js", import.meta.url);
const workforceIntegrationUrl = new URL("../seller-ai-workforce-builder-integration.js", import.meta.url);

test("Jarvis startup keeps feature workspaces out of the eager core", async () => {
  const source = await readFile(bootstrapUrl, "utf8");
  assert.doesNotThrow(() => new vm.Script(source));
  const core = source.match(/const CORE_FILES = \[([\s\S]*?)\];/)?.[1] || "";
  assert.match(core, /seller-jarvis-client\.js/);
  assert.match(core, /seller-jarvis-ui\.js/);
  assert.doesNotMatch(core, /command-center|integration-center|workforce-builder|e1-cloud|e4-control|e5-pipeline/);
  assert.match(source, /mode: "lazy-workspaces"/);
});

test("Workforce integration does not observe the entire application DOM", async () => {
  const source = await readFile(workforceIntegrationUrl, "utf8");
  assert.doesNotThrow(() => new vm.Script(source));
  assert.doesNotMatch(source, /new MutationObserver|observer\.observe\(document\.documentElement/);
  assert.match(source, /function scheduleEnhance/);
  assert.match(source, /\[0, 30, 100\]/);
});