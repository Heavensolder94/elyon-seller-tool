import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import process from "node:process";

function normalizeEnvironment(value) {
  return String(value || "production").toLowerCase() === "sandbox" ? "sandbox" : "production";
}

function getStoreMode() {
  const explicit = String(process.env.EBAY_TOKEN_STORE_MODE || "").toLowerCase();
  if (explicit) return explicit;
  if (process.env.EBAY_TOKEN_STORE_URL && process.env.EBAY_TOKEN_STORE_TOKEN) return "upstash";
  return "file";
}

function getStoreKey(environment) {
  const env = normalizeEnvironment(environment);
  return process.env.EBAY_TOKEN_STORE_KEY || `elyon-seller-tool:ebay-refresh-token:${env}`;
}

function getFilePath() {
  return process.env.EBAY_TOKEN_STORE_PATH || "./data/ebay-refresh-token.json";
}

function getUpstashConfig() {
  return {
    url: process.env.EBAY_TOKEN_STORE_URL || "",
    token: process.env.EBAY_TOKEN_STORE_TOKEN || "",
  };
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
    return { ok: true, path: filePath };
  } catch (error) {
    return { ok: false, error: error.message, path: filePath };
  }
}

async function readUpstash(environment) {
  const { url, token } = getUpstashConfig();
  if (!url || !token) return null;

  const response = await fetch(`${url}/get/${encodeURIComponent(getStoreKey(environment))}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) return null;

  const value = data?.result;
  if (!value) return null;

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return { refresh_token: value };
    }
  }

  return value && typeof value === "object" ? value : null;
}

async function writeUpstash(environment, payload) {
  const { url, token } = getUpstashConfig();
  if (!url || !token) {
    return { ok: false, error: "EBAY_TOKEN_STORE_URL oder EBAY_TOKEN_STORE_TOKEN fehlt.", path: null };
  }

  const response = await fetch(`${url}/set/${encodeURIComponent(getStoreKey(environment))}`, {
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
      error: data?.error || data?.message || `Upstash write failed with HTTP ${response.status}`,
      path: url,
    };
  }

  return { ok: true, path: url };
}

export async function readToken(environment) {
  const mode = getStoreMode();
  if (mode === "upstash") {
    const stored = await readUpstash(environment);
    if (stored) return stored;
    return null;
  }

  return readLocalFile();
}

export async function writeToken(environment, payload) {
  const mode = getStoreMode();
  if (mode === "upstash") {
    return writeUpstash(environment, payload);
  }

  return writeLocalFile(payload);
}

export function getTokenStoreDescription(environment) {
  const mode = getStoreMode();
  if (mode === "upstash") {
    return {
      mode,
      key: getStoreKey(environment),
      hasCredentials: Boolean(process.env.EBAY_TOKEN_STORE_URL && process.env.EBAY_TOKEN_STORE_TOKEN),
    };
  }

  return {
    mode,
    path: getFilePath(),
  };
}
