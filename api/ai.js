import { routeAIRequest } from "../lib/ai-provider-router.js";

const TEXT_PRIMARY_PROVIDER = "deepseek";
const JSON_RESPONSE_FORMAT = Object.freeze({ type: "json_object" });

function jsonError(res, status, error, details) {
  return res.status(status).json({
    ok: false,
    source: "ai",
    status,
    error,
    details: details ?? null,
  });
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

function readText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function clampNumber(value, min = 0, max = 100) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function normalizeList(value) {
  const list = Array.isArray(value) ? value : [];
  return Array.from(new Set(list.map((item) => readText(item)).filter(Boolean)));
}

function parseJsonObjectFromText(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  const text = String(value || "").trim();
  if (!text) return null;

  const candidates = [
    text,
    text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim(),
  ];
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      // Some providers wrap JSON in Markdown. Try the next representation.
    }
  }
  return null;
}

function withStructuredTaskResult(result) {
  if (!result || !result.ok || result.task !== "product_decision") return result;
  const parsed = parseJsonObjectFromText(result.result || result.content);
  if (!parsed) return result;
  return { ...result, result: parsed };
}

function buildSimplePrompt(task, prompt, body) {
  const parts = [
    `Task: ${task || "general"}`,
    `Prompt: ${prompt}`,
  ];
  if (body && typeof body === "object") {
    parts.push(`Context: ${JSON.stringify(body).slice(0, 6000)}`);
  }
  return parts.join("\n\n");
}

function safeAiStatus(result, fallback = 502) {
  const status = Number(result?.error?.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : fallback;
}

function aiFailure(result, fallbackMessage) {
  const error = new Error(readText(result?.error?.message) || fallbackMessage);
  error.status = safeAiStatus(result);
  error.details = {
    provider: result?.provider || null,
    model: result?.model || null,
    fallbackUsed: Boolean(result?.fallbackUsed),
    code: result?.error?.code || null,
    type: result?.error?.type || null,
  };
  return error;
}

function safeAiOptions({ task, prompt, maxTokens, provider = TEXT_PRIMARY_PROVIDER, allowFallback = true }) {
  return {
    provider,
    task,
    prompt,
    temperature: 0.2,
    maxTokens,
    allowFallback,
    responseFormat: JSON_RESPONSE_FORMAT,
    safety: {
      securityMode: true,
      sandboxMode: true,
      autonomyLocked: true,
      requiresLiveAction: false,
      userApproved: false,
    },
  };
}

async function callStructuredAI({ task, prompt, maxTokens }) {
  const primary = await routeAIRequest(safeAiOptions({ task, prompt, maxTokens }));
  if (!primary.ok) throw aiFailure(primary, "KI-Anfrage fehlgeschlagen.");

  const parsedPrimary = parseJsonObjectFromText(primary.content);
  if (parsedPrimary) return { data: parsedPrimary, ai: primary };

  // A provider can return HTTP 200 while still violating the JSON contract.
  // Retry exactly once with OpenAI instead of silently accepting malformed data.
  if (primary.provider !== "openai") {
    const repairFallback = await routeAIRequest(safeAiOptions({
      task: `${task}:json-fallback`,
      prompt,
      maxTokens,
      provider: "openai",
      allowFallback: false,
    }));
    if (repairFallback.ok) {
      const parsedFallback = parseJsonObjectFromText(repairFallback.content);
      if (parsedFallback) {
        return {
          data: parsedFallback,
          ai: { ...repairFallback, fallbackUsed: true },
        };
      }
    } else {
      throw aiFailure(repairFallback, "OpenAI-Fallback für strukturierte KI-Ausgabe fehlgeschlagen.");
    }
  }

  const error = new Error("KI lieferte auch nach dem kontrollierten Fallback kein valides JSON.");
  error.status = 502;
  error.details = {
    provider: primary.provider || null,
    model: primary.model || null,
    fallbackUsed: Boolean(primary.fallbackUsed),
    code: "INVALID_AI_JSON",
  };
  throw error;
}

function buildProductSearchPayload(body) {
  const product = body?.product || {};
  const mode = readText(body?.mode || body?.requestedMode || "improve") || "improve";
  return {
    mode,
    query: readText(body?.query || product.name || product.sku || product.notes),
    product: {
      name: readText(product.name),
      sku: readText(product.sku),
      supplierId: readText(product.supplierId),
      notes: readText(product.notes),
      buy: Number(product.buy || 0) || 0,
      ship: Number(product.ship || 0) || 0,
      sell: Number(product.sell || 0) || 0,
      competition: Number(product.competition || 0) || 0,
      delivery: Number(product.delivery || 0) || 0,
      risk: readText(product.risk) || "low",
    },
  };
}

function normalizeProductSearchResult(rawResult) {
  const query = readText(rawResult?.query);
  const recommendedQuery = readText(rawResult?.recommendedQuery);
  const queryExpansion = normalizeList(rawResult?.queryExpansion).slice(0, 12);
  const searchAngles = normalizeList(rawResult?.searchAngles).slice(0, 8);
  const titleIdeas = normalizeList(rawResult?.titleIdeas).slice(0, 8);
  const riskWarnings = normalizeList(rawResult?.riskWarnings).slice(0, 8);
  const score = rawResult?.score || {};
  const searchPotential = clampNumber(score.searchPotential);
  const competition = clampNumber(score.competition);
  const risk = clampNumber(score.risk);
  const total = clampNumber(
    score.total !== undefined && score.total !== null
      ? score.total
      : (searchPotential + competition + risk) / 3
  );

  return {
    query,
    recommendedQuery,
    queryExpansion,
    searchAngles,
    titleIdeas,
    riskWarnings,
    score: { searchPotential, competition, risk, total },
  };
}

function buildProductSearchPrompt(payload) {
  return [
    "Du bist ein professioneller Assistent fuer eBay-Produktsuche in einem deutschen Online-Shop.",
    "Hilf dabei, Suchbegriffe, Synonyme, Nischenwinkel und Titelideen fuer Produkte zu finden.",
    "Arbeite serios, eBay-tauglich und vorsichtig mit Risiken.",
    "Erfinde keine Marken, keine Zertifizierungen und keine unrealistischen Versprechen.",
    "Warn bei moeglichen Risiken wie Batterie, WEEE, EPR, LUCID, Markenrecht oder zu hoher Konkurrenz.",
    "Antworte ausschliesslich als valides JSON mit query, recommendedQuery, queryExpansion, searchAngles, titleIdeas, riskWarnings und score.",
    "score muss searchPotential, competition, risk und total als Zahlen enthalten.",
    "",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

function buildListingOptimizerPayload(body) {
  const product = body?.product || {};
  const mode = readText(body?.mode || body?.requestedMode || "regenerate") || "regenerate";
  return {
    mode,
    product: {
      mainKeyword: readText(product.mainKeyword),
      productName: readText(product.productName),
      features: readText(product.features),
      targetUse: readText(product.targetUse),
      painPoint: readText(product.painPoint),
      tone: readText(product.tone) || "neutral",
      titleMode: readText(product.titleMode) || "hybrid",
      seoKeywords: readText(product.seoKeywords),
      descriptionLength: readText(product.descriptionLength) || "normal",
      descriptionType: readText(product.descriptionType) || "ebay",
      packageScope: readText(product.packageScope),
      importantNotice: readText(product.importantNotice),
      currentTitle: readText(product.currentTitle),
      currentDescription: readText(product.currentDescription),
    },
  };
}

function normalizeListingOptimizerResult(rawResult) {
  const title = readText(rawResult?.title).slice(0, 80);
  const subtitle = readText(rawResult?.subtitle).slice(0, 120);
  const bulletPoints = normalizeList(rawResult?.bulletPoints).slice(0, 5);
  const description = readText(rawResult?.description);
  const seoKeywords = normalizeList(rawResult?.seoKeywords).slice(0, 12);
  const riskWarnings = normalizeList(rawResult?.riskWarnings).slice(0, 8);
  const score = rawResult?.score || {};
  const titleScore = clampNumber(score.title);
  const seoScore = clampNumber(score.seo);
  const descriptionScore = clampNumber(score.description);
  const riskScore = clampNumber(score.risk);
  const totalScore = clampNumber(
    score.total !== undefined && score.total !== null
      ? score.total
      : (titleScore + seoScore + descriptionScore + riskScore) / 4
  );

  return {
    title: title || "",
    subtitle: subtitle || "",
    bulletPoints: bulletPoints.length ? bulletPoints : [],
    description: description || "",
    seoKeywords: seoKeywords.length ? seoKeywords : [],
    riskWarnings: riskWarnings.length ? riskWarnings : [],
    score: {
      title: titleScore,
      seo: seoScore,
      description: descriptionScore,
      risk: riskScore,
      total: totalScore,
    },
  };
}

function buildListingOptimizerPrompt(payload) {
  return [
    "Du bist ein professioneller eBay Listing Optimizer fuer einen deutschen Online-Shop.",
    "Erstelle verkaufsstarke, aber seriöse eBay-Titel und Beschreibungen.",
    "Achte auf SEO, klare Vorteile, eBay-Regeln, keine falschen Markenversprechen, keine riskanten Aussagen und moegliche Compliance-Risiken wie Batterie, WEEE, LUCID oder EPR.",
    "Wenn keine Marke in den Produktdaten genannt wird, erfinde keine Marke.",
    "Verwende die Begriffe 'original', 'offiziell' oder 'zertifiziert' nur, wenn sie wirklich sicher sind.",
    "Mache keine unrealistischen Lieferzeitversprechen und keine Heilversprechen.",
    "Antworte ausschliesslich als valides JSON mit title, subtitle, bulletPoints, description, seoKeywords, riskWarnings und score.",
    "score muss title, seo, description, risk und total als Zahlen enthalten.",
    "",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

async function handleProductSearch(req, res, body) {
  if (req.method !== "POST") {
    return jsonError(res, 405, "Nur POST erlaubt.", "METHOD_NOT_ALLOWED");
  }

  const payload = buildProductSearchPayload(body);
  if (!payload.query && !payload.product.name && !payload.product.notes && !payload.product.sku) {
    return jsonError(res, 400, "Es fehlen Such- oder Produktdaten fuer die KI Produktsuche.", "MISSING_SEARCH_DATA");
  }

  try {
    const { data, ai } = await callStructuredAI({
      task: "product-search",
      prompt: buildProductSearchPrompt(payload),
      maxTokens: 1200,
    });

    return res.status(200).json({
      ok: true,
      source: "ai-product-search",
      task: "product-search",
      mode: payload.mode,
      provider: ai.provider,
      model: ai.model,
      fallbackUsed: Boolean(ai.fallbackUsed),
      usage: ai.usage || null,
      ...normalizeProductSearchResult(data),
    });
  } catch (error) {
    return jsonError(res, error.status || 500, error.message || "KI Produktsuche fehlgeschlagen.", error.details || null);
  }
}

async function handleListingOptimizer(req, res, body) {
  if (req.method !== "POST") {
    return jsonError(res, 405, "Nur POST erlaubt.", "METHOD_NOT_ALLOWED");
  }

  const payload = buildListingOptimizerPayload(body);
  if (
    !payload.product.productName &&
    !payload.product.mainKeyword &&
    !payload.product.features &&
    !payload.product.currentTitle &&
    !payload.product.currentDescription
  ) {
    return jsonError(res, 400, "Es fehlen Produktdaten fuer den KI Listing Optimizer.", "MISSING_PRODUCT_DATA");
  }

  try {
    const { data, ai } = await callStructuredAI({
      task: "listing-optimizer",
      prompt: buildListingOptimizerPrompt(payload),
      maxTokens: 1400,
    });

    return res.status(200).json({
      ok: true,
      source: "ai-listing-optimizer",
      task: "listing-optimizer",
      mode: payload.mode,
      provider: ai.provider,
      model: ai.model,
      fallbackUsed: Boolean(ai.fallbackUsed),
      usage: ai.usage || null,
      ...normalizeListingOptimizerResult(data),
    });
  } catch (error) {
    return jsonError(res, error.status || 500, error.message || "KI Listing Optimizer fehlgeschlagen.", error.details || null);
  }
}

async function handleCentralAiRouter(req, res, body) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      provider: "local",
      fallbackUsed: true,
      task: "",
      content: "",
      usage: null,
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "Nur POST erlaubt.",
        type: "unknown",
      },
    });
  }

  const result = await routeAIRequest({
    provider: body.provider,
    task: body.task,
    messages: body.messages,
    prompt: body.prompt,
    model: body.model,
    temperature: typeof body.temperature === "number" ? body.temperature : undefined,
    maxTokens: typeof body.maxTokens === "number" ? body.maxTokens : undefined,
    allowFallback: body.allowFallback,
    context: body.context,
    safety: body.safety,
    responseFormat: body.responseFormat,
  });

  return res.status(result.ok ? 200 : 400).json(withStructuredTaskResult(result));
}

async function handleGeneralTextTask(req, res, body, task) {
  const prompt = readText(body.prompt);
  if (!prompt) return res.status(400).json({ ok: false, error: "Prompt fehlt" });

  const result = await routeAIRequest({
    provider: TEXT_PRIMARY_PROVIDER,
    task: task || "general",
    prompt: buildSimplePrompt(task, prompt, body),
    temperature: typeof body.temperature === "number" ? body.temperature : 0.2,
    maxTokens: typeof body.maxTokens === "number" ? body.maxTokens : undefined,
    allowFallback: body.allowFallback !== false,
    safety: {
      securityMode: true,
      sandboxMode: true,
      autonomyLocked: true,
      requiresLiveAction: false,
      userApproved: false,
    },
  });

  if (!result.ok) {
    return res.status(safeAiStatus(result, 500)).json({
      ok: false,
      error: result.error?.message || "KI-Anfrage fehlgeschlagen.",
      provider: result.provider,
      modelUsed: result.model,
      fallbackUsed: Boolean(result.fallbackUsed),
    });
  }

  return res.status(200).json({
    ok: true,
    task,
    provider: result.provider,
    modelUsed: result.model,
    fallbackUsed: Boolean(result.fallbackUsed),
    usage: result.usage || null,
    result: result.content,
  });
}

export default async function handler(req, res) {
  const body = readBody(req);
  const task = readText(body.task || req.query?.task || req.query?.action || req.query?.endpoint || "");

  if (task === "router") return handleCentralAiRouter(req, res, body);
  if (task === "product-search") return handleProductSearch(req, res, body);
  if (task === "listing-optimizer") return handleListingOptimizer(req, res, body);
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  return handleGeneralTextTask(req, res, body, task);
}
