const MAX_CANDIDATES = 20;
const DEFAULT_WORKER_URL = "https://elyon-jarvis-worker.mailvahanam-raoul.workers.dev";
const DEFAULT_QUEUE_TIMEOUT_MS = 10000;

const DEFAULT_MARKET_SCOUT_PROFILE = Object.freeze({
  sellingPriceMin: 20,
  sellingPriceMax: 80,
  targetMarginPercent: 30,
  riskTolerance: "low-medium",
  seasonality: "evergreen",
  sourcing: "EU supplier preferred; otherwise verified international supplier",
});

function clean(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function requestedCount(command) {
  const match = clean(command, 12000).match(/\b(\d{1,3})\b[^.!?\n]{0,60}(?:produkt|ideen|vorschl[aä]ge|kandidaten)/i);
  return Math.min(MAX_CANDIDATES, Math.max(1, Number(match?.[1] || 10)));
}

function parsePriceRange(source) {
  const explicit = clean(source, 12000).match(/(?:vk|verkauf|verkaufspreis|preis(?:bereich)?)\D{0,20}(\d{1,4})\s*(?:-|bis)\s*(\d{1,4})\s*€?/i);
  if (!explicit) return null;
  const first = Number(explicit[1]);
  const second = Number(explicit[2]);
  if (!Number.isFinite(first) || !Number.isFinite(second) || first <= 0 || second <= 0) return null;
  return { sellingPriceMin: Math.min(first, second), sellingPriceMax: Math.max(first, second) };
}

function parseTargetMargin(source) {
  const match = clean(source, 12000).match(/(?:marge|margin)\D{0,12}(?:mindestens|>=|≥)?\s*(\d{1,3})\s*%/i);
  const value = Number(match?.[1]);
  return Number.isFinite(value) && value > 0 && value <= 100 ? value : null;
}

function parseConstraints(command) {
  const source = clean(command, 12000);
  const category = source.match(/(?:im\s+bereich|in der|in dem|bereich|im)\s+([\p{L}\d][\p{L}\d &/-]{2,50})/iu)?.[1]?.trim() || "open / diversified";
  const priceRange = parsePriceRange(source);
  const margin = parseTargetMargin(source);
  const profile = {
    ...DEFAULT_MARKET_SCOUT_PROFILE,
    ...(priceRange || {}),
    ...(margin ? { targetMarginPercent: margin } : {}),
    category: clean(category, 80),
  };
  return {
    requestedCount: requestedCount(source),
    category: profile.category,
    draftOnly: true,
    query: source,
    profile,
    assumptionsUsed: {
      sellingPrice: !priceRange,
      targetMargin: !margin,
      riskTolerance: true,
      seasonality: true,
      sourcing: true,
    },
  };
}

function workerBaseUrl(env = process.env, override = "") {
  const candidate = clean(override || env.JARVIS_TASK_RUNTIME_URL || env.ELYON_JARVIS_WORKER_URL || DEFAULT_WORKER_URL, 1000).replace(/\/+$/, "");
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:") throw new Error("invalid_protocol");
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return DEFAULT_WORKER_URL;
  }
}

async function fetchWithTimeout(fetchImpl, url, init, timeoutMs = DEFAULT_QUEUE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("market_scout_queue_timeout"), Math.max(1000, Number(timeoutMs) || DEFAULT_QUEUE_TIMEOUT_MS));
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function runMarketScout({
  command,
  env = process.env,
  fetchImpl = fetch,
  workerUrl = "",
  queueTimeoutMs = DEFAULT_QUEUE_TIMEOUT_MS,
} = {}) {
  const constraints = parseConstraints(command);
  const baseUrl = workerBaseUrl(env, workerUrl);
  const statusToken = crypto.randomUUID();
  let response;
  try {
    response = await fetchWithTimeout(fetchImpl, `${baseUrl}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "market-scout",
        payload: {
          command: constraints.query,
          requestedCount: constraints.requestedCount,
          profile: constraints.profile,
          assumptionsUsed: constraints.assumptionsUsed,
          statusToken,
          source: "seller_tool_jarvis",
          requestedAt: new Date().toISOString(),
        },
      }),
    }, queueTimeoutMs);
  } catch (error) {
    return {
      ok: false,
      mode: "market_scout_degraded",
      reason: error?.name === "AbortError" ? "market_scout_queue_timeout" : "market_scout_queue_unavailable",
      requestedCount: constraints.requestedCount,
      summary: "Der Market-Scout-Hintergrundauftrag konnte gerade nicht sicher in die Queue gestellt werden. Es wurden keine Kandidaten erfunden.",
      warnings: [clean(error?.message, 300) || "Jarvis Task Runtime nicht erreichbar."],
      safety: { draftOnly: true, externalActionsLocked: true, nothingMutated: true },
    };
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok !== true || !body?.task?.id) {
    return {
      ok: false,
      mode: "market_scout_degraded",
      reason: "market_scout_queue_rejected",
      requestedCount: constraints.requestedCount,
      summary: "Die Jarvis Task Runtime hat den Market-Scout-Auftrag nicht bestätigt. Es wurden keine Kandidaten erfunden.",
      warnings: [clean(body?.error || body?.message || `worker_http_${response.status}`, 300)],
      safety: { draftOnly: true, externalActionsLocked: true, nothingMutated: true },
    };
  }

  const task = body.task;
  const statusUrl = `${baseUrl}/market-scout/tasks/${encodeURIComponent(task.id)}?token=${encodeURIComponent(statusToken)}`;
  return {
    ok: true,
    mode: "market_scout_queued",
    handler: "market-scout-handler-v1",
    status: "queued",
    requestedCount: constraints.requestedCount,
    count: 0,
    query: constraints.query,
    profile: constraints.profile,
    assumptionsUsed: constraints.assumptionsUsed,
    summary: `Market Scout läuft im Hintergrund. Ich starte mit ${constraints.requestedCount} Kandidaten, Evergreen-Fokus, ${constraints.profile.sellingPriceMin}–${constraints.profile.sellingPriceMax} € VK, mindestens ${constraints.profile.targetMarginPercent} % Zielmarge und niedrigem bis mittlerem Risiko. Fehlende Vorgaben habe ich bewusst mit diesen Standardannahmen ergänzt.`,
    warnings: [],
    candidates: [],
    task: {
      id: clean(task.id, 120),
      type: "market-scout",
      status: clean(task.status, 40) || "queued",
      progress: Number(task.progress || 0),
      statusUrl,
    },
    safety: {
      draftOnly: true,
      readOnlyResearch: true,
      externalActionsLocked: true,
      nothingMutated: true,
      browserIndependent: true,
    },
  };
}

function isMarketScoutCommand(command, plan) {
  const value = clean(command, 12000);
  return ["product_discovery", "market_research"].includes(clean(plan?.intent?.id, 100)) || /(?:suche|finde|recherchier|ideen|produktkandidaten|marktanalyse|marktforschung|market scout|produktvorschl[aä]ge).*(?:produkt|ebay|dropship|nachfrage|wettbewerb|konkurrenz)|\b(?:produktideen|produktkandidaten)\b/i.test(value);
}

export {
  DEFAULT_MARKET_SCOUT_PROFILE,
  DEFAULT_QUEUE_TIMEOUT_MS,
  DEFAULT_WORKER_URL,
  isMarketScoutCommand,
  parseConstraints,
  runMarketScout,
  workerBaseUrl,
};
