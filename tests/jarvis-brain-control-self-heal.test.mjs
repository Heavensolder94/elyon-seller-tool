import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

async function source(name) {
  return readFile(new URL(name, root), "utf8");
}

test("Jarvis bootstrap can recover Brain Control independently from normal module loading", async () => {
  const bootstrap = await source("seller-jarvis-bootstrap.js");

  assert.match(bootstrap, /BRAIN_CONTROL_MODULES/);
  assert.match(bootstrap, /seller-jarvis-file-manager\.js/);
  assert.match(bootstrap, /seller-jarvis-file-manager-actions\.js/);
  assert.match(bootstrap, /seller-jarvis-file-manager-mount-bridge\.js/);
  assert.match(bootstrap, /async function ensureBrainControl\(\)/);
  assert.match(bootstrap, /await load\(path, \{ force: true \}\)/);
  assert.match(bootstrap, /recovery=\$\{Date\.now\(\)\}/);
  assert.match(bootstrap, /ElyonJarvisFileManager\?\.mount\?\.\(\)/);
  assert.match(bootstrap, /ElyonJarvisFileManager\?\.refresh\?\.\(true\)/);
});

test("Brain Control guard watches command center re-renders without polling", async () => {
  const bootstrap = await source("seller-jarvis-bootstrap.js");

  assert.match(bootstrap, /function installBrainControlGuard\(\)/);
  assert.match(bootstrap, /new MutationObserver\(schedule\)/);
  assert.match(bootstrap, /elyon:jarvis-command-center-rendered/);
  assert.match(bootstrap, /ElyonJarvisBrainControlGuard/);
  assert.doesNotMatch(bootstrap, /setInterval\s*\(/);
  assert.doesNotMatch(bootstrap, /setTimeout\s*\(/);
});

test("one failed Jarvis module no longer aborts the remaining bootstrap sequence", async () => {
  const bootstrap = await source("seller-jarvis-bootstrap.js");

  assert.match(bootstrap, /for \(const file of FILES\)/);
  assert.match(bootstrap, /Modul konnte nicht geladen werden/);
  assert.match(bootstrap, /await ensureBrainControl\(\)/);
  assert.match(bootstrap, /v9-unified-jarvis-hub/);
  assert.match(bootstrap, /seller-jarvis-hub\.js/);
});
