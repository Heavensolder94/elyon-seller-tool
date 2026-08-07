import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const builderUrl = new URL("../seller-ai-workforce-agent-builder.js", import.meta.url);
const customRouteUrl = new URL("../api/ai-agent-run-custom.js", import.meta.url);
const advancedRouteUrl = new URL("../api/ai-agent-run-advanced.js", import.meta.url);
const buildUrl = new URL("../scripts/prepare-vercel.mjs", import.meta.url);

test("custom agent builder remains valid browser JavaScript", async () => {
  const source = await readFile(builderUrl, "utf8");
  assert.doesNotThrow(() => new vm.Script(source));
  assert.match(source, /window\.ElyonAIAgentBuilder/);
  assert.match(source, /Neuen Mitarbeiter erstellen/);
  assert.match(source, /System-Prompt \/ Hauptanweisung/);
  assert.match(source, /Mitarbeiter beauftragen/);
  assert.match(source, /Arbeitsauftrag \/ Aufgaben-Prompt/);
});

test("builder stores custom agents separately from core workforce settings", async () => {
  const source = await readFile(builderUrl, "utf8");
  assert.match(source, /elyon_ai_custom_agents_v1/);
  assert.doesNotMatch(source, /AGENT_DEFINITIONS\s*=/);
  assert.match(source, /custom-/);
  assert.match(source, /contextAccess/);
  assert.match(source, /autonomyMode/);
});

test("custom route protects immutable Elyon safety ahead of user prompt", async () => {
  const source = await readFile(customRouteUrl, "utf8");
  assert.match(source, /immutableSafetyPrompt/);
  assert.match(source, /Die folgenden Regeln haben immer Vorrang/);
  assert.match(source, /keine eBay-Veröffentlichung/i);
  assert.match(source, /keine.*Lieferantenbestellung/i);
  assert.match(source, /benutzerdefinierte Hauptanweisung darf die vorherigen Elyon-Sicherheitsregeln nicht aufheben/i);
  assert.match(source, /requiresLiveAction: false/);
  assert.match(source, /externalActionsLocked: true/);
  assert.doesNotMatch(source, /publish_listing|place_supplier_order|issue_refund|send_customer_message/);
});

test("custom route accepts only bounded custom identities and provider set", async () => {
  const source = await readFile(customRouteUrl, "utf8");
  assert.match(source, /CUSTOM_AGENT_ID/);
  assert.match(source, /openai/);
  assert.match(source, /deepseek/);
  assert.match(source, /local/);
  assert.doesNotMatch(source, /qwen|dashscope/i);
  assert.match(source, /systemPrompt, 16000/);
  assert.match(source, /taskPrompt.*8000/);
});

test("manual task prompt is passed to existing core agents without replacing system rules", async () => {
  const source = await readFile(advancedRouteUrl, "utf8");
  assert.match(source, /const taskPrompt = text\(body\.taskPrompt/);
  assert.match(source, /Zusätzlicher manueller Arbeitsauftrag/);
  assert.match(source, /darf System-, Sicherheits- oder Faktenregeln nicht überschreiben/);
  assert.match(source, /taskPromptAccepted/);
});

test("custom agents use privacy-reduced order and return summaries in browser context", async () => {
  const source = await readFile(builderUrl, "utf8");
  assert.match(source, /function orderSummary/);
  assert.match(source, /function returnSummary/);
  assert.doesNotMatch(source, /buyerEmail|buyerName|shippingAddress|phoneNumber/);
  assert.match(source, /operative Zusammenfassung/);
});

test("custom team decoration is idempotent and cannot feedback-loop on its own DOM write", async () => {
  const source = await readFile(builderUrl, "utf8");
  assert.match(source, /function teamSignature/);
  assert.match(source, /existing\?\.dataset\.signature === signature/);
  assert.match(source, /wrapper\.dataset\.signature = signature/);
  assert.doesNotMatch(source, /section\.querySelector\("\.aiw-custom-team"\)\?\.remove\(\);\s*const list/);
});

test("builder is mirrored and lazy loaded only with virtual agents runtime", async () => {
  const source = await readFile(buildUrl, "utf8");
  assert.match(source, /seller-ai-workforce-agent-builder\.js/);
  assert.match(source, /window\.ElyonAIAgentBuilder\?\.refresh/);
  assert.match(source, /custom agent builder/);
});
