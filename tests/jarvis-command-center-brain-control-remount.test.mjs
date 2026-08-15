import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

async function source(name) {
  return readFile(new URL(name, root), "utf8");
}

test("Command Center directly remounts Brain Control after every full render", async () => {
  const commandCenter = await source("seller-jarvis-command-center.js");
  const renderStart = commandCenter.indexOf("function render() {");
  const renderEnd = commandCenter.indexOf("function renderHistory()", renderStart);
  assert.ok(renderStart >= 0 && renderEnd > renderStart, "render function must exist");
  const renderSource = commandCenter.slice(renderStart, renderEnd);

  assert.match(renderSource, /tab\.innerHTML\s*=/);
  assert.match(renderSource, /elyon:jarvis-command-center-rendered/);
  assert.match(renderSource, /ElyonJarvisFileManager\?\.refresh\?\.\(\)/);
  assert.match(renderSource, /ElyonJarvisFileManagerActions\?\.bindRoot\?\.\(\)/);
  assert.match(renderSource, /ElyonJarvisFileManagerMountBridge\?\.reconcile\?\.\(\)/);
  assert.ok(
    renderSource.indexOf("tab.innerHTML") < renderSource.indexOf("ElyonJarvisFileManager?.refresh?.()"),
    "Brain Control remount must happen after the Command Center replaces its DOM"
  );
});

test("Bootstrap cache key advances for self-healing Brain Control and unified Jarvis Hub", async () => {
  const bootstrap = await source("seller-jarvis-bootstrap.js");
  assert.match(bootstrap, /v9-unified-jarvis-hub/);
  assert.match(bootstrap, /ensureBrainControl/);
  assert.match(bootstrap, /seller-jarvis-hub\.js/);
});
