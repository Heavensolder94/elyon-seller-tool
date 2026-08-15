const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openrouter/free";
const MAX_CANDIDATES = 20;
const BATCH_SIZE = 5;
const REQUEST_TIMEOUT_MS = 90000;
const MAX_TOOL_CALLS = 3;

const text = (value, max = 4000) => String(value ?? "").trim().slice(0, max);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const array = (value) => Array.isArray(value) ? value : [];
const unique = (items) => [...new Set(items.filter(Boolean))];

const MARKET_SCOUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    warnings: { type: "array", items: { type: "string" } },
    candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          productName: { type: "string" },
          category: { type: "string" },
          rationale: { type: "string" },
          demandSignal: { type: "string" },
          competitionLevel: { type: "string", enum: ["low", "medium", "high", "unknown"] },
          purchasePrice: { type: "number" },
          sellingPrice: { type: "number" },
          supplierSource: { type: "string" },
          supplierUrl: { type: "string" },
          supplierRegion: { type: "string" },
          dropshippingSupported: { type: "boolean" },
          supplierShipsPerOrder: { type: "boolean" },
          minimumOrderQuantity: { type: "integer", minimum: 1 },
          fulfillmentEvidence: { type: "string" },
          riskLevel: { type: "string", enum: ["low", "medium", "high", "unknown"] },
          risks: { type: "array", items: { type: "string" } },
          evidence: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                url: { type: "string" },
                label: { type: "string" },
                type: { type: "string", enum: ["supplier", "market", "manufacturer", "price", "web"] },
              },
              required: ["url", "label", "type"],
            },
          },
        },
        required: [
          "productName",
          "category",
          "rationale",
          "demandSignal",
          "competitionLevel",
          "purchasePrice",
          "sellingPrice",
          "supplierSource",
          "supplierUrl",
          "supplierRegion",
          "dropshippingSupported",
          "supplierShipsPerOrder",
          "minimumOrderQuantity",
          "fulfillmentEvidence",
          "riskLevel",
          "risks",
          "evidence"
        ],
      },
    },
  },
  required: ["summary", "warnings", "candidates"],
};

const MARKET_SCOUT_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "elyon_market_scout",
    strict: true,
    schema: MARKET_SCOUT_SCHEMA,
  },
};

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

function boundedNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseJson(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
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

function messageContentText(content) {
  if (typeof content === "string") return text(content, 60000);
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") return part;
      if (typeof part?.text === "string") return part.text;
      if (typeof part?.content === "string") return part.content;
      if (part?.json && typeof part.json === "object") return JSON.stringify(part.json);
      return "";
    }).filter(Boolean).join("\n");
  }
  if (content && typeof content === "object") {
    if (typeof content.text === "string") return text(content.text, 60000);
    if (typeof content.content === "string") return text(content.content, 60000);
    try { return JSON.stringify(content).slice(0, 60000); } catch { return ""; }
  }
  return "";
}

function parseMessageJson(message = {}) {
  const content = message?.content;
  if (content && typeof content === "object" && !Array.isArray(content) && Array.isArray(content.candidates)) return content;
  if (Array.isArray(content)) {
    for (const part of content) {
      const direct = part?.json && typeof part.json === "object" ? part.json : null;
      if (direct && Array.isArray(direct.candidates)) return direct;
      const parsedPart = parseJson(part?.text || part?.content || "");
      if (parsedPart && Array.isArray(parsedPart.candidates)) return parsedPart;
    }
  }
  const parsed = parseJson(messageContentText(content));
  return parsed && Array.isArray(parsed.candidates) ? parsed : null;
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
    : null;
  const supplierUrl = safeUrl(item.supplierUrl);
  const evidence = array(item.evidence).map((entry) => ({
    url: safeUrl(entry?.url || entry?.sourceUrl),
    label: text(entry?.label || entry?.title || entry?.evidence, 300),
    type: text(entry?.type || entry?.sourceType, 80).toLowerCase() || "web",
  })).filter((entry) => entry.url);
  const minimumOrderQuantity = Number.isFinite(Number(item.minimumOrderQuantity))
    ? Math.max(1, Math.round(Number(item.minimumOrderQuantity)))
    : null;
  const dropshippingSupported = item.dropshippingSupported === true;
  const supplierShipsPerOrder = item.supplierShipsPerOrder === true;
  const fulfillmentEvidence = text(item.fulfillmentEvidence, 600);
  const hasIndependentMarketEvidence = evidence.some((entry) => ["market", "price", "web"].includes(entry.type));
  const dropshippingFit = dropshippingSupported && supplierShipsPerOrder && minimumOrderQuantity === 1 && Boolean(fulfillmentEvidence);
  const complete = Boolean(supplierUrl) && hasIndependentMarketEvidence && purchasePrice !== null && sellingPrice !== null && dropshippingFit;

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
    supplierRegion: text(item.supplierRegion, 120) || "unknown",
    dropshippingSupported,
    supplierShipsPerOrder,
    minimumOrderQuantity,
    fulfillmentEvidence: fulfillmentEvidence || null,
    riskLevel: text(item.riskLevel, 40).toLowerCase() || "unknown",
    risks: array(item.risks).slice(0, 8).map((entry) => text(entry, 300)).filter(Boolean),
    evidence,
    status: complete ? "research_only" : "rejected_supplier_fit",
  };
}

function candidateMeetsProfile(candidate, profile) {
  if (candidate.status !== "research_only") return false;
  if (!["low", "medium"].includes(candidate.riskLevel)) return false;
  if (!Number.isFinite(candidate.sellingPrice) || candidate.sellingPrice < profile.sellingPriceMin || candidate.sellingPrice > profile.sellingPriceMax) return false;
  if (!Number.isFinite(candidate.estimatedMarginPercent) || candidate.estimatedMarginPercent < profile.targetMarginPercent) return false;
  return true;
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
    "Use current web search efficiently. Do not fetch full pages in this discovery pass unless the search evidence itself is insufficient.",
    "For EACH candidate verify a plausible supplier source AND at least one independent demand/market signal.",
    "CRITICAL DROPSHIPPING FIT: only include a candidate when supplier evidence explicitly supports dropshipping or single-order fulfillment, the supplier ships individual customer orders, and MOQ is 1. Wholesale/manufacturer offers with MOQ above 1 are NOT valid candidates and must be omitted.",
    "Do not infer dropshipping support from a generic wholesale page. dropshippingSupported, supplierShipsPerOrder, minimumOrderQuantity and fulfillmentEvidence must be grounded in supplier evidence.",
    "Never invent prices, demand, margins, supplier URLs, eBay evidence, fulfillment terms, compliance facts, or availability.",
    "purchasePrice and sellingPrice must be supported by web evidence. If you cannot verify both, omit the candidate and continue researching.",
    `Selling price must be between ${profile.sellingPriceMin} and ${profile.sellingPriceMax} EUR and rough gross margin must be at least ${profile.targetMarginPercent}%.`,
    "estimatedMarginPercent is calculated by the system from purchasePrice and sellingPrice; do not add that field.",
    "Return ONLY the JSON object required by the response schema.",
  ].join("\n\n");
}

function repairPrompt(rawContent) {
  return [
    "Repair the following Market Scout model output into the required JSON schema.",
    "Do not research, add, infer, or invent any new product facts, URLs, prices, margins, supplier terms, or demand claims.",
    "Preserve only claims that are explicitly present in the supplied output.",
    "If a candidate cannot satisfy the required fields from the supplied output alone, omit that candidate.",
    "Return only the JSON object required by the response schema.",
    "RAW MODEL OUTPUT:",
    text(rawContent, 30000),
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

function openRouterHeaders(env) {
  return {
    Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": text(env.OPENROUTER_HTTP_REFERER || env.ELYON_SELLER_TOOL_URL || "https://elyonsellertool.vercel.app", 500),
    "X-Title": text(env.OPENROUTER_APP_NAME || "Elyon Jarvis", 200),
  };
}

function searchTool(env) {
  return {
    type: "openrouter:web_search",
    parameters: {
      engine: text(env.OPENROUTER_RESEARCH_SEARCH_ENGINE, 40) || "exa",
      mode: text(env.OPENROUTER_RESEARCH_SEARCH_MODE, 40) || "fast",
      max_results: boundedNumber(env.OPENROUTER_RESEARCH_MAX_RESULTS, 4, 1, 8),
      max_total_results: boundedNumber(env.OPENROUTER_RESEARCH_MAX_TOTAL_RESULTS, 10, 1, 20),
      max_uses: boundedNumber(env.OPENROUTER_RESEARCH_MAX_SEARCHES, 3, 1, 5),
      max_characters: boundedNumber(env.OPENROUTER_RESEARCH_MAX_CHARACTERS, 2000, 500, 5000),
    },
  };
}

function isDailyQuotaError(message) {
  return /free-models-per-day|daily\s+(?:rate\s+)?limit|add\s+\d+\s+credits/i.test(text(message, 800));
}

function usageFromBody(body = {}) {
  const usage = object(body?.usage);
  const toolUse = object(usage.server_tool_use);
  return {
    inputTokens: Number(usage.prompt_tokens ?? usage.input_tokens ?? 0),
    outputTokens: Number(usage.completion_tokens ?? usage.output_tokens ?? 0),
    totalTokens: Number(usage.total_tokens ?? 0),
    webSearchRequests: Number(toolUse.web_search_requests || 0),
    amount: Number.isFinite(Number(usage.cost)) ? Number(usage.cost) : 0,
  };
}

function mergeUsage(left, right) {
  return {
    inputTokens: Number(left?.inputTokens || 0) + Number(right?.inputTokens || 0),
    outputTokens: Number(left?.outputTokens || 0) + Number(right?.outputTokens || 0),
    totalTokens: Number(left?.totalTokens || 0) + Number(right?.totalTokens || 0),
    webSearchRequests: Number(left?.webSearchRequests || 0) + Number(right?.webSearchRequests || 0),
    amount: Number(left?.amount || 0) + Number(right?.amount || 0),
  };
}

async function repairInvalidMarketScoutJson({ env, requestedModel, rawContent, timeoutMs }) {
  const source = text(rawContent, 30000);
  if (!source) {
    const error = new Error("openrouter_invalid_market_scout_json");
    error.retryable = false;
    throw error;
  }

  const repairModel = text(env.OPENROUTER_REPAIR_MODEL || requestedModel || DEFAULT_MODEL, 200);
  let response;
  try {
    response = await fetchWithTimeout(ENDPOINT, {
      method: "POST",
      headers: openRouterHeaders(env),
      body: JSON.stringify({
        model: repairModel,
        messages: [{ role: "user", content: repairPrompt(source) }],
        response_format: MARKET_SCOUT_RESPONSE_FORMAT,
        plugins: [{ id: "response-healing" }],
        provider: { require_parameters: true },
        temperature: 0,
        max_tokens: 2800,
      }),
    }, timeoutMs);
  } catch (error) {
    const wrapped = new Error(error?.name === "AbortError" ? "market_scout_repair_timeout" : text(error?.message, 300) || "market_scout_repair_network_error");
    wrapped.retryable = true;
    throw wrapped;
  }

  const rawText = await response.text();
  let body = null;
  try { body = rawText ? JSON.parse(rawText) : null; } catch {}
  if (!response.ok) {
    const message = text(body?.error?.message || body?.message || `openrouter_http_${response.status}`, 500);
    const error = new Error(message);
    error.retryable = !isDailyQuotaError(message) && ([408, 409, 429].includes(response.status) || response.status >= 500);
    throw error;
  }

  const parsed = parseMessageJson(body?.choices?.[0]?.message || {});
  if (!parsed) {
    const error = new Error("openrouter_invalid_market_scout_json");
    error.retryable = false;
    throw error;
  }

  return {
    parsed,
    model: text(body?.model, 200) || repairModel,
    usage: usageFromBody(body),
  };
}

async function runBatch({ env, payload, profile, count, excludedNames, batchIndex }) {
  if (!env?.OPENROUTER_API_KEY) {
    const error = new Error("openrouter_not_configured");
    error.retryable = false;
    throw error;
  }
  const requestedModel = text(env.OPENROUTER_RESEARCH_MODEL || env.OPENROUTER_MODEL || DEFAULT_MODEL, 200);
  const timeoutMs = boundedNumber(env.OPENROUTER_RESEARCH_TIMEOUT_MS, REQUEST_TIMEOUT_MS, 30000, 120000);
  const maxToolCalls = boundedNumber(env.OPENROUTER_RESEARCH_MAX_TOOL_CALLS, MAX_TOOL_CALLS, 1, 6);
  let response;
  try {
    response = await fetchWithTimeout(ENDPOINT, {
      method: "POST",
      headers: openRouterHeaders(env),
      body: JSON.stringify({
        model: requestedModel,
        messages: [{ role: "user", content: researchPrompt({ payload, profile, count, excludedNames, batchIndex }) }],
        tools: [searchTool(env)],
        max_tool_calls: maxToolCalls,
        response_format: MARKET_SCOUT_RESPONSE_FORMAT,
        plugins: [{ id: "response-healing" }],
        provider: { require_parameters: true },
        temperature: 0.1,
        max_tokens: 2800,
      }),
    }, timeoutMs);
  } catch (error) {
    const wrapped = new Error(error?.name === "AbortError" ? "market_scout_provider_timeout" : text(error?.message, 300) || "market_scout_network_error");
    wrapped.retryable = true;
    throw wrapped;
  }

  const rawText = await response.text();
  let body = null;
  try { body = rawText ? JSON.parse(rawText) : null; } catch {}
  if (!response.ok) {
    const message = text(body?.error?.message || body?.message || `openrouter_http_${response.status}`, 500);
    const error = new Error(message);
    error.retryable = !isDailyQuotaError(message) && ([408, 409, 429].includes(response.status) || response.status >= 500);
    throw error;
  }

  const message = body?.choices?.[0]?.message || {};
  let parsed = parseMessageJson(message);
  let model = text(body?.model, 200) || requestedModel;
  let combinedUsage = usageFromBody(body);
  let repaired = false;
  if (!parsed) {
    const repairSource = messageContentText(message.content) || text(message.reasoning, 30000) || (() => {
      try { return JSON.stringify(message).slice(0, 30000); } catch { return ""; }
    })();
    const repair = await repairInvalidMarketScoutJson({ env, requestedModel, rawContent: repairSource, timeoutMs });
    parsed = repair.parsed;
    model = repair.model || model;
    combinedUsage = mergeUsage(combinedUsage, repair.usage);
    repaired = true;
  }

  const normalized = parsed.candidates.slice(0, count).map(normalizeCandidate).filter((item) => item.productName);
  const candidates = normalized.filter((item) => candidateMeetsProfile(item, profile));
  const localWarnings = array(parsed.warnings).slice(0, 10).map((entry) => text(entry, 400)).filter(Boolean);
  if (repaired) localWarnings.push("Die Modellantwort wurde automatisch in das erwartete strukturierte Format repariert.");
  if (normalized.length > candidates.length) {
    localWarnings.push(`${normalized.length - candidates.length} Kandidat(en) wurden wegen MOQ/Dropshipping-Fit, Risiko, Preisbereich oder Zielmarge verworfen.`);
  }

  const annotations = array(message.annotations)
    .filter((entry) => entry?.type === "url_citation")
    .map((entry) => safeUrl(entry?.url_citation?.url))
    .filter(Boolean);
  return {
    model,
    summary: text(parsed.summary, 1600),
    warnings: localWarnings,
    candidates,
    citations: annotations,
    usage: combinedUsage,
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

function firstResearchFailure(settled) {
  return settled.find((entry) => entry.status === "rejected")?.reason || null;
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
    if (!successful.length) {
      const failure = firstResearchFailure(settled);
      const error = failure instanceof Error
        ? failure
        : new Error(text(failure?.message, 300) || "market_scout_research_failed");
      error.retryable = settled.some((entry) => entry.status === "rejected" && entry.reason?.retryable !== false);
      throw error;
    }
    const error = new Error("market_scout_no_verified_candidates");
    error.retryable = false;
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
      ? `${candidates.length} belegte Dropshipping-Produktkandidaten wurden im Hintergrund recherchiert.`
      : `${candidates.length} belastbare Dropshipping-Produktkandidaten wurden gefunden; fehlende Kandidaten wurden nicht erfunden.`,
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

export { MARKET_SCOUT_RESPONSE_FORMAT, researchMarketScout };
