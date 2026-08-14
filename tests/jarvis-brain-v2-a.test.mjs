import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkingMemorySummary, mergeWorkingMemoryState, normalizeWorkingMemoryState, parseWorkingMemoryCommand } from "../lib/jarvis-working-memory-policy.js";
import { extractBrainPayload } from "../lib/jarvis-brain.js";
import { shouldRouteToBrain, isMemoryRecallCommand } from "../api/jarvis.js";
import { createJarvisPlan } from "../lib/elyon-jarvis-core.js";

test("V2-A parses current goal and focus deterministically", () => {
  assert.equal(parseWorkingMemoryCommand("Unser Ziel ist, drei Produkte listingbereit zu machen.").currentGoal, "drei Produkte listingbereit zu machen");
  assert.equal(parseWorkingMemoryCommand("Wir konzentrieren uns jetzt auf Product Enrichment.").currentFocus, "Product Enrichment");
});

test("V2-A stores open tasks, blockers and approvals without duplicates", () => {
  const first = parseWorkingMemoryCommand("Offen ist noch die Herstellerrecherche für Produkt A.");
  const second = parseWorkingMemoryCommand("Offen ist noch die Herstellerrecherche für Produkt A.");
  const blocker = parseWorkingMemoryCommand("Produkt B wartet auf meine Compliance-Freigabe.");
  const state = mergeWorkingMemoryState({}, { ...first, openTasks: [...first.openTasks, ...second.openTasks], blockers: blocker.blockers, pendingApprovals: blocker.pendingApprovals });
  assert.equal(state.openTasks.length, 1);
  assert.equal(state.pendingApprovals.length, 1);
  assert.match(state.blockers[0], /Produkt B/);
});

test("V2-A bounds working memory and summary", () => {
  const state = normalizeWorkingMemoryState({ openTasks: Array.from({ length: 30 }, (_, i) => `Task ${i}`), blockers: ["a".repeat(3000)] });
  assert.equal(state.openTasks.length, 20);
  assert.equal(state.blockers[0].length, 1000);
  assert.ok(buildWorkingMemorySummary(state).length <= 4000);
});

test("V2-A secret safety rejects credential-like state", () => {
  const state = normalizeWorkingMemoryState({ currentGoal: "API key sk_test_1234567890abcd" });
  assert.equal(state.currentGoal, null);
});

test("Brain JSON parser accepts V2-A state candidates", () => {
  const payload = extractBrainPayload(JSON.stringify({ answer: "Kontext geladen", memory: { shouldStore: false }, workingMemoryUpdate: { shouldUpdate: true, currentGoal: "Ziel" }, conversation: { summaryUpdate: "Kurz" } }));
  assert.equal(payload.answer, "Kontext geladen");
  assert.equal(payload.workingMemoryUpdate.currentGoal, "Ziel");
  assert.equal(payload.conversation.summaryUpdate, "Kurz");
});

test("specialist routing and memory recall remain deterministic", () => {
  const plan = createJarvisPlan({ command: "Prüfe Produkt ELY-000123", agents: [] });
  assert.equal(shouldRouteToBrain({ capability: "product_check" }, plan, "Prüfe Produkt ELY-000123"), false);
  assert.equal(isMemoryRecallCommand("Wie lautet unsere Compliance-Regel?"), true);
});
