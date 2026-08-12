import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const handoffUrl = new URL("../seller-jarvis-companion-handoff.js", import.meta.url);
const bootstrapUrl = new URL("../seller-jarvis-bootstrap.js", import.meta.url);
const prepareUrl = new URL("../scripts/prepare-agent-registry.mjs", import.meta.url);

test("D3 companion handoff is valid browser JavaScript", async () => {
  const source = await readFile(handoffUrl, "utf8");
  assert.doesNotThrow(() => new vm.Script(source));
  assert.match(source, /window\.ElyonJarvisCompanionHandoff/);
});

test("D3 accepts only the explicit Quick Access source and plan handoff", async () => {
  const source = await readFile(handoffUrl, "utf8");
  assert.match(source, /ALLOWED_SOURCE = "quick-access"/);
  assert.match(source, /ALLOWED_MODE = "plan"/);
  assert.match(source, /source !== ALLOWED_SOURCE/);
  assert.match(source, /mode !== ALLOWED_MODE/);
  assert.match(source, /MAX_COMMAND_LENGTH = 2000/);
});

test("D3 only prefills the command center and never plans or executes automatically", async () => {
  const source = await readFile(handoffUrl, "utf8");
  assert.match(source, /ElyonJarvisCommandCenter\?\.open/);
  assert.match(source, /data-jarvis-cc-input/);
  assert.match(source, /nothingExecuted: true/);
  assert.match(source, /automaticPlanning: false/);
  assert.match(source, /automaticExecution: false/);
  assert.doesNotMatch(source, /ElyonJarvis\.plan|ElyonJarvis\.execute|runCommand\(|fetch\(/);
});

test("D3 removes handoff parameters after import so refresh cannot repeat it", async () => {
  const source = await readFile(handoffUrl, "utf8");
  assert.match(source, /searchParams\.delete\(SOURCE_PARAM\)/);
  assert.match(source, /searchParams\.delete\(MODE_PARAM\)/);
  assert.match(source, /searchParams\.delete\(COMMAND_PARAM\)/);
  assert.match(source, /history\.replaceState/);
});

test("D3 remains inside the single global Jarvis bootstrap", async () => {
  const bootstrap = await readFile(bootstrapUrl, "utf8");
  const prepare = await readFile(prepareUrl, "utf8");
  assert.match(bootstrap, /seller-jarvis-companion-handoff\.js/);
  assert.match(bootstrap, /phase-e5-v1/);
  assert.match(prepare, /seller-jarvis-companion-handoff\.js/);
  assert.match(prepare, /one-script Jarvis D1\/D2\/D3\/E1\/E4\/E5 bootstrap/);
  assert.match(prepare, /const content = `<script defer src="\/\$\{jarvisBootstrapName\}/);
});
