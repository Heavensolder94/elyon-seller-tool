import { readProductMasterList, writeProductMasterList } from "./product-master-store.js";

const REGISTRY_KEY = "elyon_ebay_draft_registry_v1";
const MAX_RECORDS = 500;
const DEFAULT_MISSING_CONFIRMATIONS = 2;
const VALID_STATES = new Set(["draft", "published", "withdrawn", "removed", "ended"]);

const text = (value, max = 500) => String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
const environmentName = (value) => text(value).toLowerCase() === "sandbox" ? "sandbox" : "production";
const nowIso = () => new Date().toISOString();
const integer = (value, fallback = 0) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};
const canonicalState = (value) => {
  const state = text(value).toLowerCase();
  const normalized = VALID_STATES.has(state) ? state : "draft";
  return normalized === "withdrawn" ? "removed" : normalized;
};
const visibilityMode = (value) => text(value).toLowerCase() === "seller_hub_feed" ? "seller_hub_feed" : "inventory_offer";

function normalizeRecord(record = {}) {
  return {
    offerId: text(record.offerId, 120),
    sku: text(record.sku, 120),
    environment: environmentName(record.environment),
    state: canonicalState(record.state),
    previousState: text(record.previousState, 40).toLowerCase(),
    visibilityMode: visibilityMode(record.visibilityMode),
    source: text(record.source || "elyon", 80),
    sourceProductId: text(record.sourceProductId, 180),
    listingId: text(record.listingId, 120),
    externalDraftId: text(record.externalDraftId, 180),
    externalTaskId: text(record.externalTaskId, 220),
    createdAt: text(record.createdAt, 80),
    updatedAt: text(record.updatedAt, 80),
    publishedAt: text(record.publishedAt, 80),
    withdrawnAt: text(record.withdrawnAt, 80),
    removedAt: text(record.removedAt || record.withdrawnAt, 80),
    endedAt: text(record.endedAt, 80),
    lastEbaySyncAt: text(record.lastEbaySyncAt, 80),
    lastSeenAt: text(record.lastSeenAt, 80),
    missingSince: text(record.missingSince, 80),
    missingCount: integer(record.missingCount),
  };
}

async function readRegistry() {
  const records = await readProductMasterList(REGISTRY_KEY);
  return (Array.isArray(records) ? records : []).map(normalizeRecord)
    .filter((record) => record.offerId || record.sku || record.sourceProductId);
}

async function writeRegistry(records) {
  const compact = (Array.isArray(records) ? records : []).map(normalizeRecord)
    .filter((record) => record.offerId || record.sku || record.sourceProductId)
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))
    .slice(0, MAX_RECORDS);
  return writeProductMasterList(REGISTRY_KEY, compact);
}

function sameRecord(record, { offerId = "", sku = "", sourceProductId = "", environment = "production" } = {}) {
  if (record.environment !== environmentName(environment)) return false;
  if (offerId && record.offerId) return record.offerId === text(offerId, 120);
  if (sku && record.sku) return record.sku === text(sku, 120);
  return Boolean(sourceProductId && record.sourceProductId === text(sourceProductId, 180));
}

function transition(record, nextState, timestamp, patch = {}) {
  const before = canonicalState(record.state);
  const after = canonicalState(nextState);
  const changed = before !== after;
  return normalizeRecord({
    ...record,
    ...patch,
    state: after,
    previousState: changed ? before : record.previousState,
    updatedAt: changed ? timestamp : (record.updatedAt || timestamp),
    lastEbaySyncAt: timestamp,
    ...(after === "published" && !record.publishedAt ? { publishedAt: timestamp } : {}),
    ...(after === "removed" && !record.removedAt ? { removedAt: timestamp, withdrawnAt: record.withdrawnAt || timestamp } : {}),
    ...(after === "ended" && !record.endedAt ? { endedAt: timestamp } : {}),
  });
}

function observed(record, nextState, timestamp, current = {}) {
  const after = canonicalState(nextState);
  return transition(record, after, timestamp, {
    offerId: text(current?.offerId || record.offerId, 120),
    sku: text(current?.sku || record.sku, 120),
    listingId: text(current?.listingId || record.listingId, 120),
    lastSeenAt: timestamp,
    missingCount: 0,
    missingSince: "",
    ...(after === "draft" || after === "published" ? { removedAt: "", withdrawnAt: "", endedAt: "" } : {}),
  });
}

function missing(record, targetState, timestamp, threshold) {
  const missingCount = integer(record.missingCount) + 1;
  return transition(record, missingCount >= threshold ? targetState : record.state, timestamp, {
    missingCount,
    missingSince: record.missingSince || timestamp,
  });
}

function mapBy(items, key) {
  return new Map((Array.isArray(items) ? items : [])
    .map((item) => [text(item?.[key], 120), item])
    .filter(([value]) => value));
}

/**
 * Reconcile only after successful Inventory + ActiveList snapshots. Inventory
 * drafts need two consecutive misses before removal. Seller-Hub Feed drafts are
 * not auto-removed because eBay provides no reliable later draft lookup; once
 * their SKU is observed active, normal two-snapshot end detection applies.
 */
export function reconcileElyonDraftRecords(records = [], {
  environment,
  inventoryItems = [],
  activeListings = [],
  timestamp = nowIso(),
  missingConfirmations = DEFAULT_MISSING_CONFIRMATIONS,
} = {}) {
  const env = environmentName(environment);
  const threshold = Math.max(2, integer(missingConfirmations, DEFAULT_MISSING_CONFIRMATIONS));
  const byOfferId = mapBy(inventoryItems, "offerId");
  const inventoryBySku = mapBy(inventoryItems, "sku");
  const activeByListingId = mapBy(activeListings, "listingId");
  const activeBySku = mapBy(activeListings, "sku");
  const drafts = [];
  const changes = [];

  const nextRecords = (Array.isArray(records) ? records : []).map(normalizeRecord).map((record) => {
    if (record.environment !== env) return record;
    const before = canonicalState(record.state);
    const inventory = (record.offerId ? byOfferId.get(record.offerId) : null)
      || (record.sku ? inventoryBySku.get(record.sku) : null)
      || null;
    const active = (record.listingId ? activeByListingId.get(record.listingId) : null)
      || (record.sku ? activeBySku.get(record.sku) : null)
      || null;
    const inventoryState = text(inventory?.status, 40).toUpperCase();
    let next;

    if (active || inventoryState === "PUBLISHED") {
      next = observed(record, "published", timestamp, active || inventory || {});
    } else if (inventoryState === "UNPUBLISHED") {
      next = observed(record, "draft", timestamp, inventory || {});
      drafts.push({
        ...inventory,
        source: "elyon_inventory_draft",
        elyonDraft: true,
        draftCreatedAt: record.createdAt || "",
        draftSourceProductId: record.sourceProductId || "",
      });
    } else if (before === "draft" && record.visibilityMode === "seller_hub_feed") {
      next = transition(record, "draft", timestamp, { missingCount: 0, missingSince: "" });
    } else if (before === "draft") {
      next = missing(record, "removed", timestamp, threshold);
    } else if (before === "published") {
      next = missing(record, "ended", timestamp, threshold);
    } else {
      next = transition(record, before, timestamp);
    }

    const after = canonicalState(next.state);
    if (after !== before) {
      changes.push({
        offerId: next.offerId,
        sku: next.sku,
        listingId: next.listingId,
        sourceProductId: next.sourceProductId,
        from: before,
        to: after,
        at: timestamp,
      });
    }
    return next;
  });

  const counts = { draft: 0, published: 0, removed: 0, ended: 0 };
  for (const record of nextRecords) {
    if (record.environment === env) counts[canonicalState(record.state)] += 1;
  }
  return { records: nextRecords, drafts, changes, counts, missingConfirmations: threshold };
}

function upsertInventoryDraft(records, input = {}) {
  const offerId = text(input.offerId, 120);
  const sku = text(input.sku, 120);
  const environment = environmentName(input.environment);
  if (!offerId) return { persisted: false, reason: "offer_id_missing" };
  const index = records.findIndex((record) => sameRecord(record, { offerId, sku, environment }));
  const timestamp = nowIso();
  const current = index >= 0 ? records[index] : {};
  const next = normalizeRecord({
    ...current,
    offerId,
    sku: sku || current.sku,
    environment,
    state: "draft",
    previousState: current.state && canonicalState(current.state) !== "draft" ? canonicalState(current.state) : current.previousState,
    visibilityMode: "inventory_offer",
    source: text(input.source || current.source || "elyon_auto_lister", 80),
    sourceProductId: text(input.sourceProductId || current.sourceProductId, 180),
    listingId: "",
    createdAt: current.createdAt || timestamp,
    updatedAt: timestamp,
    lastSeenAt: timestamp,
    missingSince: "",
    missingCount: 0,
    publishedAt: "",
    withdrawnAt: "",
    removedAt: "",
    endedAt: "",
  });
  if (index >= 0) records[index] = next; else records.unshift(next);
  return next;
}

export async function registerElyonDraft(input = {}) {
  if (!text(input.offerId, 120)) return { persisted: false, reason: "offer_id_missing" };
  const records = await readRegistry();
  const next = upsertInventoryDraft(records, input);
  const storage = await writeRegistry(records);
  return { persisted: storage.persisted === true, record: next, storage };
}

export async function registerElyonInventoryDrafts(inputs = []) {
  if (!inputs.length || inputs.length > 100 || inputs.some(input => !text(input.offerId) || !text(input.sku))) {
    throw new Error("Ungültige eBay-Entwurfsidentitäten.");
  }
  const records = await readRegistry();
  const registered = inputs.map(input => upsertInventoryDraft(records, input));
  const storage = await writeRegistry(records);
  return { persisted: storage.persisted === true, count: registered.length, storage };
}

export async function registerElyonExternalDraftIdentity(input = {}) {
  const sku = text(input.sku, 120);
  const sourceProductId = text(input.sourceProductId, 180);
  const environment = environmentName(input.environment);
  if (!sku && !sourceProductId) return { persisted: false, reason: "stable_identity_missing" };
  const records = await readRegistry();
  const index = records.findIndex((record) => sameRecord(record, { sku, sourceProductId, environment }));
  const timestamp = nowIso();
  const current = index >= 0 ? records[index] : {};
  const next = normalizeRecord({
    ...current,
    sku: sku || current.sku,
    environment,
    state: "draft",
    previousState: current.state && canonicalState(current.state) !== "draft" ? canonicalState(current.state) : current.previousState,
    visibilityMode: "seller_hub_feed",
    source: text(input.source || current.source || "company_os_seller_hub_feed", 80),
    sourceProductId: sourceProductId || current.sourceProductId,
    externalDraftId: text(input.externalDraftId || current.externalDraftId, 180),
    externalTaskId: text(input.externalTaskId || current.externalTaskId, 220),
    createdAt: current.createdAt || timestamp,
    updatedAt: timestamp,
    missingCount: 0,
    missingSince: "",
    removedAt: "",
    withdrawnAt: "",
    endedAt: "",
  });
  if (index >= 0) records[index] = next; else records.unshift(next);
  const storage = await writeRegistry(records);
  return { persisted: storage.persisted === true, record: next, storage };
}

export async function markElyonDraftState(input = {}) {
  const identity = {
    offerId: text(input.offerId, 120),
    sku: text(input.sku, 120),
    sourceProductId: text(input.sourceProductId, 180),
    environment: environmentName(input.environment),
  };
  const state = canonicalState(input.state);
  if ((!identity.offerId && !identity.sku && !identity.sourceProductId) || !["published", "removed", "ended"].includes(state)) {
    return { persisted: false, reason: !identity.offerId && !identity.sku && !identity.sourceProductId ? "stable_identity_missing" : "invalid_state" };
  }
  const records = await readRegistry();
  const index = records.findIndex((record) => sameRecord(record, identity));
  if (index < 0) return { persisted: false, reason: "not_registered" };
  const timestamp = nowIso();
  const next = transition(records[index], state, timestamp, {
    listingId: text(input.listingId || records[index].listingId, 120),
    missingCount: 0,
    missingSince: "",
  });
  records[index] = next;
  const storage = await writeRegistry(records);
  return { persisted: storage.persisted === true, record: next, storage };
}

export async function getElyonDraftRegistryRecords(environment = "production") {
  const env = environmentName(environment);
  return (await readRegistry()).filter((record) => record.environment === env);
}

export async function reconcileElyonDraftRegistry({ environment, inventoryItems = [], activeListings = [] } = {}) {
  const result = reconcileElyonDraftRecords(await readRegistry(), { environment, inventoryItems, activeListings });
  const storage = await writeRegistry(result.records);
  const records = result.records.filter((record) => record.environment === environmentName(environment));
  return {
    drafts: result.drafts,
    records,
    count: result.drafts.length,
    registered: records.length,
    lifecycle: { counts: result.counts, changes: result.changes, missingConfirmations: result.missingConfirmations },
    storage,
  };
}

export const ELYON_EBAY_DRAFT_REGISTRY_KEY = REGISTRY_KEY;
export const ELYON_EBAY_MISSING_CONFIRMATIONS = DEFAULT_MISSING_CONFIRMATIONS;
