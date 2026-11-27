import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import registryHandler from "../api/ai-agent-run-registry.js";
import { listAgentStructure } from "../lib/ai-workforce-structure-v2.js";
import { ROUTING_COOKIE_NAME } from "../lib/ai-agent-routing-preferences.js";
import {
  buildStrictCoreRequest,
  filterCustomAgentInput,
  hasInlineAgentDefinition,
  isCustomAgentId,
  publicExecutionDescriptor,
  resolveCoreExecution,
  resolveRegistryAction,
} from "../lib/ai-agent-universal-runner.js";

const routeUrl = new URL("../api/ai-agent-run-registry.js", import.meta.url);

test("universal runner resolves all core execution families", () => {
  const manager = resolveCoreExecution("elyon-manager");
  assert.equal(manager?.runner, "workforce_v2");
  assert.equal(manager?.defaultAction, "run_manager");

  const draftQa = resolveCoreExecution("elyon-draft-quality-guard");
  assert.equal(draftQa?.runner, "workforce_v2");
  assert.equal(draftQa?.defaultAction, "run_draft_quality");

  const listing = resolveCoreExecution("elyon-listing-specialist");
  assert.equal(listing?.runner, "advanced");
  assert.equal(listing?.backendAgentId, "elyon-listing-pro");
  assert.equal(listing?.defaultAction, "analyze_listing");

  const legacyBackendId = resolveCoreExecution("elyon-profit-analyst");
  assert.equal(legacyBackendId?.visibleId, "elyon-profit-specialist");
  assert.equal(legacyBackendId?.backendAgentId, "elyon-profit-analyst");
});

test("generic run_agent resolves to the safe default action", () => {
  const listing = resolveCoreExecution("elyon-listing-specialist");
  const action = resolveRegistryAction("run_agent", listing);
  assert.deepEqual(action, { ok: true, action: "analyze_listing" });

  const manager = resolveCoreExecution("elyon-manager");
  assert.deepEqual(resolveRegistryAction("", manager), { ok: true, action: "run_manager" });
});

test("external live actions remain technically blocked", () => {
  const target = resolveCoreExecution("elyon-listing-specialist");
  for (const action of [
    "publish_listing",
    "change_live_price",
    "place_supplier_order",
    "send_customer_message",
    "issue_refund",
    "delete_product",
    "change_legal_data",
  ]) {
    assert.equal(resolveRegistryAction(action, target).ok, false);
    assert.equal(resolveRegistryAction(action, target).error, "external_action_locked");
  }
});

test("custom agents accept only registry-safe execution actions", () => {
  assert.equal(isCustomAgentId("custom-trend-scout-abc12"), true);
  assert.equal(isCustomAgentId("elyon-listing-pro"), false);
  assert.deepEqual(resolveRegistryAction("", { kind: "custom" }), { ok: true, action: "run_agent" });
  assert.equal(resolveRegistryAction("analyze_order", { kind: "custom" }).ok, false);
});

test("custom input is filtered by registry context permissions", () => {
  const agent = {
    contextAccess: {
      product: true,
      listing: false,
      market: true,
      orders: true,
      returns: false,
      tasks: true,
    },
  };
  const input = {
    product: { id: "ELY-1", title: "Test" },
    listingDraft: { title: "Secret draft" },
    market: { demand: "high" },
    orders: [{
      id: "O-1",
      status: "PAID",
      buyerName: "Must not pass",
      buyerEmail: "private@example.test",
      shippingAddress: { street: "Private" },
      total: 39.9,
      items: [{ sku: "ELY-1", title: "Test", quantity: 1, price: 39.9 }],
    }],
    returns: [{ id: "R-1", reason: "No" }],
    tasks: [{ id: "T-1", agentId: "x", status: "completed", result: { summary: "Done" }, secret: "drop" }],
  };

  const filtered = filterCustomAgentInput(agent, input);
  assert.equal(filtered.product.id, "ELY-1");
  assert.equal(filtered.market.demand, "high");
  assert.equal("listingDraft" in filtered, false);
  assert.equal("returns" in filtered, false);
  assert.equal(filtered.orders[0].id, "O-1");
  assert.equal("buyerName" in filtered.orders[0], false);
  assert.equal("buyerEmail" in filtered.orders[0], false);
  assert.equal("shippingAddress" in filtered.orders[0], false);
  assert.deepEqual(filtered.tasks[0], {
    id: "T-1",
    agentId: "x",
    title: "",
    status: "completed",
    summary: "Done",
    updatedAt: "",
  });
});

test("strict core request ignores provider/model overrides from callers", () => {
  const target = resolveCoreExecution("elyon-listing-specialist");
  const request = buildStrictCoreRequest({
    provider: "attacker-provider",
    model: "override-model",
    configuration: { temperature: 2 },
    title: "Listing prüfen",
    taskPrompt: "Prüfe das Produkt.",
    input: { product: { id: "ELY-2" } },
  }, target, "analyze_listing");

  assert.equal(request.agentId, "elyon-listing-pro");
  assert.equal(request.action, "analyze_listing");
  assert.equal("provider" in request, false);
  assert.equal("model" in request, false);
  assert.equal("configuration" in request, false);
});

test("inline agent definitions are rejected by policy", () => {
  assert.equal(hasInlineAgentDefinition({ agentId: "custom-test-abc", taskPrompt: "ok" }), false);
  assert.equal(hasInlineAgentDefinition({ agentId: "custom-test-abc", customAgent: { systemPrompt: "override" } }), true);
  assert.equal(hasInlineAgentDefinition({ agentId: "elyon-manager", provider: "deepseek" }), false);
  assert.equal(hasInlineAgentDefinition({ agentId: "elyon-manager", configuration: { provider: "openai" } }), true);
});

test("public execution descriptors expose routing but no custom system prompts", () => {
  const descriptor = publicExecutionDescriptor({
    id: "custom-researcher-abc12",
    kind: "custom",
    enabled: true,
    systemPrompt: "Must stay private to execution",
    capabilities: ["product.discovery"],
    allowedTools: ["market.read"],
    contextAccess: { product: true, market: true },
  });
  assert.equal(descriptor.runner, "registry_custom");
  assert.equal(descriptor.defaultAction, "run_agent");
  assert.equal("systemPrompt" in descriptor, false);
  assert.deepEqual(descriptor.capabilities, ["product.discovery"]);
});

test("registry API delegates only after loading server-side definitions", async () => {
  const source = await readFile(routeUrl, "utf8");
  assert.match(source, /getCustomAgentRegistryItem/);
  assert.match(source, /inline_agent_definition_forbidden/);
  assert.match(source, /registryIsSourceOfTruth: true/);
  assert.match(source, /filterCustomAgentInput/);
  assert.match(source, /buildStrictCoreRequest/);
  assert.match(source, /advancedAgentHandler/);
  assert.match(source, /workforceV2Handler/);
  assert.match(source, /customAgentHandler/);
  assert.doesNotMatch(source, /body\.customAgent\s*\|\|\s*body\.agent/);
});


test("all eight registered core agents execute through the real authenticated registry in local mode without network access", async (t) => {
  const originalToken = process.env.ELYON_SELLER_ACCESS_TOKEN;
  const originalFetch = globalThis.fetch;
  const token = "workforce-v11-test-only-token";
  process.env.ELYON_SELLER_ACCESS_TOKEN = token;
  let networkAttempts = 0;
  globalThis.fetch = async () => { networkAttempts++; throw Error("Unexpected network access in local agent acceptance"); };
  try {
    const agents = listAgentStructure();
    assert.equal(agents.length, 8);
    const preferences = Object.fromEntries(agents.map(agent => {
      const target = resolveCoreExecution(agent.id);
      return [target.backendAgentId, { provider: "local", allowFallback: false }];
    }));
    const cookie = ROUTING_COOKIE_NAME + "=" + encodeURIComponent(JSON.stringify({ agents: preferences }));
    const product = {
      id: "SYNTHETIC-V11-1", title: "Testprodukt", category: "Testkategorie",
      purchasePrice: 10, sellingPrice: 25, shippingCost: 2, ebayFeePercent: 12,
      paymentFee: 0.35, otherCosts: 0.5, expectedReturnRatePercent: 0, returnCost: 0,
      images: ["https://example.invalid/product.png"], productFacts: { material: "Papier" },
      manufacturer: { name: "Testhersteller" }, gpsr: { status: "documented" },
      companyOsApproval: { approved: true }, ebayCategory: { id: "123", name: "Test" },
      ebayAspects: { Material: "Papier" },
    };
    const input = {
      product,
      listingDraft: { title: "Testprodukt", description: "Synthetischer Test", aspects: { Material: "Papier" }, price: 25 },
      order: { orderId: "TEST-ORDER", shippingDeadline: "2026-12-01", trackingNumber: "TEST-TRACK" },
      returnCase: { returnId: "TEST-RETURN", orderId: "TEST-ORDER", reason: "Testfall" },
    };
    async function invoke(agentId, action, context = input) {
      let statusCode = 200;
      let payload;
      const req = { method: "POST", query: {}, headers: { "x-elyon-seller-token": token, cookie, host: "localhost" }, body: { agentId, action, input: context } };
      const res = { status(code) { statusCode = code; return this; }, json(value) { payload = value; return this; }, setHeader() { return this; }, end() { return this; } };
      await registryHandler(req, res);
      return { statusCode, payload };
    }
    for (const agent of agents) {
      await t.test(agent.id, async () => {
        const target = resolveCoreExecution(agent.id);
        const { statusCode, payload } = await invoke(agent.id, "run_agent");
        assert.equal(statusCode, 200, JSON.stringify(payload));
        assert.equal(payload.ok, true);
        assert.equal(payload.provider, "local");
        assert.equal(payload.task.agentId, target.runner === "advanced" ? target.backendAgentId : target.visibleId);
        assert.ok(payload.result.summary);
        assert.ok(["passed", "warning", "blocked", "manualReviewRequired"].includes(payload.result.status));
        assert.equal(payload.safety.manualReviewRequired, true);
        for (const key of ["automaticPublishing", "automaticOrdering", "automaticMessaging", "automaticRefunds"]) assert.equal(payload.safety[key], false);
        const denied = await invoke(agent.id, "publish_listing");
        assert.equal(denied.statusCode, 403);
        assert.equal(denied.payload.error, "external_action_locked");
      });
    }
    const sparse = await invoke("elyon-product-data-specialist", "run_agent", { product: { id: "SYNTHETIC-SPARSE", title: "Testprodukt" } });
    assert.equal(sparse.statusCode, 200);
    assert.equal(sparse.payload.result.status, "manualReviewRequired");
    assert.ok(sparse.payload.result.missingFacts.some(value => value.includes("Einkaufspreis")));
    assert.ok(sparse.payload.result.missingFacts.some(value => value.includes("Company-OS-Freigabe")));
    assert.equal(networkAttempts, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.ELYON_SELLER_ACCESS_TOKEN;
    else process.env.ELYON_SELLER_ACCESS_TOKEN = originalToken;
  }
});
