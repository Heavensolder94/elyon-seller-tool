const DEFAULT_FLAGS = {
  mobileLiveDashboard: {
    enabled: true,
    version: "v1.1",
    label: "Mobile Live Dashboard",
    description: "Live-Kennzahlen, eBay Orders, Health und Google Drive Status.",
    status: "stable",
  },
  scannerV2: {
    enabled: false,
    version: "v1.2",
    label: "Scanner V2",
    description: "Barcode-Erkennung, AI Vision, eBay Suchvorschläge und Produktidee übernehmen.",
    status: "prepared",
  },
  brainContextV2: {
    enabled: false,
    version: "v1.3",
    label: "Brain Context V2",
    description: "Brain nutzt Orders, Health, Scanner-Ergebnisse und Tagesfokus als Kontext.",
    status: "prepared",
  },
  pushFoundation: {
    enabled: false,
    version: "v1.4",
    label: "Push Notifications",
    description: "Grundlage für Verkaufs-, Backup- und API-Warnungen.",
    status: "prepared",
  },
  agentAutomation: {
    enabled: false,
    version: "v1.5",
    label: "Agent Automation",
    description: "Virtuelle Mitarbeiter, Produkt-Agent, Preis-Agent und Risiko-Agent.",
    status: "prepared",
  },
};

function getUpstashConfig() {
  return {
    url: process.env.FEATURE_FLAGS_STORE_URL || process.env.EBAY_TOKEN_STORE_URL || process.env.GOOGLE_DRIVE_TOKEN_STORE_URL || "",
    token: process.env.FEATURE_FLAGS_STORE_TOKEN || process.env.EBAY_TOKEN_STORE_TOKEN || process.env.GOOGLE_DRIVE_TOKEN_STORE_TOKEN || "",
    key: process.env.FEATURE_FLAGS_STORE_KEY || "elyon-seller-tool:feature-flags:production",
  };
}

function getAdminToken() {
  return process.env.FEATURE_FLAGS_ADMIN_TOKEN || process.env.ELYON_ADMIN_TOKEN || "";
}

function isAuthorized(req) {
  const expected = getAdminToken();
  if (!expected) return false;
  const header = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  const query = String(req.query?.token || "").trim();
  return header === expected || query === expected;
}

async function readStoredFlags() {
  const { url, token, key } = getUpstashConfig();
  if (!url || !token) return null;
  try {
    const response = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json().catch(() => null);
    const value = data?.result;
    if (!response.ok || !value) return null;
    if (typeof value === "string") return JSON.parse(value);
    return value;
  } catch {
    return null;
  }
}

async function writeStoredFlags(flags) {
  const { url, token, key } = getUpstashConfig();
  if (!url || !token) {
    return { ok: false, error: "Kein Feature-Flag-Store konfiguriert." };
  }

  const response = await fetch(`${url}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(flags),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    return { ok: false, error: data?.error || data?.message || `HTTP ${response.status}` };
  }
  return { ok: true };
}

function mergeFlags(stored = {}) {
  const merged = structuredClone(DEFAULT_FLAGS);
  for (const [key, value] of Object.entries(stored || {})) {
    if (!merged[key]) continue;
    merged[key] = { ...merged[key], ...value };
  }
  return merged;
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

export default async function handler(req, res) {
  const stored = await readStoredFlags();
  const flags = mergeFlags(stored || {});
  const store = getUpstashConfig();

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      flags,
      storeMode: store.url && store.token ? "upstash" : "none",
      canWrite: Boolean(getAdminToken()),
      checkedAt: new Date().toISOString(),
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Nur GET oder POST erlaubt." });
  }

  if (!isAuthorized(req)) {
    return res.status(403).json({
      ok: false,
      error: "Nicht autorisiert. Setze FEATURE_FLAGS_ADMIN_TOKEN oder ELYON_ADMIN_TOKEN in Vercel und sende ihn als Bearer Token.",
    });
  }

  const body = readBody(req);
  const key = String(body.key || "").trim();
  const enabled = Boolean(body.enabled);

  if (!key || !flags[key]) {
    return res.status(400).json({ ok: false, error: "Unbekannter Feature-Key.", available: Object.keys(flags) });
  }

  const nextFlags = mergeFlags(stored || {});
  nextFlags[key] = {
    ...nextFlags[key],
    enabled,
    updatedAt: new Date().toISOString(),
  };

  const writeResult = await writeStoredFlags(nextFlags);
  if (!writeResult.ok) {
    return res.status(500).json({ ok: false, error: writeResult.error });
  }

  return res.status(200).json({ ok: true, key, enabled, flags: nextFlags });
}
