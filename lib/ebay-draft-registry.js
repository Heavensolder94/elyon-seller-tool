import { readProductMasterList, writeProductMasterList } from "./product-master-store.js";

const REGISTRY_KEY = "elyon_ebay_draft_registry_v1";
const MAX_RECORDS = 500;

function text(value, max = 500) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function environmentName(value) {
  return text(value).toLowerCase() === "sandbox" ? "sandbox" : "production";
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeRecord(record = {}) {
  return {
    offerId: text(record.offerId, 120),
    sku: text(record.sku, 120),
    environment: environmentName(record.environment),
    state: ["draft", "published", "withdrawn"].includes(text(record.state).toLowerCase())
      ? text(record.state).toLowerCase()
      : "draft",
    source: text(record.source || "elyon", 80),
    sourceProductId: text(record.sourceProductId, 180),
    listingId: text(record.listingId, 120),
    createdAt: text(record.createdAt, 80),
    updatedAt: text(record.updatedAt, 80),
    publishedAt: text(record.publishedAt, 80),
    withdrawnAt: text(record.withdrawnAt, 80),
    lastSeenAt: text(record.lastSeenAt, 80),
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
    source: text(input.source || current.source || "elyon_auto_lister", 80),
    sourceProductId: text(input.sourceProductId || current.sourceProductId, 180),
    listingId: "",
    createdAt: current.createdAt || timestamp,
    updatedAt: timestamp,
    publishedAt: "",
    withdrawnAt: "",
    lastSeenAt: timestamp,
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
  const state = text(input.state).toLowerCase();
  if (!offerId || !["published", "withdrawn"].includes(state)) {
    return { persisted: false, reason: !offerId ? "offer_id_missing" : "invalid_state" };
  }

  const records = await readRegistry();
  const index = records.findIndex((record) => sameRecord(record, offerId, sku, environment));
  if (index < 0) return { persisted: false, reason: "not_registered" };

  const timestamp = nowIso();
  const next = normalizeRecord({
    ...records[index],
    state,
    listingId: text(input.listingId || records[index].listingId, 120),
    updatedAt: timestamp,
    lastSeenAt: timestamp,
    ...(state === "published" ? { publishedAt: timestamp } : {}),
    ...(state === "withdrawn" ? { withdrawnAt: timestamp } : {}),
  });
  records[index] = next;
  const storage = await writeRegistry(records);
  return { persisted: storage.persisted === true, record: next, storage };
}

export async function reconcileElyonDraftRegistry({ environment, inventoryItems = [] } = {}) {
  const env = environmentName(environment);
  const records = await readRegistry();
  const offers = Array.isArray(inventoryItems) ? inventoryItems : [];
  const byOfferId = new Map(offers.map((item) => [text(item?.offerId, 120), item]).filter(([key]) => key));
  const bySku = new Map(offers.map((item) => [text(item?.sku, 120), item]).filter(([key]) => key));
  const drafts = [];
  let changed = false;
  const timestamp = nowIso();

  const nextRecords = records.map((record) => {
    if (record.environment !== env) return record;
    const current = (record.offerId && byOfferId.get(record.offerId)) || (record.sku && bySku.get(record.sku)) || null;
    if (!current) return record;

    const status = text(current.status, 40).toUpperCase();
    if (record.state === "draft" && status === "UNPUBLISHED") {
      drafts.push({
        ...current,
        source: "elyon_inventory_draft",
        elyonDraft: true,
        draftCreatedAt: record.createdAt || "",
        draftSourceProductId: record.sourceProductId || "",
      });
      if (record.lastSeenAt !== timestamp) {
        changed = true;
        return normalizeRecord({ ...record, updatedAt: timestamp, lastSeenAt: timestamp });
      }
      return record;
    }

    if (record.state === "draft" && status === "PUBLISHED") {
      changed = true;
      return normalizeRecord({
        ...record,
        state: "published",
        listingId: text(current.listingId || record.listingId, 120),
        updatedAt: timestamp,
        lastSeenAt: timestamp,
        publishedAt: record.publishedAt || timestamp,
      });
    }

    return record;
  });

  let storage = { persisted: false, mode: "read_only" };
  if (changed) storage = await writeRegistry(nextRecords);
  return {
    drafts,
    count: drafts.length,
    registered: records.filter((record) => record.environment === env).length,
    storage,
  };
}

export const ELYON_EBAY_DRAFT_REGISTRY_KEY = REGISTRY_KEY;
