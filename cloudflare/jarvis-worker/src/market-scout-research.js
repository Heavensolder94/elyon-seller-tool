const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openrouter/free";
const MAX_CANDIDATES = 20;
const BATCH_SIZE = 5;
const REQUEST_TIMEOUT_MS = 120000;

const text = (value, max = 4000) => String(value ?? "").trim().slice(0, max);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const array = (value) => Array.isArray(value) ? value : [];
const unique = (items) => [...new Set(items.filter(Boolean))];

function safeUrl(value) {
  const candidate = text(value, 2000);
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    return /^https?:$/.test(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function number(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = text(value, 80).replace(/\s/g, "").replace(",", ".");
  const match = raw.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function parseJson(value) {
  const raw = text(value, 60000);
  if (!raw) return null;
  const candidates = [raw, raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim()];
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(raw.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return null;
}

function defaultProfile(payload = {}) {
  const source = object(payload.profile);
  return {
    sellingPriceMin: Math.max(1, number(source.sellingPriceMin) ?? 20),
    sellingPriceMax: Math.max(1, number(source.sellingPriceMax) ?? 80),
    targetMarginPercent: Math.max(1, number(source.targetMarginPercent) ?? 30),
    riskTolerance: text(source.riskTolerance, 80) || "low-medium",
    seasonality: text(source.seasonality, 80) || "evergreen",
    sourcing: text(source.sourcing, 120) || "EU supplier preferred; otherwise verified international supplier",
    category: text(source.category, 120) || "open / diversified",
  };
}

function normalizeCandidate(candidate, index) {
  const item = object(candidate);
  const purchasePrice = number(item.purchasePrice);
  const sellingPrice = number(item.sellingPrice);
  const estimatedMarginPercent = purchasePrice !== null && sellingPrice > 0
    ? Number((((sellingPrice - purchasePrice) / sellingPrice) * 100).toFixed(2))
    : number(item.estimatedMarginPercent);
  const supplierUrl = safeUrl(item.supplierUrl);
  const evidence = array(item.evidence).map((entry) => {
    if (typeof entry === "string") return { url: safeUrl(entry), label: "source", type: "web" };
    return {
      url: safeUrl(entry?.url || entry?.sourceUrl),
      label: text(entry?.label || entry?.title || entry?.evidence, 300),
      type: text(entry?.type || entry?.sourceType, 80) || "web",
    };
  }).filter((entry) => entry.url);
  const complete = Boolean(supplierUrl || evidence.length) && purchasePrice !== null && sellingPrice !== null;
  return {
    rank: index + 1,
    productName: text(item.productName || item.name, 220),
    category: text(item.category, 120),
    rationale: text(item.rationale, 900),
    demandSignal: text(item.demandSignal, 500) || "not sufficiently verified",
    competitionLevel: text(item.competitionLevel, 40).toLowerCase() || "unknown",
    purchasePrice,
    sellingPrice,
    estimatedMarginPercent,
    marginBasis: purchasePrice !== null && sellingPrice !== null ? "gross_before_marketplace_fees_and_returns" : "unknown",
    supplierSource: text(item.supplierSource, 180) || "unknown",
    supplierUrl: supplierUrl || null,
    riskLevel: text(item.riskLevel, 40).toLowerCase() || "unknown",
    risks: array(item.risks).slice(0, 8).map((entry) => text(entry, 300)).filter(Boolean),
    evidence,
    status: complete ? "research_only" : "needs_research",
  };
}

function researchPrompt({ payload, profile, count, excludedNames = [], batchIndex = 0 }) {
  return [
    "You are Elyon Jarvis Market Scout V1 for a German eBay dropshipping seller.",
    "This is read-only research. Never publish listings, place orders, contact customers, or mutate product/compliance data.",
    `Find exactly ${count} DISTINCT product opportunities. Batch: ${batchIndex + 1}.`,
    `Original request: ${text(payload.command, 4000) || "Find profitable low-risk product opportunities."}`,
    `Profile: ${JSON.stringify(profile)}`,
    excludedNames.length ? `Do not repeat these products: ${JSON.stringify(excludedNames.slice(0, 30))}` : "Avoid near-duplicate products.",
    "Prefer evergreen, low-to-medium risk products with manageable return risk and low regulatory burden.",
    "Avoid supplements, medical products, cosmetics, weapons, age-restricted products, counterfeit/branded-copy risks, high-voltage/mains electronics, batteries and children's safety products unless the evidence makes the risk clearly acceptable.",
    "Use current web search. For EACH candidate verify a plausible supplier source AND at least one independent demand/market signal.",
    "Never invent prices, demand, margins, supplier URLs, eBay evidence, compliance facts, or availability.",
    "purchasePrice and sellingPrice must be supported by web evidence. If you cannot verify both, omit the candidate and continue researching.",
    "estimatedMarginPercent is only a rough gross margin before eBay fees, returns, taxes and other costs; do not present it as net profit.",
    "Return ONLY JSON.",
    "Shape: {\"summary\":\"string\",\"warnings\":[\"string\"],\"candidates\":[{\"productName\":\"string\",\"category\":\"string\",\"rationale\":\"string\",\"demandSignal\":\"string\",\"competitionLevel\":\"low|medium|high|unknown\",\"purchasePrice\":number,\"sellingPrice\":number,\"supplierSource\":\"string\",\"supplierUrl\":\"https://...\",\"riskLevel\":\"low|medium|high|unknown\",\"risks\":[\"string\"],\"evidence\":[{\"url\":\"https://...\",\"label\":\"short evidence\",\"type\":\"supplier|market|manufacturer|web\"}]}]}",
  ].join("\n\n");
}

async function fetchWithTimeout(url, init, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("market_scout_timeout"), Math.max(1000, Number(timeoutMs) || REQUEST_TIMEOUT_MS));
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function runBatch({ env, payload, profile, count, excludedNames, batchIndex }) {
  if (!env?.OPENROUTER_API_KEY) {
    const error = new Error("openrouter_not_configured");
    error.retryable = false;
    throw error;
  }
  const model = text(env.OPENROUTER_RESEARCH_MODEL || env.OPENROUTER_MODEL || DEFAULT_MODEL, 200);
  let response;
  try {
    response = await fetchWithTimeout(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": text(env.OPENROUTER_HTTP_REFERER || env.ELYON_SELLER_TOOL_URL || "https://elyonsellertool.vercel.app", 500),
        "X-Title": text(env.OPENROUTER_APP_NAME || "Elyon Jarvis", 200),
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: researchPrompt({ payload, profile, count, excludedNames, batchIndex }) }],
        tools: [
          { type: "openrouter:web_search", parameters: { engine: "auto", max_results: 6, max_total_results: 16, search_context_size: "low" } },
          { type: "openrouter:web_fetch" },
        ],
        temperature: 0.1,
        max_tokens: 3500,
      }),
    });
  } catch (error) {
    const wrapped = new Error(error?.name === "AbortError" ? "market_scout_provider_timeout" : text(error?.message, 300) || "market_scout_network_error");
    wrapped.retryable = true;
    throw wrapped;
  }

  const rawText = await response.text();
  let body = null;
  try { body = rawText ? JSON.parse(rawText) : null; } catch {}
  if (!response.ok) {
    const error = new Error(text(body?.error?.message || body?.message || `openrouter_http_${response.status}`, 500));
    error.retryable = [408, 409, 429].includes(response.status) || response.status >= 500;
    throw error;
  }

  const message = body?.choices?.[0]?.message || {};
  const parsed = parseJson(message.content);
  if (!parsed || !Array.isArray(parsed.candidates)) {
    const error = new Error("openrouter_invalid_market_scout_json");
    error.retryable = true;
    throw error;
  }

  const usage = object(body?.usage);
  const toolUse = object(usage.server_tool_use);
  const annotations = array(message.annotations)
    .filter((entry) => entry?.type === "url_citation")
    .map((entry) => safeUrl(entry?.url_citation?.url))
    .filter(Boolean);
  return {
    model,
    summary: text(parsed.summary, 1600),
    warnings: array(parsed.warnings).slice(0, 10).map((entry) => text(entry, 400)).filter(Boolean),
    candidates: parsed.candidates.slice(0, count).map(normalizeCandidate).filter((item) => item.productName),
    citations: annotations,
    usage: {
      inputTokens: usage.prompt_tokens ?? usage.input_tokens ?? 0,
      outputTokens: usage.completion_tokens ?? usage.output_tokens ?? 0,
      totalTokens: usage.total_tokens ?? 0,
      webSearchRequests: Number(toolUse.web_search_requests || 0),
      amount: Number.isFinite(Number(usage.cost)) ? Number(usage.cost) : 0,
    },
  };
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  const output = [];
  for (const candidate of candidates) {
    const key = text(candidate.productName, 220).toLowerCase().replace(/[^a-z0-9äöüß]+/gi, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(candidate);
  }
  return output;
}

async function researchMarketScout({ env, payload = {} } = {}) {
  const requestedCount = Math.max(1, Math.min(MAX_CANDIDATES, Number(payload.requestedCount || payload.profile?.requestedCount || 10) || 10));
  const profile = defaultProfile(payload);
  const firstBatches = [];
  for (let offset = 0; offset < requestedCount; offset += BATCH_SIZE) {
    firstBatches.push({ count: Math.min(BATCH_SIZE, requestedCount - offset), batchIndex: firstBatches.length });
  }

  const settled = await Promise.allSettled(firstBatches.map((batch) => runBatch({
    env,
    payload,
    profile,
    count: batch.count,
    excludedNames: [],
    batchIndex: batch.batchIndex,
  })));

  const successful = settled.filter((entry) => entry.status === "fulfilled").map((entry) => entry.value);
  let candidates = dedupeCandidates(successful.flatMap((entry) => entry.candidates));
  const warnings = successful.flatMap((entry) => entry.warnings);
  for (const entry of settled) {
    if (entry.status === "rejected") warnings.push(`Ein Research-Teilauftrag konnte nicht abgeschlossen werden: ${text(entry.reason?.message, 200) || "provider_error"}`);
  }

  if (candidates.length < requestedCount && successful.length) {
    const remaining = Math.min(BATCH_SIZE, requestedCount - candidates.length);
    try {
      const fill = await runBatch({
        env,
        payload,
        profile,
        count: remaining,
        excludedNames: candidates.map((item) => item.productName),
        batchIndex: firstBatches.length,
      });
      successful.push(fill);
      candidates = dedupeCandidates([...candidates, ...fill.candidates]);
      warnings.push(...fill.warnings);
    } catch (error) {
      warnings.push(`Nachrecherche konnte nicht abgeschlossen werden: ${text(error?.message, 200) || "provider_error"}`);
    }
  }

  candidates = candidates.slice(0, requestedCount).map((candidate, index) => ({ ...candidate, rank: index + 1 }));
  if (!candidates.length) {
    const error = new Error("market_scout_no_verified_candidates");
    error.retryable = settled.some((entry) => entry.status === "rejected" && entry.reason?.retryable !== false);
    throw error;
  }
  if (candidates.length < requestedCount) warnings.push(`Nur ${candidates.length} von ${requestedCount} Kandidaten konnten ausreichend belegt werden.`);

  const usage = successful.reduce((total, entry) => ({
    inputTokens: total.inputTokens + Number(entry.usage.inputTokens || 0),
    outputTokens: total.outputTokens + Number(entry.usage.outputTokens || 0),
    totalTokens: total.totalTokens + Number(entry.usage.totalTokens || 0),
    webSearchRequests: total.webSearchRequests + Number(entry.usage.webSearchRequests || 0),
    amount: total.amount + Number(entry.usage.amount || 0),
  }), { inputTokens: 0, outputTokens: 0, totalTokens: 0, webSearchRequests: 0, amount: 0 });

  return {
    processed: true,
    handler: "market-scout-handler-v1",
    status: candidates.length === requestedCount ? "research_complete" : "partial",
    requestedCount,
    count: candidates.length,
    profile,
    summary: candidates.length === requestedCount
      ? `${candidates.length} belegte Produktkandidaten wurden im Hintergrund recherchiert.`
      : `${candidates.length} belastbare Produktkandidaten wurden gefunden; fehlende Kandidaten wurden nicht erfunden.`,
    warnings: unique(warnings).slice(0, 12),
    candidates,
    citations: unique(successful.flatMap((entry) => entry.citations)),
    provider: "openrouter",
    model: successful[0]?.model || text(env.OPENROUTER_RESEARCH_MODEL || env.OPENROUTER_MODEL || DEFAULT_MODEL, 200),
    cost: {
      provider: "openrouter",
      model: successful[0]?.model || text(env.OPENROUTER_RESEARCH_MODEL || env.OPENROUTER_MODEL || DEFAULT_MODEL, 200),
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      webSearchRequests: usage.webSearchRequests,
      amount: Number(usage.amount.toFixed(8)),
      unit: "openrouter_credits",
    },
    safety: {
      readOnly: true,
      draftOnly: true,
      nothingMutated: true,
      livePublishingAllowed: false,
      supplierOrderingAllowed: false,
    },
  };
}

export { researchMarketScout };
