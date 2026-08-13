import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Workforce V7 keeps a simple company facade over stable APIs", async () => {
  const [core, style, view] = await Promise.all([
    read("seller-ai-workforce-v7-core.js"),
    read("seller-ai-workforce-v7-style.js"),
    read("seller-ai-workforce-v7-view.js"),
  ]);
  for (const code of [core, style, view]) assert.doesNotThrow(() => new Script(code));
  for (const name of ["Product Manager", "Listing Manager", "Operations Manager", "Customer Care"]) assert.match(core, new RegExp(name));
  assert.match(view, /Jarvis/);
  assert.match(view, /Maschinenraum/);
  assert.match(view, /ElyonAIWorkforceTeamV6\?\.openDetails/);
  assert.match(view, /ElyonAIWorkforceTeamV6\?\.openComposer/);
  assert.match(view, /ElyonAIWorkforceRoutingCenter\?\.getRoute/);
  assert.match(view, /jarvisCommandCenterTab/);
  assert.match(style, /aiw-v7-overview-active/);
});

test("Workforce V7 remains lazy, local and event-driven", async () => {
  const joined = (await Promise.all([
    read("seller-ai-workforce-v7-core.js"), read("seller-ai-workforce-v7-style.js"), read("seller-ai-workforce-v7-view.js")
  ])).join("\n");
  assert.doesNotMatch(joined, /MutationObserver|setInterval\s*\(|fetch\s*\(/);
  assert.doesNotMatch(joined, /\/api\/ebay|\/api\/ai-agent-run/);
  assert.match(joined, /requestAnimationFrame/);
  const finalizer = await read("scripts/finalize-workforce-v7.mjs");
  assert.match(finalizer, /seller-ai-workforce-routing-center\.js/);
  assert.match(finalizer, /seller-ai-workforce-v7-core\.js/);
  assert.match(finalizer, /seller-ai-workforce-v7-style\.js/);
  assert.match(finalizer, /seller-ai-workforce-v7-view\.js/);
  assert.match(await read("vercel.json"), /finalize-workforce-v7\.mjs/);
});
