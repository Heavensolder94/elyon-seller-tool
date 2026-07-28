import test from "node:test";
import assert from "node:assert/strict";
import {
  buildContextPacket,
  buildLocalFallbackResult,
  calculateProfitAnalysis,
  canRunAgent,
  canonicalAgentId,
  createWorkforceTask,
  isActionAllowed,
  migrateAgentSettings,
  parseStructuredAgentResponse,
  sanitizeAgentResult,
} from "../lib/ai-workforce.js";

test("legacy agent ids migrate to canonical workforce ids", () => {
  const migrated = migrateAgentSettings({
    agents: {
      "soul-seo": { name: "Alt SEO", model: "deepseek", autonomyLevel: 2, dailyLimit: 0.5 },
    },
  });
  assert.equal(canonicalAgentId("soul-seo"), "elyon-listing-pro");
  assert.equal(migrated.agents["elyon-listing-pro"].name, "Alt SEO");
  assert.equal(migrated.agents["elyon-listing-pro"].provider, "deepseek");
  assert.equal(migrated.agents["elyon-listing-pro"].autonomyLevel, 2);
  assert.equal(migrated.agents["soul-seo"].name, "Alt SEO");
});

test("external and mismatched actions stay blocked", () => {
  assert.equal(isActionAllowed("analyze_listing", "elyon-listing-pro"), true);
  assert.equal(isActionAllowed("publish_listing", "elyon-listing-pro"), false);
  assert.equal(isActionAllowed("analyze_order", "elyon-listing-pro"), false);
});

test("task schema normalizes ids, status and structured result", () => {
  const task = createWorkforceTask({
    agentId: "soul-finance",
    title: "Marge prüfen",
    status: "approval_required",
    priority: "high",
    inputSnapshot: { sellingPrice: 29.99 },
    result: { summary: "Prüfung fertig", status: "warning", confidence: 0.8 },
  });
  assert.equal(task.agentId, "elyon-profit-analyst");
  assert.equal(task.status, "approval_required");
  assert.equal(task.priority, "high");
  assert.equal(task.result.summary, "Prüfung fertig");
  assert.equal(task.approvedAt, null);
});

test("profit calculation enforces Elyon minimum rule", () => {
  const strong = calculateProfitAnalysis({
    purchasePrice: 10,
    shippingCost: 2,
    sellingPrice: 25,
    ebayFeePercent: 12,
    paymentFee: 0.35,
    otherCosts: 0.5,
  });
  assert.equal(strong.passesMinimum, true);
  assert.equal(strong.profit, 9.15);
  assert.equal(strong.marginPercent, 36.6);
  assert.equal(strong.assumptions.some((entry) => entry.includes("Retourenrisiko")), true);

  const weak = calculateProfitAnalysis({
    purchasePrice: 10,
    shippingCost: 3,
    sellingPrice: 15,
    ebayFeePercent: 12,
    paymentFee: 0.35,
    otherCosts: 0.5,
  });
  assert.equal(weak.passesMinimum, false);
  assert.equal(weak.profit < 5, true);
  assert.equal(weak.marginPercent < 20, true);
});

test("context packet keeps required seller fields and drops arbitrary PII", () => {
  const context = buildContextPacket("elyon-order-coordinator", {
    order: {
      orderId: "O-1",
      buyerCountry: "DE",
      buyerEmail: "private@example.com",
      buyerPhone: "+491234",
      items: [{ sku: "SKU-1", title: "Produkt", quantity: 1 }],
    },
  });
  assert.equal(context.orderId, "O-1");
  assert.equal(context.buyerCountry, "DE");
  assert.equal("buyerEmail" in context, false);
  assert.equal("buyerPhone" in context, false);
});

test("unbelegte generated facts are removed", () => {
  const result = sanitizeAgentResult({
    summary: "Text erstellt",
    status: "passed",
    confidence: 0.9,
    generatedContent: {
      title: "Neuer Titel",
      ean: "1234567890123",
      manufacturer: "Erfundene GmbH",
    },
  }, {
    agentId: "elyon-listing-pro",
    context: { title: "Alt", productFacts: {} },
  });
  assert.equal(result.generatedContent.title, "Neuer Titel");
  assert.equal("ean" in result.generatedContent, false);
  assert.equal("manufacturer" in result.generatedContent, false);
  assert.equal(result.missingFacts.includes("ean"), true);
  assert.equal(result.warnings.some((entry) => entry.includes("Unbelegte Angabe")), true);
});

test("compliance cannot pass without approval and evidence", () => {
  const result = sanitizeAgentResult({
    summary: "Alles gut",
    status: "passed",
    confidence: 0.9,
  }, {
    agentId: "elyon-compliance-guard",
    context: { title: "Produkt", companyOsApproval: {} },
  });
  assert.equal(result.status, "blocked");
  assert.equal(result.blockers.some((entry) => entry.includes("Company-OS")), true);
  assert.equal(result.missingFacts.includes("Herstellerangaben"), true);
  assert.equal(result.missingFacts.includes("GPSR-Status"), true);
});

test("structured JSON parser accepts fenced output and validates status", () => {
  const result = parseStructuredAgentResponse('```json\n{"summary":"OK","status":"passed","confidence":1}\n```', {
    agentId: "elyon-listing-pro",
    context: { title: "Produkt" },
  });
  assert.equal(result.summary, "OK");
  assert.equal(result.status, "passed");
  assert.equal(result.confidence, 1);
});

test("paused, disabled and daily-limited agents do not run", () => {
  const paused = canRunAgent({ agents: { "elyon-listing-pro": { paused: true } } }, "elyon-listing-pro");
  assert.deepEqual(paused, { ok: false, code: "AGENT_PAUSED" });

  const limited = canRunAgent({ agents: { "elyon-listing-pro": { dailyLimit: 0.25, todayUsage: 0.25 } } }, "elyon-listing-pro");
  assert.deepEqual(limited, { ok: false, code: "DAILY_LIMIT_REACHED" });
});

test("local profit fallback returns deterministic structured analysis", () => {
  const result = buildLocalFallbackResult("elyon-profit-analyst", {
    purchasePrice: 10,
    shippingCost: 2,
    sellingPrice: 25,
    ebayFeePercent: 12,
    paymentFee: 0.35,
    otherCosts: 0.5,
  });
  assert.equal(result.status, "passed");
  assert.equal(result.generatedContent.calculation.passesMinimum, true);
  assert.equal(Array.isArray(result.generatedContent.calculation.scenarios), true);
});
