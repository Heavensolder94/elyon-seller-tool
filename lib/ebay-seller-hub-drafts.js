import crypto from "node:crypto";
import { gunzipSync } from "node:zlib";
import { ebayApiRoot, ebayUserSession, normalizeEbayEnvironment, serviceError } from "./ebay-production.js";
import { buildDraftItemSpecificColumns } from "./ebay-draft-item-specifics.js";
import {
  THEMES,
  buildVisualListingHtml,
  normalizeVisualDraft,
  visualDraftFromListingView,
} from "../seller-listing-visual-core.js";

// The verified Company OS Auto Lister V2 Draft flow uses FX_DRAFT.
// Retain the legacy CSV parser only for backward compatibility, never for new uploads.
export const SELLER_HUB_DRAFT_FEED_TYPE = "FX_DRAFT";
const SELLER_HUB_SCHEMA_VERSION = "1.0";
const DEFAULT_MARKETPLACE_ID = "EBAY_DE";
const DRAFT_DESCRIPTION_MAX = 30000;
const DRAFT_IMAGE_MAX = 24;
const RESULT_PREVIEW_MAX = 3000;
const TEMPLATE_API_VERSION = "1193";

const MARKETPLACE_METADATA = Object.freeze({
  EBAY_DE: { siteId: "Germany", country: "DE", currency: "EUR" },
  EBAY_AT: { siteId: "Austria", country: "AT", currency: "EUR" },
  EBAY_CH: { siteId: "Switzerland", country: "CH", currency: "CHF" },
  EBAY_GB: { siteId: "UK", country: "GB", currency: "GBP" },
  EBAY_US: { siteId: "US", country: "US", currency: "USD" },
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
  const raw = String(value ?? "");
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < String(line || "").length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  values.push(value);
  return values;
}

function marketplaceMetadata(marketplaceId) {
  return MARKETPLACE_METADATA[text(marketplaceId, 30).toUpperCase()] || MARKETPLACE_METADATA[DEFAULT_MARKETPLACE_ID];
}

function draftActionHeader(marketplaceId) {
  const meta = marketplaceMetadata(marketplaceId);
  return `*Action(SiteID=${meta.siteId}|Country=${meta.country}|Currency=${meta.currency}|Version=${TEMPLATE_API_VERSION}|CC=UTF-8)`;
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
  const sourceProductId = text(source.sourceProductId, 50)
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "");
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

function descriptionTheme(input = {}) {
  const requested = text(input?.descriptionTheme, 30).toLowerCase();
  return THEMES[requested] ? requested : "";
}

function compactDescriptionHtml(value) {
  return String(value || "")
    .replace(/\r\n|\r|\n/g, " ")
    .replace(/>\s+</g, "><")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, DRAFT_DESCRIPTION_MAX);
}

function sellerHubDescription(source, { title, categoryId, images }) {
  const rawDescription = text(source.description, 20000);
  if (source.useDescriptionDesign !== true) return normalizedDescription(rawDescription);

  const view = {
    listingTitle: title,
    title,
    categoryId,
    categoryName: text(source.categoryName, 300),
    descriptionHtml: rawDescription,
    images,
    itemSpecifics: object(source.itemSpecifics),
    local: { description: rawDescription },
    server: { description: rawDescription },
  };
  let visual = visualDraftFromListingView(view);
  const theme = descriptionTheme(source);
  visual = normalizeVisualDraft({
    ...visual,
    ...(theme ? { theme } : {}),
    title: title || visual.title,
    imageUrl: images[0] || visual.imageUrl,
    images: images.length ? images : visual.images,
    longDescription: rawDescription || visual.longDescription,
  });

  return compactDescriptionHtml(buildVisualListingHtml(visual));
}

export function buildSellerHubDraftCsv(input = {}) {
  const source = object(input);
  const categoryId = text(source.categoryId, 10);
  if (!/^\d{2,10}$/.test(categoryId)) {
    throw serviceError(400, "ebay_draft_category_missing", "Für den Seller-Hub-Entwurf fehlt eine gültige numerische eBay-Kategorie-ID.");
  }

  const marketplaceId = text(source.marketplaceId || DEFAULT_MARKETPLACE_ID, 30).toUpperCase();
  const title = text(source.title, 80);
  const sku = draftIdentity(source);
  const images = normalizedImages(source.images);
  const quantity = Math.max(1, Math.min(999, Math.floor(number(source.quantity, 1) || 1)));
  const price = number(source.price, 0);
  const description = sellerHubDescription(source, { title, categoryId, images });
  const condition = draftCondition(source);
  const upc = normalizedUpc(source);
  const itemSpecificColumns = buildDraftItemSpecificColumns(source.itemSpecifics);

  // Mirror the physical shape of eBay's downloaded "Create new drafts" template.
  // Seller-Hub draft uploads also accept Item Specific columns prefixed with C:.
  const headers = [
    draftActionHeader(marketplaceId),
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
    ...itemSpecificColumns.headers,
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
    ...itemSpecificColumns.values,
  ];
  const lines = [
    `#INFO Created=${Date.now()}`,
    "#INFO Version=1.0 Template=fx_draft_template_EBAY",
    "#INFO",
    headers.map(csvCell).join(","),
    row.map(csvCell).join(","),
  ];

  return {
    csv: `${lines.join("\r\n")}\r\n`,
    sku,
    categoryId,
    title,
    marketplaceId,
    imageCount: images.length,
    itemSpecificCount: itemSpecificColumns.count,
    price: price > 0 ? Number(price.toFixed(2)) : 0,
    condition,
    descriptionDesigned: source.useDescriptionDesign === true,
    descriptionTheme: descriptionTheme(source) || (source.useDescriptionDesign === true ? "auto" : "plain"),
  };
}


/**
 * Request the canonical Auto Lister V2 CSV from Company OS.
 * Uses the existing server-only Company OS sync code; the extension never
 * receives that code, the template or eBay credentials.
 * Fail closed: no legacy FX_LISTING fallback when the bridge is unavailable.
 */
export async function fetchCompanyOsAmazonDraftFile(input = {}, {
  env = process.env,
  fetchClient = fetch,
} = {}) {
  const syncCode = text(env.ELYON_COMPANY_OS_SYNC_CODE || env.COMPANY_OS_SYNC_CODE, 500);
  if (syncCode.length < 6) {
    throw serviceError(503, "company_os_sync_code_missing",
      "Company-OS-Sync-Code fehlt. Kein eBay-Task wurde gestartet.");
  }
  let url;
  try {
    url = new URL("/api/auto-lister-seller-hub",
      env.ELYON_COMPANY_OS_URL || env.COMPANY_OS_URL || "https://elyon-company-os.vercel.app");
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("invalid_url");
  } catch {
    throw serviceError(503, "company_os_draft_bridge_url_invalid",
      "Company-OS-Draft-Schnittstelle ist nicht sicher konfiguriert.");
  }
  const sku = draftIdentity(input);
  if (!/^AMZ-[A-Z0-9]{10}$/.test(sku)) {
    throw serviceError(409, "amazon_draft_sku_invalid", "Für den Draft ist eine eindeutige Amazon-SKU erforderlich.");
  }
  const condition = draftCondition(input);
  if (!condition) {
    throw serviceError(409, "amazon_draft_condition_required",
      "Bitte den Zustand vor dem eBay-Draft bestätigen.");
  }
  const images = normalizedImages(input.images);
  const marketplaceId = text(input.marketplaceId || DEFAULT_MARKETPLACE_ID, 30).toUpperCase();
  const description = sellerHubDescription(input, {
    title: text(input.title, 80),
    categoryId: text(input.categoryId, 10),
    images,
  });
  const draft = {
    sku,
    marketplaceId,
    currency: text(input.currency || "EUR", 10),
    title: text(input.title, 80),
    categoryId: text(input.categoryId, 10),
    description,
    price: number(input.price),
    quantity: number(input.quantity, 1),
    condition,
    images,
    itemSpecifics: object(input.itemSpecifics),
    brand: text(input.brand, 65),
    mpn: text(input.mpn, 65),
    upc: normalizedUpc(input),
    manufacturer: object(input.manufacturer),
    responsiblePerson: object(input.responsiblePerson),
    productSafety: object(input.productSafety),
    regulatoryDocumentIds: Array.isArray(input.regulatoryDocumentIds) ? input.regulatoryDocumentIds : [],
    variants: Array.isArray(input.variants) ? input.variants : [],
  };
  let response;
  try {
    response = await fetchClient(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        action: "build_external_csv",
        syncCode,
        confirmation: "draft_only",
        publish: false,
        draft,
      }),
    });
  } catch {
    throw serviceError(503, "company_os_draft_bridge_unavailable",
      "Company OS ist für die Draft-Erzeugung nicht erreichbar. Kein eBay-Task wurde gestartet.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok !== true) {
    throw serviceError(response.status || 502,
      text(data.error, 100) || "company_os_draft_bridge_failed",
      text(data.message, 1000) || "Company OS konnte die offizielle Draft-CSV nicht erzeugen. Kein eBay-Task gestartet.");
  }
  const base64 = text(data.contentBase64, 4000000);
  if (data.action !== "Draft" || data.feedType !== SELLER_HUB_DRAFT_FEED_TYPE
      || data.published !== false || data.uploaded !== false
      || !/^[a-f0-9]{64}$/i.test(text(data.sha256, 80))
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw serviceError(502, "company_os_draft_response_invalid",
      "Company OS hat keine verifizierbare Draft-only-Datei zurückgegeben.");
  }
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.length > 2000000 || bytes.length !== data.byteLength
      || crypto.createHash("sha256").update(bytes).digest("hex") !== data.sha256.toLowerCase()) {
    throw serviceError(502, "company_os_draft_file_integrity_failed",
      "Die Draft-CSV hat die Größen- oder Prüfsummenprüfung nicht bestanden.");
  }
  const fileName = text(data.fileName, 180);
  if (!fileName.toLowerCase().endsWith(".csv") || /[\\/\x00-\x1f]/.test(fileName)) {
    throw serviceError(502, "company_os_draft_filename_invalid", "Company OS meldet keinen gültigen Draft-Dateinamen.");
  }
  return {
    bytes,
    fileName,
    sku,
    summary: object(data.summary),
    sha256: data.sha256.toLowerCase(),
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
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const header = parseCsvLine(lines[0]).map((entry) => entry.trim());
    const errorCodeIndex = header.findIndex((entry) => /^ErrorCode$/i.test(entry));
    const errorMessageIndex = header.findIndex((entry) => /^ErrorMessage$/i.test(entry));
    const statusIndex = header.findIndex((entry) => /^Status$/i.test(entry));
    if (errorCodeIndex >= 0 || errorMessageIndex >= 0) {
      for (const line of lines.slice(1)) {
        const columns = parseCsvLine(line);
        const code = errorCodeIndex >= 0 ? text(columns[errorCodeIndex], 80) : "";
        const message = errorMessageIndex >= 0 ? text(columns[errorMessageIndex], 1200) : "";
        const severity = statusIndex >= 0 ? text(columns[statusIndex], 80) : "";
        if (code || message) add({ code, shortMessage: message, severity });
        if (errors.length >= 5) break;
      }
    }
  }

  if (!errors.length && raw) {
    const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      if (!/(error|failure|failed|invalid|required|missing|warning)/i.test(line)) continue;
      add({ shortMessage: decodeXmlEntities(line).slice(0, 1200) });
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
  const returned = location ? {} : await response.json().catch(() => ({}));
  const taskId = decodeURIComponent(location.split("/").filter(Boolean).pop() || text(returned.taskId, 200));
  if (!taskId) {
    throw serviceError(502, "ebay_draft_task_id_missing", "eBay hat für den Seller-Hub-Draft keine Task-ID zurückgegeben.", { location });
  }
  return taskId;
}


async function waitForDraftTaskCreated(session, taskId) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = await fetch(`${ebayApiRoot(session.environment)}/sell/feed/v1/task/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${session.accessToken}`, Accept: "application/json" },
    });
    if (response.ok) {
      const task = await response.json().catch(() => ({}));
      if (text(task.status, 40).toUpperCase() === "CREATED") return;
      if (["FAILED", "CANCELLED"].includes(text(task.status, 40).toUpperCase())) break;
    }
    if (attempt < 7) await new Promise(resolve => setTimeout(resolve, Math.min(250 * (attempt + 1), 1000)));
  }
  throw serviceError(409, "ebay_draft_task_not_ready",
    "eBay hat die FX_DRAFT-Task nicht für den Upload freigegeben.");
}

async function uploadDraftCsv(session, taskId, file) {
  const fileName = file.fileName;
  const form = new FormData();
  // Preserve original Company OS bytes, filename and multipart file-only upload.
  form.append("file", new Blob([file.bytes], { type: "text/csv" }), fileName);

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
    return { errors: [], preview: "", resultFileError: `Result-Datei konnte nicht geladen werden (HTTP ${response.status}).` };
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

export function feedTaskHasConfirmedSuccess(status, successCount, failureCount) {
  return status === "COMPLETED" && Number.isFinite(successCount) && successCount > 0 && failureCount === 0;
}

export function classifySellerHubFeedEvidence(status, successCount, failureCount) {
  const feedConfirmed = feedTaskHasConfirmedSuccess(status, successCount, failureCount);
  return {
    feedConfirmed,
    // A completed FX_DRAFT feed is not evidence of visibility in Seller Hub.
    sellerHubVisibility: "not_verified",
    // Kept for existing extension consumers; do not present as actual visibility.
    draftVisible: feedConfirmed,
  };
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
  const firstError = result.errors?.[0];
  const firstErrorText = [firstError?.code, firstError?.message].filter(Boolean).join(" · ");

  return {
    ok: true,
    taskId,
    status,
    complete,
    ...classifySellerHubFeedEvidence(status, successCount, failureCount),
    successCount,
    failureCount,
    uploadSummary: summary,
    errors: result.errors || [],
    resultPreview: result.preview || "",
    resultFileError: result.resultFileError || "",
    task,
    message: complete
      ? (failureCount > 0
        ? (firstErrorText ? `eBay hat den Entwurf abgelehnt: ${firstErrorText}` : "eBay hat den Draft-Upload mit Fehlern verarbeitet.")
        : (successCount > 0 ? "eBay meldet einen verarbeiteten Feed-Eintrag. Bitte den Entwurf im Seller Hub prüfen." : "Feed beendet, aber eBay hat keinen erfolgreichen Eintrag bestätigt. Bitte den Task im Seller Hub prüfen."))
      : "Seller-Hub-Entwurf wird von eBay verarbeitet.",
  };
}

export async function createSellerHubDraft(input = {}, environment) {
  const env = normalizeEbayEnvironment(environment || input?.environment || process.env.EBAY_ENV);
  const marketplaceId = text(input?.marketplaceId || process.env.EBAY_MARKETPLACE_ID || DEFAULT_MARKETPLACE_ID, 30).toUpperCase();
  // Build and verify the official CSV before starting any eBay task.
  const file = await fetchCompanyOsAmazonDraftFile({ ...input, marketplaceId });
  const session = await ebayUserSession(env);
  const taskId = await createFeedTask(session, marketplaceId);
  let upload = null;
  let uploadWarning = "";
  try {
    await waitForDraftTaskCreated(session, taskId);
    upload = await uploadDraftCsv(session, taskId, file);
  } catch (error) {
    // Once a Task-ID exists, an ambiguous upload must NEVER auto-create a
    // second task. The extension stores this Task-ID for read-only follow-up.
    uploadWarning = text(error?.message || "Upload nicht bestätigt.", 500);
  }
  return {
    ok: true,
    sellerHubDraft: true,
    draftSubmitted: Boolean(upload),
    published: false,
    environment: session.environment,
    marketplaceId,
    feedType: SELLER_HUB_DRAFT_FEED_TYPE,
    schemaVersion: SELLER_HUB_SCHEMA_VERSION,
    taskId,
    sku: file.sku,
    fileName: file.fileName,
    fileSha256: file.sha256,
    status: upload ? "QUEUED" : "UPLOAD_UNCONFIRMED",
    uploadWarning,
    message: upload
      ? "Der offizielle Company-OS-Draft-Feed wurde übermittelt. Bitte den Ergebnisstatus und anschließend den Seller Hub prüfen."
      : "Die eBay-Task-ID ist vorhanden, aber der Upload wurde nicht bestätigt: " + uploadWarning
        + " Kein zweiter Task wurde gestartet. Bitte den vorhandenen Task prüfen.",
  };
}
