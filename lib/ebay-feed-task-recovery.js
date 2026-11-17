import { gunzipSync } from "node:zlib";
import { ebayApiRoot, ebayUserSession, normalizeEbayEnvironment, serviceError } from "./ebay-production.js";

const PAGE_SIZE = 25;
const MAX_PAGES = 4;
const MAX_FILE_BYTES = 2_000_000;
const LOOKBACK_DAYS = 7;

function text(value, max = 500) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function csvFields(line) {
  const fields = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i += 1; }
      else quoted = !quoted;
    } else if (c === "," && !quoted) {
      fields.push(current);
      current = "";
    }
  }
  fields.push(current);
  return fields.map((field) => field.trim());
}

export function feedCsvProductForSku(raw, sku) {
  const wanted = text(sku, 70).toUpperCase();
  const lines = String(raw || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const headerIndex = lines.findIndex((line) => {
    const fields = csvFields(line).map((field) => field.toLowerCase());
    return fields.includes("custom label (sku)") && fields.includes("title");
  });
  if (headerIndex < 0) return null;
  const columns = csvFields(lines[headerIndex]).map((x) => x.toLowerCase());
  const skuAt = columns.indexOf("custom label (sku)");
  const titleAt = columns.indexOf("title");
  const priceAt = columns.indexOf("price");
  const imagesAt = columns.indexOf("item photo url");
  for (const line of lines.slice(headerIndex + 1, headerIndex + 100)) {
    const row = csvFields(line);
    if (text(row[skuAt]).toUpperCase() !== wanted) continue;
    const title = text(row[titleAt], 200);
    if (!title) return null;
    const price = Number(text(row[priceAt]));
    const images = (imagesAt < 0 ? [] : text(row[imagesAt], 12000).split("|"))
      .map((url) => text(url, 2000)).filter((url) => /^https:\/\//i.test(url)).slice(0, 8);
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
  return raw.toString("utf8");
}

/**
 * Read-only recovery of a missing local FX_DRAFT task ID.
 * The caller must verify a matched task's success before registering it.
 */
export async function findRecentSellerHubFeedForSku({ sku, environment, getSession = ebayUserSession, fetchClient = fetch } = {}) {
  const wanted = text(sku, 70).toUpperCase();
  if (!/^AMZ-[A-Z0-9]{10}$/.test(wanted)) {
    throw serviceError(400, "feed_recovery_sku_invalid", "Für die Wiederherstellung wird eine gültige Amazon-SKU AMZ-XXXXXXXXXX benötigt.");
  }
  const session = await getSession(normalizeEbayEnvironment(environment));
  const apiRoot = ebayApiRoot(session.environment);
  const matches = [];
  let scanned = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(apiRoot + "/sell/feed/v1/task");
    url.searchParams.set("feed_type", "FX_DRAFT");
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
    if (!tasks) throw serviceError(502, "feed_recovery_history_invalid", "eBay hat kein gültiges Feed-Task-Verzeichnis geliefert.");
    for (const task of tasks) {
      if (text(task?.feedType).toUpperCase() !== "FX_DRAFT") continue;
      if (text(task?.status).toUpperCase() !== "COMPLETED") continue;
      const taskId = text(task.taskId, 220);
      if (!taskId) continue;
      scanned += 1;
      const input = await fetchFeedInput(apiRoot, session.accessToken, taskId, fetchClient);
      if (!input) continue;
      const product = feedCsvProductForSku(input, wanted);
      if (product) matches.push({ ...product, taskId });
      if (matches.length > 1) {
        throw serviceError(409, "feed_recovery_ambiguous",
          "Mehrere abgeschlossene eBay-Feed-Tasks enthalten diese SKU. Zur Vermeidung einer falschen Zuordnung ist eine manuelle Prüfung nötig.");
      }
    }
    const total = Number(result.total);
    const haveMore = Number.isFinite(total) && total >= 0
      ? (page + 1) * PAGE_SIZE < total
      : Boolean(result.next) || tasks.length >= PAGE_SIZE;
    if (!haveMore) return { found: matches.length === 1, record: matches[0] || null, scanned };
  }
  throw serviceError(409, "feed_recovery_history_limit",
    "Die eBay-Feed-Historie umfasst mehr als 100 Tasks. Bitte den Zeitraum begrenzen oder eine Task-ID bereitstellen.");
}
