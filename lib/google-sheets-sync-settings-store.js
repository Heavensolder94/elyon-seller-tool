import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import process from "node:process";

function normalizeMode() {
  const explicit = String(process.env.GOOGLE_SHEETS_SYNC_STORE_MODE || "").trim().toLowerCase();
  if (explicit.includes("upstash")) return "upstash";
  if (explicit.includes("file")) return "file";

  if (process.env.GOOGLE_SHEETS_SYNC_STORE_URL && process.env.GOOGLE_SHEETS_SYNC_STORE_TOKEN) {
    return "upstash";
  }

  if (process.env.EBAY_TOKEN_STORE_URL && process.env.EBAY_TOKEN_STORE_TOKEN) {
    return "upstash";
  }

  return "file";
}

function getStoreKey() {
  return process.env.GOOGLE_SHEETS_SYNC_STORE_KEY || "elyon-seller-tool:google-sheets-sync-settings";
}

function getFilePath() {
  return process.env.GOOGLE_SHEETS_SYNC_STORE_PATH || "./data/google-sheets-sync-settings.json";
}

function getUpstashConfig() {
  return {
    url: process.env.GOOGLE_SHEETS_SYNC_STORE_URL || process.env.EBAY_TOKEN_STORE_URL || "",
    token: process.env.GOOGLE_SHEETS_SYNC_STORE_TOKEN || process.env.EBAY_TOKEN_STORE_TOKEN || "",
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
    return { ok: false, error: error?.message || "Lokales Schreiben fehlgeschlagen.", path: filePath };
  }
}

async function readUpstash() {
  const { url, token } = getUpstashConfig();
  if (!url || !token) return null;

  const response = await fetch(`${url}/get/${encodeURIComponent(getStoreKey())}`, {
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
      return { url: value };
    }
  }

  return value && typeof value === "object" ? value : null;
}

async function writeUpstash(payload) {
  const { url, token } = getUpstashConfig();
  if (!url || !token) {
    return { ok: false, error: "GOOGLE_SHEETS_SYNC_STORE_URL oder GOOGLE_SHEETS_SYNC_STORE_TOKEN fehlt.", path: null };
  }

  const response = await fetch(`${url}/set/${encodeURIComponent(getStoreKey())}`, {
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

export async function readSettings() {
  const mode = normalizeMode();
  if (mode === "upstash") {
    const stored = await readUpstash();
    if (stored) return stored;
    return null;
  }

  return readLocalFile();
}

export async function writeSettings(payload) {
  const mode = normalizeMode();
  if (mode === "upstash") {
    return writeUpstash(payload);
  }

  return writeLocalFile(payload);
}

export function getSettingsStoreDescription() {
  const mode = normalizeMode();
  if (mode === "upstash") {
    return {
      mode,
      key: getStoreKey(),
      hasCredentials: Boolean(
        (process.env.GOOGLE_SHEETS_SYNC_STORE_URL && process.env.GOOGLE_SHEETS_SYNC_STORE_TOKEN) ||
          (process.env.EBAY_TOKEN_STORE_URL && process.env.EBAY_TOKEN_STORE_TOKEN)
      ),
    };
  }

  return {
    mode,
    path: getFilePath(),
  };
}
