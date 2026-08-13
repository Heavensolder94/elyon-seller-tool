const OPENROUTER_CHAT_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const ENRICHMENT_VERSION = "jarvis-product-enrichment-v1";
const HIGH_CONFIDENCE = 0.9;
const MEDIUM_CONFIDENCE = 0.7;

const COMPLIANCE_SENSITIVE_FIELDS = new Set([
  "manufacturer",
  "euResponsiblePerson",
  "gpsr",
  "ce",
  "weee",
  "battery",
  "epr",
  "warnings",
  "certifications",
  "brandAuthenticity",
]);

const SUPPORTED_FIELDS = new Set([
  "material",
  "color",
  "dimensions",
  "weight",
  "packageContents",
  "model",
  "deliveryTime",
  "supplierName",
  "supplierSku",
  "manufacturer",
  "euResponsiblePerson",
  "gpsr",
]);

const DEFAULT_FIELDS = [
  "material",
  "color",
  "dimensions",
  "weight",
  "packageContents",
  "model",
  "deliveryTime",
  "supplierName",
  "supplierSku",
  "manufacturer",
  "euResponsiblePerson",
  "gpsr",
];

const ITEM_SPECIFIC_KEYS = {
  material: "Material",
  color: "Farbe",
  dimensions: "Maße",
  weight: "Gewicht",
  packageContents: "Lieferumfang",
  model: "Modell",
};

const text = (value, max = 4000) => String(value ?? "").trim().slice(0, max);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const array = (value) => Array.isArray(value) ? value : [];
const unique = (values) => [...new Set(values.filter(Boolean))];
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number(value) || 0));

const jsonClone = (value) => JSON.parse(JSON.stringify(value ?? null));

const normalizeUrl = (value) => {
  const candidate = text(value, 2000);
  if (!candidate) return "";
  try {
    const parsed = new URL(candidate);
    if (!/^https?:$/.test(parsed.protocol)) return "";
    return parsed.toString();
  } catch {
    return "";
  }
};

const valueFromSpecifics = (product, key) => {
  const specifics = object(product?.listing?.itemSpecifics);
  const raw = specifics[key];
  if (Array.isArray(raw)) return text(raw[0]);
  return text(raw);
};

const productFieldValue = (product = {}, rawProduct = {}, field) => {
  const raw = object(rawProduct);
  switch (field) {
    case "material": return text(raw.material || raw.attributes?.material || valueFromSpecifics(product, "Material"));
    case "color": return text(raw.color || raw.colour || raw.attributes?.color || valueFromSpecifics(product, "Farbe"));
    case "dimensions": return text(raw.dimensions || raw.size || raw.attributes?.dimensions || valueFromSpecifics(product, "Maße"));
    case "weight": return text(raw.weight || raw.attributes?.weight || valueFromSpecifics(product, "Gewicht"));
    case "packageContents": return text(raw.packageContents || raw.packageScope || raw.attributes?.packageContents || valueFromSpecifics(product, "Lieferumfang"));
    case "model": return text(raw.model || raw.modelNumber || raw.attributes?.model || valueFromSpecifics(product, "Modell"));
    case "deliveryTime": return text(product?.logistics?.deliveryTime || raw.deliveryTime || raw.shippingInfo || raw.availability);
    case "supplierName": return text(product?.supplier?.name || raw.supplierName || raw.linkedSupplierName);
    case "supplierSku": return text(product?.supplierSku || raw.supplierSku || raw.supplierSkuId || raw.skuId);
    case "manufacturer": return text(raw.manufacturerName || raw.manufacturer?.name || raw.compliance?.manufacturer?.companyName || raw.gpsr?.manufacturerName);
    case "euResponsiblePerson": return text(raw.responsiblePersonName || raw.responsiblePerson?.name || raw.compliance?.responsiblePerson?.companyName || raw.gpsr?.responsiblePersonName);
    case "gpsr": {
      const gpsr = raw.gpsr || raw.compliance?.gpsr || raw.listing?.compliance;
      return gpsr && typeof gpsr === "object" && Object.keys(gpsr).length ? JSON.stringify(gpsr) : text(gpsr);
    }
    default: return "";
  }
};

const normalizeRequestedFields = (requestedFields) => {
  const requested = array(requestedFields).map((field) => text(field, 80)).filter((field) => SUPPORTED_FIELDS.has(field));
  return requested.length ? unique(requested) : DEFAULT_FIELDS;
};

const discoverEnrichmentTargets = (product = {}, rawProduct = {}, requestedFields = []) => normalizeRequestedFields(requestedFields)
  .filter((field) => !productFieldValue(product, rawProduct, field));

const supplierUrlFor = (product = {}, rawProduct = {}) => normalizeUrl(
  product?.supplier?.url || rawProduct?.supplierLink || rawProduct?.supplierUrl || rawProduct?.url || rawProduct?.sourceUrl
);

const buildResearchPrompt = ({ product, rawProduct, fields }) => {
  const supplierUrl = supplierUrlFor(product, rawProduct);
  const compact = {
    id: product?.articleNumber || product?.sku || product?.id || null,
    title: product?.title || rawProduct?.title || null,
    source: product?.source || rawProduct?.source || null,
    supplier: {
      name: product?.supplier?.name || rawProduct?.supplierName || null,
      url: supplierUrl || null,
      sku: product?.supplierSku || rawProduct?.supplierSku || rawProduct?.skuId || null,
    },
    existingItemSpecifics: object(product?.listing?.itemSpecifics),
  };

  return [
    "You are Elyon Jarvis Product Enrichment V1 for a German e-commerce seller.",
    "Research only factual product information. Never invent or infer a fact when no source supports it.",
    "Use the supplier URL first when available, then official manufacturer sources, then broader web search.",
    "For manufacturer, GPSR, EU responsible person, CE, WEEE, battery, EPR, certifications or safety claims: treat all findings as review-only and require an authoritative source.",
    "Marketplace listings, blogs and reseller pages may be supporting hints but are not authoritative compliance proof.",
    "Return only JSON. No Markdown.",
    "For every field return: field, value, sourceType, sourceUrl, evidence, evidenceCount.",
    "sourceType must be one of: manufacturer, supplier, official_registry, multi_source, web, inference.",
    "If a field cannot be verified, omit it from findings and include it in unresolved.",
    `Fields to research: ${JSON.stringify(fields)}`,
    `Product: ${JSON.stringify(compact)}`,
    supplierUrl ? `Supplier URL to inspect first: ${supplierUrl}` : "No supplier URL is available.",
    "Expected JSON shape: {\"findings\":[{\"field\":\"material\",\"value\":\"ABS\",\"sourceType\":\"manufacturer\",\"sourceUrl\":\"https://...\",\"evidence\":\"short factual support\",\"evidenceCount\":1}],\"unresolved\":[\"field\"]}",
  ].join("\n\n");
};

const parseJsonObject = (value) => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
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
    } catch {
      // Try the next representation.
    }
  }
  return null;
};

const sourceBaseConfidence = (sourceType) => ({
  manufacturer: 0.97,
  official_registry: 0.97,
  supplier: 0.93,
  multi_source: 0.90,
  web: 0.78,
  inference: 0.35,
}[sourceType] ?? 0.5);

const scoreFinding = (finding) => {
  const sourceType = text(finding?.sourceType, 40).toLowerCase();
  const sourceUrl = normalizeUrl(finding?.sourceUrl);
  const evidence = text(finding?.evidence, 1200);
  const evidenceCount = Math.max(0, Number(finding?.evidenceCount) || 0);
  let confidence = sourceBaseConfidence(sourceType);
  if (!sourceUrl) confidence -= 0.12;
  if (!evidence) confidence -= 0.08;
  if (evidenceCount >= 2 && sourceType !== "inference") confidence += 0.02;
  return Number(clamp(confidence).toFixed(2));
};

const normalizeFinding = (finding, allowedFields) => {
  const field = text(finding?.field, 80);
  if (!allowedFields.has(field) || !SUPPORTED_FIELDS.has(field)) return null;
  const rawValue = finding?.value;
  const value = typeof rawValue === "object" && rawValue !== null ? jsonClone(rawValue) : text(rawValue, 5000);
  if (value === "" || value === null || value === undefined || (typeof value === "object" && !Object.keys(value).length)) return null;
  const sourceType = text(finding?.sourceType, 40).toLowerCase() || "web";
  return {
    field,
    value,
    sourceType,
    sourceUrl: normalizeUrl(finding?.sourceUrl),
    evidence: text(finding?.evidence, 1200),
    evidenceCount: Math.max(0, Number(finding?.evidenceCount) || 0),
    confidence: scoreFinding(finding),
    complianceSensitive: COMPLIANCE_SENSITIVE_FIELDS.has(field),
  };
};

const extractCitations = (message = {}) => unique(array(message.annotations)
  .filter((annotation) => annotation?.type === "url_citation")
  .map((annotation) => normalizeUrl(annotation?.url_citation?.url))
  .filter(Boolean));

const callOpenRouterResearch = async ({ env, product, rawProduct, fields }) => {
  if (!env?.OPENROUTER_API_KEY) {
    const error = new Error("openrouter_not_configured");
    error.retryable = false;
    throw error;
  }

  const model = text(env.OPENROUTER_RESEARCH_MODEL || env.OPENROUTER_MODEL || "openrouter/free", 200);
  const payload = {
    model,
    messages: [{ role: "user", content: buildResearchPrompt({ product, rawProduct, fields }) }],
    tools: [
      {
        type: "openrouter:web_search",
        parameters: {
          engine: "auto",
          max_results: 5,
          max_total_results: 12,
          search_context_size: "low",
        },
      },
      { type: "openrouter:web_fetch" },
    ],
    temperature: 0,
    max_tokens: 2500,
  };

  const response = await fetch(OPENROUTER_CHAT_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": text(env.OPENROUTER_HTTP_REFERER || env.ELYON_SELLER_TOOL_URL || "https://elyonsellertool.vercel.app", 500),
      "X-Title": text(env.OPENROUTER_APP_NAME || "Elyon Jarvis", 200),
    },
    body: JSON.stringify(payload),
  });

  const rawText = await response.text();
  let body = null;
  try { body = rawText ? JSON.parse(rawText) : null; } catch { body = null; }

  if (!response.ok) {
    const error = new Error(text(body?.error?.message || body?.message || `openrouter_http_${response.status}`, 500));
    error.retryable = response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500;
    throw error;
  }

  const message = body?.choices?.[0]?.message || {};
  const parsed = parseJsonObject(message.content);
  if (!parsed) {
    const error = new Error("openrouter_invalid_enrichment_json");
    error.retryable = true;
    throw error;
  }

  const allowedFields = new Set(fields);
  const findings = array(parsed.findings).map((finding) => normalizeFinding(finding, allowedFields)).filter(Boolean);
  const unresolved = unique([
    ...array(parsed.unresolved).map((field) => text(field, 80)).filter((field) => allowedFields.has(field)),
    ...fields.filter((field) => !findings.some((finding) => finding.field === field)),
  ]);
  const usage = object(body?.usage);
  const serverToolUse = object(usage.server_tool_use);

  return {
    provider: "openrouter",
    model,
    findings,
    unresolved,
    citations: extractCitations(message),
    usage: {
      inputTokens: usage.prompt_tokens ?? usage.input_tokens ?? null,
      outputTokens: usage.completion_tokens ?? usage.output_tokens ?? null,
      totalTokens: usage.total_tokens ?? null,
      webSearchRequests: Number(serverToolUse.web_search_requests || 0),
    },
  };
};

const classifyFindings = ({ product, rawProduct, findings }) => {
  const autoApply = [];
  const pendingReview = [];
  const lowConfidence = [];
  const existingValueConflicts = [];

  for (const finding of findings) {
    const existing = productFieldValue(product, rawProduct, finding.field);
    if (existing) {
      existingValueConflicts.push({ ...finding, existingValue: existing, status: "conflict" });
      continue;
    }
    if (finding.complianceSensitive) {
      pendingReview.push({ ...finding, status: "pending_review" });
      continue;
    }
    if (finding.confidence >= HIGH_CONFIDENCE) {
      autoApply.push({ ...finding, status: "auto_apply" });
      continue;
    }
    if (finding.confidence >= MEDIUM_CONFIDENCE) {
      pendingReview.push({ ...finding, status: "pending_review" });
      continue;
    }
    lowConfidence.push({ ...finding, status: "low_confidence" });
  }

  return { autoApply, pendingReview, lowConfidence, existingValueConflicts };
};

const setItemSpecific = (patch, product, finding) => {
  const key = ITEM_SPECIFIC_KEYS[finding.field];
  if (!key) return false;
  if (valueFromSpecifics(product, key)) return false;
  patch.listing = {
    ...object(patch.listing),
    itemSpecifics: {
      ...object(product?.listing?.itemSpecifics),
      ...object(patch.listing?.itemSpecifics),
      [key]: finding.value,
    },
  };
  return true;
};

const buildAutoApplyPatch = ({ product, findings }) => {
  const patch = {};
  const applied = [];
  for (const finding of findings) {
    if (ITEM_SPECIFIC_KEYS[finding.field]) {
      if (setItemSpecific(patch, product, finding)) applied.push(finding.field);
      continue;
    }
    if (finding.field === "deliveryTime" && !text(product?.logistics?.deliveryTime)) {
      patch.logistics = { ...object(product?.logistics), deliveryTime: finding.value };
      applied.push(finding.field);
      continue;
    }
    if (finding.field === "supplierName" && !text(product?.supplier?.name)) {
      patch.supplier = { ...object(product?.supplier), name: finding.value };
      applied.push(finding.field);
      continue;
    }
    if (finding.field === "supplierSku" && !text(product?.supplierSku)) {
      patch.supplierSku = finding.value;
      applied.push(finding.field);
    }
  }
  return { patch, applied };
};

const buildProvenancePatch = ({ product, findings, now = new Date().toISOString() }) => {
  const current = object(product?.enrichment);
  const currentFields = object(current.fields);
  const nextFields = { ...currentFields };
  for (const finding of findings) {
    nextFields[finding.field] = {
      value: finding.value,
      confidence: finding.confidence,
      sourceType: finding.sourceType,
      sourceUrl: finding.sourceUrl || null,
      evidence: finding.evidence || null,
      status: finding.status,
      complianceSensitive: finding.complianceSensitive,
      verifiedAt: now,
      version: ENRICHMENT_VERSION,
    };
  }
  return {
    enrichment: {
      ...current,
      version: ENRICHMENT_VERSION,
      lastRunAt: now,
      fields: nextFields,
    },
  };
};

const snapshotTargetValues = (product, rawProduct, fields) => Object.fromEntries(
  fields.map((field) => [field, productFieldValue(product, rawProduct, field)])
);

const detectConcurrentConflicts = ({ baseline = {}, currentProduct = {}, currentRawProduct = {}, findings = [] }) => {
  const conflicts = [];
  const safeFindings = [];
  for (const finding of findings) {
    const before = text(baseline[finding.field], 5000);
    const now = productFieldValue(currentProduct, currentRawProduct, finding.field);
    if (now && now !== before) {
      conflicts.push({ ...finding, existingValue: now, status: "conflict_detected" });
    } else {
      safeFindings.push(finding);
    }
  }
  return { conflicts, safeFindings };
};

export {
  COMPLIANCE_SENSITIVE_FIELDS,
  ENRICHMENT_VERSION,
  HIGH_CONFIDENCE,
  MEDIUM_CONFIDENCE,
  buildAutoApplyPatch,
  buildProvenancePatch,
  callOpenRouterResearch,
  classifyFindings,
  detectConcurrentConflicts,
  discoverEnrichmentTargets,
  productFieldValue,
  snapshotTargetValues,
};
