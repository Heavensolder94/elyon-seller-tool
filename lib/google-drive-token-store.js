import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import process from "node:process";

function getStoreMode() {
  const explicit = String(process.env.GOOGLE_DRIVE_TOKEN_STORE_MODE || process.env.EBAY_TOKEN_STORE_MODE || "").trim().toLowerCase();
  if (explicit.includes("upstash")) return "upstash";
  if (explicit.includes("file")) return "file";
  if (process.env.GOOGLE_DRIVE_TOKEN_STORE_URL && process.env.GOOGLE_DRIVE_TOKEN_STORE_TOKEN) return "upstash";
  if (process.env.EBAY_TOKEN_STORE_URL && process.env.EBAY_TOKEN_STORE_TOKEN) return "upstash";
  return "file";
}

function getStoreKey() {
  return process.env.GOOGLE_DRIVE_TOKEN_STORE_KEY || "elyon-seller-tool:google-drive-refresh-token:production";
}

function getStateStoreKey(state) {
  return `${process.env.GOOGLE_DRIVE_STATE_STORE_PREFIX || "elyon-seller-tool:google-drive-oauth-state"}:${state}`;
}

function getFilePath() {
  return process.env.GOOGLE_DRIVE_TOKEN_STORE_PATH || "./data/google-drive-refresh-token.json";
}

function getStateFilePath(state) {
  return `./data/google-drive-oauth-state-${String(state || "unknown").replace(/[^a-zA-Z0-9_-]/g, "")}.json`;
}

function getUpstashConfig() {
  return {
    url: process.env.GOOGLE_DRIVE_TOKEN_STORE_URL || process.env.EBAY_TOKEN_STORE_URL || "",
    token: process.env.GOOGLE_DRIVE_TOKEN_STORE_TOKEN || process.env.EBAY_TOKEN_STORE_TOKEN || "",
  };
}

async function ensureDirectoryFor(filePath) {
  await mkdir(dirname(filePath), { recursive: true });
}

async function readLocalJson(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function writeLocalJson(filePath, payload) {
  try {
    await ensureDirectoryFor(filePath);
    await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
    return { ok: true, path: filePath };
  } catch (error) {
    return { ok: false, error: error.message, path: filePath };
  }
}

async function readUpstashKey(key) {
  const { url, token } = getUpstashConfig();
  if (!url || !token) return null;

  const response = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) return null;

  const value = data?.result;
  if (!value) return null;

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return { value };
    }
  }

  return value && typeof value === "object" ? value : null;
}

async function writeUpstashKey(key, payload, ttlSeconds = null) {
  const { url, token } = getUpstashConfig();
  if (!url || !token) {
    return { ok: false, error: "GOOGLE_DRIVE_TOKEN_STORE_URL/TOKEN oder EBAY_TOKEN_STORE_URL/TOKEN fehlt.", path: null };
  }

  const setResponse = await fetch(`${url}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const setData = await setResponse.json().catch(() => null);
  if (!setResponse.ok) {
    return {
      ok: false,
      error: setData?.error || setData?.message || `Upstash write failed with HTTP ${setResponse.status}`,
      path: url,
    };
  }

  if (ttlSeconds) {
    await fetch(`${url}/expire/${encodeURIComponent(key)}/${Number(ttlSeconds)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null);
  }

  return { ok: true, path: url };
}

async function readLocalFile() {
  return readLocalJson(getFilePath());
}

async function writeLocalFile(payload) {
  return writeLocalJson(getFilePath(), payload);
}

async function readUpstash() {
  const value = await readUpstashKey(getStoreKey());
  if (!value) return null;
  if (value.value) return { refresh_token: value.value };
  return value;
}

async function writeUpstash(payload) {
  return writeUpstashKey(getStoreKey(), payload);
}

export async function readGoogleDriveToken() {
  const mode = getStoreMode();
  if (mode === "upstash") return readUpstash();
  return readLocalFile();
}

export async function writeGoogleDriveToken(payload) {
  const mode = getStoreMode();
  if (mode === "upstash") return writeUpstash(payload);
  return writeLocalFile(payload);
}

export async function writeGoogleDriveOAuthState(state, payload = {}) {
  if (!state) return { ok: false, error: "state fehlt" };
  const record = {
    state,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    ...payload,
  };

  const mode = getStoreMode();
  if (mode === "upstash") return writeUpstashKey(getStateStoreKey(state), record, 10 * 60);
  return writeLocalJson(getStateFilePath(state), record);
}

export async function readGoogleDriveOAuthState(state) {
  if (!state) return null;
  const mode = getStoreMode();
  const record = mode === "upstash"
    ? await readUpstashKey(getStateStoreKey(state))
    : await readLocalJson(getStateFilePath(state));

  if (!record) return null;
  if (record.expires_at && new Date(record.expires_at).getTime() < Date.now()) return null;
  return record;
}

export function getGoogleDriveTokenStoreDescription() {
  const mode = getStoreMode();
  if (mode === "upstash") {
    const config = getUpstashConfig();
    return {
      mode,
      key: getStoreKey(),
      statePrefix: process.env.GOOGLE_DRIVE_STATE_STORE_PREFIX || "elyon-seller-tool:google-drive-oauth-state",
      hasCredentials: Boolean(config.url && config.token),
    };
  }

  return {
    mode,
    path: getFilePath(),
  };
}
