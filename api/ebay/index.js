import internalHandler from "../../internal/ebay/index.js";
import { createEbayOAuthState, readEbayOAuthState, verifyEbayOAuthState } from "../../lib/ebay-oauth-state.js";
import { readToken } from "../../lib/ebay-token-store.js";
import { requireSellerAccess } from "../../lib/seller-access.js";

const EBAY_FINANCES_SCOPE = "https://api.ebay.com/oauth/api_scope/sell.finances";

function ensureFinanceScope() {
  const configured = String(process.env.EBAY_SCOPES || "")
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
  if (!configured.includes(EBAY_FINANCES_SCOPE)) {
    process.env.EBAY_SCOPES = [...configured, EBAY_FINANCES_SCOPE].join(" ");
  }
}

ensureFinanceScope();

function text(value) {
  return String(value ?? "").trim();
}

function actionFrom(req) {
  const explicit = text(req?.query?.action || req?.query?.endpoint || req?.query?.path);
  if (explicit) return explicit.replace(/^\/+/, "");
  try {
    const url = new URL(req?.url || "/api/ebay", `https://${req?.headers?.host || "localhost"}`);
    return url.pathname.replace(/^\/api\/ebay\/?/, "") || "status";
  } catch {
    return "status";
  }
}

function environmentFrom(req) {
  const raw = req?.method === "POST"
    ? req?.body?.environment || req?.body?.env
    : req?.query?.environment || req?.query?.env;
  return text(raw).toLowerCase() === "sandbox" ? "sandbox" : "production";
}

export function publicConnectionStatus(tokenRecord) {
  return { connected: Boolean(tokenRecord?.refresh_token || tokenRecord?.access_token) };
}

function redactSecrets(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, seen));
  if (typeof value !== "object") return value;
  if (seen.has(value)) return undefined;
  seen.add(value);
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (/^(access_token|refresh_token|stored_token_preview|access_token_preview|stored_refresh_token_preview)$/i.test(key)) {
      output[key] = Boolean(item);
      continue;
    }
    if (/token$/i.test(key) && typeof item === "string" && item.length > 20) {
      output[key] = true;
      continue;
    }
    output[key] = redactSecrets(item, seen);
  }
  return output;
}

export default async function handler(req, res) {
  ensureFinanceScope();
  const action = actionFrom(req);
  const environment = environmentFrom(req);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (action === "status") {
    try {
      const tokenRecord = await readToken(environment);
      const captured = {
        statusCode: 200,
        body: null,
        setHeader() {},
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
      };
      await internalHandler(req, captured);
      return res.status(captured.statusCode).json({ ...captured.body, ...publicConnectionStatus(tokenRecord) });
    } catch {
      return res.status(200).json({ ok: true, connected: false, environment });
    }
  }

  if (action === "login-url") {
    req.query = {
      ...(req.query || {}),
      state: createEbayOAuthState({ source: req?.query?.source || "elyon-seller-tool", environment }),
    };
  }

  if (action === "exchange-token") {
    const state = readEbayOAuthState(req);
    const verified = verifyEbayOAuthState(state, { environment });
    if (!verified.ok) {
      return res.status(403).json({
        ok: false,
        connected: false,
        error: verified.error,
        message: "eBay OAuth-State ist ungültig oder abgelaufen.",
      });
    }
  }

  const protectedActions = new Set(["token", "orders", "setup", "create-draft", "draft", "publish", "withdraw"]);
  if (protectedActions.has(action)) {
    if (!requireSellerAccess(req, res, { maxBodyBytes: 1024 * 1024 })) return;
  }

  if (["create-draft", "draft", "publish", "withdraw"].includes(action) && req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed", message: "Diese eBay-Aktion benötigt POST." });
  }

  const originalJson = res.json.bind(res);
  res.json = (payload) => originalJson(redactSecrets(payload));
  return internalHandler(req, res);
}
