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

test("Jarvis Inbox UI exposes safe trash, restore and permanent inbox removal", async () => {
  const [ui, handoff, api] = await Promise.all([
    readFile(new URL("../seller-jarvis-inbox.js", import.meta.url), "utf8"),
    readFile(new URL("../seller-jarvis-companion-handoff.js", import.meta.url), "utf8"),
    readFile(new URL("../api/jarvis-inbox.js", import.meta.url), "utf8"),
  ]);
  assert.match(handoff, /seller-jarvis-inbox\.js/);
  assert.match(ui, /Jarvis Inbox/);
  assert.match(ui, /In Nova übernehmen/);
  assert.match(ui, /Verwerfen/);
  assert.match(ui, /Neu recherchieren/);
  assert.match(ui, /Papierkorb/);
  assert.match(ui, /Wiederherstellen/);
  assert.match(ui, /Endgültig löschen/);
  assert.match(ui, /delete_permanent/);
  assert.match(ui, /technical Jarvis-Task bleibt als Audit-Historie erhalten|technische Jarvis-Task bleibt als Audit-Historie erhalten|technische Jarvis-Task bleibt als Audit-Historie/i);
  assert.match(api, /technicalTaskRetained:\s*true/);
  assert.match(api, /technicalTaskDelete:\s*false/);
  assert.match(api, /delete_requires_trash/);
  assert.match(ui, /elyon:jarvis-async-result/);
});

test("Jarvis Inbox migrations keep task audit data separate and add tombstone states", async () => {
  const [baseMigration, trashMigration] = await Promise.all([
    readFile(new URL("../supabase/migrations/20260815152000_jarvis_inbox_v1.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260815154500_jarvis_inbox_trash_v1.sql", import.meta.url), "utf8"),
  ]);
  assert.match(baseMigration, /create table if not exists public\.jarvis_inbox_state/i);
  assert.match(baseMigration, /primary key \(task_id, item_key\)/i);
  assert.match(baseMigration, /enable row level security/i);
  assert.match(trashMigration, /previous_state/i);
  assert.match(trashMigration, /trashed_at/i);
  assert.match(trashMigration, /deleted_at/i);
  assert.match(trashMigration, /'trashed'/i);
  assert.match(trashMigration, /'deleted'/i);
  assert.doesNotMatch(`${baseMigration}\n${trashMigration}`, /delete from public\.jarvis_tasks/i);
  assert.doesNotMatch(`${baseMigration}\n${trashMigration}`, /drop table public\.jarvis_tasks/i);
});
