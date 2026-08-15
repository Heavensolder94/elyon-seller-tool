import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

async function source(name) {
  return readFile(new URL(name, root), "utf8");
}

test("Brain Control mount bridge loads directly after File Manager and is copied to public build", async () => {
  const [bootstrap, prepare, bridge] = await Promise.all([
    source("seller-jarvis-bootstrap.js"),
    source("scripts/prepare-agent-registry.mjs"),
    source("seller-jarvis-file-manager-mount-bridge.js"),
  ]);

  assert.ok(
    bootstrap.indexOf('"/seller-jarvis-file-manager.js"') < bootstrap.indexOf('"/seller-jarvis-file-manager-mount-bridge.js"'),
    "mount bridge must load after the File Manager API exists"
  );
  assert.match(prepare, /"seller-jarvis-file-manager-mount-bridge\.js"/);
  assert.doesNotThrow(() => new Function(bridge));
});

test("Brain Control mount bridge restores a removed panel without background polling", async () => {
  const bridge = await source("seller-jarvis-file-manager-mount-bridge.js");

  assert.match(bridge, /window\.ElyonJarvisFileManager\?\.refresh\?\.\(\)/);
  assert.match(bridge, /tabObserver\.observe\(tab, \{ childList: true, subtree: true \}\)/);
  assert.match(bridge, /requestAnimationFrame\(reconcile\)/);
  assert.doesNotMatch(bridge, /setInterval\s*\(/);
  assert.doesNotMatch(bridge, /setTimeout\s*\(/);
});

test("bootstrap cache key changes whenever Brain Control runtime assets change", async () => {
  const bootstrap = await source("seller-jarvis-bootstrap.js");
  assert.match(bootstrap, /phase-e5-v1-openrouter-registry-v\d+-file-manager/);
  assert.match(bootstrap, /seller-jarvis-file-manager-actions\.js/);
  assert.match(bootstrap, /ElyonJarvisFileManagerMountBridge\?\.reconcile/);
});
