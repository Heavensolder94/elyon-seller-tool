import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import process from "node:process";

function normalizeEnvironment(value) {
  return String(value || "production").toLowerCase() === "sandbox" ? "sandbox" : "production";
}

function getUpstashConfig() {
  if (process.env.EBAY_TOKEN_STORE_URL && process.env.EBAY_TOKEN_STORE_TOKEN) {
    return {
      source: "ebay_token_store",
      url: process.env.EBAY_TOKEN_STORE_URL,
      token: process.env.EBAY_TOKEN_STORE_TOKEN,
    };
  }

  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return {
      source: "upstash_redis_rest",
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    };
  }

  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    return {
      source: "vercel_kv_rest",
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    };
  }

  return { source: "none", url: "", token: "" };
}

function isHostedProduction() {
  return Boolean(process.env.VERCEL || process.env.VERCEL_ENV || process.env.NODE_ENV === "production");
}

function getStoreMode() {
  const explicit = String(process.env.EBAY_TOKEN_STORE_MODE || "").trim().toLowerCase();
  if (explicit.includes("upstash") || explicit.includes("redis") || explicit.includes("kv")) return "upstash";
  if (explicit.includes("file")) return isHostedProduction() ? "unconfigured" : "file";

  const { url, token } = getUpstashConfig();
  if (url && token) return "upstash";
  return isHostedProduction() ? "unconfigured" : "file";
}

function getStoreKey(environment) {
  const env = normalizeEnvironment(environment);
  const explicit = String(process.env.EBAY_TOKEN_STORE_KEY || "").trim();
  if (!explicit) return `elyon-seller-tool:ebay-refresh-token:${env}`;
  if (explicit.includes("{environment}")) return explicit.replaceAll("{environment}", env);
  if (explicit.endsWith(`:${env}`)) return explicit;
  return `${explicit}:${env}`;
}

function getLegacyStoreKey() {
  return String(process.env.EBAY_TOKEN_STORE_KEY || "").trim();
}

function getFilePath() {
  return process.env.EBAY_TOKEN_STORE_PATH || "./data/ebay-refresh-token.json";
}

async function ensureDirectoryFor(filePath) {
  await mkdir(dirname(filePath), { recursive: true });
}

async function readLocalFile() {
  const filePath = getFilePath();
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function writeLocalFile(payload) {
  const filePath = getFilePath();
  try {
    await ensureDirectoryFor(filePath);
    await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
    return { ok: true, mode: "file", path: filePath };
  } catch (error) {
    return { ok: false, mode: "file", error: error.message, path: filePath };
  }
}

async function upstashGet(key) {
  const { url, token } = getUpstashConfig();
  if (!url || !token || !key) return null;

  const response = await fetch(`${url.replace(/\/$/, "")}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) return null;
  const value = data?.result;
  if (!value) return null;
  if (typeof value === "string") {
    try { return JSON.parse(value); }
    catch { return { refresh_token: value }; }
  }
  return value && typeof value === "object" ? value : null;
}

async function readUpstash(environment) {
  const current = await upstashGet(getStoreKey(environment));
  if (current) return current;

  const legacyKey = getLegacyStoreKey();
  if (legacyKey && legacyKey !== getStoreKey(environment)) {
    return upstashGet(legacyKey);
  }
  return null;
}

async function writeUpstash(environment, payload) {
  const { source, url, token } = getUpstashConfig();
  if (!url || !token) {
    return { ok: false, mode: "upstash", source, error: "Kein persistenter Upstash-/KV-Speicher für den eBay Token konfiguriert.", path: null };
  }

  const key = getStoreKey(environment);
  const response = await fetch(`${url.replace(/\/$/, "")}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      ok: false,
      mode: "upstash",
      source,
      error: data?.error || data?.message || `Upstash write failed with HTTP ${response.status}`,
      path: null,
    };
  }

  return { ok: true, mode: "upstash", source, path: key };
}

export async function readToken(environment) {
  const mode = getStoreMode();
  if (mode === "upstash") return readUpstash(environment);
  if (mode === "file") return readLocalFile();
  return null;
}

export async function writeToken(environment, payload) {
  const mode = getStoreMode();
  if (mode === "upstash") return writeUpstash(environment, payload);
  if (mode === "file") return writeLocalFile(payload);
  return {
    ok: false,
    mode: "unconfigured",
    error: "Persistenter eBay-Token-Speicher fehlt. Konfiguriere Upstash/KV, bevor eBay verbunden wird.",
    path: null,
  };
}

export function getTokenStoreDescription(environment) {
  const mode = getStoreMode();
  if (mode === "upstash") {
    const { source, url, token } = getUpstashConfig();
    return {
      mode,
      source,
      key: getStoreKey(environment),
      hasCredentials: Boolean(url && token),
      persistent: true,
    };
  }

  if (mode === "file") {
    return {
      mode,
      path: getFilePath(),
      persistent: false,
      localOnly: true,
    };
  }

  return {
    mode: "unconfigured",
    source: "none",
    persistent: false,
    hasCredentials: false,
    message: "Persistenter eBay-Token-Speicher fehlt.",
  };
}
