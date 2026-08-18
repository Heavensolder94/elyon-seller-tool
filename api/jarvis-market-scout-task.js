import { requireSellerAccess } from "../lib/seller-access.js";
import { workerBaseUrl } from "../lib/jarvis-market-scout.js";

const STATUS_TIMEOUT_MS = 10000;
const TASK_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function publicMarketScoutTask(task = {}) {
  return {
    id: text(task.id, 120),
    type: "market-scout",
    status: text(task.status, 40),
    progress: Number(task.progress || 0),
    output: task.output && typeof task.output === "object" ? task.output : null,
    error: text(task.error, 1000) || null,
    lastError: text(task.lastError, 1000) || null,
    attemptCount: Number(task.attemptCount || 0),
    maxAttempts: Number(task.maxAttempts || 0),
    createdAt: text(task.createdAt, 100) || null,
    updatedAt: text(task.updatedAt, 100) || null,
    startedAt: text(task.startedAt, 100) || null,
    finishedAt: text(task.finishedAt, 100) || null,
  };
}

async function fetchTask(fetchImpl, url, timeoutMs = STATUS_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("market_scout_status_timeout"), timeoutMs);
  try {
    return await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  if (!requireSellerAccess(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "method_not_allowed", message: "Nur GET ist erlaubt." });
  }

  const id = text(firstQueryValue(req.query?.id), 120);
  if (!TASK_ID_PATTERN.test(id)) {
    return res.status(400).json({ ok: false, error: "invalid_market_scout_task_id" });
  }

  const baseUrl = workerBaseUrl(process.env);
  let response;
  try {
    response = await fetchTask(fetch, `${baseUrl}/tasks/${encodeURIComponent(id)}`);
  } catch (error) {
    const timeout = error?.name === "AbortError";
    return res.status(502).json({
      ok: false,
      error: timeout ? "market_scout_status_timeout" : "market_scout_status_unavailable",
    });
  }

  const body = await response.json().catch(() => ({}));
  if (response.status === 404 || body?.error === "task_not_found") {
    return res.status(404).json({ ok: false, error: "market_scout_task_not_found" });
  }
  if (!response.ok || body?.ok !== true || !body?.task) {
    return res.status(502).json({ ok: false, error: "market_scout_status_unavailable" });
  }
  if (body.task.type !== "market-scout") {
    return res.status(404).json({ ok: false, error: "market_scout_task_not_found" });
  }

  return res.status(200).json({ ok: true, task: publicMarketScoutTask(body.task) });
}

export { publicMarketScoutTask };
