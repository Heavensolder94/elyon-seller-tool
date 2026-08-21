import { fetchEbayListingSnapshot as fetchInventoryOfferSnapshot } from "./listings.js";
import { reconcileElyonDraftRegistry } from "../../lib/ebay-draft-registry.js";
import {
  ebayApiRoot,
  ebayUserSession,
  normalizeEbayEnvironment,
  publicEbayError,
  serviceError,
} from "../../lib/ebay-production.js";
import { requireSellerAccess } from "../../lib/seller-access.js";

const TRADING_PAGE_SIZE = 200;
const MAX_TRADING_PAGES = 125;
const TRADING_API_VERSION = "1455";

function text(value, max = 5000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function environmentFrom(req) {
  return normalizeEbayEnvironment(req?.query?.environment || req?.query?.env || process.env.EBAY_ENV);
}

function decodeXml(value) {
  return String(value ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .trim();
}

function tagValue(xml, tagName, max = 5000) {
  const match = String(xml ?? "").match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return text(decodeXml(match?.[1] || ""), max);
}

function tagBlocks(xml, tagName) {
  const blocks = [];
  const pattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tagName}>`, "gi");
  let match;
  while ((match = pattern.exec(String(xml ?? "")))) blocks.push(match[0]);
  return blocks;
}

function tradingRequest(pageNumber) {
  return `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ActiveList>
    <Include>true</Include>
    <Pagination>
      <EntriesPerPage>${TRADING_PAGE_SIZE}</EntriesPerPage>
      <PageNumber>${pageNumber}</PageNumber>
    </Pagination>
  </ActiveList>
</GetMyeBaySellingRequest>`;
}

function normalizeActiveItem(itemXml) {
  const pictureDetails = tagValue(itemXml, "PictureDetails", 12000);
  const sellingStatus = tagValue(itemXml, "SellingStatus", 12000);
  const listingDetails = tagValue(itemXml, "ListingDetails", 12000);
  const image = tagValue(pictureDetails, "GalleryURL", 2000) || tagValue(pictureDetails, "PictureURL", 2000);

  return {
    offerId: "",
    sku: tagValue(itemXml, "SKU", 120),
    status: "PUBLISHED",
    listingId: tagValue(itemXml, "ItemID", 120),
    listingStatus: "ACTIVE",
    title: tagValue(itemXml, "Title", 200),
    images: image ? [image] : [],
    price: number(tagValue(sellingStatus, "CurrentPrice", 80) || tagValue(itemXml, "StartPrice", 80)),
    currency: "EUR",
    quantity: number(tagValue(itemXml, "QuantityAvailable", 40) || tagValue(itemXml, "Quantity", 40)),
    marketplaceId: "EBAY_DE",
    listingUrl: tagValue(listingDetails, "ViewItemURL", 2000),
    startTime: tagValue(listingDetails, "StartTime", 80),
    endTime: tagValue(listingDetails, "EndTime", 80),
    source: "ebay_trading_get_myeBaySelling_active",
  };
}

function errorDetails(xml) {
  return tagBlocks(xml, "Errors").map((block) => ({
    code: tagValue(block, "ErrorCode", 80),
    severity: tagValue(block, "SeverityCode", 80),
    shortMessage: tagValue(block, "ShortMessage", 500),
    longMessage: tagValue(block, "LongMessage", 2000),
  }));
}

async function fetchSellerHubActiveListings(session) {
  const items = [];
  let totalPages = 1;
  let totalEntries = 0;

  for (let page = 1; page <= Math.min(totalPages, MAX_TRADING_PAGES); page += 1) {
    const response = await fetch(`${ebayApiRoot(session.environment)}/ws/api.dll`, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml",
        "X-EBAY-API-CALL-NAME": "GetMyeBaySelling",
        "X-EBAY-API-COMPATIBILITY-LEVEL": process.env.EBAY_TRADING_API_VERSION || TRADING_API_VERSION,
        "X-EBAY-API-SITEID": "77",
        "X-EBAY-API-IAF-TOKEN": session.accessToken,
      },
      body: tradingRequest(page),
    });
    const xml = await response.text();
    const ack = tagValue(xml, "Ack", 40).toUpperCase();
    if (!response.ok || ack === "FAILURE" || ack === "PARTIALFAILURE") {
      const errors = errorDetails(xml);
      const first = errors.find((entry) => entry.longMessage || entry.shortMessage);
      throw serviceError(
        response.status || 502,
        "ebay_seller_hub_active_failed",
        first?.longMessage || first?.shortMessage || `GetMyeBaySelling fehlgeschlagen (HTTP ${response.status}).`,
        { ack, errors },
      );
    }

    const activeList = tagValue(xml, "ActiveList", 2_000_000);
    const pagination = tagValue(activeList, "PaginationResult", 5000);
    totalPages = Math.max(1, Math.min(number(tagValue(pagination, "TotalNumberOfPages", 40)) || 1, MAX_TRADING_PAGES));
    totalEntries = number(tagValue(pagination, "TotalNumberOfEntries", 40));
    const itemArray = tagValue(activeList, "ItemArray", 2_000_000);
    items.push(...tagBlocks(itemArray, "Item").map(normalizeActiveItem));
  }

  const deduped = new Map(items.filter((item) => item.listingId).map((item) => [item.listingId, item]));
  return { items: [...deduped.values()], total: totalEntries || deduped.size };
}

export async function fetchSellerState(environment) {
  const session = await ebayUserSession(environment);
  const [activeResult, inventoryResult] = await Promise.allSettled([
    fetchSellerHubActiveListings(session),
    fetchInventoryOfferSnapshot(session.environment),
  ]);

  // Active-list retrieval is authoritative for live listings. If it fails, do
  // not reconcile absences into ended/removed states.
  if (activeResult.status !== "fulfilled") throw activeResult.reason;

  const activeListings = activeResult.value.items;
  const inventorySnapshot = inventoryResult.status === "fulfilled"
    ? inventoryResult.value
    : { items: [], counts: { active: 0, drafts: 0, other: 0 }, total: 0, inventoryItemCount: 0, error: text(inventoryResult.reason?.message) };

  let draftItems = [];
  let draftRegistry = {
    count: 0,
    registered: 0,
    lifecycle: { counts: { draft: 0, published: 0, removed: 0, ended: 0 }, changes: [], missingConfirmations: 2 },
    storage: { persisted: false, mode: "unavailable" },
  };
  let draftError = "";

  // Missing records are only meaningful when BOTH eBay snapshots succeeded.
  // This prevents token errors/timeouts from being interpreted as deletion.
  if (inventoryResult.status === "fulfilled") {
    try {
      draftRegistry = await reconcileElyonDraftRegistry({
        environment: session.environment,
        inventoryItems: inventorySnapshot.items,
        activeListings,
      });
      draftItems = draftRegistry.drafts;
    } catch (error) {
      draftError = text(error?.message);
    }
  } else {
    draftError = text(inventoryResult.reason?.message);
  }

  const items = [...draftItems, ...activeListings];
  const lifecycleCounts = draftRegistry.lifecycle?.counts || {};

  return {
    environment: session.environment,
    items,
    activeListings,
    draftItems,
    elyonDrafts: {
      readable: !draftError,
      count: draftItems.length,
      items: draftItems,
      source: "elyon_draft_registry_plus_ebay_inventory",
      registered: number(draftRegistry.registered),
      message: draftError
        ? `Elyon-Entwürfe konnten nicht vollständig geprüft werden: ${draftError}`
        : "Elyon gleicht Entwürfe und Listings über stabile eBay-IDs/SKUs ab. Ein Fehlen wird erst nach zwei erfolgreichen eBay-Abgleichen als entfernt oder beendet gewertet.",
    },
    ebayLifecycle: {
      reliable: !draftError,
      missingConfirmations: number(draftRegistry.lifecycle?.missingConfirmations) || 2,
      counts: {
        draft: number(lifecycleCounts.draft),
        active: number(lifecycleCounts.published),
        removed: number(lifecycleCounts.removed),
        ended: number(lifecycleCounts.ended),
      },
      changes: Array.isArray(draftRegistry.lifecycle?.changes) ? draftRegistry.lifecycle.changes : [],
      safety: "absence_requires_two_successful_snapshots",
    },
    inventoryOffers: {
      ...inventorySnapshot,
      source: "ebay_inventory_api_diagnostic_only",
    },
    counts: {
      active: activeListings.length,
      drafts: draftItems.length,
      removed: number(lifecycleCounts.removed),
      ended: number(lifecycleCounts.ended),
      inventoryUnpublished: number(inventorySnapshot?.counts?.drafts),
      inventoryPublished: number(inventorySnapshot?.counts?.active),
      inventoryOther: number(inventorySnapshot?.counts?.other),
    },
    draftsAvailable: !draftError,
    draftError,
    total: items.length,
    syncedAt: new Date().toISOString(),
    source: "ebay_seller_state",
    activeSource: "ebay_trading_get_myeBaySelling_active",
    draftSource: "elyon_draft_registry_plus_ebay_inventory",
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
    return res.status(200).json({ ok: true, ...(await fetchSellerState(environmentFrom(req))) });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json(publicEbayError(error));
  }
}
