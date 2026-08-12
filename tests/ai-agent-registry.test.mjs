import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import {
  deleteCustomAgentRegistryItem,
  getCustomAgentRegistryItem,
  listCoreRegistryAgents,
  normalizeCustomAgent,
  readCustomAgentRegistry,
  replaceCustomAgentRegistry,
  upsertCustomAgentRegistryItem,
} from "../lib/ai-agent-registry-store.js";

const clientUrl = new URL("../seller-ai-agent-registry-client.js", import.meta.url);
const routeUrl = new URL("../api/ai-agent-registry.js", import.meta.url);
const runnerUrl = new URL("../api/ai-agent-run-registry.js", import.meta.url);

function sampleAgent(overrides = {}) {
  return {
    id: "custom-trend-scout-a1234",
    name: "Trend Scout",
    role: "Findet Produkttrends und strukturiert Marktchancen.",
    systemPrompt: "Analysiere ausschließlich belegte Marktdaten und kennzeichne Unsicherheiten.",
    department: "research",
    capabilities: ["product.discovery", "trend.research"],
    provider: "deepseek",
    autonomyMode: "assisted",
    contextAccess: { product: true, market: true },
    ...overrides,
  };
}

function redisHarness() {
  const data = new Map();
  const commands = [];
  const env = {
    UPSTASH_REDIS_REST_URL: "https://redis.example.test",
    UPSTASH_REDIS_REST_TOKEN: "test-token",
  };
  const fetchImpl = async (_url, options = {}) => {
    const command = JSON.parse(options.body || "[]");
    commands.push(command);
    if (command[0] === "GET") {
      return { ok: true, status: 200, json: async () => ({ result: data.get(command[1]) ?? null }) };
    }
    if (command[0] === "SET") {
      data.set(command[1], command[2]);
      return { ok: true, status: 200, json: async () => ({ result: "OK" }) };
    }
    return { ok: false, status: 400, json: async () => ({}) };
  };
  return { data, commands, env, fetchImpl };
}

test("core registry agents remain locked and separate from custom agents", () => {
  const core = listCoreRegistryAgents();
  assert.ok(core.length >= 8);
  assert.ok(core.every((agent) => agent.kind === "core"));
  assert.ok(core.every((agent) => agent.locked === true));
  assert.ok(core.every((agent) => agent.enabled === true));
  assert.ok(core.some((agent) => agent.id === "elyon-manager"));
});

test("custom registry normalizes bounded agent configuration", () => {
  const agent = normalizeCustomAgent(sampleAgent({ temperature: 99, maxTokens: 999999 }));
  assert.equal(agent.kind, "custom");
  assert.equal(agent.locked, false);
  assert.equal(agent.department, "research");
  assert.equal(agent.reportsTo, "elyon-manager");
  assert.equal(agent.temperature, 1.2);
  assert.equal(agent.maxTokens, 12000);
  assert.deepEqual(agent.capabilities, ["product.discovery", "trend.research"]);
  assert.equal(agent.contextAccess.market, true);
  assert.equal(agent.contextAccess.orders, false);
});

test("custom registry rejects invalid ids and missing permanent prompt", () => {
  assert.throws(() => normalizeCustomAgent(sampleAgent({ id: "elyon-manager" })), /Ungültige Custom-Agent-ID|reserviert/);
  assert.throws(() => normalizeCustomAgent(sampleAgent({ systemPrompt: "" })), /Pflichtfelder/);
});

test("registry persists, updates, resolves and deletes agents through Elyon Redis REST", async () => {
  const harness = redisHarness();
  const options = { env: harness.env, fetchImpl: harness.fetchImpl };

  const initial = await replaceCustomAgentRegistry([sampleAgent()], options);
  assert.equal(initial.persisted, true);
  assert.equal(initial.agents.length, 1);

  const read = await readCustomAgentRegistry(options);
  assert.equal(read.length, 1);
  assert.equal(read[0].name, "Trend Scout");

  const updated = await upsertCustomAgentRegistryItem(sampleAgent({ name: "Trend Radar" }), options);
  assert.equal(updated.status, "updated");
  assert.equal(updated.agent.name, "Trend Radar");

  const resolved = await getCustomAgentRegistryItem(sampleAgent().id, options);
  assert.equal(resolved.name, "Trend Radar");

  const deleted = await deleteCustomAgentRegistryItem(sampleAgent().id, options);
  assert.equal(deleted.deleted, true);
  assert.equal((await readCustomAgentRegistry(options)).length, 0);
  assert.ok(harness.commands.some((command) => command[0] === "SET"));
});

test("browser registry bridge remains valid and syncs the existing custom-agent storage key", async () => {
  const source = await readFile(clientUrl, "utf8");
  assert.doesNotThrow(() => new vm.Script(source));
  assert.match(source, /\/api\/ai-agent-registry/);
  assert.match(source, /elyon_ai_custom_agents_v1/);
  assert.match(source, /Storage\.prototype\.setItem/);
  assert.match(source, /elyon:ai-agent-registry-ready/);
  assert.match(source, /method: "PUT"/);
});

test("registry API locks core agents and registry runner resolves custom agents by id", async () => {
  const routeSource = await readFile(routeUrl, "utf8");
  const runnerSource = await readFile(runnerUrl, "utf8");
  assert.match(routeSource, /coreAgentsLocked: true/);
  assert.match(routeSource, /liveExternalActionsGrantedByRegistry: false/);
  assert.match(routeSource, /requireSellerAccess/);
  assert.match(runnerSource, /getCustomAgentRegistryItem/);
  assert.match(runnerSource, /customAgentHandler/);
  assert.match(runnerSource, /enabled === false/);
});
