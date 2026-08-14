import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  autoDelegationDecision,
  isBrainFirstCommand,
  isExplicitPlanOnly,
} from "../lib/jarvis-autonomy-policy.js";
import { rankOperationalHistory } from "../lib/jarvis-context-builder.js";
import { brainSystemPrompt } from "../lib/jarvis-brain.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

function plan(overrides = {}) {
  return {
    status: "ready",
    executable: true,
    requiresUserApproval: false,
    intent: { id: "profit", capabilities: ["profit"], confidence: 0.95 },
    delegations: [
      {
        agentId: "elyon-profit-specialist",
        agentName: "Profit Specialist",
        kind: "core",
        capability: "profit",
        action: "run_agent",
      },
    ],
    ...overrides,
  };
}

test("V2-A.1 auto-delegates bounded safe core analysis", () => {
  const decision = autoDelegationDecision({ command: "Prüfe Marge und Gewinn für dieses Produkt.", plan: plan(), body: { autoDelegate: true } });
  assert.equal(decision.allowed, true);
  assert.deepEqual(decision.agentIds, ["elyon-profit-specialist"]);
});

test("V2-A.1 allows compliance analysis but never external mutation commands", () => {
  const compliance = autoDelegationDecision({
    command: "Prüfe die GPSR- und Herstellerangaben dieses Produkts.",
    body: { autoDelegate: true },
    plan: plan({
      intent: { id: "compliance", capabilities: ["compliance"], confidence: 0.95 },
      delegations: [{ agentId: "elyon-compliance-specialist", agentName: "Compliance", kind: "core", capability: "compliance", action: "run_agent" }],
    }),
  });
  assert.equal(compliance.allowed, true);

  const blocked = autoDelegationDecision({
    command: "Veröffentliche das Listing live auf eBay.",
    body: { autoDelegate: true },
    plan: plan(),
  });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, "external_action_blocked");
});

test("V2-A.1 keeps custom agents and explicit plan-only requests manual", () => {
  const custom = autoDelegationDecision({
    command: "Prüfe den Gewinn.",
    body: { autoDelegate: true },
    plan: plan({ delegations: [{ agentId: "custom-profit", agentName: "Custom", kind: "custom", capability: "profit", action: "run_agent" }] }),
  });
  assert.equal(custom.allowed, false);
  assert.equal(custom.reason, "custom_agent_requires_manual_start");

  assert.equal(isExplicitPlanOnly("Nur planen: Prüfe den Gewinn."), true);
  const manual = autoDelegationDecision({ command: "Nur planen: Prüfe den Gewinn.", body: { autoDelegate: true }, plan: plan() });
  assert.equal(manual.allowed, false);
  assert.equal(manual.reason, "explicit_plan_only");
});

test("working-memory questions stay Brain-first instead of spawning specialists", () => {
  assert.equal(isBrainFirstCommand("Was ist mein aktuelles Ziel?"), true);
  assert.equal(isBrainFirstCommand("Was blockiert mich aktuell?"), true);
  assert.equal(isBrainFirstCommand("Was würdest du jetzt empfehlen?"), true);
});

test("current-state questions suppress background operational history", () => {
  const history = [
    { id: "old-1", title: "3D-Wandaufkleber prüfen", status: "blocked", result: { summary: "GPSR fehlt" }, updatedAt: new Date().toISOString() },
  ];
  assert.deepEqual(
    rankOperationalHistory(history, "Was blockiert mich aktuell?", { currentGoal: "10 gute Produkte für eBay finden" }, 4),
    []
  );
});

test("Brain prompt preserves rule meaning and separates history from active blockers", () => {
  const prompt = brainSystemPrompt();
  assert.match(prompt, /does NOT mean compliance analysis itself is forbidden/i);
  assert.match(prompt, /Background operational history is optional context only/i);
  assert.match(prompt, /Prefer one clear recommended next step/i);
});

test("Seller Jarvis client routes normal chat to V2-A.1 auto API while keeping explicit execute protected", () => {
  const source = read("seller-jarvis-client.js");
  assert.match(source, /const AUTO_API_URL = "\/api\/jarvis-auto"/);
  assert.match(source, /request\(execute \? API_URL : AUTO_API_URL/);
  assert.match(source, /async function preview/);
  assert.match(source, /autoDelegate/);
});

test("V2-A.1 orchestrator executes only through existing protected executePlan and returns direct Brain output", () => {
  const source = read("api/jarvis-auto.js");
  assert.match(source, /const runs = await executePlan\(req, plan, executionBody\)/);
  assert.match(source, /mode: "brain_auto_delegated"/);
  assert.match(source, /internalDelegationOnly: true/);
  assert.match(source, /complianceFindingsAutoApply: false/);
});

test("floating Jarvis UI advertises auto mode without removing explicit execute", () => {
  const source = read("seller-jarvis-ui-response-adapter.js");
  assert.match(source, /Jarvis starten/);
  assert.match(source, /Direkt ausführen/);
  assert.match(source, /brain_auto_delegated/);
});
