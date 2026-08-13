import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const source = (path) => fs.readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("workforce autonomy reads models from Jarvis Integration Center", async () => {
  const policy = await source("seller-ai-workforce-workspace-v3-policy.js");
  assert.match(policy, /elyon_jarvis_integration_registry_v1/);
  assert.match(policy, /data-elyon-agent-provider/);
  assert.match(policy, /data-elyon-agent-model/);
  assert.doesNotMatch(policy, /new MutationObserver/);
});
