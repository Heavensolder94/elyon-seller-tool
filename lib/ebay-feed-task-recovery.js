import { gunzipSync } from "node:zlib";
import { ebayApiRoot, ebayUserSession, normalizeEbayEnvironment, serviceError } from "./ebay-production.js";

const PAGE_SIZE = 25;
const MAX_PAGES = 4;
const MAX_FILE_BYTES = 2_000_000;
const LOOKBACK_DAYS = 7;

function text(value, max = 500) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function csvFields(line, delimiter = ",") {
  const fields = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i += 1; }
      else quoted = !quoted;
    } else if (c === delimiter && !quoted) {
      fields.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  fields.push(current);
  return fields.map((field) => field.trim());
}

export function feedCsvProductForSku(raw, sku) {
  const wanted = text(sku, 70).toUpperCase();
  const lines = String(raw || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  let headerIndex = -1;
  let delimiter = ",";
  let columns = [];
  for (let index = 0; index < lines.length; index += 1) {
    for (const candidate of [";", ",", "\t"]) {
      const fields = csvFields(lines[index], candidate).map(field => field.toLowerCase());
      if (fields.includes("custom label (sku)") && fields.includes("title")
          && fields.some(field => /^\*?action(?:\(|$)/i.test(field))) {
        headerIndex = index;
        delimiter = candidate;
        columns = fields;
        break;
      }
    }
    if (headerIndex >= 0) break;
  }
  if (headerIndex < 0) return null;
  const skuAt = columns.indexOf("custom label (sku)");
  const actionAt = columns.findIndex(column => /^\*?action(?:\(|$)/i.test(column));
  const titleAt = columns.indexOf("title");
  const priceAt = columns.indexOf("price");
  const imagesAt = columns.indexOf("item photo url");
  for (const line of lines.slice(headerIndex + 1, headerIndex + 100)) {
    const row = csvFields(line, delimiter);
    if (text(row[skuAt]).toUpperCase() !== wanted) continue;
    // Both legacy FX_LISTING and FX_DRAFT may include other actions.
    if (text(row[actionAt], 40).toLowerCase() !== "draft") continue;
    const title = text(row[titleAt], 200);
    if (!title) return null;
    const price = Number(text(row[priceAt]));
    const images = (imagesAt < 0 ? [] : text(row[imagesAt], 12000).split("|"))
      .map(url => text(url, 2000)).filter(url => /^https:\/\//i.test(url)).slice(0, 8);
    return { sku: wanted, title, price: Number.isFinite(price) && price > 0 ? price : 0, images };
  }
  return null;
}

async function fetchFeedInput(apiRoot, token, taskId, fetchClient) {
  const response = await fetchClient(apiRoot + "/sell/feed/v1/task/" + encodeURIComponent(taskId) + "/download_input_file", {
    headers: { Authorization: "Bearer " + token },
  });
  if (!response.ok) return null;
  const statedLength = Number(response.headers?.get?.("content-length") || 0);
  if (statedLength > MAX_FILE_BYTES) return null;
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_FILE_BYTES) return null;
  let raw = bytes;
  try {
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      raw = gunzipSync(bytes, { maxOutputLength: MAX_FILE_BYTES });
    }
  } catch { return null; }
  if (raw.length > MAX_FILE_BYTES || (raw[0] === 0x50 && raw[1] === 0x4b)) return null;
  // Company OS preserves the official template encoding including UTF-16
  // and Windows-1252; task recovery must read those bytes, not only UTF-8.
  const bom = raw.subarray(0, 3);
  const decode = encoding => {
    try { return new TextDecoder(encoding, { fatal: true }).decode(raw); }
    catch { return null; }
  };
  if (bom[0] === 0xff && bom[1] === 0xfe) return decode("utf-16le");
  if (bom[0] === 0xfe && bom[1] === 0xff) return decode("utf-16be");
  const sample = raw.subarray(0, Math.min(raw.length, 4000));
  const oddNulls = [...sample].filter((v, i) => v === 0 && i % 2 === 1).length;
  const evenNulls = [...sample].filter((v, i) => v === 0 && i % 2 === 0).length;
  if (oddNulls > sample.length * 0.12 && oddNulls > evenNulls * 3) return decode("utf-16le");
  if (evenNulls > sample.length * 0.12 && evenNulls > oddNulls * 3) return decode("utf-16be");
  return decode("utf-8") || decode("windows-1252");
}


/**
 * Read-only discovery for an importer popup that has lost its current Amazon
 * page context. Never guesses a product by title and never writes to eBay.
 * Every option comes from an actual Seller Hub Draft upload CSV, not a local
 * shopping or product search.
 */
export function feedCsvAmazonDraftCandidates(raw) {
  const lines = String(raw || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  let headers = null;
  let delimiter = "";
  let headerIndex = -1;
  for (let index = 0; index < Math.min(lines.length, 40); index += 1) {
    for (const candidate of [";", ",", "\t"]) {
      const fields = csvFields(lines[index], candidate).map(value => value.trim().toLowerCase());
      if (fields.includes("custom label (sku)") && fields.includes("title")
          && fields.some(field => /^\*?action(?:\(|$)/i.test(field))) {
        headers = fields;
        delimiter = candidate;
        headerIndex = index;
        break;
      }
    }
    if (headers) break;
  }
  if (!headers) return [];
  const skuAt = headers.indexOf("custom label (sku)");
  const actionAt = headers.findIndex(field => /^\*?action(?:\(|$)/i.test(field));
  const titleAt = headers.indexOf("title");
  const priceAt = headers.indexOf("price");
  const imagesAt = headers.indexOf("item photo url");
  const results = [];
  const seen = new Set();
  for (const line of lines.slice(headerIndex + 1, headerIndex + 101)) {
    const row = csvFields(line, delimiter);
    if (text(row[actionAt], 20).toLowerCase() !== "draft") continue;
    const sku = text(row[skuAt], 70).toUpperCase();
    const title = text(row[titleAt], 200);
    if (!/^AMZ-[A-Z0-9]{10}$/.test(sku) || !title || seen.has(sku)) continue;
    const price = Number(text(row[priceAt]));
    const images = imagesAt < 0 ? [] : text(row[imagesAt], 12000).split("|")
      .map(value => text(value, 2000)).filter(value => /^https:\/\//i.test(value)).slice(0, 8);
    results.push({ sku, title, price: Number.isFinite(price) && price > 0 ? price : 0, images });
    seen.add(sku);
    if (results.length >= 25) break;
  }
  return results;
}

export async function listRecentAmazonDraftRecoveryCandidates({
  environment, getSession = ebayUserSession, fetchClient = fetch,
} = {}) {
  const session = await getSession(normalizeEbayEnvironment(environment));
  const apiRoot = ebayApiRoot(session.environment);
  const url = new URL(apiRoot + "/sell/feed/v1/task");
  url.searchParams.set("feed_type", "FX_DRAFT");
  url.searchParams.set("look_back_days", String(LOOKBACK_DAYS));
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("offset", "0");
  const response = await fetchClient(url.toString(), {
    headers: { Authorization: "Bearer " + session.accessToken, Accept: "application/json" },
  });
  if (!response.ok) {
    throw serviceError(response.status || 502, "feed_recovery_candidates_list_failed",
      "eBay konnte die jüngsten Draft-Tasks nicht laden. Es wurde nichts verändert.");
  }
  const result = await response.json().catch(() => ({}));
  if (!Array.isArray(result.tasks)) {
    throw serviceError(502, "feed_recovery_candidates_invalid",
      "eBay hat kein gültiges Draft-Task-Verzeichnis geliefert.");
  }
  const candidates = [];
  let checked = 0;
  // Bound network work; do not scan or create every listing on the account.
  for (const task of result.tasks) {
    if (checked >= 12 || candidates.length >= 12) break;
    if (text(task?.feedType).toUpperCase() !== "FX_DRAFT"
        || text(task?.status).toUpperCase() !== "COMPLETED") continue;
    const taskId = text(task?.taskId, 220);
    if (!taskId) continue;
    checked += 1;
    const input = await fetchFeedInput(apiRoot, session.accessToken, taskId, fetchClient);
    if (!input) continue;
    for (const row of feedCsvAmazonDraftCandidates(input)) {
      candidates.push({ ...row, taskId, feedType: "FX_DRAFT" });
      if (candidates.length >= 12) break;
    }
  }
  return { candidates, scanned: checked, sellerHubVisibility: "not_verified" };
}

/**
 * Read-only recovery of a missing local FX_DRAFT or legacy FX_LISTING Draft task ID.
 * The caller must verify a matched task's success before registering it.
 */
export async function findRecentSellerHubFeedForSku({
  sku, environment, getSession = ebayUserSession, fetchClient = fetch,
} = {}) {
  const wanted = text(sku, 70).toUpperCase();
  if (!/^AMZ-[A-Z0-9]{10}$/.test(wanted)) {
    throw serviceError(400, "feed_recovery_sku_invalid",
      "Für die Wiederherstellung wird eine gültige Amazon-SKU AMZ-XXXXXXXXXX benötigt.");
  }
  const session = await getSession(normalizeEbayEnvironment(environment));
  const apiRoot = ebayApiRoot(session.environment);
  const matches = [];
  let scanned = 0;

  for (const feedType of ["FX_DRAFT", "FX_LISTING"]) {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const url = new URL(apiRoot + "/sell/feed/v1/task");
      url.searchParams.set("feed_type", feedType);
      url.searchParams.set("look_back_days", String(LOOKBACK_DAYS));
      url.searchParams.set("limit", String(PAGE_SIZE));
      url.searchParams.set("offset", String(page * PAGE_SIZE));
      const response = await fetchClient(url.toString(), {
        headers: { Authorization: "Bearer " + session.accessToken, "Accept": "application/json" },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw serviceError(response.status || 502, "feed_recovery_task_history_failed",
          "eBay konnte die jüngsten Feed-Tasks nicht auflisten. Es wurde nichts verändert.");
      }
      const tasks = Array.isArray(result.tasks) ? result.tasks : null;
      if (!tasks) {
        throw serviceError(502, "feed_recovery_history_invalid",
          "eBay hat kein gültiges Feed-Task-Verzeichnis geliefert.");
      }
      for (const task of tasks) {
        if (text(task?.feedType).toUpperCase() !== feedType) continue;
        if (text(task?.status).toUpperCase() !== "COMPLETED") continue;
        const taskId = text(task.taskId, 220);
        if (!taskId) continue;
        scanned += 1;
        const input = await fetchFeedInput(apiRoot, session.accessToken, taskId, fetchClient);
        if (!input) continue;
        const product = feedCsvProductForSku(input, wanted);
        if (product) matches.push({ ...product, taskId, feedType });
        if (matches.length > 1) {
          throw serviceError(409, "feed_recovery_ambiguous",
            "Mehrere abgeschlossene eBay-Feed-Tasks enthalten diese SKU. Manuelle Prüfung erforderlich.");
        }
      }
      const total = Number(result.total);
      const haveMore = Number.isFinite(total) && total >= 0
        ? (page + 1) * PAGE_SIZE < total
        : Boolean(result.next) || tasks.length >= PAGE_SIZE;
      if (!haveMore) break;
      if (page === MAX_PAGES - 1) {
        throw serviceError(409, "feed_recovery_history_limit",
          "Die eBay-Feed-Historie ist zu umfangreich für einen eindeutigen automatischen Abgleich.");
      }
    }
  }
  return { found: matches.length === 1, record: matches[0] || null, scanned };
}
