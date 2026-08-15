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

test("Brain Control uses a persistent sibling host outside the Command Center render tree", async () => {
  const bridge = await source("seller-jarvis-file-manager-mount-bridge.js");

  assert.match(bridge, /jarvisBrainControlPersistentHost/);
  assert.match(bridge, /function ensurePersistentHost/);
  assert.match(bridge, /tab\.insertAdjacentElement\("afterend", host\)/);
  assert.match(bridge, /function movePanelToPersistentHost/);
  assert.match(bridge, /host\.appendChild\(panel\)/);
  assert.match(bridge, /syncHostVisibility/);
  assert.match(bridge, /menu\?\.value === TAB_ID/);
});

test("Brain Control persistent host still restores a missing panel without background polling", async () => {
  const bridge = await source("seller-jarvis-file-manager-mount-bridge.js");

  assert.match(bridge, /window\.ElyonJarvisFileManager\?\.refresh\?\.\(\)/);
  assert.match(bridge, /window\.ElyonJarvisFileManagerActions\?\.bindRoot\?\.\(\)/);
  assert.match(bridge, /attributeFilter: \["class"\]/);
  assert.match(bridge, /requestAnimationFrame\(reconcile\)/);
  assert.doesNotMatch(bridge, /setInterval\s*\(/);
  assert.doesNotMatch(bridge, /setTimeout\s*\(/);
});

test("V1.2 reconciler removes stale read-only semantics after every Brain Control render", async () => {
  const bridge = await source("seller-jarvis-file-manager-mount-bridge.js");

  assert.match(bridge, /EDIT WORKFLOW V1\.2/);
  assert.match(bridge, /APPROVAL ERFORDERLICH/);
  assert.match(bridge, /Draft → Review → Freigabe → Aktivierung/);
  assert.match(bridge, /Sicherheitsmodus V1\.2/);
  assert.match(bridge, /observeDetailModal/);
});

test("V1.2 edit entry is created by the stable mount and can lazy-load the action module", async () => {
  const bridge = await source("seller-jarvis-file-manager-mount-bridge.js");

  assert.match(bridge, /data-jarvis-file-key/);
  assert.match(bridge, /data-jarvis-file-edit/);
  assert.match(bridge, /button\.textContent = "Bearbeiten"/);
  assert.match(bridge, /seller-jarvis-file-manager-actions\.js/);
  assert.match(bridge, /loadActions/);
  assert.match(bridge, /actions\.openEditor\(cleanKey\)/);
});

test("bootstrap cache key changes whenever Brain Control or unified Jarvis runtime assets change", async () => {
  const bootstrap = await source("seller-jarvis-bootstrap.js");
  assert.match(bootstrap, /phase-e5-v1-openrouter-registry-v\d+-(?:file-manager|unified-jarvis-hub)/);
  assert.match(bootstrap, /seller-jarvis-file-manager-actions\.js/);
  assert.match(bootstrap, /seller-jarvis-hub\.js/);
  assert.match(bootstrap, /ElyonJarvisFileManagerMountBridge\?\.reconcile/);
});
