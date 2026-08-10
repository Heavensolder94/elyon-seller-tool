import {
  callEbayJson,
  ebayApiRoot,
  ebayUserSession,
  normalizeEbayEnvironment,
  publicEbayError,
} from "../../lib/ebay-production.js";
import { requireSellerAccess } from "../../lib/seller-access.js";

const INVENTORY_PAGE_LIMIT = 100;
const OFFER_PAGE_LIMIT = 25;
const OFFER_FETCH_CONCURRENCY = 8;
const MAX_INVENTORY_PAGES = 100;
const MAX_OFFER_PAGES_PER_SKU = 10;

function text(value, max = 1000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function environmentFrom(req) {
  return normalizeEbayEnvironment(req?.query?.environment || req?.query?.env || process.env.EBAY_ENV);
}

function ebayHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "Content-Language": "de-DE",
    "Accept-Language": "de-DE",
    "X-EBAY-C-MARKETPLACE-ID": "EBAY_DE",
  };
}

async function fetchInventoryItems(root, headers) {
  const items = [];
  let offset = 0;
  let total = null;

  for (let page = 0; page < MAX_INVENTORY_PAGES; page += 1) {
    const data = await callEbayJson(`${root}/sell/inventory/v1/inventory_item?limit=${INVENTORY_PAGE_LIMIT}&offset=${offset}`, { headers });
    const pageItems = Array.isArray(data.inventoryItems) ? data.inventoryItems : [];
    const reportedTotal = Number(data.total);
    if (Number.isFinite(reportedTotal)) total = reportedTotal;
    items.push(...pageItems);

    if (!pageItems.length || pageItems.length < INVENTORY_PAGE_LIMIT || (total !== null && items.length >= total)) break;
    offset += pageItems.length;
  }

  return items;
}

async function fetchOffersForSku(root, headers, sku) {
  const offers = [];
  let offset = 0;
  let total = null;

  for (let page = 0; page < MAX_OFFER_PAGES_PER_SKU; page += 1) {
    const endpoint = `${root}/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}&limit=${OFFER_PAGE_LIMIT}&offset=${offset}`;
    const data = await callEbayJson(endpoint, { headers });
    const pageOffers = Array.isArray(data.offers) ? data.offers : [];
    const reportedTotal = Number(data.total);
    if (Number.isFinite(reportedTotal)) total = reportedTotal;
    offers.push(...pageOffers);

    if (!pageOffers.length || pageOffers.length < OFFER_PAGE_LIMIT || (total !== null && offers.length >= total)) break;
    offset += pageOffers.length;
  }

  return offers;
}

async function mapConcurrent(values, concurrency, worker) {
  const source = Array.isArray(values) ? values : [];
  const results = new Array(source.length);
  let cursor = 0;

  async function run() {
    while (cursor < source.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(source[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), source.length) }, () => run());
  await Promise.all(workers);
  return results;
}

function normalizeListing(offer, inventoryItem) {
  const product = inventoryItem?.product && typeof inventoryItem.product === "object" ? inventoryItem.product : {};
  const listing = offer?.listing && typeof offer.listing === "object" ? offer.listing : {};
  const status = text(offer?.status, 40).toUpperCase();
  const listingStatus = text(listing.listingStatus, 40).toUpperCase();
  const imageUrls = Array.isArray(product.imageUrls) ? product.imageUrls.map((url) => text(url, 2000)).filter(Boolean) : [];

  return {
    offerId: text(offer?.offerId, 120),
    sku: text(offer?.sku || inventoryItem?.sku, 120),
    status,
    listingId: text(listing.listingId || offer?.listingId, 120),
    listingStatus,
    title: text(product.title || offer?.title, 200),
    description: text(product.description, 2000),
    images: imageUrls,
    price: number(offer?.pricingSummary?.price?.value || offer?.price?.value),
    currency: text(offer?.pricingSummary?.price?.currency || offer?.price?.currency || "EUR", 12),
    quantity: number(offer?.availableQuantity ?? inventoryItem?.availability?.shipToLocationAvailability?.quantity),
    marketplaceId: text(offer?.marketplaceId, 40),
    inventoryItemGroupKey: text(inventoryItem?.groupIds?.[0] || inventoryItem?.inventoryItemGroupKey, 120),
    lastModifiedDate: text(offer?.lastModifiedDate || inventoryItem?.lastModifiedDate, 80),
  };
}

function summarize(items) {
  return items.reduce((counts, item) => {
    if (item.status === "PUBLISHED") counts.active += 1;
    else if (item.status === "UNPUBLISHED") counts.drafts += 1;
    else counts.other += 1;
    return counts;
  }, { active: 0, drafts: 0, other: 0 });
}

export async function fetchEbayListingSnapshot(environment) {
  const session = await ebayUserSession(environment);
  const root = ebayApiRoot(session.environment);
  const headers = ebayHeaders(session.accessToken);
  const inventoryItems = await fetchInventoryItems(root, headers);
  const validInventoryItems = inventoryItems.filter((item) => text(item?.sku));

  const offerGroups = await mapConcurrent(validInventoryItems, OFFER_FETCH_CONCURRENCY, async (inventoryItem) => {
    const offers = await fetchOffersForSku(root, headers, text(inventoryItem.sku));
    return offers.map((offer) => normalizeListing(offer, inventoryItem));
  });

  const deduped = new Map();
  offerGroups.flat().forEach((item) => {
    const key = item.offerId || `${item.sku}:${item.marketplaceId}:${item.status}:${item.listingId}`;
    if (key) deduped.set(key, item);
  });
  const items = [...deduped.values()];

  return {
    environment: session.environment,
    items,
    counts: summarize(items),
    total: items.length,
    inventoryItemCount: validInventoryItems.length,
    syncedAt: new Date().toISOString(),
    source: "ebay_inventory_api",
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (String(req?.method || "GET").toUpperCase() !== "GET") {
    return res.status(405).json({ ok: false, error: "method_not_allowed", message: "Diese Route unterstützt nur GET." });
  }
  if (!requireSellerAccess(req, res, { maxBodyBytes: 64 * 1024 })) return;

  try {
    const result = await fetchEbayListingSnapshot(environmentFrom(req));
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json(publicEbayError(error));
  }
}
