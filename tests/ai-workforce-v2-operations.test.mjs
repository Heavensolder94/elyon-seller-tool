import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

test("operations control parses and is lazy-loaded with workforce v2", async () => {
  const [source, build] = await Promise.all([
    readFile(new URL("../seller-ai-workforce-v2-operations.js", import.meta.url), "utf8"),
    readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8"),
  ]);
  assert.doesNotThrow(() => new vm.Script(source));
  assert.match(source, /runManagerWorkflow\("operations"/);
  assert.match(source, /Betrieb prüfen/);
  assert.match(source, /Betrieb delegieren/);
  assert.match(source, /Produktteam ausführen/);
  assert.match(source, /autoDelegate/);
  assert.match(source, /allowedAgentIds/);
  assert.match(source, /childTasks/);
  assert.match(source, /runOperations/);
  assert.match(build, /seller-ai-workforce-v2-operations\.js/);
  assert.match(build, /injectWorkforceV2IntoRuntimeLoader/);
});
