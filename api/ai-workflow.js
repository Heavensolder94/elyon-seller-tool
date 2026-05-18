const STORE_URL = process.env.ELYON_AGENT_RUNTIME_STORE_URL || "";
const STORE_TOKEN = process.env.ELYON_AGENT_RUNTIME_STORE_TOKEN || "";
const STORE_KEY = process.env.ELYON_AI_WORKFLOW_STORE_KEY || "elyon:ai-workflow";

function safeJsonParse(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function responseJson(res, status, body) {
  return res.status(status).json(body);
}

async function readStore() {
  if (!STORE_URL || !STORE_TOKEN) return null;
  const response = await fetch(`${STORE_URL.replace(/\/+$/, "")}/get/${encodeURIComponent(STORE_KEY)}`, {
    headers: { Authorization: `Bearer ${STORE_TOKEN}` },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) return null;
  return data?.result ? safeJsonParse(data.result) || data.result : null;
}

async function writeStore(payload) {
  if (!STORE_URL || !STORE_TOKEN) return false;
  const response = await fetch(`${STORE_URL.replace(/\/+$/, "")}/set/${encodeURIComponent(STORE_KEY)}/${encodeURIComponent(JSON.stringify(payload))}`, {
    headers: { Authorization: `Bearer ${STORE_TOKEN}` },
  });
  return response.ok;
}

function normalizePayload(body) {
  const source = body && typeof body === "object" ? body : {};
  return {
    tasks: Array.isArray(source.tasks) ? source.tasks : [],
    events: Array.isArray(source.events) ? source.events : [],
    logs: Array.isArray(source.logs) ? source.logs : [],
    updatedAt: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const stored = await readStore();
      return responseJson(res, 200, {
        ok: true,
        storeConfigured: Boolean(STORE_URL && STORE_TOKEN),
        data: stored && typeof stored === "object" ? stored : { tasks: [], events: [], logs: [], updatedAt: "" },
      });
    }

    if (req.method === "POST") {
      const payload = normalizePayload(req.body);
      const saved = await writeStore(payload);
      return responseJson(res, 200, {
        ok: true,
        saved,
        storeConfigured: Boolean(STORE_URL && STORE_TOKEN),
        data: payload,
      });
    }

    return responseJson(res, 405, { ok: false, error: "Nur GET und POST erlaubt" });
  } catch (error) {
    return responseJson(res, 500, {
      ok: false,
      error: error && error.message ? error.message : "AI workflow error",
    });
  }
}
