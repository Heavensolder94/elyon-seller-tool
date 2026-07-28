import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  AGENT_IDS,
  applyAdvancedResultPolicy,
  calculateConfiguredProfit,
  normalizeAdvancedSettings,
} from "../lib/ai-workforce-advanced.js";

const clientSource = await readFile(new URL("../seller-ai-workforce-advanced-settings.js", import.meta.url), "utf8");
const endpointSource = await readFile(new URL("../api/ai-agent-run-advanced.js", import.meta.url), "utf8");
const buildSource = await readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8");

test("advanced settings exist for all six visible virtual employees", () => {
  assert.deepEqual([...AGENT_IDS].sort(), [
    "elyon-compliance-guard",
    "elyon-listing-pro",
    "elyon-operations-manager",
    "elyon-order-coordinator",
    "elyon-profit-analyst",
    "elyon-support-assistant",
  ]);
  for (const agentId of AGENT_IDS) {
    assert.match(clientSource, new RegExp(agentId));
  }
});

test("agent settings are normalized with safe specialist defaults", () => {
  const listing = normalizeAdvancedSettings("elyon-listing-pro", {
    common: { confidenceThreshold: 5, maxTokens: 50 },
    specialist: { titleMaxLength: 500, seoStrength: "unknown" },
  });
  assert.equal(listing.common.confidenceThreshold, 1);
  assert.equal(listing.common.maxTokens, 500);
  assert.equal(listing.specialist.titleMaxLength, 120);
  assert.equal(listing.specialist.seoStrength, "balanced");

  const order = normalizeAdvancedSettings("elyon-order-coordinator", {
    specialist: { neverOrderAutomatically: false },
  });
  assert.equal(order.specialist.neverOrderAutomatically, true);

  const support = normalizeAdvancedSettings("elyon-support-assistant", {
    specialist: { requireApproval: false, prohibitBindingPromises: false },
  });
  assert.equal(support.specialist.requireApproval, true);
  assert.equal(support.specialist.prohibitBindingPromises, true);
});

test("configured profit rules support OR and AND decisions", () => {
  const context = {
    purchasePrice: 10,
    shippingCost: 2,
    sellingPrice: 25,
    ebayFeePercent: 12,
    paymentFee: 0.35,
    otherCosts: 0.5,
  };
  const orResult = calculateConfiguredProfit(context, {
    specialist: {
      minimumProfitEur: 5,
      minimumMarginPercent: 20,
      minimumRuleMode: "or",
      returnReservePercent: 0,
      priceBufferPercent: 0,
      advertisingCostPercent: 0,
      scenarioCount: 3,
    },
  });
  assert.equal(orResult.passesMinimum, true);

  const andResult = calculateConfiguredProfit(context, {
    specialist: {
      minimumProfitEur: 12,
      minimumMarginPercent: 45,
      minimumRuleMode: "and",
      returnReservePercent: 0,
      priceBufferPercent: 0,
      advertisingCostPercent: 0,
      scenarioCount: 3,
    },
  });
  assert.equal(andResult.passesMinimum, false);
});

test("risk reserves reduce calculated profit deterministically", () => {
  const context = {
    purchasePrice: 10,
    shippingCost: 2,
    sellingPrice: 25,
    ebayFeePercent: 12,
    paymentFee: 0.35,
    otherCosts: 0.5,
  };
  const withoutReserves = calculateConfiguredProfit(context, {
    specialist: { returnReservePercent: 0, priceBufferPercent: 0, advertisingCostPercent: 0 },
  });
  const withReserves = calculateConfiguredProfit(context, {
    specialist: { returnReservePercent: 10, priceBufferPercent: 5, advertisingCostPercent: 5 },
  });
  assert.equal(withReserves.profit < withoutReserves.profit, true);
  assert.equal(withReserves.totalCosts > withoutReserves.totalCosts, true);
});

test("low-confidence output is forced to manual review", () => {
  const result = applyAdvancedResultPolicy("elyon-listing-pro", {
    summary: "Entwurf",
    status: "passed",
    confidence: 0.4,
    warnings: [],
    blockers: [],
    generatedContent: {},
  }, {
    common: { confidenceThreshold: 0.8 },
  });
  assert.equal(result.status, "manualReviewRequired");
  assert.equal(result.warnings.some((entry) => entry.includes("Konfidenz")), true);
});

test("compliance evidence policy can block missing proof", () => {
  const result = applyAdvancedResultPolicy("elyon-compliance-guard", {
    summary: "Prüfung",
    status: "warning",
    confidence: 0.9,
    missingFacts: ["GPSR-Status"],
    warnings: [],
    blockers: [],
    generatedContent: {},
  }, {
    specialist: { missingEvidenceAction: "block" },
  });
  assert.equal(result.status, "blocked");
});

test("client adds advanced controls and redirects only the workforce endpoint", () => {
  assert.match(clientSource, /Erweiterte Einstellungen/);
  assert.match(clientSource, /data-action =? "advanced-settings"|dataset\.action = "advanced-settings"/);
  assert.match(clientSource, /\/api\/ai-agent-run-advanced/);
  assert.match(clientSource, /parsed\.pathname !== ENDPOINT/);
  assert.match(clientSource, /body\.agent = .*advanced/s);
});

test("advanced API retains seller access and external-action locks", () => {
  assert.match(endpointSource, /requireSellerAccess/);
  assert.match(endpointSource, /isActionAllowed/);
  assert.match(endpointSource, /automaticPublishing: false/);
  assert.match(endpointSource, /automaticOrdering: false/);
  assert.match(endpointSource, /automaticMessaging: false/);
  assert.match(endpointSource, /automaticRefunds: false/);
});

test("production build loads the bridge before the workforce client", () => {
  const advancedIndex = buildSource.indexOf('seller-ai-workforce-advanced-settings.js');
  const clientIndex = buildSource.indexOf('ai-workforce-client.js');
  assert.equal(advancedIndex >= 0, true);
  assert.equal(clientIndex > advancedIndex, true);
  assert.match(buildSource, /\["seller-ai-workforce-advanced-settings\.js", "public\/seller-ai-workforce-advanced-settings\.js"\]/);
});
