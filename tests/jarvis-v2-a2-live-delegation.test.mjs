import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const previewSource = await readFile(new URL("../api/jarvis-auto-preview.js", import.meta.url), "utf8");
const clientSource = await readFile(new URL("../seller-jarvis-client.js", import.meta.url), "utf8");
const adapterSource = await readFile(new URL("../seller-jarvis-ui-response-adapter.js", import.meta.url), "utf8");

test("V2-A.2 preview is protected and explicitly side-effect free", () => {
  assert.match(previewSource, /requireSellerAccess\(req, res/);
  assert.match(previewSource, /previewHasNoSideEffects: true/);
  assert.match(previewSource, /nothingExecuted: true/);
  assert.doesNotMatch(previewSource, /appendConversationMessage|upsertWorkingMemory|executePlan|runMarketScout\s*\(/);
});

test("V2-A.2 preview exposes the actual planned specialists without executing them", () => {
  assert.match(previewSource, /plan\.delegations/);
  assert.match(previewSource, /agentId: text\(delegation\.agentId/);
  assert.match(previewSource, /agentName: text\(delegation\.agentName/);
  assert.match(previewSource, /capability: text\(delegation\.capability/);
  assert.match(previewSource, /autoDelegationDecision/);
});

test("Jarvis client emits preview before protected auto execution", () => {
  const previewIndex = clientSource.indexOf("await delegationPreview(command");
  const executeIndex = clientSource.indexOf("const result = await request(execute ? API_URL : AUTO_API_URL");
  assert.ok(previewIndex >= 0);
  assert.ok(executeIndex > previewIndex);
  assert.match(clientSource, /elyon:jarvis-auto-preview/);
  assert.match(clientSource, /AUTO_PREVIEW_API_URL = "\/api\/jarvis-auto-preview"/);
});

test("Jarvis UI shows live queued specialists and final run results", () => {
  assert.match(adapterSource, /renderPendingDelegation/);
  assert.match(adapterSource, /Jarvis · Spezialisten/);
  assert.match(adapterSource, /arbeitet …/);
  assert.match(adapterSource, /wartet …/);
  assert.match(adapterSource, /renderFinalDelegationPanel/);
  assert.match(adapterSource, /Ausgeführte Spezialisten/);
  assert.match(adapterSource, /run\?\.payload\?\.result \|\| run\?\.payload\?\.task\?\.result/);
});

test("completed specialist cards preserve success warning and failure states", () => {
  assert.match(adapterSource, /success: "✓"/);
  assert.match(adapterSource, /warning: "⚠"/);
  assert.match(adapterSource, /error: "✕"/);
  assert.match(adapterSource, /Freigabe \/ Prüfung nötig/);
});
