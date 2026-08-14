import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const adapterSource = await readFile(new URL("../seller-jarvis-ui-response-adapter.js", import.meta.url), "utf8");
const bootstrapSource = await readFile(new URL("../seller-jarvis-bootstrap.js", import.meta.url), "utf8");

test("Brain/direct/memory responses are treated as direct answers", () => {
  assert.match(adapterSource, /\["brain", "direct", "memory_write"\]\.includes\(mode\)/);
  assert.match(adapterSource, /payload\?\.plan\?\.brainHandled === true/);
  assert.match(adapterSource, /payload\?\.plan\?\.answerDirectly === true/);
});

test("direct Brain answers remove the execute-plan button and use Jarvis chat title", () => {
  assert.match(adapterSource, /title\.textContent = payload\?\.mode === "memory_write" \? "Jarvis · Erinnerung" : "Jarvis"/);
  assert.match(adapterSource, /querySelectorAll\("\[data-jarvis-run-last\]"\).*button\.remove\(\)/s);
  assert.match(adapterSource, /body\.textContent = text\(payload\.answer\)/);
});

test("non-executable plans cannot keep an execute button", () => {
  assert.match(adapterSource, /payload\?\.plan\?\.executable === true && !isDirectAnswer\(payload\)/);
  assert.match(adapterSource, /removeInvalidRunButton\(payload\)/);
});

test("Jarvis ONLINE state is refreshed from the real API status", () => {
  assert.match(adapterSource, /window\.ElyonJarvis\?\.status/);
  assert.match(adapterSource, /payload\?\.ok === true && payload\?\.jarvis === "ready"/);
  assert.match(adapterSource, /node\.textContent = "OFFLINE"/);
});

test("bootstrap loads response adapter directly after the UI", () => {
  const uiIndex = bootstrapSource.indexOf('"/seller-jarvis-ui.js"');
  const adapterIndex = bootstrapSource.indexOf('"/seller-jarvis-ui-response-adapter.js"');
  assert.ok(uiIndex >= 0);
  assert.ok(adapterIndex > uiIndex);
  assert.match(bootstrapSource, /ElyonJarvisUIResponseAdapter\?\.refreshSystemStatus\?\.\(\)/);
});
