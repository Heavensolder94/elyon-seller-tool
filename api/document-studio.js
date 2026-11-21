import { requireSellerAccess } from "../lib/seller-access.js";
import { readFinanceState } from "../lib/finance-store.js";
import { applyStudioChange, documentSummary, normalizeStudioState } from "../lib/document-studio-core.js";

const STORE_KEY = "elyon-seller-tool:document-studio:v1";

function config() {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) return { url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN };
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) return { url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN };
  if (process.env.EBAY_TOKEN_STORE_URL && process.env.EBAY_TOKEN_STORE_TOKEN) return { url: process.env.EBAY_TOKEN_STORE_URL, token: process.env.EBAY_TOKEN_STORE_TOKEN };
  return null;
}

async function redis(command) {
  const store = config();
  if (!store) throw Object.assign(new Error("Geschützter Dokumentenspeicher fehlt. Bitte vorhandene Upstash-/KV-Konfiguration prüfen."), { status: 503 });
  const response = await fetch(store.url.replace(/\/$/, ""), {
    method: "POST",
    headers: { Authorization: "Bearer " + store.token, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) throw Object.assign(new Error("Dokumentenspeicher nicht erreichbar."), { status: 503 });
  return result.result;
}

async function load() {
  const raw = await redis(["GET", STORE_KEY]);
  if (!raw) return normalizeStudioState(null);
  try { return normalizeStudioState(typeof raw === "string" ? JSON.parse(raw) : raw); }
  catch { throw Object.assign(new Error("Speicherinhalt unlesbar. Es wird nichts überschrieben."), { status: 503 }); }
}

async function compareSet(state, expectedRevision) {
  const lua = [
    "local raw = redis.call('GET', KEYS[1])",
    "local previous = 0",
    "if raw then previous = tonumber(cjson.decode(raw).revision or 0) end",
    "if previous ~= tonumber(ARGV[1]) then return 0 end",
    "redis.call('SET', KEYS[1], ARGV[2])",
    "return 1",
  ].join("\n");
  return Number(await redis(["EVAL", lua, 1, STORE_KEY, expectedRevision, JSON.stringify(state)])) === 1;
}

function send(res, status, data) {
  return res.status(status).json(data);
}

export default async function handler(req, res) {
  if (!requireSellerAccess(req, res, { maxBodyBytes: 100_000 })) return;
  const action = String(req.query?.action || (req.method === "GET" ? "list" : "")).toLowerCase();
  try {
    if (req.method === "GET" && action === "profile") {
      const finance = await readFinanceState();
      const s = finance.settings || {};
      const profile = {
        name: String(s.sellerLegalName || s.sellerBrand || "").slice(0, 200),
        brand: String(s.sellerBrand || "").slice(0, 120),
        street: String(s.sellerStreet || "").slice(0, 120),
        postalCode: String(s.sellerPostalCode || "").slice(0, 30),
        city: String(s.sellerCity || "").slice(0, 120),
        country: String(s.sellerCountry || "").slice(0, 30),
        taxId: String(s.sellerTaxId || "").slice(0, 100),
      };
      return send(res, 200, { ok: true, profile });
    }
    if (req.method === "GET" && action === "list") {
      const state = await load();
      return send(res, 200, { ok: true, revision: state.revision, persistent: true, documents: state.documents.map(documentSummary) });
    }
    if (req.method === "GET" && action === "templates") {
      const state = await load();
      return send(res, 200, { ok: true, revision: state.revision, templates: state.customTemplates });
    }
    if (req.method === "GET" && action === "get") {
      const state = await load();
      const id = String(req.query?.id || "");
      const doc = state.documents.find((record) => record.id === id);
      if (!doc) return send(res, 404, { ok: false, message: "Dokument nicht gefunden." });
      return send(res, 200, { ok: true, revision: state.revision, document: doc });
    }
    if (req.method === "POST" && ["save", "archive", "restore", "save-template", "delete-template"].includes(action)) {
      const expected = req.body?.expectedRevision;
      if (!Number.isSafeInteger(expected) || expected < 0) return send(res, 400, { ok: false, message: "Zuerst Dokumentenbestand laden (Revision fehlt)." });
      const current = await load();
      if (current.revision !== expected) {
        return send(res, 409, { ok: false, error: "revision_conflict", message: "Dokumente wurden auf einem anderen Gerät geändert. Bitte neu laden.", currentRevision: current.revision });
      }
      const next = applyStudioChange(current, action, req.body?.document, req.body?.id);
      if (!(await compareSet(next, expected))) {
        return send(res, 409, { ok: false, error: "revision_conflict", message: "Zeitgleiche Änderung. Bitte Dokumentenbestand neu laden." });
      }
      return send(res, 200, { ok: true, revision: next.revision, documents: next.documents.map(documentSummary), templates: ["save-template", "delete-template"].includes(action) ? next.customTemplates : undefined });
    }
    return send(res, 405, { ok: false, message: "Aktion oder Methode nicht erlaubt." });
  } catch (error) {
    const status = Number(error.status) || 500;
    return send(res, status, { ok: false, message: status === 500 ? "Interner Dokumentenfehler." : error.message });
  }
}
