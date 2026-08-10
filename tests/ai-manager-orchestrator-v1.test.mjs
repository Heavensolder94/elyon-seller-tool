import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { optimizeWorkspaceV3 } from "../scripts/virtual-agents-runtime-optimization.mjs";

const orchestrator = await readFile(new URL("../seller-ai-manager-orchestrator-v1.js", import.meta.url), "utf8");
const companyView = await readFile(new URL("../seller-ai-company-view-v1.js", import.meta.url), "utf8");
const workforce = await readFile(new URL("../lib/ai-workforce.js", import.meta.url), "utf8");
const api = await readFile(new URL("../api/ai-agent-run.js", import.meta.url), "utf8");
const prepare = await readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8");
const optimization = await readFile(new URL("../scripts/virtual-agents-runtime-optimization.mjs", import.meta.url), "utf8");
const legacyWorkspace = await readFile(new URL("../seller-ai-workforce-workspace-v3.js", import.meta.url), "utf8");

test("Elyon Manager reuses the existing backend agent and agent-run endpoint", () => {
  assert.match(orchestrator, /backendId:\s*"elyon-operations-manager"/);
  assert.match(orchestrator, /fetch\("\/api\/ai-agent-run"/);
  assert.doesNotMatch(orchestrator, /\/api\/ai-agent-run-advanced/);
  assert.doesNotMatch(orchestrator, /OPENAI_API_KEY|DEEPSEEK_API_KEY/);
});

test("product and operations workflows delegate to the existing specialist IDs", () => {
  assert.match(orchestrator, /const PRODUCT_FLOW = \["elyon-product-data-checker", "elyon-compliance-guard", "elyon-profit-analyst", "elyon-listing-pro"\]/);
  assert.match(orchestrator, /const OPERATIONS_FLOW = \["elyon-order-coordinator", "elyon-support-assistant"\]/);
  for (const id of [
    "elyon-product-data-checker",
    "elyon-compliance-guard",
    "elyon-profit-analyst",
    "elyon-listing-pro",
    "elyon-order-coordinator",
    "elyon-support-assistant",
    "elyon-operations-manager",
  ]) {
    assert.match(workforce, new RegExp(`"${id}"`));
  }
});

test("orchestrator has parent-child metadata, dedupe and loop guards", () => {
  assert.match(orchestrator, /workflowId/);
  assert.match(orchestrator, /parentTaskId/);
  assert.match(orchestrator, /workflowDepth/);
  assert.match(orchestrator, /workflowStep/);
  assert.match(orchestrator, /dedupeKey/);
  assert.match(orchestrator, /const MAX_DEPTH = 3/);
  assert.match(orchestrator, /const MAX_AGENT_RUNS = 7/);
  assert.match(orchestrator, /const MAX_RETRIES = 1/);
  assert.match(orchestrator, /const AGENT_TIMEOUT_MS = 35000/);
  assert.match(orchestrator, /const FAILURE_COOLDOWN_MS = 30000/);
  assert.match(orchestrator, /reusableTask\(dedupeKey\)/);
});

test("events are targeted and do not introduce polling or global observers", () => {
  for (const name of [
    "elyon:product-approved",
    "elyon:listing-updated",
    "elyon:new-order",
    "elyon:return-created",
  ]) {
    assert.match(orchestrator, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(orchestrator, /setInterval\s*\(/);
  assert.doesNotMatch(orchestrator, /new\s+MutationObserver\s*\(/);
  assert.match(optimization, /CLIENT_WATCH_AFTER/);
  assert.match(optimization, /function installMountLifecycle\(\)/);
  assert.doesNotMatch(optimization.match(/const CLIENT_WATCH_AFTER = `([\s\S]*?)`;/)?.[1] || "", /MutationObserver/);
});

test("legacy workspace is build-optimized behind manager safety", () => {
  const optimized = optimizeWorkspaceV3(legacyWorkspace);
  assert.match(optimized, /filter\(\(mode\) => mode\.level <= 3\)/);
  assert.match(optimized, /if \(modeById\(migratedMode\)\.level > 3\) migratedMode = "semi"/);
  assert.match(optimized, /externe Agentenaktionen sind durch Elyon Manager V1 gesperrt/);
  assert.doesNotMatch(optimized, /observer\.observe\(document\.documentElement/);
  const install = optimized.match(/  function install\(\) \{([\s\S]*?)\n  \}/)?.[1] || "";
  assert.doesNotMatch(install, /bindTriggers\(\)/);
  assert.doesNotMatch(install, /setTimeout\(/);
});

test("autonomy is capped at level 3 and old external modes are normalized", () => {
  assert.match(orchestrator, /maxAutonomyLevel:\s*3/);
  assert.match(orchestrator, /auto_internal:\s*3/);
  assert.match(orchestrator, /auto_external:\s*3/);
  assert.match(orchestrator, /clamp\([^\n]+,\s*0,\s*3\)/);
  assert.doesNotMatch(orchestrator, /Stufe 4/);
  assert.doesNotMatch(orchestrator, /Stufe 5/);
  assert.match(api, /maxAutonomyLevel:\s*3/);
});

test("irreversible actions remain blocked in the existing workforce backend", () => {
  for (const action of [
    "publish_listing",
    "change_live_price",
    "place_supplier_order",
    "send_customer_message",
    "issue_refund",
    "delete_product",
    "change_legal_data",
  ]) {
    assert.match(workforce, new RegExp(`"${action}"`));
  }
  assert.match(orchestrator, /publishListing:\s*false/);
  assert.match(orchestrator, /updateLivePrice:\s*false/);
  assert.match(orchestrator, /placeSupplierOrder:\s*false/);
  assert.match(orchestrator, /sendCustomerMessage:\s*false/);
  assert.match(orchestrator, /issueRefund:\s*false/);
  assert.match(orchestrator, /deleteProduct:\s*false/);
  assert.match(orchestrator, /changeLegalData:\s*false/);
});

test("profit decisions preserve the Elyon minimum rule", () => {
  assert.match(workforce, /marginPercent[^\n]*>= 20 \|\| \(profit[^\n]*>= 5/);
  assert.match(workforce, /Mindestens 20 % realistische Marge ODER mindestens 5,00 EUR realistischer Gewinn/);
  assert.match(orchestrator, /passesMinimum === false/);
});

test("approval inbox only promotes risk-bearing outcomes", () => {
  assert.match(orchestrator, /agentId === "elyon-listing-pro" \|\| agentId === "elyon-support-assistant"/);
  assert.match(orchestrator, /agentId === "elyon-compliance-guard"/);
  assert.match(orchestrator, /agentId === "elyon-profit-analyst"/);
  assert.match(orchestrator, /Freigabe erforderlich/);
  assert.match(orchestrator, /approvalRequired/);
});

test("company view exposes operational metadata from the same settings and task store", () => {
  assert.match(companyView, /elyon_ai_agents_settings/);
  assert.match(companyView, /elyon_ai_workforce_tasks/);
  assert.match(companyView, /Provider/);
  assert.match(companyView, /Autonomie/);
  assert.match(companyView, /Letzter Lauf/);
  assert.match(companyView, /Tageslimit/);
  assert.match(companyView, /Letztes Ergebnis/);
  assert.match(companyView, /aktiv/);
  assert.match(companyView, /pausiert/);
  assert.match(companyView, /@media\(max-width:620px\)/);
  assert.doesNotMatch(companyView, /fetch\s*\(/);
});

test("build keeps the manager modules lazy inside the virtual-agent runtime", () => {
  assert.match(prepare, /seller-ai-manager-orchestrator-v1\.js/);
  assert.match(prepare, /seller-ai-company-view-v1\.js/);
  assert.match(prepare, /optimizeWorkspaceV3/);
  assert.match(prepare, /filesToMirror/);
  assert.match(prepare, /lazy-loaded Elyon Manager orchestrator V1/);
  assert.doesNotMatch(orchestrator, /window\.addEventListener\("load"/);
});
