import test from "node:test";
import assert from "node:assert/strict";
import { authorizeFinanceCron } from "../api/finance-auto-sync.js";
import { berlinMonthKey, selectNewAutoTransactions, runAutomaticEbayFinanceSync } from "../lib/ebay-finance-auto-sync.js";
import { mergeFinanceState, normalizeFinanceState } from "../lib/finance-store.js";
import { normalizeEbayApiTransactions, mergeTransactions } from "../seller-finance-core.js";
import { signFinancesGetRequest } from "../lib/ebay-finance-signature.js";

const sale = (id, date = "2026-11-18T09:00:00Z") => ({
  transactionId: id, transactionDate: date, transactionType: "SALE",
  orderId: `order-${id}`, amount: { value: "25.00", currency: "EUR" },
});
const raw = (transactions) => ({ environment: "production", transactions });
const persistent = () => ({ persistent: true, configured: true });
const state = (input = {}) => normalizeFinanceState(input);

test("signing configuration errors identify only the missing Preview keys", () => {
  const target = "https://apiz.ebay.com/sell/finances/v1/transaction";
  assert.throws(
    () => signFinancesGetRequest(target, { jwe: "", privateKey: "example" }),
    (failure) => failure.code === "ebay_signature_not_configured"
      && failure.message.includes("EBAY_SIGNATURE_JWE")
      && !failure.message.includes("EBAY_SIGNATURE_PRIVATE_KEY"),
  );
  assert.throws(
    () => signFinancesGetRequest(target, { jwe: "example", privateKey: "" }),
    (failure) => failure.code === "ebay_signature_not_configured"
      && failure.message.includes("EBAY_SIGNATURE_PRIVATE_KEY")
      && !failure.message.includes("EBAY_SIGNATURE_JWE"),
  );
});

test("cron requires a configured secret with exact bearer authorization", () => {
  assert.equal(authorizeFinanceCron({ headers: {} }, {}).status, 503);
  const env = { CRON_SECRET: "a-strong-private-cron-token" };
  assert.equal(authorizeFinanceCron({ headers: {} }, env).status, 401);
  assert.equal(authorizeFinanceCron({ headers: { authorization: "Bearer wrong" } }, env).status, 401);
  assert.deepEqual(authorizeFinanceCron({ headers: { authorization: `Bearer ${env.CRON_SECRET}` } }, env), { ok: true });
});

test("idempotent daily merge preserves previously stored timestamps and review status", () => {
  const item = normalizeEbayApiTransactions(raw([sale("already")]))[0];
  const reviewed = { ...item, status: "approved", updatedAt: "2026-11-18T09:10:00.000Z" };
  const merged = mergeTransactions([reviewed], [reviewed]);
  assert.equal(merged.updated, 0);
  assert.equal(merged.duplicates, 1);
  assert.equal(merged.transactions[0].status, "approved");
  assert.equal(merged.transactions[0].updatedAt, "2026-11-18T09:10:00.000Z");
});

test("closed month comparison uses Germany timezone at UTC boundary", () => {
  assert.equal(berlinMonthKey("2026-10-31T23:30:00Z"), "2026-11");
  assert.equal(berlinMonthKey("2026-11-01T00:30:00Z"), "2026-11");
});

test("closed months, existing manual reviews and voids cannot be reimported", () => {
  const incoming = normalizeEbayApiTransactions(raw([
    sale("already"), sale("locked", "2026-10-15T12:00:00Z"), sale("fresh"),
  ]));
  const preserved = { ...incoming.find((tx) => tx.transactionId === "already"), status: "approved", voidedAt: "2026-11-18T10:00:00Z" };
  const picked = selectNewAutoTransactions(state({
    transactions: [preserved],
    monthClosures: { "2026-10": { closedAt: "2026-11-01T09:00:00Z" } },
  }), incoming);
  assert.equal(picked.transactions.length, 1);
  assert.equal(picked.transactions[0].transactionId, "fresh");
  assert.equal(picked.duplicates, 1);
  assert.equal(picked.blockedLockedMonths, 1);
});

test("cron imports only new rows with revision check and an audit/import record", async () => {
  let current = state();
  const writes = [];
  const dependencies = {
    fetchTransactionsImpl: async (environment, days) => {
      assert.equal(environment, "production");
      assert.equal(days, 90);
      return raw([sale("first")]);
    },
    readStateImpl: async () => current,
    writeStateImpl: async (payload, audit, options) => {
      assert.equal(options.expectedRevision, current.revision);
      const merged = mergeFinanceState(current, payload, audit);
      current = state({ ...merged.state, revision: current.revision + 1 });
      writes.push({ payload, audit, options });
      return { ok: true, state: current };
    },
    storeDescriptionImpl: persistent,
    now: () => new Date("2026-11-18T18:00:00Z"),
  };
  const first = await runAutomaticEbayFinanceSync(dependencies);
  assert.equal(first.inserted, 1);
  assert.equal(current.transactions.length, 1);
  assert.equal(current.transactions[0].status, "needs_review");
  assert.equal(current.imports.length, 1);
  assert.equal(writes[0].audit.actor, "finance_cron");
  const second = await runAutomaticEbayFinanceSync(dependencies);
  assert.equal(second.inserted, 0);
  assert.equal(second.duplicates, 1);
  assert.equal(current.transactions.length, 1);
});

test("conflicting revisions are retried against the latest closed-month state", async () => {
  let current = state();
  let calls = 0;
  const result = await runAutomaticEbayFinanceSync({
    fetchTransactionsImpl: async () => raw([sale("new", "2026-11-18T09:00:00Z")]),
    readStateImpl: async () => current,
    writeStateImpl: async (payload) => {
      calls += 1;
      if (calls === 1) {
        current = state({ ...current, revision: 1, monthClosures: { "2026-11": { closedAt: "2026-11-19T00:00:00Z" } } });
        return { ok: false, conflict: true };
      }
      assert.equal(payload.transactions.length, 0);
      return { ok: true, state: { ...current, revision: 2 } };
    },
    storeDescriptionImpl: persistent,
  });
  assert.equal(calls, 2);
  assert.equal(result.inserted, 0);
  assert.equal(result.blockedLockedMonths, 1);
});

test("missing persistent storage fails closed before accessing eBay", async () => {
  await assert.rejects(() => runAutomaticEbayFinanceSync({
    fetchTransactionsImpl: async () => { throw new Error("must not fetch"); },
    storeDescriptionImpl: () => ({ persistent: false, configured: false }),
  }), { code: "finance_auto_store_unavailable" });
});
