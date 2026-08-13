import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { Script } from "node:vm";

const source = (path) => fs.readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("V6 autonomy clicks reach model routing before propagation is stopped", async () => {
  const policy = await source("seller-ai-workforce-workspace-v3-policy.js");
  const team = await source("seller-ai-workforce-team-v6.js");

  assert.match(team, /stopImmediatePropagation\(\)/);
  assert.match(team, /data-v6-skill-autonomy/);
  assert.match(policy, /window\.addEventListener\("click"/);
  assert.match(policy, /data-v6-skill-autonomy/);
  assert.match(policy, /queueMicrotask\(\(\) => decorateAutonomy\(agentId\)\)/);
  assert.match(policy, /\}, true\);/);
  assert.doesNotMatch(policy, /new MutationObserver/);
  assert.doesNotMatch(policy, /setInterval/);
  assert.doesNotThrow(() => new Script(policy, { filename: "seller-ai-workforce-workspace-v3-policy.js" }));
});
