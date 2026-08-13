const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const SUPPORTED_FIELDS = new Set([
  "material", "color", "dimensions", "weight", "packageContents", "model",
  "deliveryTime", "supplierName", "supplierSku", "manufacturer", "euResponsiblePerson", "gpsr",
]);
const COMPLIANCE_FIELDS = new Set([
  "manufacturer", "euResponsiblePerson", "gpsr", "ce", "weee", "battery", "epr",
  "warnings", "certifications", "brandAuthenticity",
]);

const text = (value, max = 4000) => String(value ?? "").trim().slice(0, max);
const asObject = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const asArray = (value) => Array.isArray(value) ? value : [];
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

function parseJson(value) {
  const raw = text(value, 30000);
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

function confidenceFor(finding) {
  const type = text(finding?.sourceType, 40).toLowerCase();
  let score = ({ manufacturer: 0.97, official_registry: 0.97, supplier: 0.93, multi_source: 0.90, web: 0.78, inference: 0.35 })[type] ?? 0.5;
  if (!safeUrl(finding?.sourceUrl)) score -= 0.12;
  if (!text(finding?.evidence, 1200)) score -= 0.08;
  if (Number(finding?.evidenceCount || 0) >= 2 && type !== "inference") score += 0.02;
  return Number(Math.max(0, Math.min(1, score)).toFixed(2));
}

function normalizeFinding(finding, allowed) {
  const field = text(finding?.field, 80);
  if (!allowed.has(field) || !SUPPORTED_FIELDS.has(field)) return null;
  const value = finding?.value && typeof finding.value === "object"
    ? JSON.parse(JSON.stringify(finding.value))
    : text(finding?.value, 5000);
  if (value === "" || value === null || value === undefined) return null;
  return {
    field,
    value,
    sourceType: text(finding?.sourceType, 40).toLowerCase() || "web",
    sourceUrl: safeUrl(finding?.sourceUrl),
    evidence: text(finding?.evidence, 1200),
    evidenceCount: Math.max(0, Number(finding?.evidenceCount) || 0),
    confidence: confidenceFor(finding),
    complianceSensitive: COMPLIANCE_FIELDS.has(field),
  };
}

function researchPrompt({ product, rawProduct, fields }) {
  const supplierUrl = safeUrl(product?.supplier?.url || rawProduct?.supplierLink || rawProduct?.sourceUrl || rawProduct?.url);
  const context = {
    id: product?.articleNumber || product?.sku || product?.id || null,
    title: product?.title || rawProduct?.title || null,
    supplier: {
      name: product?.supplier?.name || rawProduct?.supplierName || null,
      url: supplierUrl || null,
      sku: product?.supplierSku || rawProduct?.supplierSku || rawProduct?.skuId || null,
    },
    itemSpecifics: asObject(product?.listing?.itemSpecifics),
  };
  return [
    "You are Elyon Jarvis Product Enrichment V1 for a German e-commerce seller.",
    "Research only factual product information and never invent missing facts.",
    "Inspect the supplier source first when available, then official manufacturer sources, then broader web search.",
    "Compliance-related facts are research-only and must never be treated as automatically approved.",
    "Marketplace listings, blogs and reseller pages are not authoritative compliance proof.",
    "Return only JSON with findings and unresolved fields.",
    "Each finding needs field, value, sourceType, sourceUrl, evidence and evidenceCount.",
    "sourceType: manufacturer, supplier, official_registry, multi_source, web or inference.",
    `Fields: ${JSON.stringify(fields)}`,
    `Product: ${JSON.stringify(context)}`,
    "Shape: {\"findings\":[{\"field\":\"material\",\"value\":\"ABS\",\"sourceType\":\"manufacturer\",\"sourceUrl\":\"https://...\",\"evidence\":\"short support\",\"evidenceCount\":1}],\"unresolved\":[]}",
  ].join("\n\n");
}

async function researchWithOpenRouter({ env, product, rawProduct, fields, fetchImpl = fetch }) {
  if (!env?.OPENROUTER_API_KEY) {
    const error = new Error("openrouter_not_configured");
    error.retryable = false;
    throw error;
  }
  const model = text(env.OPENROUTER_RESEARCH_MODEL || env.OPENROUTER_MODEL || "openrouter/free", 200);
  const response = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": text(env.OPENROUTER_HTTP_REFERER || env.ELYON_SELLER_TOOL_URL || "https://elyonsellertool.vercel.app", 500),
      "X-Title": text(env.OPENROUTER_APP_NAME || "Elyon Jarvis", 200),
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: researchPrompt({ product, rawProduct, fields }) }],
      tools: [
        { type: "openrouter:web_search", parameters: { engine: "auto", max_results: 5, max_total_results: 12, search_context_size: "low" } },
        { type: "openrouter:web_fetch" },
      ],
      temperature: 0,
      max_tokens: 2500,
    }),
  });
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
  if (!parsed) {
    const error = new Error("openrouter_invalid_enrichment_json");
    error.retryable = true;
    throw error;
  }
  const allowed = new Set(fields);
  const findings = asArray(parsed.findings).map((finding) => normalizeFinding(finding, allowed)).filter(Boolean);
  const unresolved = unique([
    ...asArray(parsed.unresolved).map((field) => text(field, 80)).filter((field) => allowed.has(field)),
    ...fields.filter((field) => !findings.some((finding) => finding.field === field)),
  ]);
  const usage = asObject(body?.usage);
  const toolUse = asObject(usage.server_tool_use);
  const amount = Number(usage.cost);
  const citations = unique(asArray(message.annotations)
    .filter((item) => item?.type === "url_citation")
    .map((item) => safeUrl(item?.url_citation?.url))
    .filter(Boolean));
  return {
    provider: "openrouter",
    model,
    findings,
    unresolved,
    citations,
    usage: {
      inputTokens: usage.prompt_tokens ?? usage.input_tokens ?? null,
      outputTokens: usage.completion_tokens ?? usage.output_tokens ?? null,
      totalTokens: usage.total_tokens ?? null,
      webSearchRequests: Number(toolUse.web_search_requests || 0),
      amount: Number.isFinite(amount) ? amount : null,
      unit: "openrouter_credits",
      costDetails: asObject(usage.cost_details),
    },
  };
}

export { researchWithOpenRouter };
