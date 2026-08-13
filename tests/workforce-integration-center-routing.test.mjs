import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { Script } from "node:vm";

const source = (path) => fs.readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("workforce autonomy reads active models from Jarvis Integration Center", async () => {
  const policy = await source("seller-ai-workforce-workspace-v3-policy.js");
  assert.match(policy, /elyon_jarvis_integration_registry_v1/);
  assert.match(policy, /ElyonJarvisIntegrationCenter/);
  assert.match(policy, /data-elyon-agent-provider/);
  assert.match(policy, /data-elyon-agent-model/);
  assert.match(policy, /data-elyon-model-routing/);
  assert.match(policy, /openrouter\/free/);
  assert.match(policy, /nvidia\/nemotron-3-ultra-550b-a55b:free/);
  assert.match(policy, /openai\/gpt-oss-20b:free/);
  assert.match(policy, /cohere\/north-mini-code:free/);
  assert.match(policy, /google\/gemma-4-31b-it:free/);
  assert.doesNotMatch(policy, /new MutationObserver/);
  assert.doesNotMatch(policy, /setInterval/);
  assert.doesNotThrow(() => new Script(policy, { filename: "seller-ai-workforce-workspace-v3-policy.js" }));
});

test("workforce routing keeps V3 aliases and executable backend agents in sync", async () => {
  const policy = await source("seller-ai-workforce-workspace-v3-policy.js");
  assert.match(policy, /BACKEND_AGENT_IDS/);
  assert.match(policy, /settings\.agents\[agentId\]/);
  assert.match(policy, /settings\.agents\[backendId\]/);
  assert.match(policy, /resourceProvider: provider/);
  assert.match(policy, /integrationProvider: provider === "openrouter"/);
  assert.match(policy, /allowFallback: fallbackEnabled/);
});

test("AI provider router supports OpenRouter chat models and free-router fallback", async () => {
  const router = await source("lib/ai-provider-router.js");
  assert.match(router, /openrouter\.ai\/api\/v1\/chat\/completions/);
  assert.match(router, /OPENROUTER_API_KEY/);
  assert.match(router, /function isOpenRouterModel/);
  assert.match(router, /function callOpenRouter/);
  assert.match(router, /if \(provider === "openrouter"\) return callOpenRouter\(request\)/);
  assert.match(router, /isOpenRouterModel\(requestedModel\) \? "openrouter"/);
  assert.match(router, /provider === "openrouter" && request\.model !== "openrouter\/free"/);
  assert.match(router, /model: "openrouter\/free"/);
});
