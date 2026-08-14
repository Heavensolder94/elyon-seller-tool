import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bootstrap = await readFile(path.join(root, "seller-jarvis-bootstrap.js"), "utf8");
const windowControls = await readFile(path.join(root, "seller-jarvis-ui-window-controls.js"), "utf8");

test("Jarvis loads the busy-safe window controls directly after the main UI", () => {
  const uiIndex = bootstrap.indexOf('"/seller-jarvis-ui.js"');
  const controlsIndex = bootstrap.indexOf('"/seller-jarvis-ui-window-controls.js"');
  const adapterIndex = bootstrap.indexOf('"/seller-jarvis-ui-response-adapter.js"');

  assert.ok(uiIndex >= 0, "main Jarvis UI must be loaded");
  assert.ok(controlsIndex > uiIndex, "window controls must load after the main Jarvis UI");
  assert.ok(adapterIndex > controlsIndex, "window controls must initialize before response adapters");
});

test("Jarvis minimize and reopen controls stay usable while task buttons are disabled", () => {
  assert.match(windowControls, /\[data-jarvis-minimize\],\[data-jarvis-open\]/);
  assert.match(windowControls, /if \(button\.disabled\) button\.disabled = false/);
  assert.match(windowControls, /attributeFilter: \["disabled"\]/);
  assert.match(windowControls, /MutationObserver/);
});
