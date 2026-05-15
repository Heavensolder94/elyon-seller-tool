import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const MODEL_BY_TASK = {
  category: DEFAULT_MODEL,
  tags: DEFAULT_MODEL,
  title: DEFAULT_MODEL,
  description: DEFAULT_MODEL,
  product_score: DEFAULT_MODEL,
  assistant: DEFAULT_MODEL,
  "product-search": DEFAULT_MODEL,
  "listing-optimizer": DEFAULT_MODEL,
};

function chooseModel(task) {
  return MODEL_BY_TASK[task] || DEFAULT_MODEL;
}

function jsonError(res, status, error, details) {
  return res.status(status).json({
    ok: false,
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

function extractOutputText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const output = Array.isArray(data?.output) ? data.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === "string" && part.text.trim()) {
        return part.text.trim();
      }
    }
  }

  return "";
}

function buildSimplePrompt(task, prompt, body) {
  const payload = JSON.stringify(body || {}, null, 2);

  if (task === "category") {
    return [
      "Erstelle eine kurze Kategorien-Einschaetzung fuer einen eBay-Shop.",
      "",
      "Prompt:",
      prompt,
      "",
      "Daten:",
      payload,
    ].join("\n");
  }

  if (task === "tags") {
    return [
      "Erstelle SEO-Keywords, Synonyme und Titelideen fuer eBay.",
      "",
      "Prompt:",
      prompt,
      "",
      "Daten:",
      payload,
    ].join("\n");
  }

  if (task === "title") {
    return [
      "Erzeuge einen eBay-Titel mit maximal 80 Zeichen.",
      "Keine falschen Markenversprechen und keine unsicheren Zertifizierungen.",
      "",
      "Prompt:",
      prompt,
      "",
      "Daten:",
      payload,
    ].join("\n");
  }

  if (task === "description") {
    return [
      "Erzeuge eine seriöse, verkaufsstarke eBay-Beschreibung.",
      "Achte auf klare Vorteile, Bulletpoints und sichere Formulierungen.",
      "",
      "Prompt:",
      prompt,
      "",
      "Daten:",
      payload,
    ].join("\n");
  }

  if (task === "product_score") {
    return [
      "Bewerte die Produktidee sachlich mit Chancen, Risiken und einem Score.",
      "Achte auf Konkurrenz, Marge, Lieferzeit, Batterie/WEEE/LUCID/EPR und Markenrisiko.",
      "",
      "Prompt:",
      prompt,
      "",
      "Daten:",
      payload,
    ].join("\n");
  }

  return [prompt, payload].join("\n\n");
}

async function callTextOpenAI(task, prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY fehlt in Vercel.");
  }

  const model = chooseModel(task);
  const response = await client.responses.create({
    model,
    input: prompt,
  });

  return {
    ok: true,
    task,
    modelUsed: model,
    result: response.output_text,
  };
}

async function callJsonOpenAI({ prompt, schema, name, description, maxOutputTokens = 1200 }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY fehlt in Vercel.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      input: [
        { role: "system", content: "Antworte ausschliesslich mit validem JSON." },
        { role: "user", content: prompt },
      ],
      text: {
        format: {
          type: "json_schema",
          name,
          description,
          strict: true,
          schema,
        },
      },
      max_output_tokens: maxOutputTokens,
    }),
  });

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const rawText = await response.text();
  let data = null;

  if (rawText && contentType.includes("application/json")) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const message = data?.error?.message || data?.error?.type || data?.message || rawText || "OpenAI API Fehler";
    const error = new Error(message);
    error.status = response.status || 502;
    error.details = {
      upstreamStatus: response.status,
      upstreamStatusText: response.statusText || "",
      upstreamBody: data || rawText || null,
    };
    throw error;
  }

  const outputText = extractOutputText(data);
  if (!outputText) {
    throw new Error("OpenAI Antwort enthielt keinen JSON-Text.");
  }

  try {
    return JSON.parse(outputText);
  } catch {
    throw new Error("OpenAI Antwort konnte nicht als JSON gelesen werden.");
  }
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
    score: {
      searchPotential,
      competition,
      risk,
      total,
    },
  };
}

function buildProductSearchPrompt(payload) {
  return [
    "Du bist ein professioneller Assistent fuer eBay-Produktsuche in einem deutschen Online-Shop.",
    "Hilf dabei, Suchbegriffe, Synonyme, Nischenwinkel und Titelideen fuer Produkte zu finden.",
    "Arbeite serios, eBay-tauglich und vorsichtig mit Risiken.",
    "Erfinde keine Marken, keine Zertifizierungen und keine unrealistischen Versprechen.",
    "Warn bei moeglichen Risiken wie Batterie, WEEE, EPR, LUCID, Markenrecht oder zu hoher Konkurrenz.",
    "",
    payload.mode === "analyze"
      ? "Pruefe die Produktidee auf Suchpotenzial, Konkurrenz und Risiko. Gib eine klare Empfehlung."
      : "Erweitere den Suchbegriff zu besseren eBay-Suchvarianten. Gib Synonyme und verwertbare Titelideen aus.",
    "",
    `Suchbegriff:\n${payload.query || "Unbekannt"}`,
    "",
    `Produktdaten:\n${JSON.stringify(payload.product, null, 2)}`,
    "",
    "Antworte nur mit JSON, das exakt dem Schema entspricht.",
  ].join("\n");
}

function buildProductSearchSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      query: { type: "string" },
      recommendedQuery: { type: "string" },
      queryExpansion: {
        type: "array",
        minItems: 0,
        maxItems: 12,
        items: { type: "string" },
      },
      searchAngles: {
        type: "array",
        minItems: 0,
        maxItems: 8,
        items: { type: "string" },
      },
      titleIdeas: {
        type: "array",
        minItems: 0,
        maxItems: 8,
        items: { type: "string" },
      },
      riskWarnings: {
        type: "array",
        minItems: 0,
        maxItems: 8,
        items: { type: "string" },
      },
      score: {
        type: "object",
        additionalProperties: false,
        properties: {
          searchPotential: { type: "integer", minimum: 0, maximum: 100 },
          competition: { type: "integer", minimum: 0, maximum: 100 },
          risk: { type: "integer", minimum: 0, maximum: 100 },
          total: { type: "integer", minimum: 0, maximum: 100 },
        },
        required: ["searchPotential", "competition", "risk", "total"],
      },
    },
    required: ["query", "recommendedQuery", "queryExpansion", "searchAngles", "titleIdeas", "riskWarnings", "score"],
  };
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
    "Bei Elektronik, Batterie oder anderen Risikoprodukten nenne die moeglichen Pflichten und warnenden Hinweise klar.",
    "Der eBay-Titel darf maximal 80 Zeichen lang sein.",
    "",
    payload.mode === "improve"
      ? "Verbessere einen bereits vorhandenen Entwurf. Nutze currentTitle und currentDescription als Ausgangspunkt."
      : payload.mode === "check"
        ? "Pruefe das Listing und bewerte seine Qualitaet. Ersetze unsichere Formulierungen durch sichere Alternativen."
        : "Erzeuge das Listing komplett neu aus den Produktdaten.",
    "",
    `Produktdaten:\n${JSON.stringify(payload.product, null, 2)}`,
    "",
    "Antworte nur mit JSON, das exakt dem Schema entspricht.",
  ].join("\n");
}

function buildListingOptimizerSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string", maxLength: 80 },
      subtitle: { type: "string", maxLength: 120 },
      bulletPoints: {
        type: "array",
        minItems: 0,
        maxItems: 5,
        items: { type: "string" },
      },
      description: { type: "string" },
      seoKeywords: {
        type: "array",
        minItems: 0,
        maxItems: 12,
        items: { type: "string" },
      },
      riskWarnings: {
        type: "array",
        minItems: 0,
        maxItems: 8,
        items: { type: "string" },
      },
      score: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "integer", minimum: 0, maximum: 100 },
          seo: { type: "integer", minimum: 0, maximum: 100 },
          description: { type: "integer", minimum: 0, maximum: 100 },
          risk: { type: "integer", minimum: 0, maximum: 100 },
          total: { type: "integer", minimum: 0, maximum: 100 },
        },
        required: ["title", "seo", "description", "risk", "total"],
      },
    },
    required: ["title", "subtitle", "bulletPoints", "description", "seoKeywords", "riskWarnings", "score"],
  };
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
    const result = await callJsonOpenAI({
      prompt: buildProductSearchPrompt(payload),
      schema: buildProductSearchSchema(),
      name: "product_search_optimizer_v1",
      description: "Strukturierte Produktsuche-Analyse fuer Elyon Seller Tool",
      maxOutputTokens: 1200,
    });

    return res.status(200).json({
      ok: true,
      source: "ai-product-search",
      task: "product-search",
      mode: payload.mode,
      model: DEFAULT_MODEL,
      ...normalizeProductSearchResult(result),
    });
  } catch (error) {
    return jsonError(
      res,
      error.status || 500,
      error.message || "KI Produktsuche fehlgeschlagen.",
      error.details || null
    );
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
    const result = await callJsonOpenAI({
      prompt: buildListingOptimizerPrompt(payload),
      schema: buildListingOptimizerSchema(),
      name: "listing_optimizer_v1",
      description: "Strukturierte eBay-Listing-Ausgabe fuer Elyon Seller Tool",
      maxOutputTokens: 1400,
    });

    return res.status(200).json({
      ok: true,
      source: "ai-listing-optimizer",
      task: "listing-optimizer",
      mode: payload.mode,
      model: DEFAULT_MODEL,
      ...normalizeListingOptimizerResult(result),
    });
  } catch (error) {
    return jsonError(
      res,
      error.status || 500,
      error.message || "KI Listing Optimizer fehlgeschlagen.",
      error.details || null
    );
  }
}

export default async function handler(req, res) {
  const body = readBody(req);
  const task = readText(body.task || req.query?.task || req.query?.action || req.query?.endpoint || "");

  if (task === "product-search") {
    return handleProductSearch(req, res, body);
  }

  if (task === "listing-optimizer") {
    return handleListingOptimizer(req, res, body);
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const prompt = readText(body.prompt);
  if (!prompt) {
    return res.status(400).json({ ok: false, error: "Prompt fehlt" });
  }

  try {
    const model = chooseModel(task);
    const response = await client.responses.create({
      model,
      input: buildSimplePrompt(task, prompt, body),
    });

    return res.status(200).json({
      ok: true,
      task,
      modelUsed: model,
      result: response.output_text,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
}
