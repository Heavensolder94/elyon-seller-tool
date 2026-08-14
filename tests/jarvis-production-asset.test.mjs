import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("Jarvis response adapter is copied into the production public output", async () => {
  const prepare = await readFile(new URL("scripts/prepare-agent-registry.mjs", root), "utf8");
  const bootstrap = await readFile(new URL("seller-jarvis-bootstrap.js", root), "utf8");
  await readFile(new URL("seller-jarvis-ui-response-adapter.js", root), "utf8");

  assert.match(prepare, /"seller-jarvis-ui-response-adapter\.js"/);
  assert.match(bootstrap, /\/seller-jarvis-ui-response-adapter\.js/);
});

test("Jarvis window controls are copied before bootstrap loads the Integration Center", async () => {
  const prepare = await readFile(new URL("scripts/prepare-agent-registry.mjs", root), "utf8");
  const bootstrap = await readFile(new URL("seller-jarvis-bootstrap.js", root), "utf8");
  await readFile(new URL("seller-jarvis-ui-window-controls.js", root), "utf8");

  assert.match(prepare, /"seller-jarvis-ui-window-controls\.js"/);
  assert.match(bootstrap, /\/seller-jarvis-ui-window-controls\.js/);
  assert.match(bootstrap, /\/seller-jarvis-integration-center\.js/);
  assert.ok(
    bootstrap.indexOf('"/seller-jarvis-ui-window-controls.js"') < bootstrap.indexOf('"/seller-jarvis-integration-center.js"'),
    "window controls must be available before the Integration Center is loaded"
  );
});
