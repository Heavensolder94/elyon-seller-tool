import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Workforce V7 facade remains valid but separate from the dedicated employee page", async () => {
  const files = await Promise.all([read("seller-ai-workforce-v7-core.js"), read("seller-ai-workforce-v7-style.js"), read("seller-ai-workforce-v7-view.js")]);
  files.forEach((code) => assert.doesNotThrow(() => new Script(code)));
  const joined = files.join("\n");
  for (const name of ["Product Manager", "Listing Manager", "Operations Manager", "Customer Care", "Jarvis", "Maschinenraum"]) assert.match(joined, new RegExp(name));
  assert.doesNotMatch(joined, /MutationObserver|setInterval\s*\(|fetch\s*\(/);
  assert.match(joined, /ElyonAIWorkforceTeamV6/);
  assert.match(joined, /ElyonAIWorkforceRoutingCenter/);
});

test("Workforce V7 production finalizer removes the Jarvis overlay from virtual employees", async () => {
  const finalizer = await read("v7.mjs");
  assert.match(finalizer, /seller-ai-workforce-v7-/);
  assert.match(finalizer, /source\.replace/);
  assert.doesNotMatch(finalizer, /const entries =/);
  assert.doesNotMatch(finalizer, /routing-center/);
  assert.doesNotMatch(finalizer, /clean\.replace\(marker/);

  const config = JSON.parse(await read("vercel.json"));
  assert.match(config.buildCommand, /node v7\.mjs$/);
  assert.ok(config.buildCommand.length <= 256);
});