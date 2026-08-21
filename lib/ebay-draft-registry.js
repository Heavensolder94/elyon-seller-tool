import { readProductMasterList, writeProductMasterList } from "./product-master-store.js";

const REGISTRY_KEY = "elyon_ebay_draft_registry_v1";
const MAX_RECORDS = 500;
const DEFAULT_MISSING_CONFIRMATIONS = 2;
const VALID_STATES = new Set(["draft", "published", "withdrawn", "removed", "ended"]);

function text(value, max = 500) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function environmentName(value) {
  return text(value).toLowerCase() === "sandbox" ? "sandbox" : "production";
}

function nowIso() {
  return new Date().toISOString();
}

function integer(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function lifecycleState(value) {
  const state = text(value).toLowerCase();
  return VALID_STATES.has(state) ? state : "draft";
}

function canonicalState(value) {
  const state = lifecycleState(value);
  return state === "withdrawn" ? "removed" : state;
}

function normalizeRecord(record = {}) {
  return {
    offerId: text(record.offerId, 120),
    sku: text(record.sku, 120),
    environment: environmentName(record.environment),
    state: lifecycleState(record.state),
    previousState: text(record.previousState, 40).toLowerCase(),
    source: text(record.source || "elyon", 80),
    sourceProductId: text(record.sourceProductId, 180),
    listingId: text(record.listingId, 120),
    createdAt: text(record.createdAt, 80),
    updatedAt: text(record.updatedAt, 80),
    publishedAt: text(record.publishedAt, 80),
    withdrawnAt: text(record.withdrawnAt, 80),
    removedAt: text(record.removedAt || record.withdrawnAt, 80),
    endedAt: text(record.endedAt, 80),
    lastEbaySyncAt: text(record.lastEbaySyncAt, 80),
    lastSeenAt: text(record.lastSeenAt, 80),
    missingSince: text(record.missingSince, 80),
    missingCount: integer(record.missingCount, 0),
  };
}

async function readRegistry() {
  const records = await readProductMasterList(REGISTRY_KEY);
  return (Array.isArray(records) ? records : [])
    .map(normalizeRecord)
    .filter((record) => record.offerId || record.sku);
}

async function writeRegistry(records) {
  const compact = (Array.isArray(records) ? records : [])
    .map(normalizeRecord)
    .filter((record) => record.offerId || record.sku)
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))
    .slice(0, MAX_RECORDS);
  return writeProductMasterList(REGISTRY_KEY, compact);
}

function sameRecord(record, offerId, sku, environment) {
  if (record.environment !== environment) return false;
  if (offerId && record.offerId) return record.offerId === offerId;
  return Boolean(sku && record.sku && record.sku === sku);
}

function transition(record, nextState, timestamp, patch = {}) {
  const currentState = canonicalState(record.state);
  const targetState = canonicalState(nextState);
  const stateChanged = currentState !== targetState;
  return normalizeRecord({
    ...record,
    ...patch,
    state: targetState,
    previousState: stateChanged ? currentState : record.previousState,
    updatedAt: stateChanged ? timestamp : (record.updatedAt || timestamp),
    lastEbaySyncAt: timestamp,
    ...(targetState === "published" && !record.publishedAt ? { publishedAt: timestamp } : {}),
    ...(targetState === "removed" && !record.removedAt ? { removedAt: timestamp, withdrawnAt: record.withdrawnAt || timestamp } : {}),
    ...(targetState === "ended" && !record.endedAt ? { endedAt: timestamp } : {}),
  });
}

function observed(record, nextState, timestamp, current = {}) {
  return transition(record, nextState, timestamp, {
    offerId: text(current.offerId || record.offerId, 120),
    sku: text(current.sku || record.sku, 120),
    listingId: text(current.listingId || record.listingId, 120),
    lastSeenAt: timestamp,
    missingCount: 0,
    missingSince: "",
    ...(canonicalState(nextState) === "draft" ? { removedAt: "", withdrawnAt: "", endedAt: "" } : {}),
    ...(canonicalState(nextState) === "published" ? { removedAt: "", withdrawnAt: "", endedAt: "" } : {}),
  });
}

function missing(record, nextState, timestamp, missingConfirmations) {
  const count = integer(record.missingCount, 0) + 1;
  const firstMissingAt = record.missingSince || timestamp;
  const confirmed = count >= missingConfirmations;
  return transition(record, confirmed ? nextState : canonicalState(record.state), timestamp, {
    missingCount: count,
    missingSince: firstMissingAt,
  });
}

function mapBy(items, field) {
  return new Map(
    (Array.isArray(items) ? items : [])
      .map((item) => [text(item?.[field], 120), item])
      .filter(([key]) => key),
  );
}

function inventoryStatus(item = {}) {
  return text(item.status, 40).toUpperCase();
}

function findInventory(record, byOfferId, bySku) {
  return (record.offerId ? byOfferId.get(record.offerId) : null)
    || (record.sku ? bySku.get(record.sku) : null)
    || null;
}

function findActive(record, byListingId, bySku) {
  return (record.listingId ? byListingId.get(record.listingId) : null)
    || (record.sku ? bySku.get(record.sku) : null)
    || null;
}

/**
 * Pure lifecycle reconciliation used by the persisted registry and unit tests.
 * The caller must only invoke this after successful eBay snapshots. A single
 * absence is never treated as deletion; two consecutive successful snapshots
 * are required by default.
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
  const normalized = (Array.isArray(records) ? records : []).map(normalizeRecord);
  const byOfferId = mapBy(inventoryItems, "offerId");
  const inventoryBySku = mapBy(inventoryItems, "sku");
  const activeByListingId = mapBy(activeListings, "listingId");
  const activeBySku = mapBy(activeListings, "sku");
  const drafts = [];
  const changes = [];

  const nextRecords = normalized.map((record) => {
    if (record.environment !== env) return record;

    const before = canonicalState(record.state);
    const inventory = findInventory(record, byOfferId, inventoryBySku);
    const active = findActive(record, activeByListingId, activeBySku);
    const inventoryState = inventoryStatus(inventory);
    let next = record;

    if (active || inventoryState === "PUBLISHED") {
      next = observed(record, "published", timestamp, active || inventory);
    } else if (inventoryState === "UNPUBLISHED") {
      next = observed(record, "draft", timestamp, inventory);
      drafts.push({
        ...inventory,
        source: "elyon_inventory_draft",
        elyonDraft: true,
        draftCreatedAt: record.createdAt || "",
        draftSourceProductId: record.sourceProductId || "",
      });
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

  return {
    records: nextRecords,
    drafts,
    changes,
    counts: nextRecords.reduce((acc, record) => {
      if (record.environment !== env) return acc;
      const state = canonicalState(record.state);
      acc[state] = (acc[state] || 0) + 1;
      return acc;
    }, { draft: 0, published: 0, removed: 0, ended: 0 }),
    missingConfirmations: threshold,
  };
}

export async function registerElyonDraft(input = {}) {
  const offerId = text(input.offerId, 120);
  const sku = text(input.sku, 120);
  const environment = environmentName(input.environment);
  if (!offerId) return { persisted: false, reason: "offer_id_missing" };

  const records = await readRegistry();
  const index = records.findIndex((record) => sameRecord(record, offerId, sku, environment));
  const timestamp = nowIso();
  const current = index >= 0 ? records[index] : {};
  const next = normalizeRecord({
    ...current,
    offerId,
    sku: sku || current.sku,
    environment,
    state: "draft",
    previousState: current.state && canonicalState(current.state) !== "draft" ? canonicalState(current.state) : current.previousState,
    source: text(input.source || current.source || "elyon_auto_lister", 80),
    sourceProductId: text(input.sourceProductId || current.sourceProductId, 180),
    listingId: "",
    createdAt: current.createdAt || timestamp,
    updatedAt: timestamp,
    lastEbaySyncAt: current.lastEbaySyncAt || "",
    lastSeenAt: timestamp,
    missingSince: "",
    missingCount: 0,
    publishedAt: "",
    withdrawnAt: "",
    removedAt: "",
    endedAt: "",
  });

  if (index >= 0) records[index] = next;
  else records.unshift(next);
  const storage = await writeRegistry(records);
  return { persisted: storage.persisted === true, record: next, storage };
}

export async function markElyonDraftState(input = {}) {
  const offerId = text(input.offerId, 120);
  const sku = text(input.sku, 120);
  const environment = environmentName(input.environment);
  const state = canonicalState(input.state);
  if (!offerId || !["published", "removed", "ended"].includes(state)) {
    return { persisted: false, reason: !offerId ? "offer_id_missing" : "invalid_state" };
  }

  const records = await readRegistry();
  const index = records.findIndex((record) => sameRecord(record, offerId, sku, environment));
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

export async function reconcileElyonDraftRegistry({ environment, inventoryItems = [], activeListings = [] } = {}) {
  const records = await readRegistry();
  const result = reconcileElyonDraftRecords(records, {
    environment,
    inventoryItems,
    activeListings,
  });

  const storage = await writeRegistry(result.records);
  return {
    drafts: result.drafts,
    count: result.drafts.length,
    registered: result.records.filter((record) => record.environment === environmentName(environment)).length,
    lifecycle: {
      counts: result.counts,
      changes: result.changes,
      missingConfirmations: result.missingConfirmations,
    },
    storage,
  };
}

export const ELYON_EBAY_DRAFT_REGISTRY_KEY = REGISTRY_KEY;
export const ELYON_EBAY_MISSING_CONFIRMATIONS = DEFAULT_MISSING_CONFIRMATIONS;
