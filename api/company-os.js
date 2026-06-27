import crypto from "node:crypto";

function getRedisConfig() {
  const pairs = [
    { source: "custom_upstash_backup", url: process.env.UPSTASH_BACKUP_URL, token: process.env.UPSTASH_BACKUP_TOKEN },
    { source: "upstash_redis_rest", url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN },
    { source: "vercel_kv_rest", url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN },
  ];
  return pairs.find((pair) => pair.url && pair.token) || { source: "memory", url: "", token: "" };
}

async function redisCommand(command) {
  const { url, token } = getRedisConfig();
  if (!url || !token) return null;
  const response = await fetch(url.replace(/\/$/, ""), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw new Error(`Redis REST ${response.status}`);
  return response.json().catch(() => null);
}

function parseStored(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeSyncCode(value) {
  return String(value || "").trim();
}

function validateSyncCode(syncCode) {
  if (!syncCode) return "Sync-Code fehlt.";
  if (syncCode.length < 6) return "Sync-Code muss mindestens 6 Zeichen haben.";
  if (syncCode.length > 80) return "Sync-Code ist zu lang.";
  return "";
}

function syncKey(syncCode) {
  const hash = crypto.createHash("sha256").update(syncCode).digest("hex").slice(0, 32);
  return `elyon_company_os:${hash}`;
}

function sanitizeState(input) {
  const state = input && typeof input === "object" ? input : {};
  return {
    tasks: Array.isArray(state.tasks) ? state.tasks.slice(0, 500) : [],
    products: Array.isArray(state.products) ? state.products.slice(0, 500) : [],
    listings: Array.isArray(state.listings) ? state.listings.slice(0, 500) : [],
    money: Array.isArray(state.money) ? state.money.slice(0, 500) : [],
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const config = getRedisConfig();

  try {
    if (req.method === "GET") {
      return res.status(200).json({
        ok: true,
        route: "/api/company-os",
        storage: {
          configured: Boolean(config.url && config.token),
          source: config.source,
          mode: config.url && config.token ? "upstash" : "server_memory_disabled",
        },
        actions: ["load", "save"],
      });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Nur GET und POST erlaubt." });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const action = String(body.action || "").trim().toLowerCase();
    const syncCode = normalizeSyncCode(body.syncCode || body.key || body.code);
    const validationError = validateSyncCode(syncCode);
    if (validationError) return res.status(400).json({ ok: false, error: validationError });

    if (!config.url || !config.token) {
      return res.status(503).json({
        ok: false,
        error: "Upstash/KV ist nicht konfiguriert.",
        storage: { configured: false, source: config.source },
      });
    }

    const key = syncKey(syncCode);

    if (action === "load") {
      const data = await redisCommand(["GET", key]);
      const stored = parseStored(data?.result);
      return res.status(200).json({
        ok: true,
        action: "load",
        found: Boolean(stored?.state),
        state: sanitizeState(stored?.state),
        updatedAt: stored?.updatedAt || null,
        storage: { configured: true, source: config.source },
      });
    }

    if (action === "save") {
      const state = sanitizeState(body.state);
      const payload = {
        version: "company-os-start-v1",
        updatedAt: new Date().toISOString(),
        state,
      };
      await redisCommand(["SET", key, JSON.stringify(payload)]);
      return res.status(200).json({
        ok: true,
        action: "save",
        updatedAt: payload.updatedAt,
        counts: {
          tasks: state.tasks.length,
          products: state.products.length,
          listings: state.listings.length,
          money: state.money.length,
        },
        storage: { configured: true, source: config.source },
      });
    }

    return res.status(400).json({ ok: false, error: "Unbekannte action. Nutze 'load' oder 'save'." });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      route: "/api/company-os",
      error: error?.message || "Company OS Sync Fehler",
      storage: { configured: Boolean(config.url && config.token), source: config.source },
    });
  }
}
