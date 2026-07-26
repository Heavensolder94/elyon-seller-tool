const HEALTH_TIMEOUT_MS = 7000;

function envFlag(name) {
  return Boolean(process.env[name]);
}

function withTimeout(promise, ms = HEALTH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    run: promise(controller.signal).finally(() => clearTimeout(timeout)),
  };
}

function getBaseUrl(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host || process.env.VERCEL_URL || "localhost:3000";
  return `${proto}://${host}`;
}

function forwardedAuthHeaders(req) {
  const headers = {};
  if (req?.headers?.cookie) headers.cookie = req.headers.cookie;
  if (req?.headers?.authorization) headers.authorization = req.headers.authorization;
  if (req?.headers?.["x-elyon-seller-token"]) headers["x-elyon-seller-token"] = req.headers["x-elyon-seller-token"];
  return headers;
}

async function readJsonSafe(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

async function probe(req, path, options = {}) {
  const url = `${getBaseUrl(req)}${path}`;
  const started = Date.now();
  try {
    const headers = { ...forwardedAuthHeaders(req), ...(options.headers || {}) };
    const runner = withTimeout((signal) => fetch(url, { ...options, headers, signal }));
    const response = await runner.run;
    const data = await readJsonSafe(response);
    return {
      routeOk: response.status < 500,
      ok: response.ok,
      status: response.status,
      ms: Date.now() - started,
      data,
    };
  } catch (error) {
    return {
      routeOk: false,
      ok: false,
      status: 0,
      ms: Date.now() - started,
      error: error?.message || "Probe fehlgeschlagen",
    };
  }
}

function missing(flags) {
  return Object.entries(flags).filter(([, value]) => !value).map(([key]) => key);
}

function hasEbayOrderScope() {
  const scopes = String(process.env.EBAY_SCOPES || "");
  return /sell\.fulfillment/i.test(scopes);
}

function buildEnvReadiness() {
  const hasEbayTokenStore =
    envFlag("EBAY_TOKEN_STORE_URL") && envFlag("EBAY_TOKEN_STORE_TOKEN");

  const ebay = {
    EBAY_CLIENT_ID: envFlag("EBAY_CLIENT_ID"),
    EBAY_CLIENT_SECRET: envFlag("EBAY_CLIENT_SECRET"),
    EBAY_REDIRECT_URI_OR_RUNAME: envFlag("EBAY_REDIRECT_URI") || envFlag("EBAY_RUNAME"),
    EBAY_REFRESH_TOKEN_OR_STORE: envFlag("EBAY_REFRESH_TOKEN") || hasEbayTokenStore || envFlag("UPSTASH_REDIS_REST_URL") || envFlag("KV_REST_API_URL"),
    EBAY_SELL_SCOPES_FOR_ORDERS: hasEbayOrderScope(),
  };

  const googleDrive = {
    GOOGLE_CLIENT_ID: envFlag("GOOGLE_CLIENT_ID"),
    GOOGLE_CLIENT_SECRET: envFlag("GOOGLE_CLIENT_SECRET"),
    GOOGLE_REDIRECT_URI: envFlag("GOOGLE_REDIRECT_URI"),
  };

  const cj = {
    CJ_API_KEY_OR_ACCESS_TOKEN: envFlag("CJ_API_KEY") || envFlag("CJ_ACCESS_TOKEN"),
  };

  const openai = {
    OPENAI_API_KEY: envFlag("OPENAI_API_KEY"),
  };

  const deepseek = {
    DEEPSEEK_API_KEY: envFlag("DEEPSEEK_API_KEY"),
  };

  const qwen = {
    QWEN_API_KEY_OR_DASHSCOPE_API_KEY: envFlag("QWEN_API_KEY") || envFlag("DASHSCOPE_API_KEY"),
  };

  const upstash = {
    EBAY_TOKEN_STORE_URL_OR_UPSTASH_REDIS_REST_URL: envFlag("EBAY_TOKEN_STORE_URL") || envFlag("UPSTASH_REDIS_REST_URL") || envFlag("KV_REST_API_URL"),
    EBAY_TOKEN_STORE_TOKEN_OR_UPSTASH_REDIS_REST_TOKEN: envFlag("EBAY_TOKEN_STORE_TOKEN") || envFlag("UPSTASH_REDIS_REST_TOKEN") || envFlag("KV_REST_API_TOKEN"),
  };

  return { ebay, googleDrive, cj, openai, deepseek, qwen, upstash };
}

function summarizeService({ key, name, envFlags, routeProbe, liveProbe, liveLabel, forceState, forceDetail }) {
  const missingEnv = missing(envFlags);
  const envReady = missingEnv.length === 0;
  const routeOk = routeProbe ? routeProbe.routeOk : false;
  const liveOk = liveProbe ? liveProbe.ok : routeProbe?.ok || false;
  let state = "bad";
  if (envReady && routeOk && liveOk) state = "ok";
  else if (routeOk || envReady) state = "warn";
  if (forceState) state = forceState;

  const detail = forceDetail || liveProbe?.data?.error || routeProbe?.data?.error || liveProbe?.error || routeProbe?.error || null;

  return {
    key,
    name,
    state,
    envReady,
    missing: missingEnv,
    routeOk,
    routeStatus: routeProbe?.status ?? null,
    routeMs: routeProbe?.ms ?? null,
    liveOk,
    liveStatus: liveProbe?.status ?? null,
    liveMs: liveProbe?.ms ?? null,
    liveLabel: liveLabel || null,
    detail,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Nur GET erlaubt." });
  }

  const env = buildEnvReadiness();

  const [envCheck, ebayStatus, ebayToken, ebayOrders, googleDrive, cjStatus] = await Promise.all([
    probe(req, "/api/env-check"),
    probe(req, "/api/ebay/status"),
    probe(req, "/api/ebay/token"),
    probe(req, "/api/ebay/orders?days=7"),
    probe(req, "/api/google-drive/status"),
    probe(req, "/api/cj/status"),
  ]);

  const ebayAccessDenied = ebayOrders.status === 403 && ebayOrders.data?.error === "seller_access_denied";
  const ebayScopeMissing = ebayOrders.status === 403 && !ebayAccessDenied;
  const ebayState = ebayOrders.ok ? "ok" : ebayToken.ok ? "warn" : ebayAccessDenied ? "bad" : undefined;
  const ebayDetail = ebayAccessDenied
    ? "Seller-Sitzung fehlt in der internen Orders-Prüfung. Bitte erneut im Seller Tool anmelden."
    : ebayScopeMissing
      ? "eBay ist verbunden, aber der Fulfillment-/Orders-Scope fehlt oder wurde noch nicht neu autorisiert."
      : null;

  const googleData = googleDrive.data || {};
  const googleState = googleData.connected === false ? "warn" : undefined;
  const googleDetail = googleData.connected === false ? "Google Drive OAuth ist vorbereitet, aber noch nicht verbunden." : null;

  const services = [
    summarizeService({ key: "env", name: "ENV Check", envFlags: {}, routeProbe: envCheck, liveProbe: envCheck, liveLabel: "System" }),
    summarizeService({ key: "ebay", name: "eBay", envFlags: env.ebay, routeProbe: ebayStatus, liveProbe: ebayOrders.ok ? ebayOrders : ebayToken, liveLabel: ebayOrders.ok ? "Orders live" : "Token/OAuth", forceState: ebayState, forceDetail: ebayDetail }),
    summarizeService({ key: "googleDrive", name: "Google Drive", envFlags: env.googleDrive, routeProbe: googleDrive, liveProbe: googleDrive, liveLabel: "OAuth/Status", forceState: googleState, forceDetail: googleDetail }),
    summarizeService({ key: "cj", name: "CJ Dropshipping", envFlags: env.cj, routeProbe: cjStatus, liveProbe: cjStatus, liveLabel: "Status" }),
    summarizeService({ key: "openai", name: "OpenAI", envFlags: env.openai, routeProbe: envCheck, liveProbe: envCheck, liveLabel: "Key vorhanden" }),
    summarizeService({ key: "deepseek", name: "DeepSeek", envFlags: env.deepseek, routeProbe: envCheck, liveProbe: envCheck, liveLabel: "Key vorhanden" }),
    summarizeService({ key: "qwen", name: "Qwen", envFlags: env.qwen, routeProbe: envCheck, liveProbe: envCheck, liveLabel: "Key vorhanden" }),
    summarizeService({ key: "upstash", name: "Upstash/KV", envFlags: env.upstash, routeProbe: envCheck, liveProbe: envCheck, liveLabel: "Token Store" }),
  ];

  const okCount = services.filter((service) => service.state === "ok").length;
  const warnCount = services.filter((service) => service.state === "warn").length;
  const badCount = services.filter((service) => service.state === "bad").length;

  return res.status(200).json({
    ok: true,
    checkedAt: new Date().toISOString(),
    summary: { total: services.length, ok: okCount, warn: warnCount, bad: badCount },
    nextActions: {
      ebayOrders: ebayAccessDenied
        ? "Seller Tool erneut anmelden."
        : ebayScopeMissing
          ? "EBAY_SCOPES um sell.fulfillment.readonly erweitern und eBay danach neu verbinden."
          : null,
      googleDrive: googleData.connected === false ? "Google Drive OAuth Flow erneut starten." : null,
    },
    services,
    probes: {
      envCheck,
      ebayStatus,
      ebayToken,
      ebayOrders,
      googleDrive,
      cjStatus,
    },
  });
}
