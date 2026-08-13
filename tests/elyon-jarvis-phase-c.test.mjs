import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import {
  blockedCommand,
  createJarvisPlan,
  inferJarvisIntent,
  summarizeJarvisRuns,
} from "../lib/elyon-jarvis-core.js";

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
    id: "elyon-listing-specialist",
    name: "Listing Specialist",
    kind: "core",
    enabled: true,
    role: "Erstellt Listing, Titel, SEO, Beschreibung und Artikelmerkmale.",
    capabilities: [],
  },
  {
    id: "elyon-draft-quality-guard",
    name: "Draft Quality Guard",
    kind: "core",
    enabled: true,
    role: "Prüft eBay-Entwurf, Qualität und Widersprüche vor Freigabe.",
    capabilities: [],
  },
  {
    id: "custom-trend-scout-abc",
    name: "Trend Scout",
    kind: "custom",
    enabled: true,
    autonomyMode: "assisted",
    department: "research",
    role: "Findet neue Produkttrends und Marktchancen.",
    capabilities: ["Product Discovery", "Trend Research", "Produktideen"],
  },
  {
    id: "custom-disabled-scout",
    name: "Disabled Scout",
    kind: "custom",
    enabled: false,
    autonomyMode: "assisted",
    role: "Findet Produkttrends.",
    capabilities: ["Product Discovery"],
  },
];

test("Jarvis infers a complete product review as a three-specialist workflow", () => {
  const intent = inferJarvisIntent("Prüfe alle neuen Produkte komplett");
  assert.equal(intent.id, "full_product_review");
  assert.deepEqual(intent.capabilities, ["product_data", "compliance", "profit"]);

  const plan = createJarvisPlan({ command: "Prüfe alle neuen Produkte komplett", agents, maxAgents: 3 });
  assert.equal(plan.status, "ready");
  assert.deepEqual(plan.delegations.map((item) => item.agentId), [
    "elyon-product-data-specialist",
    "elyon-compliance-specialist",
    "elyon-profit-specialist",
  ]);
  assert.ok(plan.delegations.every((item) => item.action === "run_agent"));
});

test("Jarvis can discover a newly registered custom specialist by capability", () => {
  const plan = createJarvisPlan({ command: "Finde neue Trend Produktideen und Marktchancen", agents, maxAgents: 2 });
  assert.equal(plan.status, "ready");
  assert.equal(plan.intent.id, "product_discovery");
  assert.equal(plan.delegations[0].agentId, "custom-trend-scout-abc");
  assert.equal(plan.delegations[0].kind, "custom");
});

test("disabled custom agents cannot be selected by Jarvis", () => {
  const plan = createJarvisPlan({
    command: "Nutze diesen Mitarbeiter",
    agents,
    explicitAgentId: "custom-disabled-scout",
  });
  assert.equal(plan.executable, false);
  assert.equal(plan.status, "needs_attention");
});

test("explicit active agent selection remains possible without hard-coding it into Jarvis", () => {
  const plan = createJarvisPlan({
    command: "Analysiere diese Produktidee",
    agents,
    explicitAgentId: "custom-trend-scout-abc",
  });
  assert.equal(plan.executable, true);
  assert.equal(plan.delegations.length, 1);
  assert.equal(plan.delegations[0].agentId, "custom-trend-scout-abc");
  assert.match(plan.delegations[0].reason, /ausdrücklich ausgewählter Mitarbeiter/i);
});

test("Jarvis blocks live and external business actions before delegation", () => {
  const blocked = blockedCommand("Veröffentliche das Listing live auf eBay");
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.action, "publish_listing");

  const plan = createJarvisPlan({ command: "Veröffentliche das Listing live auf eBay", agents });
  assert.equal(plan.status, "blocked");
  assert.equal(plan.executable, false);
  assert.equal(plan.delegations.length, 0);
});

test("Jarvis deterministic summary surfaces blockers and partial failures", () => {
  const plan = createJarvisPlan({ command: "Prüfe alle neuen Produkte komplett", agents, maxAgents: 3 });
  const summary = summarizeJarvisRuns(plan, [
    { ok: true, payload: { result: { status: "passed", blockers: [], warnings: [] } } },
    { ok: true, payload: { result: { status: "blocked", blockers: ["GPSR fehlt"], warnings: [] } } },
  ]);
  assert.equal(summary.status, "blocked");
  assert.equal(summary.successful, 2);
  assert.deepEqual(summary.blockers, ["GPSR fehlt"]);
});

test("Jarvis endpoint delegates through Brain and the protected registry runner", async () => {
  const source = await readFile(new URL("../api/jarvis.js", import.meta.url), "utf8");
  assert.match(source, /ai-agent-run-registry\.js/);
  assert.match(source, /runJarvisBrain/);
  assert.match(source, /action:\s*"run_agent"/);
  assert.match(source, /body\.execute === true/);
  assert.match(source, /generalJarvisFallback:\s*true/);
  assert.match(source, /externalActionsLocked:\s*true/);
  assert.match(source, /livePublishingAllowed:\s*false/);
  assert.doesNotMatch(source, /publish_listing|place_supplier_order|issue_refund|send_customer_message/);
  assert.doesNotMatch(source, /jarvis_no_suitable_agent/);
});

test("Jarvis browser client is valid JavaScript and exposes plan/execute/delegate", async () => {
  const source = await readFile(new URL("../seller-jarvis-client.js", import.meta.url), "utf8");
  assert.doesNotThrow(() => new vm.Script(source));
  assert.match(source, /window\.ElyonJarvis/);
  assert.match(source, /async function plan/);
  assert.match(source, /async function execute/);
  assert.match(source, /async function delegate/);
  assert.match(source, /\/api\/jarvis/);
});

test("Jarvis client is injected with the registry client into desktop and mobile build preparation", async () => {
  const source = await readFile(new URL("../scripts/prepare-agent-registry.mjs", import.meta.url), "utf8");
  assert.match(source, /seller-ai-agent-registry-client\.js/);
  assert.match(source, /seller-jarvis-client\.js/);
  assert.match(source, /injectRuntimeLoader/);
  assert.match(source, /injectMobileHtml/);
});
