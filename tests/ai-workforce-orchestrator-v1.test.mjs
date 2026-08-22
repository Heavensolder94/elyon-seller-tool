import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  MAX_PARALLEL_DELEGATIONS,
  PRODUCT_WAVES,
  runManagerOrchestration,
  taskOutcome,
} from "../lib/ai-workforce-orchestrator-v1.js";

function completedTask(agentId, meta = {}, resultStatus = "passed", generatedContent = {}) {
  const now = new Date().toISOString();
  return {
    id: `task-${agentId}-${Math.random().toString(36).slice(2, 7)}`,
    agentId,
    status: resultStatus === "blocked" ? "blocked" : "draft_ready",
    provider: "local",
    model: "test",
    result: {
      status: resultStatus,
      summary: `${agentId} ${resultStatus}`,
      findings: [],
      recommendations: [],
      missingFacts: [],
      blockers: resultStatus === "blocked" ? ["kritischer Blocker"] : [],
      warnings: resultStatus === "warning" ? ["manuelle Prüfung nötig"] : [],
      generatedContent,
    },
    errors: [],
    createdAt: now,
    updatedAt: now,
    parentTaskId: meta.parentTaskId,
    workflowId: meta.workflowId,
  };
}

const allSpecialists = [
  "elyon-product-data-specialist",
  "elyon-compliance-specialist",
  "elyon-profit-specialist",
  "elyon-listing-specialist",
  "elyon-draft-quality-guard",
  "elyon-order-specialist",
  "elyon-customer-support-specialist",
];

test("product manager runs four waves and parallelizes compliance plus profit", async () => {
  const calls = [];
  let active = 0;
  let maxActive = 0;
  const result = await runManagerOrchestration({
    workflowType: "product",
    context: { product: { id: "p-1", title: "Test" } },
    workflowId: "wf-1",
    parentTaskId: "parent-1",
    allowedAgentIds: allSpecialists,
    executeAgent: async (meta) => {
      calls.push({ agentId: meta.agentId, stage: meta.stage });
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return completedTask(meta.agentId, meta);
    },
  });

  assert.equal(MAX_PARALLEL_DELEGATIONS, 3);
  assert.deepEqual(PRODUCT_WAVES.map((wave) => [...wave]), [
    ["elyon-product-data-specialist"],
    ["elyon-compliance-specialist", "elyon-profit-specialist"],
    ["elyon-listing-specialist"],
    ["elyon-draft-quality-guard"],
  ]);
  assert.equal(result.status, "manual_approval_required");
  assert.equal(result.childTasks.length, 5);
  assert.equal(result.parentTaskId, "parent-1");
  assert.equal(result.workflowId, "wf-1");
  assert.equal(maxActive, 2);
  assert.deepEqual(calls.map((entry) => entry.stage), [1, 2, 2, 3, 4]);
  assert.ok(result.childTasks.every((task) => taskOutcome(task) === "completed"));
});

test("manager propagates sanitized specialist results and generated listing to later waves", async () => {
  let listingSawAnalysis = false;
  let qualitySawGeneratedDraft = false;
  const result = await runManagerOrchestration({
    workflowType: "product",
    context: {
      product: {
        id: "p-propagation",
        title: "Alter Produkttitel",
        listingDraft: { title: "Alter Produkttitel", description: "Alt" },
      },
    },
    allowedAgentIds: allSpecialists,
    executeAgent: async (meta) => {
      if (meta.agentId === "elyon-listing-specialist") {
        listingSawAnalysis = Boolean(
          meta.context.agentResults?.["elyon-compliance-specialist"] &&
          meta.context.agentResults?.["elyon-profit-specialist"]
        );
        return completedTask(meta.agentId, meta, "passed", {
          title: "Neuer Elyon Listing Titel",
          description: "Neue kontrollierte Beschreibung",
          aspects: { Material: "Polyester" },
          price: 29.99,
          ignoredUnsafeShape: { arbitrary: true },
        });
      }
      if (meta.agentId === "elyon-draft-quality-guard") {
        qualitySawGeneratedDraft =
          meta.context.listingDraft?.title === "Neuer Elyon Listing Titel" &&
          meta.context.product?.listingDraft?.description === "Neue kontrollierte Beschreibung" &&
          meta.context.agentResults?.["elyon-listing-specialist"]?.status === "passed";
      }
      return completedTask(meta.agentId, meta);
    },
  });

  assert.equal(result.status, "manual_approval_required");
  assert.equal(listingSawAnalysis, true);
  assert.equal(qualitySawGeneratedDraft, true);
  assert.ok(result.contextUpdates.includes("listingDraft"));
  assert.ok(result.contextUpdates.includes("elyon-listing-specialist:agentResult"));
  assert.equal("finalContext" in result, false);
});

test("manager stops before listing when compliance requests manual review", async () => {
  const calls = [];
  const result = await runManagerOrchestration({
    workflowType: "product",
    context: { product: { id: "p-2" } },
    allowedAgentIds: allSpecialists,
    executeAgent: async (meta) => {
      calls.push(meta.agentId);
      return completedTask(meta.agentId, meta, meta.agentId === "elyon-compliance-specialist" ? "warning" : "passed");
    },
  });

  assert.equal(result.status, "manual_review_required");
  assert.ok(result.warnings.some((entry) => entry.includes("manuelle Prüfung")));
  assert.deepEqual(calls, [
    "elyon-product-data-specialist",
    "elyon-compliance-specialist",
    "elyon-profit-specialist",
  ]);
  assert.ok(!calls.includes("elyon-listing-specialist"));
  assert.ok(!calls.includes("elyon-draft-quality-guard"));
});

test("manager does not bypass a paused or budget-blocked specialist", async () => {
  const calls = [];
  const allowed = allSpecialists.filter((agentId) => agentId !== "elyon-profit-specialist");
  const result = await runManagerOrchestration({
    workflowType: "product",
    context: { product: { id: "p-3" } },
    allowedAgentIds: allowed,
    executeAgent: async (meta) => {
      calls.push(meta.agentId);
      return completedTask(meta.agentId, meta);
    },
  });

  assert.equal(result.status, "manual_review_required");
  assert.match(result.stopReason, /Profit Analyst/);
  assert.deepEqual(calls, ["elyon-product-data-specialist"]);
  assert.ok(result.events.some((event) => event.type === "delegation_denied"));
});

test("operations orchestration only delegates to specialists with matching live context", async () => {
  const orderCalls = [];
  const orderResult = await runManagerOrchestration({
    workflowType: "operations",
    context: { orders: [{ id: "o-1" }], returns: [] },
    allowedAgentIds: allSpecialists,
    executeAgent: async (meta) => {
      orderCalls.push(meta.agentId);
      return completedTask(meta.agentId, meta);
    },
  });
  assert.equal(orderResult.status, "manual_approval_required");
  assert.deepEqual(orderCalls, ["elyon-order-specialist"]);

  const noContext = await runManagerOrchestration({
    workflowType: "operations",
    context: { orders: [], returns: [] },
    allowedAgentIds: allSpecialists,
    executeAgent: async () => {
      throw new Error("should not run");
    },
  });
  assert.equal(noContext.status, "manual_review_required");
  assert.match(noContext.stopReason, /Kein passender/);
});

test("manager API and browser control expose orchestration without external actions", async () => {
  const [api, ui] = await Promise.all([
    readFile(new URL("../api/ai-workforce-v2.js", import.meta.url), "utf8"),
    readFile(new URL("../seller-ai-workforce-v2-operations.js", import.meta.url), "utf8"),
  ]);
  assert.match(api, /runManagerOrchestration/);
  assert.match(api, /allowedAgentIds/);
  assert.match(api, /childTasks/);
  assert.match(api, /advancedAgentHandler/);
  assert.match(api, /readinessFindings/);
  assert.match(api, /automaticPublishing: false/);
  assert.match(api, /automaticOrdering: false/);
  assert.match(ui, /autoDelegate/);
  assert.match(ui, /Autonomiestufe 3/);
  assert.match(ui, /Produktteam ausführen/);
  assert.match(ui, /Betrieb delegieren/);
  assert.match(ui, /parentTaskId|workflowId/);
});
