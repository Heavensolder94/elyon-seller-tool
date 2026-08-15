import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { novaProductFromItem } from "../api/jarvis-inbox.js";
import { itemKeyForCandidate } from "../lib/jarvis-inbox-store.js";

test("Jarvis Inbox creates stable candidate keys", () => {
  assert.equal(itemKeyForCandidate({ rank: 1 }, 0), "candidate:1");
  assert.equal(itemKeyForCandidate({}, 4), "candidate:5");
});

test("Jarvis Inbox maps a Market Scout result into the Nova inbox workflow", () => {
  const product = novaProductFromItem({
    taskId: "7c45439f-5148-4b7a-81b0-4757d0fd1705",
    itemKey: "candidate:1",
    researchStrategy: "supplier_first_fallback",
    candidate: {
      productName: "LED Pflanzenwachstumslampe mit Timer 12W",
      supplierSource: "Supplier",
      supplierUrl: "https://supplier.example/product",
      supplierRegion: "EU",
      category: "Heimgarten",
      purchasePrice: 18.5,
      sellingPrice: 34.99,
      estimatedMarginPercent: 47.13,
      riskLevel: "low",
      dropshippingSupported: true,
      supplierShipsPerOrder: true,
      minimumOrderQuantity: 1,
      fulfillmentEvidence: "Single-order fulfillment",
      evidence: [{ type: "market", url: "https://example.com/evidence" }],
    },
  });

  assert.equal(product.status, "nova_inbox");
  assert.equal(product.reviewStatus, "not_reviewed");
  assert.equal(product.processingStatus, "new");
  assert.equal(product.targetArea, "find_nova_inbox");
  assert.equal(product.companyOsSection, "finden_nova_eingang");
  assert.equal(product.raw.marketScout.minimumOrderQuantity, 1);
  assert.equal(product.raw.researchStrategy, "supplier_first_fallback");
  assert.equal("allowPublish" in product, false);
});

test("Jarvis Inbox UI is loaded additively and exposes the V1 actions", async () => {
  const [ui, handoff] = await Promise.all([
    readFile(new URL("../seller-jarvis-inbox.js", import.meta.url), "utf8"),
    readFile(new URL("../seller-jarvis-companion-handoff.js", import.meta.url), "utf8"),
  ]);
  assert.match(handoff, /seller-jarvis-inbox\.js/);
  assert.match(ui, /Jarvis Inbox/);
  assert.match(ui, /In Nova übernehmen/);
  assert.match(ui, /Verwerfen/);
  assert.match(ui, /Neu recherchieren/);
  assert.match(ui, /elyon:jarvis-async-result/);
});

test("Jarvis Inbox migration stays separate from jarvis_tasks", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260815152000_jarvis_inbox_v1.sql", import.meta.url), "utf8");
  assert.match(migration, /create table if not exists public\.jarvis_inbox_state/i);
  assert.match(migration, /primary key \(task_id, item_key\)/i);
  assert.match(migration, /enable row level security/i);
  assert.doesNotMatch(migration, /alter table public\.jarvis_tasks/i);
});
