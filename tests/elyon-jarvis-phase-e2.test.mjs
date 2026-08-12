import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateE2BridgeEvent } from "../api/jarvis-events.js";

const eventsApiUrl = new URL("../api/jarvis-events.js", import.meta.url);
const eventStoreUrl = new URL("../lib/elyon-jarvis-event-store.js", import.meta.url);

function validEvent(overrides = {}) {
  return {
    type: "nova.product.created",
    source: "company-os",
    sourceId: "nova-123",
    subjectId: "nova-123",
    idempotencyKey: "nova.product.created:nova-123",
    payload: { productId: "nova-123", title: "Produkt" },
    ...overrides,
  };
}

test("E2 bridge accepts only Company OS nova.product.created with stable identity", () => {
  assert.deepEqual(validateE2BridgeEvent(validEvent()), { ok: true });
  assert.equal(validateE2BridgeEvent(validEvent({ type: "market.analysis.completed" })).ok, false);
  assert.equal(validateE2BridgeEvent(validEvent({ source: "browser" })).ok, false);
  assert.equal(validateE2BridgeEvent(validEvent({ sourceId: "" })).ok, false);
  assert.equal(validateE2BridgeEvent(validEvent({ idempotencyKey: "free-form" })).ok, false);
  assert.equal(validateE2BridgeEvent(validEvent({ sourceId: "nova-999", idempotencyKey: "nova.product.created:nova-123" })).ok, false);
});

test("E2 event API keeps GET seller-only while POST can use the existing server bridge", async () => {
  const source = await readFile(eventsApiUrl, "utf8");
  assert.match(source, /isSellerAuthenticated/);
  assert.match(source, /validateBridgeAccess/);
  assert.match(source, /req\.method === "GET"[\s\S]*requireSellerAccess/);
  assert.match(source, /req\.method === "POST"[\s\S]*validateBridgeAccess/);
  assert.match(source, /validateE2BridgeEvent/);
  assert.match(source, /E2_BRIDGE_EVENT_TYPE = "nova\.product\.created"/);
  assert.match(source, /E2_BRIDGE_SOURCE = "company-os"/);
  assert.doesNotMatch(source, /Access-Control-Allow-Origin|cors\(/i);
});

test("E2 service bridge cannot broaden Jarvis execution authority", async () => {
  const source = await readFile(eventsApiUrl, "utf8");
  assert.match(source, /eventIngestionExecutesAgents: false/);
  assert.match(source, /autonomousExecutionEnabled: false/);
  assert.match(source, /jobExecutionPolicy: "manual_dispatch"/);
  assert.match(source, /livePublishingAllowed: false/);
  assert.doesNotMatch(source, /ai-agent-run-registry|registryRunner|executePlan|publish_listing|place_supplier_order|issue_refund|send_customer_message/);
});

test("E2 still relies on the E1 deterministic event/job store for idempotency", async () => {
  const source = await readFile(eventStoreUrl, "utf8");
  assert.match(source, /const explicitKey = text\(source\.idempotencyKey/);
  assert.match(source, /const eventId = `evt-\$\{hash\.slice\(0, 24\)\}`/);
  assert.match(source, /const jobId = `job-\$\{hash\.slice\(0, 24\)\}`/);
  assert.match(source, /"NX"/);
  assert.match(source, /executionPolicy: "manual_dispatch"/);
  assert.match(source, /autoExecute: false/);
});
