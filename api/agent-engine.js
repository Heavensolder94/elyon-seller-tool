import { routeAIRequest } from "../lib/ai-provider-router.js";

const STORE_URL = process.env.ELYON_AGENT_RUNTIME_STORE_URL || "";
const STORE_TOKEN = process.env.ELYON_AGENT_RUNTIME_STORE_TOKEN || "";
const STORE_KEY = process.env.ELYON_AGENT_RUNTIME_KEY || "elyon:agent-runtime";
const AI_WORKFLOW_STORE_KEY = process.env.ELYON_AI_WORKFLOW_STORE_KEY || "elyon:ai-workflow";
const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";

function safeJsonParse(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return safeJsonParse(req.body) || {};
  return {};
}

function extractOutputText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  const output = Array.isArray(data?.output) ? data.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === "string" && part.text.trim()) return part.text.trim();
    }
  }
  return "";
}

function extractJson(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try { return JSON.parse(raw); } catch {}
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)); } catch {}
  }
  return null;
}

function normalizeMode(runtime) {
  const securityLocked = runtime?.settings?.securityMode !== false || runtime?.settings?.sandboxMode !== false;
  if (runtime?.settings?.pauseAllAgents === true || runtime?.settings?.pausedAll === true) return "paused";
  if (securityLocked) return "sandboxed";
  if (runtime?.settings?.advancedMode === true && runtime?.settings?.autonomyLocked === false) return "local";
  return "sandboxed";
}

function fallbackProductVision(barcode, note) {
  return {
    ok: true,
    mode: "fallback",
    source: "ai-workflow-product-vision",
    productName: barcode ? `Barcode Produkt ${barcode}` : "Unbekanntes Produkt",
    category: "Noch prüfen",
    searchKeywords: barcode ? [barcode, "EAN", "eBay Deutschland"] : ["Produktfoto", "eBay Deutschland", "Dropshipping"],
    estimatedPurchasePrice: null,
    estimatedSellPrice: null,
    estimatedProfit: null,
    riskLevel: "medium",
    recommendation: "prüfen",
    notes: note || "Foto/Barcode wurde erfasst, aber die Vision-Analyse konnte nicht abgeschlossen werden.",
    nextSteps: ["eBay Konkurrenz prüfen", "Marge berechnen", "Lieferzeit und Risiko prüfen"]
  };
}

async function callOpenAI(payload) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY fehlt.");
  const response = await fetch(OPENAI_RESPONSES_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });
  const raw = await response.text();
  const data = safeJsonParse(raw) || {};
  if (!response.ok) throw new Error(data?.error?.message || raw || "OpenAI Fehler");
  return data;
}

async function handleProductVision(body, res) {
  const image = String(body.image || body.imageBase64 || "").trim();
  const barcode = String(body.barcode || "").trim();
  const context = String(body.context || body.prompt || "Mobile Produkt Scanner").trim();
  if (!image && !barcode) return res.status(400).json({ ok: false, error: "Bild oder Barcode fehlt." });
  if (!image) return res.status(200).json(fallbackProductVision(barcode, "Kein Bild vorhanden; nur Barcode erfasst."));

  try {
    const data = await callOpenAI({
      model: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: `Analysiere dieses Produktfoto für eBay Deutschland. Antworte nur als JSON mit: ok, mode, productName, category, visibleFeatures, searchKeywords, estimatedPurchasePrice, estimatedSellPrice, estimatedProfit, riskLevel, recommendation, notes, nextSteps. Empfehlung: nehmen, prüfen oder lassen. Barcode: ${barcode || "nicht erkannt"}. Kontext: ${context}` },
          { type: "input_image", image_url: image }
        ]
      }],
      max_output_tokens: 900
    });
    const parsed = extractJson(extractOutputText(data));
    if (!parsed) return res.status(200).json(fallbackProductVision(barcode, "AI Antwort war kein JSON."));
    return res.status(200).json({ ok: true, mode: "ai-vision", source: "ai-workflow-product-vision", barcode: barcode || null, ...parsed });
  } catch (error) {
    return res.status(200).json(fallbackProductVision(barcode, error.message || "Vision Fehler"));
  }
}

async function handleAiPrompt(body, res) {
  const prompt = String(body.prompt || "").trim();
  if (!prompt) return res.status(400).json({ ok: false, error: "Prompt fehlt." });

  const result = await routeAIRequest({
    provider: "deepseek",
    task: "mobile_command_center_text",
    prompt: `Du bist Elyon Brain im Mobile Command Center. Gib kurze, praktische Hilfe. Kontext: ${body.context || ""}\n\nFrage: ${prompt}`,
    temperature: 0.2,
    maxTokens: 700,
    allowFallback: true,
    safety: {
      securityMode: true,
      sandboxMode: true,
      autonomyLocked: true,
      requiresLiveAction: false,
      userApproved: false,
    },
  });

  if (!result.ok) {
    return res.status(200).json({
      ok: false,
      answer: "Live Brain konnte nicht antworten.",
      error: result.error?.message || "AI Fehler",
      source: "ai-workflow",
      provider: result.provider || null,
      model: result.model || null,
      fallbackUsed: Boolean(result.fallbackUsed),
    });
  }

  return res.status(200).json({
    ok: true,
    answer: result.content || "Keine Antwort erzeugt.",
    source: "ai-workflow",
    provider: result.provider,
    model: result.model,
    fallbackUsed: Boolean(result.fallbackUsed),
    usage: result.usage || null,
  });
}

async function readStore() {
  if (!STORE_URL || !STORE_TOKEN) return null;
  const response = await fetch(`${STORE_URL.replace(/\/+$/, "")}/get/${encodeURIComponent(STORE_KEY)}`, { headers: { Authorization: `Bearer ${STORE_TOKEN}` } });
  const data = await response.json().catch(() => null);
  if (!response.ok) return null;
  return data?.result ? safeJsonParse(data.result) || data.result : null;
}

async function writeStore(payload) {
  if (!STORE_URL || !STORE_TOKEN) return false;
  const response = await fetch(`${STORE_URL.replace(/\/+$/, "")}/set/${encodeURIComponent(STORE_KEY)}/${encodeURIComponent(JSON.stringify(payload))}`, { headers: { Authorization: `Bearer ${STORE_TOKEN}` } });
  return response.ok;
}

async function readAiWorkflowStore() {
  if (!STORE_URL || !STORE_TOKEN) return null;
  const response = await fetch(`${STORE_URL.replace(/\/+$/, "")}/get/${encodeURIComponent(AI_WORKFLOW_STORE_KEY)}`, { headers: { Authorization: `Bearer ${STORE_TOKEN}` } });
  const data = await response.json().catch(() => null);
  if (!response.ok) return null;
  return data?.result ? safeJsonParse(data.result) || data.result : null;
}

async function writeAiWorkflowStore(payload) {
  if (!STORE_URL || !STORE_TOKEN) return false;
  const response = await fetch(`${STORE_URL.replace(/\/+$/, "")}/set/${encodeURIComponent(STORE_KEY)}/${encodeURIComponent(JSON.stringify(payload))}`, { headers: { Authorization: `Bearer ${STORE_TOKEN}` } });
  return response.ok;
}

function summarizeRuntime(runtime) {
  const worker = runtime?.worker && typeof runtime.worker === "object" ? runtime.worker : {};
  const queue = Array.isArray(runtime?.queue) ? runtime.queue : [];
  const logs = Array.isArray(runtime?.logs) ? runtime.logs : [];
  return {
    workerStatus: worker.status || normalizeMode(runtime),
    mode: worker.mode || normalizeMode(runtime),
    queueLength: queue.length,
    logCount: logs.length,
    lastTick: worker.lastTick || "",
    lastRun: worker.lastRun || "",
    queuePreview: queue.slice(0, 5).map((item) => ({ id: item?.id || "", agentId: item?.agentId || "", title: item?.title || "", status: item?.status || "queued" }))
  };
}

function buildNextRuntime(runtime, req) {
  const now = new Date().toISOString();
  const next = runtime && typeof runtime === "object" ? { ...runtime } : {};
  next.settings = next.settings && typeof next.settings === "object" ? { ...next.settings } : {};
  next.worker = next.worker && typeof next.worker === "object" ? { ...next.worker } : {};
  next.worker.lastTick = now;
  next.worker.lastRun = now;
  next.worker.status = normalizeMode(next);
  next.worker.mode = next.worker.status;
  next.worker.notes = next.worker.notes || "Serverseitiger Status-Worker";
  next.worker.queueLength = Array.isArray(next.queue) ? next.queue.length : 0;
  next.source = req?.query?.tick ? "cron" : "manual";
  return next;
}

export default async function handler(req, res) {
  try {
    const body = readBody(req);
    if (req?.query?.action === "ai-workflow") {
      if (req.method === "GET") {
        const stored = await readAiWorkflowStore();
        return res.status(200).json({ ok: true, storeConfigured: Boolean(STORE_URL && STORE_TOKEN), data: stored && typeof stored === "object" ? stored : { tasks: [], events: [], logs: [], updatedAt: "" } });
      }
      if (req.method === "POST") {
        if (body.action === "product-vision" || body.mode === "product-vision" || body.image || body.imageBase64) return handleProductVision(body, res);
        if (body.prompt && !Array.isArray(body.tasks) && !Array.isArray(body.events) && !Array.isArray(body.logs)) return handleAiPrompt(body, res);
        const payload = { tasks: Array.isArray(body.tasks) ? body.tasks : [], events: Array.isArray(body.events) ? body.events : [], logs: Array.isArray(body.logs) ? body.logs : [], updatedAt: new Date().toISOString() };
        const saved = await writeAiWorkflowStore(payload);
        return res.status(200).json({ ok: true, saved, storeConfigured: Boolean(STORE_URL && STORE_TOKEN), data: payload });
      }
    }

    const runtimeFromBody = body && typeof body === "object" ? body.runtime : null;
    const requestSettings = body && typeof body === "object" && body.settings && typeof body.settings === "object" ? body.settings : null;
    const storedRuntime = runtimeFromBody || (await readStore());
    const nextRuntime = buildNextRuntime(requestSettings ? { ...storedRuntime, settings: requestSettings } : storedRuntime, req);
    if ((runtimeFromBody || storedRuntime) && STORE_URL && STORE_TOKEN) await writeStore(nextRuntime);
    return res.status(200).json({ ok: true, stored: Boolean(storedRuntime), runtime: summarizeRuntime(nextRuntime), storeConfigured: Boolean(STORE_URL && STORE_TOKEN), tick: Boolean(req?.query?.tick || body?.action === "tick") });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error && error.message ? error.message : "Agent engine error" });
  }
}
