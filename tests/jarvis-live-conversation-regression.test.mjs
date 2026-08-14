import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseWorkingMemoryCommand } from "../lib/jarvis-working-memory-policy.js";
import { planForBrainContext, resolveConversationId } from "../lib/jarvis-context-builder.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("Jarvis understands personal current-goal and blocker phrases", () => {
  assert.equal(
    parseWorkingMemoryCommand("Mein aktuelles Ziel ist, 10 gute Produkte für eBay zu finden.")?.currentGoal,
    "10 gute Produkte für eBay zu finden"
  );
  assert.equal(
    parseWorkingMemoryCommand("Mein aktueller Blocker ist, dass Lieferantendaten fehlen.")?.blockers?.[0],
    "dass Lieferantendaten fehlen"
  );
});

test("Brain context resolves the browser conversation bridge", () => {
  assert.equal(
    resolveConversationId({ context: { jarvisConversationId: "conversation-123" } }),
    "conversation-123"
  );
});

test("generic no-agent routing does not contaminate direct Brain conversation", () => {
  const contextPlan = planForBrainContext({
    status: "needs_attention",
    executable: false,
    intent: { id: "generic", capabilities: [] },
    blockers: ["Jarvis konnte für diesen Auftrag keinen ausreichend passenden aktiven Mitarbeiter bestimmen."],
    warnings: ["internal-routing-warning"],
  });
  assert.equal(contextPlan.status, "brain_handled");
  assert.deepEqual(contextPlan.blockers, []);
  assert.deepEqual(contextPlan.warnings, []);
});

test("Jarvis client forwards the remembered conversation id into Brain context", () => {
  const source = read("seller-jarvis-client.js");
  assert.match(source, /jarvisConversationId:\s*conversationId/);
  assert.match(source, /const conversationId = options\?\.conversationId \|\| getConversationId\(\)/);
});

test("Jarvis direct-answer adapter replaces stale plan DOM instead of appending to it", () => {
  const source = read("seller-jarvis-ui-response-adapter.js");
  assert.match(source, /for \(const child of Array\.from\(message\.children\)\)/);
  assert.match(source, /if \(child !== head\) child\.remove\(\)/);
  assert.match(source, /repairRememberedDirectAnswers\(\)/);
});
