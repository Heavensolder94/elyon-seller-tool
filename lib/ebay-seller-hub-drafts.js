import { ebayApiRoot, ebayUserSession, normalizeEbayEnvironment, serviceError } from "./ebay-production.js";

const SELLER_HUB_DRAFT_FEED_TYPE = "FX_LISTING";
const SELLER_HUB_SCHEMA_VERSION = "1.0";
const DEFAULT_MARKETPLACE_ID = "EBAY_DE";
const DRAFT_DESCRIPTION_MAX = 30000;
const DRAFT_IMAGE_MAX = 12;

const CONDITION_ENUM_TO_ID = Object.freeze({
  NEW: "1000",
  NEW_OTHER: "1500",
  NEW_WITH_DEFECTS: "1750",
  CERTIFIED_REFURBISHED: "2000",
  SELLER_REFURBISHED: "2500",
  LIKE_NEW: "2750",
  USED_EXCELLENT: "3000",
  USED_VERY_GOOD: "4000",
  USED_GOOD: "5000",
  USED_ACCEPTABLE: "6000",
  FOR_PARTS_OR_NOT_WORKING: "7000",
});

function text(value, max = 5000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function normalizedImages(value) {
  const values = Array.isArray(value) ? value : [];
  const unique = [];
  for (const entry of values) {
    const candidate = text(typeof entry === "string" ? entry : entry?.url, 2048);
    if (!candidate || unique.includes(candidate)) continue;
    try {
      if (new URL(candidate).protocol !== "https:") continue;
    } catch {
      continue;
    }
    unique.push(candidate.replace(/ /g, "%20"));
    if (unique.length >= DRAFT_IMAGE_MAX) break;
  }
  return unique;
}

function draftIdentity(input = {}) {
  const source = object(input);
  const explicit = text(source.sku, 50);
  if (explicit) return explicit;
  const sourceProductId = text(source.sourceProductId, 50).replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "");
  return (sourceProductId || `ELYON-${Date.now()}`).slice(0, 50);
}

function conditionId(input = {}) {
  const source = object(input);
  const explicit = text(source.conditionId, 10);
  if (/^\d{3,5}$/.test(explicit)) return explicit;
  return CONDITION_ENUM_TO_ID[text(source.conditionEnum, 50).toUpperCase()] || "";
}

export function buildSellerHubDraftCsv(input = {}) {
  const source = object(input);
  const categoryId = text(source.categoryId, 10);
  if (!/^\d{2,10}$/.test(categoryId)) {
    throw serviceError(400, "ebay_draft_category_missing", "Für den Seller-Hub-Entwurf fehlt eine gültige numerische eBay-Kategorie-ID.");
  }

  const title = text(source.title, 80);
  const sku = draftIdentity(source);
  const images = normalizedImages(source.images);
  const quantity = Math.max(1, Math.min(999, Math.floor(number(source.quantity, 1) || 1)));
  const price = number(source.price, 0);
  const description = text(source.description, DRAFT_DESCRIPTION_MAX);
  const headers = [
    "Action",
    "Custom label (SKU)",
    "Category ID",
    "Title",
    "Condition ID",
    "Item photo URL",
    "Description",
    "Format",
    "Quantity",
    "Start price",
  ];
  const row = [
    "Draft",
    sku,
    categoryId,
    title,
    conditionId(source),
    images.join("|"),
    description,
    "FixedPrice",
    quantity,
    price > 0 ? price.toFixed(2) : "",
  ];

  return {
    csv: `\uFEFF${headers.map(csvCell).join(",")}\r\n${row.map(csvCell).join(",")}\r\n`,
    sku,
    categoryId,
    title,
    imageCount: images.length,
    price: price > 0 ? Number(price.toFixed(2)) : 0,
  };
}

async function parseFeedFailure(response, code, fallback) {
  const raw = await response.text().catch(() => "");
  let details = null;
  try { details = raw ? JSON.parse(raw) : null; }
  catch { details = raw ? { raw } : null; }
  const first = details?.errors?.[0] || {};
  const message = first.longMessage || first.message || details?.message || details?.error || fallback;
  throw serviceError(response.status || 500, code, message, details || undefined);
}

async function createFeedTask(session, marketplaceId) {
  const response = await fetch(`${ebayApiRoot(session.environment)}/sell/feed/v1/task`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      "X-EBAY-C-MARKETPLACE-ID": marketplaceId,
    },
    body: JSON.stringify({
      feedType: SELLER_HUB_DRAFT_FEED_TYPE,
      schemaVersion: SELLER_HUB_SCHEMA_VERSION,
    }),
  });
  if (!response.ok) return parseFeedFailure(response, "ebay_draft_task_create_failed", "eBay konnte den Seller-Hub-Draft-Task nicht erstellen.");
  const location = text(response.headers.get("location"), 1000);
  const taskId = decodeURIComponent(location.split("/").filter(Boolean).pop() || "");
  if (!taskId) {
    throw serviceError(502, "ebay_draft_task_id_missing", "eBay hat für den Seller-Hub-Draft keine Task-ID zurückgegeben.", { location });
  }
  return taskId;
}

async function uploadDraftCsv(session, taskId, csv) {
  const fileName = `elyon-ebay-draft-${Date.now()}.csv`;
  const form = new FormData();
  form.append("file", new Blob([csv], { type: "text/csv;charset=utf-8" }), fileName);
  form.append("fileName", fileName);
  form.append("creationDate", new Date().toISOString());

  const response = await fetch(`${ebayApiRoot(session.environment)}/sell/feed/v1/task/${encodeURIComponent(taskId)}/upload_file`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.accessToken}` },
    body: form,
  });
  if (!response.ok) return parseFeedFailure(response, "ebay_draft_upload_failed", "Der Seller-Hub-Draft konnte nicht zu eBay hochgeladen werden.");
  return { fileName };
}

export async function getSellerHubDraftTask(input = {}, environment) {
  const env = normalizeEbayEnvironment(environment || input?.environment || process.env.EBAY_ENV);
  const taskId = text(input?.taskId, 200);
  if (!taskId) throw serviceError(400, "ebay_draft_task_id_required", "Task-ID für den Seller-Hub-Entwurf fehlt.");
  const session = await ebayUserSession(env);
  const response = await fetch(`${ebayApiRoot(session.environment)}/sell/feed/v1/task/${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  if (!response.ok) return parseFeedFailure(response, "ebay_draft_status_failed", "Der Status des Seller-Hub-Entwurfs konnte nicht geladen werden.");
  const task = await response.json().catch(() => ({}));
  const status = text(task.status, 50).toUpperCase();
  const summary = object(task.uploadSummary);
  const successCount = number(summary.successCount ?? summary.success, 0);
  const failureCount = number(summary.failureCount ?? summary.failed, 0);
  const complete = status === "COMPLETED" || status === "COMPLETED_WITH_ERROR";
  return {
    ok: true,
    taskId,
    status,
    complete,
    draftVisible: status === "COMPLETED" && failureCount === 0 && (successCount > 0 || !Object.keys(summary).length),
    successCount,
    failureCount,
    uploadSummary: summary,
    task,
    message: complete
      ? (failureCount > 0 ? "eBay hat den Draft-Upload mit Fehlern verarbeitet." : "Seller-Hub-Entwurf wurde von eBay verarbeitet.")
      : "Seller-Hub-Entwurf wird von eBay verarbeitet.",
  };
}

export async function createSellerHubDraft(input = {}, environment) {
  const env = normalizeEbayEnvironment(environment || input?.environment || process.env.EBAY_ENV);
  const marketplaceId = text(input?.marketplaceId || process.env.EBAY_MARKETPLACE_ID || DEFAULT_MARKETPLACE_ID, 30);
  const built = buildSellerHubDraftCsv(input);
  const session = await ebayUserSession(env);
  const taskId = await createFeedTask(session, marketplaceId);
  const upload = await uploadDraftCsv(session, taskId, built.csv);

  return {
    ok: true,
    sellerHubDraft: true,
    draftSubmitted: true,
    published: false,
    environment: session.environment,
    marketplaceId,
    feedType: SELLER_HUB_DRAFT_FEED_TYPE,
    schemaVersion: SELLER_HUB_SCHEMA_VERSION,
    taskId,
    sku: built.sku,
    fileName: upload.fileName,
    status: "QUEUED",
    message: "Seller-Hub-Entwurf wurde an eBay übergeben und wird verarbeitet. Er erscheint nach erfolgreicher Verarbeitung unter Angebote → Entwürfe.",
  };
}
