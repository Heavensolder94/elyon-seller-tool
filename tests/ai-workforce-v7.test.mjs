import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Workforce V7 stays a simple lazy company facade", async () => {
  const files = await Promise.all([read("seller-ai-workforce-v7-core.js"), read("seller-ai-workforce-v7-style.js"), read("seller-ai-workforce-v7-view.js")]);
  files.forEach((code) => assert.doesNotThrow(() => new Script(code)));
  const joined = files.join("\n");
  for (const name of ["Product Manager", "Listing Manager", "Operations Manager", "Customer Care", "Jarvis", "Maschinenraum"]) assert.match(joined, new RegExp(name));
  assert.doesNotMatch(joined, /MutationObserver|setInterval\s*\(|fetch\s*\(/);
  assert.match(joined, /ElyonAIWorkforceTeamV6/);
  assert.match(joined, /ElyonAIWorkforceRoutingCenter/);
});

test("Workforce V7 production finalizer respects Vercel build limits", async () => {
  const finalizer = await read("v7.mjs");
  for (const name of ["routing-center", "v7-core", "v7-style", "v7-view"]) assert.match(finalizer, new RegExp(name));
  const config = JSON.parse(await read("vercel.json"));
  assert.match(config.buildCommand, /node v7\.mjs$/);
  assert.ok(config.buildCommand.length <= 256);
});
