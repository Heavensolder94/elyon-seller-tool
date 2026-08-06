import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import {
  AGENT_STRUCTURE,
  EXTERNAL_ACTIONS_LOCKED,
  MAIN_AGENT_ID,
  PRODUCT_WORKFLOW,
  canonicalV2AgentId,
  evaluateDraftQuality,
  listAgentStructure,
} from "../lib/ai-workforce-structure-v2.js";
import { createManagerPlan } from "../lib/ai-workforce-manager-v2.js";

const completeProduct = {
  product: {
    id: "product-1",
    title: "Reise Organizer Set 7-teilig",
    category: "Koffer-Organizer",
    purchasePrice: 8,
    sellingPrice: 24.99,
    images: ["https://example.com/image.jpg"],
    productFacts: { material: "Polyester" },
    manufacturer: { name: "Beispiel GmbH" },
    gpsr: { status: "documented" },
    companyOsApproval: { approved: true, status: "ready_for_seller_tool" },
    listingDraft: {
      title: "Reise Organizer Set 7-teilig für Koffer und Gepäck",
      category: "Koffer-Organizer",
      price: 24.99,
      description: "Praktisches Organizer-Set für Reisen.",
      aspects: { Marke: "Markenlos", Material: "Polyester" },
    },
  },
};

test("workforce v2 has one manager and seven specialists", () => {
  const agents = listAgentStructure();
  assert.equal(agents.length, 8);
  assert.equal(agents.filter((agent) => agent.type === "manager").length, 1);
  assert.equal(agents.filter((agent) => agent.type === "specialist").length, 7);
  assert.equal(AGENT_STRUCTURE[MAIN_AGENT_ID].name, "Elyon Manager");
  assert.deepEqual(PRODUCT_WORKFLOW, [
    "elyon-product-data-specialist",
    "elyon-compliance-specialist",
    "elyon-profit-specialist",
    "elyon-listing-specialist",
    "elyon-draft-quality-guard",
  ]);
});

test("legacy agent ids migrate to the new role structure", () => {
  assert.equal(canonicalV2AgentId("elyon-operations-manager"), "elyon-manager");
  assert.equal(canonicalV2AgentId("elyon-listing-pro"), "elyon-listing-specialist");
  assert.equal(canonicalV2AgentId("elyon-support-assistant"), "elyon-customer-support-specialist");
  assert.equal(canonicalV2AgentId("elyon-product-data-checker"), "elyon-product-data-specialist");
});

test("manager routes incomplete products to Product Data Specialist first", () => {
  const plan = createManagerPlan({ context: { product: {} }, tasks: [] });
  assert.equal(plan.status, "ready");
  assert.equal(plan.nextAgentId, "elyon-product-data-specialist");
  assert.match(plan.summary, /Product Data Specialist/);
  assert.equal(plan.blockers.length, 0);
});

test("manager routes a checked complete product to Compliance Guard", () => {
  const plan = createManagerPlan({
    context: completeProduct,
    tasks: [{
      id: "task-data",
      agentId: "elyon-product-data-specialist",
      status: "completed",
      result: { status: "passed", summary: "Produktdaten vollständig." },
    }],
  });
  assert.equal(plan.nextAgentId, "elyon-compliance-specialist");
  assert.equal(plan.nextAgentName, "Compliance Guard");
});

test("manager stops when product data was checked but critical values remain missing", () => {
  const plan = createManagerPlan({
    context: { product: { title: "Produkt ohne Preis" } },
    tasks: [{
      id: "task-data",
      agentId: "elyon-product-data-specialist",
      status: "completed",
      result: { status: "passed", summary: "Prüfung abgeschlossen." },
    }],
  });
  assert.equal(plan.status, "blocked");
  assert.equal(plan.nextAgentId, "");
  assert.ok(plan.blockers.some((entry) => entry.includes("Einkaufspreis")));
});

test("operations routing selects Order Coordinator or Customer Support Specialist", () => {
  const orderPlan = createManagerPlan({ workflowType: "operations", context: { order: { id: "order-1" } }, tasks: [] });
  assert.equal(orderPlan.nextAgentId, "elyon-order-specialist");
  const supportPlan = createManagerPlan({ workflowType: "operations", context: { returnCase: { id: "return-1" } }, tasks: [] });
  assert.equal(supportPlan.nextAgentId, "elyon-customer-support-specialist");
});

test("Draft Quality Guard blocks critical listing defects", () => {
  const result = evaluateDraftQuality({
    product: {
      title: "X".repeat(90),
      category: "Test",
      purchasePrice: 5,
      sellingPrice: 15,
      images: ["https://example.com/a.jpg"],
      listingDraft: {
        title: "X".repeat(90),
        category: "Test",
        price: 15,
        description: "AliExpress supplier price",
        aspects: { Marke: "Markenlos" },
      },
    },
  });
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.includes("Titel maximal 80 Zeichen"));
  assert.ok(result.blockers.includes("Keine sichtbaren Lieferantenreste"));
});

test("Draft Quality Guard passes a complete draft but still requires manual approval", () => {
  const result = evaluateDraftQuality(completeProduct);
  assert.equal(result.status, "passed");
  assert.match(result.summary, /manuelle Freigabe/);
});

test("all external seller actions remain locked", () => {
  assert.deepEqual(EXTERNAL_ACTIONS_LOCKED, [
    "publish_listing",
    "change_live_price",
    "place_supplier_order",
    "send_customer_message",
    "issue_refund",
    "delete_product",
    "change_legal_data",
  ]);
});

test("browser modules parse and Vercel build ships workforce v2", async () => {
  const [ui, settings, build, api] = await Promise.all([
    readFile(new URL("../seller-ai-workforce-structure-v2.js", import.meta.url), "utf8"),
    readFile(new URL("../seller-ai-workforce-v2-settings.js", import.meta.url), "utf8"),
    readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8"),
    readFile(new URL("../api/ai-workforce-v2.js", import.meta.url), "utf8"),
  ]);
  assert.doesNotThrow(() => new vm.Script(ui));
  assert.doesNotThrow(() => new vm.Script(settings));
  assert.match(ui, /Elyon Agententeam/);
  assert.match(ui, /Nächsten Fachagenten starten/);
  assert.match(ui, /Draft Quality Guard/);
  assert.match(settings, /Elyon Manager/);
  assert.match(build, /seller-ai-workforce-structure-v2\.js/);
  assert.match(build, /seller-ai-workforce-v2-settings\.js/);
  assert.match(api, /requireSellerAccess/);
  assert.match(api, /automaticPublishing: false/);
  assert.match(api, /automaticOrdering: false/);
});
