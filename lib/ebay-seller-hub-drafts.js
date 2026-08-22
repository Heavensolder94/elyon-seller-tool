import { gunzipSync } from "node:zlib";
import { ebayApiRoot, ebayUserSession, normalizeEbayEnvironment, serviceError } from "./ebay-production.js";

const SELLER_HUB_DRAFT_FEED_TYPE = "FX_LISTING";
const SELLER_HUB_SCHEMA_VERSION = "1.0";
const DEFAULT_MARKETPLACE_ID = "EBAY_DE";
const DRAFT_DESCRIPTION_MAX = 30000;
const DRAFT_IMAGE_MAX = 24;
const RESULT_PREVIEW_MAX = 3000;

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
      if (!["http:", "https:"].includes(new URL(candidate).protocol)) continue;
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

function draftCondition(input = {}) {
  const source = object(input);
  const explicit = text(source.condition, 20).toUpperCase();
  if (explicit === "NEW" || explicit === "USED") return explicit;

  const conditionEnum = text(source.conditionEnum, 50).toUpperCase();
  if (conditionEnum.startsWith("NEW")) return "NEW";
  if (conditionEnum) return "USED";

  const conditionId = text(source.conditionId, 10);
  if (["1000", "1500", "1750"].includes(conditionId)) return "NEW";
  if (/^\d{3,5}$/.test(conditionId)) return "USED";
  return "";
}

function normalizedUpc(input = {}) {
  const source = object(input);
  const candidate = text(source.upc || source.UPC, 20).replace(/\D/g, "");
  return /^\d{12}$/.test(candidate) ? candidate : "";
}

function normalizedDescription(value) {
  return text(value, DRAFT_DESCRIPTION_MAX)
    .replace(/\r\n|\r|\n/g, "<br>")
    .slice(0, DRAFT_DESCRIPTION_MAX);
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
  const description = normalizedDescription(source.description);
  const condition = draftCondition(source);
  const upc = normalizedUpc(source);

  // Keep this aligned with eBay's current "Create new drafts" Seller Hub Reports template.
  // For drafts, eBay expects the generic NEW/USED condition values and the header "Price".
  const headers = [
    "Action",
    "Custom label (SKU)",
    "Category ID",
    "Title",
    "UPC",
    "Price",
    "Quantity",
    "Item photo URL",
    "Condition ID",
    "Description",
    "Format",
  ];
  const row = [
    "Draft",
    sku,
    categoryId,
    title,
    upc,
    price > 0 ? price.toFixed(2) : "",
    quantity,
    images.join("|"),
    condition,
    description,
    "FixedPrice",
  ];

  return {
    csv: `\uFEFF${headers.map(csvCell).join(",")}\r\n${row.map(csvCell).join(",")}\r\n`,
    sku,
    categoryId,
    title,
    imageCount: images.length,
    price: price > 0 ? Number(price.toFixed(2)) : 0,
    condition,
  };
}

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function xmlField(block, tag) {
  const match = String(block || "").match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXmlEntities(match[1]) : "";
}

export function parseSellerHubDraftResult(rawValue) {
  const raw = String(rawValue || "").replace(/^\uFEFF/, "").trim();
  const errors = [];
  const seen = new Set();

  const add = (entry) => {
    const code = text(entry?.code, 80);
    const shortMessage = text(entry?.shortMessage, 500);
    const longMessage = text(entry?.longMessage, 1200);
    const severity = text(entry?.severity, 80);
    const message = longMessage || shortMessage;
    if (!message && !code) return;
    const key = `${code}|${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    errors.push({ code, severity, shortMessage, longMessage, message });
  };

  const xmlBlocks = raw.match(/<Errors\b[\s\S]*?<\/Errors>/gi) || [];
  for (const block of xmlBlocks) {
    add({
      code: xmlField(block, "ErrorCode") || xmlField(block, "errorId"),
      severity: xmlField(block, "SeverityCode") || xmlField(block, "severity"),
      shortMessage: xmlField(block, "ShortMessage") || xmlField(block, "message"),
      longMessage: xmlField(block, "LongMessage") || xmlField(block, "longMessage"),
    });
    if (errors.length >= 5) break;
  }

  if (!errors.length && raw) {
    const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      if (!/(error|failure|failed|invalid|required|missing|warning)/i.test(line)) continue;
      add({ message: decodeXmlEntities(line).slice(0, 1200) });
      if (errors.length >= 5) break;
    }
  }

  return {
    errors,
    preview: decodeXmlEntities(raw).slice(0, RESULT_PREVIEW_MAX),
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

async function downloadTaskResult(session, taskId) {
  const response = await fetch(`${ebayApiRoot(session.environment)}/sell/feed/v1/task/${encodeURIComponent(taskId)}/download_result_file`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  if (!response.ok) {
    return {
      errors: [],
      preview: "",
      resultFileError: `Result-Datei konnte nicht geladen werden (HTTP ${response.status}).`,
    };
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  let decoded = bytes;
  try {
    if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) decoded = gunzipSync(bytes);
  } catch (error) {
    return {
      errors: [],
      preview: "",
      resultFileError: `eBay-Result-Datei konnte nicht entpackt werden: ${error?.message || "unbekannter Fehler"}`,
    };
  }

  return parseSellerHubDraftResult(decoded.toString("utf8"));
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
  const result = complete && failureCount > 0
    ? await downloadTaskResult(session, taskId)
    : { errors: [], preview: "" };
  const firstError = result.errors?.[0]?.message || "";

  return {
    ok: true,
    taskId,
    status,
    complete,
    draftVisible: status === "COMPLETED" && failureCount === 0 && (successCount > 0 || !Object.keys(summary).length),
    successCount,
    failureCount,
    uploadSummary: summary,
    errors: result.errors || [],
    resultPreview: result.preview || "",
    resultFileError: result.resultFileError || "",
    task,
    message: complete
      ? (failureCount > 0
        ? (firstError ? `eBay hat den Entwurf abgelehnt: ${firstError}` : "eBay hat den Draft-Upload mit Fehlern verarbeitet. Die Result-Datei enthält die genaue Ursache.")
        : "Seller-Hub-Entwurf wurde von eBay verarbeitet.")
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
