import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  mergeFinanceState,
  writeFinanceState,
  reserveFinanceInvoiceNumber,
} from "../lib/finance-store.js";
import { normalizeFinanceTransaction, selectApprovedEurTransactions } from "../seller-finance-core.js";

test("EÜR working rows reject unapproved entries and foreign currency, and skip voided rows", () => {
  const rows = [
    normalizeFinanceTransaction({ transactionId: "good", transactionType: "SALE", status: "approved", amount: 21, currency: "EUR" }),
    normalizeFinanceTransaction({ transactionId: "pending", transactionType: "SALE", status: "needs_review", amount: 14, currency: "EUR" }),
    normalizeFinanceTransaction({ transactionId: "foreign", transactionType: "SALE", status: "approved", amount: 15, currency: "USD" }),
    normalizeFinanceTransaction({ transactionId: "voided", transactionType: "SALE", status: "needs_review", amount: 8, currency: "USD", voidedAt: "2026-11-01T10:00:00Z" }),
  ];
  const selected = selectApprovedEurTransactions(rows);
  assert.equal(selected.ready, false);
  assert.equal(selected.unapprovedCount, 1);
  assert.deepEqual(selected.foreignCurrencies, ["USD"]);
  assert.deepEqual(selected.transactions.map((x) => x.transactionId), ["good"]);
});

test("partial order-center writes preserve finance settings and client audit entries", () => {
  const current = {
    settings: { taxMode: "small_business", invoicePrefix: "ELYON", revenueAccount: "Erlöse Spezial" },
    auditLog: [{ id: "event-server", action: "sync", hash: "server-hash" }],
  };
  const local = {
    invoiceMeta: { "order-1": { invoiceNumber: "ELYON-2026-00001" } },
    auditLog: [{ id: "event-local", timestamp: "2026-11-18T09:00:00Z", action: "document_linked", summary: "Beleg zugewiesen" }],
  };
  const once = mergeFinanceState(current, local).state;
  assert.equal(once.settings.revenueAccount, "Erlöse Spezial");
  assert.equal(once.settings.taxMode, "small_business");
  assert.equal(once.invoiceMeta["order-1"].invoiceNumber, "ELYON-2026-00001");
  const events = once.auditLog.filter((x) => x.metadata?.clientEventId === "event-local");
  assert.equal(events.length, 1);
  const twice = mergeFinanceState(once, local).state;
  assert.equal(twice.auditLog.filter((x) => x.metadata?.clientEventId === "event-local").length, 1);
});

function fakeUpstash() {
  const saved = new Map();
  const originalFetch = globalThis.fetch;
  const keys = [
    "ELYON_FINANCE_STORE_MODE",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ];
  const originals = Object.fromEntries(keys.map((name) => [name, process.env[name]]));
  process.env.ELYON_FINANCE_STORE_MODE = "upstash";
  process.env.UPSTASH_REDIS_REST_URL = "https://example.invalid";
  process.env.UPSTASH_REDIS_REST_TOKEN = "unit-test";
  const result = (value) => ({ ok: true, json: async () => ({ result: value }) });
  globalThis.fetch = async (url, opts = {}) => {
    if (!opts.method || opts.method === "GET") {
      const encoded = String(url).split("/get/")[1];
      return result(saved.get(decodeURIComponent(encoded)) ?? null);
    }
    const args = JSON.parse(opts.body);
    assert.equal(args[0], "EVAL");
    const keyCount = Number(args[2]);
    if (keyCount === 1) {
      const currentRevision = JSON.parse(saved.get(args[3]) || '{"revision":0}').revision;
      if (currentRevision !== Number(args[4])) return result(0);
      saved.set(args[3], args[5]);
      return result(1);
    }
    if (keyCount === 2) {
      const counter = args[3];
      const order = args[4];
      if (saved.has(order)) return result(saved.get(order));
      const next = Number(saved.get(counter) ?? args[5]) + 1;
      saved.set(counter, String(next));
      const invoice = args[6] + String(next).padStart(5, "0");
      saved.set(order, invoice);
      return result(invoice);
    }
    throw new Error("Unexpected Redis command");
  };
  return () => {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(originals)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
}

test("revision guard detects stale financial writes and prevents lost updates", async () => {
  const restore = fakeUpstash();
  try {
    const saved = await writeFinanceState({ settings: { revenueAccount: "Custom" } }, { action: "test" }, { expectedRevision: 0 });
    assert.equal(saved.ok, true);
    assert.equal(saved.state.revision, 1);
    const stale = await writeFinanceState({ settings: { revenueAccount: "Old" } }, {}, { expectedRevision: 0 });
    assert.equal(stale.ok, false);
    assert.equal(stale.conflict, true);
    assert.equal(stale.currentRevision, 1);
    const updated = await writeFinanceState({ settings: { ebayFeeAccount: "eBay" } }, {}, { expectedRevision: 1 });
    assert.equal(updated.ok, true);
    assert.equal(updated.state.revision, 2);
    assert.equal(updated.state.settings.revenueAccount, "Custom");
  } finally { restore(); }
});

test("invoice reservations are global, unique and idempotent per order", async () => {
  const restore = fakeUpstash();
  try {
    await writeFinanceState({
      settings: { nextInvoiceNumber: 10 },
      invoiceMeta: { previous: { invoiceNumber: "ELYON-2026-00011" } },
    }, {}, { expectedRevision: 0 });
    const first = await reserveFinanceInvoiceNumber("ebay-order-1", "ELYON", 2026);
    const retry = await reserveFinanceInvoiceNumber("ebay-order-1", "ELYON", 2026);
    const second = await reserveFinanceInvoiceNumber("ebay-order-2", "ELYON", 2026);
    assert.equal(first.invoiceNumber, "ELYON-2026-00012");
    assert.equal(retry.invoiceNumber, first.invoiceNumber);
    assert.equal(second.invoiceNumber, "ELYON-2026-00013");
  } finally { restore(); }
});

test("invoice UI requires the server and documents are explicitly local-only", async () => {
  const invoiceUI = await readFile(new URL("../seller-order-invoices.js", import.meta.url), "utf8");
  const financeUI = await readFile(new URL("../seller-finance.js", import.meta.url), "utf8");
  assert.match(invoiceUI, /reserve-invoice-number/);
  assert.doesNotMatch(invoiceUI, /function invoiceNumber\(meta\)/);
  assert.match(financeUI, /expectedRevision: serverRevision/);
  assert.match(financeUI, /Originaldatei nur im Browser dieses Geräts/);
});
