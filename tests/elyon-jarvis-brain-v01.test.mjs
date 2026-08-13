import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  inferJarvisBrainIntent,
  runJarvisBrain,
  shouldJarvisAnswerDirectly,
} from "../lib/elyon-jarvis-brain.js";
import { describeJarvisAgent } from "../lib/elyon-jarvis-agent-registry.js";

const agents = [
  {
    id: "elyon-manager",
    name: "Elyon Manager",
    kind: "core",
    enabled: true,
    role: "Steuert Workflow, Pipeline, Blocker und Prioritäten.",
    capabilities: ["Workflowstatus bewerten"],
  },
  {
    id: "elyon-product-data-specialist",
    name: "Product Data Specialist",
    kind: "core",
    enabled: true,
    role: "Prüft Produktdaten, Varianten, Bilder und Lieferantenangaben.",
    capabilities: [],
  },
  {
    id: "elyon-compliance-specialist",
    name: "Compliance Guard",
    kind: "core",
    enabled: true,
    role: "Prüft GPSR, Hersteller, EU-Verantwortlichen, CE und VeRO.",
    capabilities: [],
  },
  {
    id: "elyon-profit-specialist",
    name: "Profit Analyst",
    kind: "core",
    enabled: true,
    role: "Berechnet Gewinn, Marge, Kosten und Break-even.",
    capabilities: [],
  },
  {
    id: "custom-market-scout",
    name: "Market Scout",
    kind: "custom",
    enabled: true,
    autonomyMode: "assisted",
    role: "Analysiert eBay Markt, Konkurrenz, Wettbewerb und Nachfrage.",
    capabilities: ["Marktanalyse", "Market Research", "eBay Marktcheck"],
  },
];

const fakeGeneralResponder = async ({ reason = "" } = {}) => ({
  answer: reason ? `General fallback: ${reason}` : "General answer",
  provider: "local",
  model: "test",
  fallbackUsed: false,
  usage: null,
});

test("Brain classifies conversational and system requests as direct Jarvis work", () => {
  assert.equal(inferJarvisBrainIntent("Hi Jarvis").id, "conversation");
  assert.equal(inferJarvisBrainIntent("Was kannst du?").id, "system_question");
  assert.equal(inferJarvisBrainIntent("Welche Mitarbeiter hast du?").id, "system_question");
  assert.equal(shouldJarvisAnswerDirectly(inferJarvisBrainIntent("Hi Jarvis")), true);
});

test("Hi Jarvis receives a direct answer and never requires an agent", async () => {
  const result = await runJarvisBrain({ command: "Hi Jarvis", agents });
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.mode, "direct");
  assert.equal(result.payload.plan.answerDirectly, true);
  assert.equal(result.payload.plan.delegations.length, 0);
  assert.match(result.payload.answer, /Jarvis ist da/i);
});

test("Was kannst du is answered directly from Brain and Registry", async () => {
  const result = await runJarvisBrain({ command: "Was kannst du?", agents });
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.mode, "direct");
  assert.match(result.payload.answer, /Orchestrator|Gesprächspartner/i);
  assert.match(result.payload.answer, /aktive Mitarbeiter/i);
});

test("Welche Mitarbeiter hast du explains the existing registry without delegation", async () => {
  const result = await runJarvisBrain({ command: "Welche Mitarbeiter hast du?", agents });
  assert.equal(result.payload.mode, "direct");
  assert.match(result.payload.answer, /Elyon Manager/);
  assert.match(result.payload.answer, /Product Data Specialist/);
  assert.equal(result.payload.plan.delegations.length, 0);
});

test("generic product request without product context is handled as needs_input instead of an agent error", async () => {
  const result = await runJarvisBrain({
    command: "Prüfe ein Produkt.",
    agents,
    input: {},
    generalResponder: fakeGeneralResponder,
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.mode, "direct");
  assert.equal(result.payload.summary.status, "needs_input");
  assert.equal(result.payload.plan.fallbackReason, "missing_product");
});

test("product analysis with product context selects the existing Product Data Specialist", async () => {
  const result = await runJarvisBrain({
    command: "Prüfe das Produkt.",
    agents,
    input: { product: { id: "p-1", title: "Testprodukt", purchasePrice: 10 } },
    execute: false,
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.mode, "plan");
  assert.equal(result.payload.plan.intent.id, "product_analysis");
  assert.equal(result.payload.plan.answerDirectly, false);
  assert.equal(result.payload.plan.delegations[0].agentId, "elyon-product-data-specialist");
});

test("market analysis selects a registered Market Scout when one exists", async () => {
  const result = await runJarvisBrain({
    command: "Analysiere den Markt für dieses Produkt.",
    agents,
    input: { product: { id: "p-2", title: "Marktprodukt" } },
    execute: false,
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.mode, "plan");
  assert.equal(result.payload.plan.intent.id, "market_analysis");
  assert.equal(result.payload.plan.delegations[0].agentId, "custom-market-scout");
});

test("missing specialist falls back to Jarvis General Mode instead of jarvis_no_suitable_agent", async () => {
  const result = await runJarvisBrain({
    command: "Suche einen Lieferanten für eine Tischlampe.",
    agents: agents.filter((agent) => agent.id !== "custom-market-scout"),
    input: { product: { title: "Tischlampe" } },
    generalResponder: fakeGeneralResponder,
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.mode, "direct");
  assert.equal(result.payload.routing.fallbackUsed, true);
  assert.equal(result.payload.plan.fallbackReason, "no_suitable_agent");
  assert.doesNotMatch(JSON.stringify(result.payload), /jarvis_no_suitable_agent/);
});

test("unknown input is a direct General Jarvis request, not an error", async () => {
  const result = await runJarvisBrain({
    command: "Blubb blubb 123",
    agents,
    generalResponder: fakeGeneralResponder,
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.plan.intent.id, "unknown");
  assert.equal(result.payload.mode, "direct");
  assert.equal(result.payload.ok, true);
});

test("locked external actions remain blocked before any agent execution", async () => {
  let executed = false;
  const result = await runJarvisBrain({
    command: "Veröffentliche das Listing live auf eBay",
    agents,
    input: { listingDraft: { title: "Test" } },
    execute: true,
    executePlan: async () => {
      executed = true;
      return [];
    },
  });
  assert.equal(result.statusCode, 403);
  assert.equal(result.payload.plan.status, "blocked");
  assert.equal(executed, false);
});

test("Brain registry adapter exposes structured execution metadata without creating a second registry", () => {
  const agent = describeJarvisAgent({
    id: "elyon-profit-specialist",
    name: "Profit Analyst",
    kind: "core",
    enabled: true,
    role: "Berechnet Gewinn und Marge.",
    capabilities: [],
  });
  assert.deepEqual(agent.requiredInput, ["product"]);
  assert.equal(agent.outputType, "profit_analysis");
  assert.equal(agent.endpoint, "/api/ai-agent-run-registry");
  assert.equal(agent.handler, "registry_runner");
});

test("Jarvis endpoint is Brain-first and no longer emits jarvis_no_suitable_agent", async () => {
  const source = await readFile(new URL("../api/jarvis.js", import.meta.url), "utf8");
  assert.match(source, /runJarvisBrain/);
  assert.match(source, /listJarvisAgentRegistry/);
  assert.match(source, /ai-agent-run-registry\.js/);
  assert.match(source, /generalJarvisFallback:\s*true/);
  assert.doesNotMatch(source, /jarvis_no_suitable_agent/);
  assert.doesNotMatch(source, /status\(422\)/);
});
