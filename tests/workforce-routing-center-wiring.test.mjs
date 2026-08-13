import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { optimizeVirtualAgentsRuntimeLoader } from "../scripts/virtual-agents-runtime-optimization.mjs";
import { getAgentRoutingPreference, parseRoutingPayload } from "../lib/ai-agent-routing-preferences.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(path.join(root, file), "utf8");

const routingCenter = await read("seller-ai-workforce-routing-center.js");
const publicRoutingCenter = await read("public/seller-ai-workforce-routing-center.js");
const runtimeLoader = await read("seller-runtime-loader.js");
const advancedApi = await read("api/ai-agent-run-advanced.js");
const legacyClient = await read("ai-workforce-client.js");

function cookieRequest(payload) {
  return {
    headers: {
      cookie: `other=value; elyon_ai_routing_v1=${encodeURIComponent(JSON.stringify(payload))}; session=ok`,
    },
  };
}

test("workforce routing center is browser-valid and production asset matches source", () => {
  assert.doesNotThrow(() => new Function(routingCenter));
  assert.equal(publicRoutingCenter, routingCenter);
  assert.match(routingCenter, /KI-Modelle & Autonomie/);
  assert.match(routingCenter, /elyon_jarvis_integration_registry_v1/);
  assert.match(routingCenter, /modelId \|\| model\.runtimeModel \|\| model\.providerModel/);
});

test("routing center is a stable sibling of the orgchart/team renderer", () => {
  assert.match(routingCenter, /team\.insertAdjacentElement\("beforebegin", root\)/);
  assert.match(routingCenter, /root\.id = ROOT_ID/);
  assert.match(routingCenter, /data-routing-agent/);
  assert.match(routingCenter, /Draft Quality Guard/);
  assert.match(routingCenter, /Deterministische Qualitätsprüfung/);
});

test("routing center maps visible employees to executable backend agents", () => {
  const expectedMappings = [
    ["elyon-manager", "elyon-operations-manager"],
    ["elyon-product-data-specialist", "elyon-product-data-checker"],
    ["elyon-compliance-specialist", "elyon-compliance-guard"],
    ["elyon-profit-specialist", "elyon-profit-analyst"],
    ["elyon-listing-specialist", "elyon-listing-pro"],
    ["elyon-order-specialist", "elyon-order-coordinator"],
    ["elyon-customer-support-specialist", "elyon-support-assistant"],
  ];
  for (const [visible, backend] of expectedMappings) {
    assert.ok(routingCenter.includes(`"${visible}": "${backend}"`), `${visible} must map to ${backend}`);
  }
  assert.match(routingCenter, /data\.agents\[agentId\] = \{ \.\.\.visibleCurrent, \.\.\.routingPatch \}/);
  assert.match(routingCenter, /data\.agents\[backend\] = \{ \.\.\.backendCurrent, \.\.\.routingPatch \}/);
});

test("routing center synchronizes server defaults without background polling", () => {
  assert.match(routingCenter, /elyon_ai_routing_v1/);
  assert.match(routingCenter, /document\.cookie = `\$\{COOKIE_NAME\}=\$\{value\}; Path=\/; SameSite=Lax; Max-Age=31536000`/);
  assert.match(routingCenter, /provider: route\.provider/);
  assert.match(routingCenter, /model: route\.model/);
  assert.match(routingCenter, /allowFallback: route\.allowFallback/);
  assert.doesNotMatch(routingCenter, /MutationObserver/);
  assert.doesNotMatch(routingCenter, /setInterval\s*\(/);
});

test("virtual agent runtime lazy-loads routing center and cache-busts the new wiring", () => {
  const output = optimizeVirtualAgentsRuntimeLoader(runtimeLoader);
  assert.match(output, /\/seller-ai-workforce-team-v6\.js/);
  assert.match(output, /\/seller-ai-workforce-routing-center\.js/);
  assert.ok(output.indexOf("/seller-ai-workforce-routing-center.js") > output.indexOf("/seller-ai-workforce-team-v6.js"));
  assert.match(output, /const VERSION = "workforce-routing-20260813-1";/);
});

test("server routing cookie is parsed defensively per backend agent", () => {
  const req = cookieRequest({
    version: 1,
    agents: {
      "elyon-profit-analyst": {
        provider: "openrouter",
        model: "openai/gpt-oss-20b:free",
        allowFallback: false,
      },
      "elyon-listing-pro": {
        provider: "not-a-provider",
        model: "example/model",
        allowFallback: true,
      },
    },
  });

  assert.deepEqual(getAgentRoutingPreference(req, "elyon-profit-analyst"), {
    provider: "openrouter",
    model: "openai/gpt-oss-20b:free",
    allowFallback: false,
  });
  assert.deepEqual(getAgentRoutingPreference(req, "elyon-listing-pro"), {
    model: "example/model",
    allowFallback: true,
  });
  assert.deepEqual(parseRoutingPayload({ headers: { cookie: "elyon_ai_routing_v1=%7Bbroken" } }), {});
});

test("advanced Team V6 runs use saved routing only as a default", () => {
  assert.match(advancedApi, /getAgentRoutingPreference/);
  assert.match(advancedApi, /const preference = getAgentRoutingPreference\(req, agentId\)/);
  assert.match(advancedApi, /source\.provider \|\| body\.provider \|\| preference\.provider \|\| definition\.defaultProvider/);
  assert.match(advancedApi, /source\.model \|\| body\.model \|\| preference\.model/);
  assert.match(advancedApi, /runAgent\(action, body, req\)/);
  assert.match(advancedApi, /openrouter: Boolean/);
});

test("legacy workforce path still sends provider, model and fallback explicitly", () => {
  assert.match(legacyClient, /provider: options\.test \? "local" : agent\.provider/);
  assert.match(legacyClient, /model: options\.test \? "" : agent\.model/);
  assert.match(legacyClient, /allowFallback: agent\.allowFallback/);
});
