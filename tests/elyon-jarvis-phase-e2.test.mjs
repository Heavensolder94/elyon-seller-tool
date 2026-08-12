import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateE2BridgeEvent } from "../api/jarvis-events.js";

const eventsApiUrl = new URL("../api/jarvis-events.js", import.meta.url);
const eventStoreUrl = new URL("../lib/elyon-jarvis-event-store.js", import.meta.url);
const workerStoreUrl = new URL("../lib/elyon-jarvis-worker-store.js", import.meta.url);

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

test("E2 service bridge still cannot execute agents or broaden external authority directly", async () => {
  const source = await readFile(eventsApiUrl, "utf8");
  assert.match(source, /eventIngestionExecutesAgents: false/);
  assert.match(source, /armJarvisJobForWorker/);
  assert.match(source, /externalActionsLocked: true/);
  assert.match(source, /livePublishingAllowed: false/);
  assert.doesNotMatch(source, /ai-agent-run-registry|registryRunner|executePlan|publish_listing|place_supplier_order|issue_refund|send_customer_message/);
});

test("E2 still relies on the E1 deterministic event/job store and E3 arms only the exact safe scope", async () => {
  const [eventStore, workerStore] = await Promise.all([
    readFile(eventStoreUrl, "utf8"),
    readFile(workerStoreUrl, "utf8"),
  ]);
  assert.match(eventStore, /const explicitKey = text\(source\.idempotencyKey/);
  assert.match(eventStore, /const eventId = `evt-\$\{hash\.slice\(0, 24\)\}`/);
  assert.match(eventStore, /const jobId = `job-\$\{hash\.slice\(0, 24\)\}`/);
  assert.match(eventStore, /"NX"/);
  assert.match(eventStore, /executionPolicy: "manual_dispatch"/);
  assert.match(eventStore, /autoExecute: false/);
  assert.match(workerStore, /nova\.product\.created/);
  assert.match(workerStore, /company-os/);
  assert.match(workerStore, /executionPolicy: "auto_internal"/);
  assert.match(workerStore, /autoExecute: true/);
});
