import { readProductMasterList, writeProductMasterList, updateProductMasterListCas } from "./product-master-store.js";
import { planExternalFeedRegistration } from "./ebay-external-feed-identity.js";

const REGISTRY_KEY = "elyon_ebay_draft_registry_v1";
const MAX_RECORDS = 500;
const DEFAULT_MISSING_CONFIRMATIONS = 2;
const VALID_STATES = new Set(["draft", "published", "withdrawn", "removed", "ended", "archived"]);

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
const externalDraftStatus = (value) => ["processing", "confirmed", "failed"].includes(text(value).toLowerCase()) ? text(value).toLowerCase() : "";
const retailPrice = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0.01 && amount <= 100000 ? Math.round(amount * 100) / 100 : null;
};
const feedImages = (value) => (Array.isArray(value) ? value : []).map((url) => text(url, 2000)).filter((url) => /^https:\/\//i.test(url)).slice(0, 8);

function normalizeRecord(record = {}) {
  return {
    offerId: text(record.offerId, 120),
    ...(/^[a-f0-9]{64}$/.test(record.accountId??'')?{accountId:record.accountId}:{}),
    sku: text(record.sku, 120),
    ...(/^ELY-\d{6,}$/.test(record.parentSku??'')?{parentSku:record.parentSku}:{}),
    ...(/^ELY-GROUP-[A-Z0-9_-]{1,40}$/.test(record.groupKey??'')?{groupKey:record.groupKey}:{}),
    environment: environmentName(record.environment),
    state: canonicalState(record.state),
    previousState: text(record.previousState, 40).toLowerCase(),
    visibilityMode: visibilityMode(record.visibilityMode),
    source: text(record.source || "elyon", 80),
    sourceProductId: text(record.sourceProductId, 180),
    listingId: text(record.listingId, 120),
    externalDraftId: text(record.externalDraftId, 180),
    externalTaskId: text(record.externalTaskId, 220),
    externalDraftStatus: externalDraftStatus(record.externalDraftStatus),
    draftTitle: text(record.draftTitle, 200),
    draftPrice: Number.isFinite(Number(record.draftPrice)) && Number(record.draftPrice) >= 0 ? Number(record.draftPrice) : 0,
    draftCurrency: text(record.draftCurrency || "EUR", 12),
    draftImages: feedImages(record.draftImages),
    feedStatusCheckedAt: text(record.feedStatusCheckedAt, 80),
    amazonReferencePrice: retailPrice(record.amazonReferencePrice),
    amazonReferenceCapturedAt: text(record.amazonReferenceCapturedAt, 80),
    createdAt: text(record.createdAt, 80),
    updatedAt: text(record.updatedAt, 80),
    publishedAt: text(record.publishedAt, 80),
    withdrawnAt: text(record.withdrawnAt, 80),
    removedAt: text(record.removedAt || record.withdrawnAt, 80),
    archivedAt: text(record.archivedAt, 80),
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
    // Archiving a processed Feed is only a local ELYON visibility decision.
    // It does not assert deletion on eBay, and snapshots cannot revive it.
    // A newly observed published/API offer is handled separately below.
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
      // Feed-created Seller Hub drafts cannot be listed by the Inventory API.
      // Show only a feed task independently confirmed as processed, not a speculative live draft.
      next = transition(record, "draft", timestamp, { missingCount: 0, missingSince: "" });
      const alreadyInInventory = Boolean(inventory && inventoryState === "UNPUBLISHED");
      if (record.externalDraftStatus === "confirmed" && record.externalTaskId && record.sku && !alreadyInInventory) {
        drafts.push({
          sku: record.sku,
          offerId: "",
          status: "UNPUBLISHED",
          title: record.draftTitle || `eBay Feed-Entwurf ${record.sku}`,
          images: record.draftImages,
          price: record.draftPrice,
          currency: record.draftCurrency || "EUR",
          externalTaskId: record.externalTaskId,
          feedStatusCheckedAt: record.feedStatusCheckedAt,
          amazonReferencePrice: record.amazonReferencePrice,
          amazonReferenceCapturedAt: record.amazonReferenceCapturedAt,
          feedVerification: "feed_processed_not_live_checked",
          source: "elyon_seller_hub_feed",
          elyonDraft: true,
          draftCreatedAt: record.createdAt,
          draftSourceProductId: record.sourceProductId,
        });
      }
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

  const counts = { draft: 0, published: 0, removed: 0, ended: 0, archived: 0 };
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
  const taskId = text(input.externalTaskId, 220);
  // A verified new task may share a SKU with an older archived/removed Feed.
  // Never overwrite that historical record or any currently active draft.
  const plan = taskId ? planExternalFeedRegistration(records, {
    sku, externalTaskId: taskId, sourceProductId, environment,
  }) : null;
  if (plan && !plan.ok) return { persisted: false, reason: plan.reason };
  const index = plan ? plan.index
    : records.findIndex((record) => sameRecord(record, { sku, sourceProductId, environment }));
  const timestamp = nowIso();
  const current = index >= 0 ? records[index] : {};
  const sameArchivedTask = canonicalState(current.state) === "archived"
    && text(current.externalTaskId) && text(current.externalTaskId) === text(input.externalTaskId)
    && visibilityMode(current.visibilityMode) === "seller_hub_feed";
  const next = normalizeRecord({
    ...current,
    sku: sku || current.sku,
    environment,
    state: sameArchivedTask ? "archived" : "draft",
    previousState: sameArchivedTask ? current.previousState : current.state && canonicalState(current.state) !== "draft" ? canonicalState(current.state) : current.previousState,
    visibilityMode: "seller_hub_feed",
    source: text(input.source || current.source || "company_os_seller_hub_feed", 80),
    sourceProductId: sourceProductId || current.sourceProductId,
    externalDraftId: text(input.externalDraftId || current.externalDraftId, 180),
    externalTaskId: text(input.externalTaskId || current.externalTaskId, 220),
    externalDraftStatus: current.externalDraftStatus === "confirmed" && input.externalDraftStatus === "processing"
      ? "confirmed" : externalDraftStatus(input.externalDraftStatus || current.externalDraftStatus),
    draftTitle: text(input.draftTitle || current.draftTitle, 200),
    draftPrice: input.draftPrice === undefined ? current.draftPrice : Number(input.draftPrice),
    draftCurrency: text(input.draftCurrency || current.draftCurrency || "EUR", 12),
    draftImages: Array.isArray(input.draftImages) && input.draftImages.length ? input.draftImages : current.draftImages,
    feedStatusCheckedAt: input.externalDraftStatus === "confirmed" ? timestamp : current.feedStatusCheckedAt,
    amazonReferencePrice: retailPrice(input.amazonReferencePrice) ?? current.amazonReferencePrice ?? null,
    amazonReferenceCapturedAt: retailPrice(input.amazonReferencePrice) !== null
      ? text(input.amazonReferenceCapturedAt || timestamp, 80) : current.amazonReferenceCapturedAt,
    createdAt: current.createdAt || timestamp,
    updatedAt: timestamp,
    missingCount: 0,
    missingSince: "",
    removedAt: "",
    withdrawnAt: "",
    endedAt: "",
    archivedAt: sameArchivedTask ? current.archivedAt : "",
  });
  if (index >= 0) records[index] = next; else records.unshift(next);
  const storage = await writeRegistry(records);
  if (storage.persisted !== true) {
    return { persisted: false, reason: "storage_unavailable", record: next, storage };
  }
  if (taskId) {
    // An HTTP 200 from Redis alone must never be mistaken for a durable
    // registry write. Verify the precise SKU + task identity after saving.
    const confirmed = (await readRegistry()).filter((entry) =>
      entry.environment === environment
      && entry.visibilityMode === "seller_hub_feed"
      && entry.sku.toUpperCase() === sku.toUpperCase()
      && entry.externalTaskId === taskId);
    if (confirmed.length !== 1) {
      return { persisted: false, reason: "storage_confirmation_missing", record: next, storage };
    }
  }
  return { persisted: true, record: next, storage };
}

// Exact Company OS Feed reconciliation. A task ID is never a fuzzy SKU match.
export function findExactCompanyFeedRecord(records = [], input = {}) {
  const taskId = text(input.externalTaskId || input.taskId, 220);
  const productId = text(input.sourceProductId, 180);
  if (!taskId || !productId) return null;
  const matches = records.filter(record => record.environment === environmentName(input.environment)
    && record.visibilityMode === "seller_hub_feed"
    && record.externalTaskId === taskId && record.sourceProductId === productId
    && (!input.sku || record.sku === text(input.sku, 120))
    && (!input.externalDraftId || record.externalDraftId === text(input.externalDraftId, 180))
    && (!input.listingId || record.listingId === text(input.listingId, 120)));
  return matches.length === 1 ? matches[0] : null;
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
  const exact = input.requireExactCompanyFeed === true;
  const match = exact ? findExactCompanyFeedRecord(records, {...input, ...identity}) : null;
  const index = exact ? records.indexOf(match) : records.findIndex((record) => sameRecord(record, identity));
  if (index < 0) return { persisted: false, reason: "not_registered" };
  if (exact && (state !== "removed" || !["draft", "removed"].includes(records[index].state) || records[index].listingId)) {
    return { persisted: false, reason: "feed_not_unpublished_draft" };
  }
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


/**
 * Conservative manual cleanup: a Seller Hub FX_DRAFT can be deleted without
 * an observable API draft-deletion event. The seller explicitly confirms its
 * removal, then ELYON marks only the uniquely matched *active Feed* as removed.
 * This does not delete anything from eBay or delete registry history.
 */
export function planManuallyDeletedSellerHubFeed(records = [], input = {}, timestamp = nowIso()) {
  const sku = text(input.sku, 120).toUpperCase();
  const externalTaskId = text(input.externalTaskId, 220);
  const environment = environmentName(input.environment);
  if (!/^AMZ-[A-Z0-9]{10}$/.test(sku) || !externalTaskId) {
    return { ok: false, reason: "manual_feed_identity_missing" };
  }
  const list = (Array.isArray(records) ? records : []).map(normalizeRecord);
  const sameSku = list.map((record, index) => ({ record, index })).filter(({ record }) =>
    record.environment === environment && record.sku.toUpperCase() === sku);
  const active = sameSku.filter(({ record }) => record.state === "draft");
  const candidate = active.filter(({ record }) =>
    record.visibilityMode === "seller_hub_feed" && record.externalTaskId === externalTaskId);
  const alreadyRemoved = sameSku.filter(({ record }) =>
    record.visibilityMode === "seller_hub_feed" && record.externalTaskId === externalTaskId && record.state === "removed");
  if (!candidate.length && alreadyRemoved.length === 1 && active.length === 0) {
    return { ok: true, alreadyRemoved: true, records: list, record: alreadyRemoved[0].record };
  }
  if (active.length !== 1 || candidate.length !== 1) {
    return { ok: false, reason: active.length > 1 ? "manual_feed_active_sku_ambiguous" : "manual_feed_task_mismatch" };
  }
  const { record, index } = candidate[0];
  if (record.offerId || record.listingId || record.state !== "draft"
    || !["confirmed", "processing"].includes(record.externalDraftStatus)) {
    return { ok: false, reason: "manual_feed_not_eligible" };
  }
  if (sameSku.some(({ record: other }) => other.state === "published")) {
    return { ok: false, reason: "manual_feed_has_published_listing" };
  }
  const removed = transition(record, "removed", timestamp, {
    removedAt: timestamp,
    withdrawnAt: timestamp,
    missingCount: 0,
    missingSince: "",
  });
  list[index] = removed;
  return { ok: true, alreadyRemoved: false, records: list, record: removed };
}

export async function previewManuallyDeletedSellerHubFeed(input = {}) {
  const sku = text(input.sku, 120).toUpperCase();
  if (!/^AMZ-[A-Z0-9]{10}$/.test(sku)) return { ok: false, reason: "manual_feed_identity_missing" };
  const records = await readRegistry();
  const environment = environmentName(input.environment);
  const matching = records.filter(record => record.environment === environment && record.sku.toUpperCase() === sku);
  const active = matching.filter(record => record.state === "draft");
  if (active.length !== 1) {
    return { ok: false, reason: active.length > 1 ? "manual_feed_active_sku_ambiguous" : "manual_feed_not_registered" };
  }
  const candidate = active[0];
  if (candidate.visibilityMode !== "seller_hub_feed" || !candidate.externalTaskId
    || candidate.offerId || candidate.listingId
    || !["confirmed", "processing"].includes(candidate.externalDraftStatus)
    || matching.some(record => record.state === "published")) {
    return { ok: false, reason: "manual_feed_not_eligible" };
  }
  return { ok: true, record: {
    sku: candidate.sku,
    externalTaskId: candidate.externalTaskId,
    title: candidate.draftTitle,
    state: candidate.state,
    sourceProductId: candidate.sourceProductId,
    environment: candidate.environment,
  } };
}

export async function markManuallyDeletedSellerHubFeed(input = {}) {
  const result = planManuallyDeletedSellerHubFeed(await readRegistry(), input);
  if (!result.ok) return { persisted: false, reason: result.reason };
  if (result.alreadyRemoved) return { persisted: true, alreadyRemoved: true, record: result.record };
  const storage = await writeRegistry(result.records);
  if (storage.persisted !== true) return { persisted: false, reason: "storage_unavailable" };
  const matching = (await readRegistry()).filter(record =>
    record.environment === result.record.environment
    && record.sku === result.record.sku
    && record.externalTaskId === result.record.externalTaskId
    && record.visibilityMode === "seller_hub_feed" && record.state === "removed");
  if (matching.length !== 1) return { persisted: false, reason: "storage_confirmation_missing" };
  return { persisted: true, alreadyRemoved: false, record: matching[0] };
}

/**
 * Archive a processed Seller Hub feed LOCALLY while preserving its task identity,
 * processing evidence, SKU and product relationship. This is not eBay deletion.
 */
export function archiveProcessedFeedRecord(records = [], input = {}, timestamp = nowIso()) {
  const sku = text(input.sku, 120).toUpperCase();
  const externalTaskId = text(input.externalTaskId, 220);
  const environment = environmentName(input.environment);
  if (!/^AMZ-[A-Z0-9]{10}$/.test(sku) || !externalTaskId) {
    return { ok: false, reason: "stable_feed_identity_missing" };
  }
  const list = (Array.isArray(records) ? records : []).map(normalizeRecord);
  const matches = list.map((record, index) => ({ record, index })).filter(({ record }) =>
    record.environment === environment && record.visibilityMode === "seller_hub_feed"
    && record.sku.toUpperCase() === sku && record.externalTaskId === externalTaskId);
  if (matches.length !== 1) return { ok: false, reason: "feed_identity_not_unique" };
  const { record, index } = matches[0];
  if (record.state === "archived") return { ok: true, alreadyArchived: true, records: list, record };
  if (record.state !== "draft" || record.externalDraftStatus !== "confirmed" || record.offerId) {
    return { ok: false, reason: "not_a_processed_feed" };
  }
  const archived = transition(record, "archived", timestamp, { archivedAt: timestamp });
  list[index] = archived;
  return { ok: true, alreadyArchived: false, records: list, record: archived };
}

export async function archiveElyonProcessedFeed(input = {}) {
  const result = archiveProcessedFeedRecord(await readRegistry(), input);
  if (!result.ok) return { persisted: false, reason: result.reason };
  if (result.alreadyArchived) return { persisted: true, alreadyArchived: true, record: result.record };
  const storage = await writeRegistry(result.records);
  return { persisted: storage.persisted === true, record: result.record, storage, alreadyArchived: false };
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


// No fuzzy matching, implicit account adoption, overwrite of another task or
// truncation of registry history is permitted by the canonical first release.
export async function registerCanonicalInventoryIdentity(input,options={}){
 const fail=()=>{throw Object.assign(Error('canonical_registry_identity_conflict'),{code:'canonical_registry_identity_conflict',status:409});};
 const {offerId,sku,sourceProductId,accountId,environment}=input??{};
 if(environment!=='production'||!/^[a-f0-9]{64}$/.test(accountId??'')||!/^[A-Za-z0-9_-]{1,120}$/.test(offerId??'')||!/^ELY-\d{6,}$/.test(sku??'')||!sourceProductId||text(sourceProductId,180)!==sourceProductId)fail();
 const storage=await updateProductMasterListCas(REGISTRY_KEY,records=>{
  if(records.some(r=>!r||typeof r!=='object'||Array.isArray(r)||!['production','sandbox'].includes(r.environment)||!['draft','published','withdrawn','removed','ended','archived'].includes(r.state)))fail();
  const conflicts=records.filter(r=>r.environment===environment&&(r.offerId===offerId||String(r.sku??'').toUpperCase()===sku.toUpperCase()||r.sourceProductId===sourceProductId));
  if(conflicts.length){
   if(conflicts.length!==1)fail();
   const r=conflicts[0];
   if(r.accountId!==accountId||r.offerId!==offerId||r.sku!==sku||r.sourceProductId!==sourceProductId||r.visibilityMode!=='inventory_offer'||r.state!=='draft'||r.listingId)fail();
   return records;
  }
  if(records.length>=MAX_RECORDS)fail();
  return [normalizeRecord({offerId,sku,environment,accountId,sourceProductId,visibilityMode:'inventory_offer',state:'draft',source:'company_os_canonical_inventory',createdAt:nowIso(),updatedAt:nowIso(),lastSeenAt:nowIso()}),...records];
 },options);
 return {...storage,count:1,accountId,accountVerified:true};
}

/** A complete exact Inventory group is registered atomically, never row by row.
 * Existing single-SKU and legacy records are not adopted or overwritten. */
export async function registerCanonicalVariantInventoryGroup(input,options={}){
 const fail=()=>{throw Object.assign(Error('canonical_registry_variant_identity_conflict'),{code:'canonical_registry_variant_identity_conflict',status:409});};
 const {offers,parentSku,groupKey,sourceProductId,accountId,environment}=input??{};
 if(environment!=='production'||!/^[a-f0-9]{64}$/.test(accountId??'')||!/^ELY-\d{6,}$/.test(parentSku??'')||!/^ELY-GROUP-[A-Z0-9_-]{1,40}$/.test(groupKey??'')||!sourceProductId||text(sourceProductId,180)!==sourceProductId||!Array.isArray(offers)||offers.length<2||offers.length>100||offers.some(o=>!o||!/^[A-Za-z0-9_-]{1,120}$/.test(o.offerId??'')||typeof o.sku!=='string'||!o.sku.startsWith(parentSku+'-')||!/^\d{10}$/.test(o.sku.slice(parentSku.length+1)))||new Set(offers.map(o=>o.offerId)).size!==offers.length||new Set(offers.map(o=>o.sku)).size!==offers.length)fail();
 const ids=new Set(offers.map(o=>o.offerId)),skus=new Set([parentSku,...offers.map(o=>o.sku)]);
 const storage=await updateProductMasterListCas(REGISTRY_KEY,records=>{
  if(records.some(r=>!r||typeof r!=='object'||Array.isArray(r)||!['production','sandbox'].includes(r.environment)||!['draft','published','withdrawn','removed','ended','archived'].includes(r.state)))fail();
  const conflicts=records.filter(r=>r.environment===environment&&(ids.has(r.offerId)||skus.has(String(r.sku??'').toUpperCase())||r.sourceProductId===sourceProductId||r.parentSku===parentSku||r.groupKey===groupKey));
  if(conflicts.length){
   if(conflicts.length!==offers.length||!offers.every(o=>conflicts.filter(r=>r.accountId===accountId&&r.offerId===o.offerId&&r.sku===o.sku&&r.parentSku===parentSku&&r.groupKey===groupKey&&r.sourceProductId===sourceProductId&&r.visibilityMode==='inventory_offer'&&r.state==='draft'&&!r.listingId).length===1))fail();
   return records;
  }
  if(records.length+offers.length>MAX_RECORDS)fail();
  const time=nowIso();
  return [...offers.map(o=>normalizeRecord({...o,parentSku,groupKey,environment,accountId,sourceProductId,visibilityMode:'inventory_offer',state:'draft',source:'company_os_canonical_inventory',createdAt:time,updatedAt:time,lastSeenAt:time})),...records];
 },options);
 return {...storage,count:offers.length,parentSku,groupKey,accountId,accountVerified:true};
}
