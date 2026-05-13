const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function jsonError(res, status, error, details) {
  return res.status(status).json({
    ok: false,
    source: "ai-product-search",
    status,
    error,
    details: details ?? null,
  });
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
  return Array.from(
    new Set(
      list
        .map((item) => readText(item))
        .filter(Boolean)
    )
  );
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

function normalizeResult(rawResult) {
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

function buildUserPayload(payload) {
  const product = payload?.product || {};
  const mode = readText(payload?.mode || payload?.requestedMode || "improve") || "improve";
  return {
    mode,
    query: readText(payload?.query || product.name || product.sku || product.notes),
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

function buildSystemPrompt() {
  return [
    "Du bist ein professioneller Assistent fuer eBay-Produktsuche in einem deutschen Online-Shop.",
    "Hilf dabei, Suchbegriffe, Synonyme, Nischenwinkel und Titelideen fuer Produkte zu finden.",
    "Arbeite serios, eBay-tauglich und vorsichtig mit Risiken.",
    "Erfinde keine Marken, keine Zertifizierungen und keine unrealistischen Versprechen.",
    "Warn bei moeglichen Risiken wie Batterie, WEEE, EPR, LUCID, Markenrecht oder zu hoher Konkurrenz.",
    "Antworte ausschliesslich als valides JSON und sonst mit nichts.",
  ].join(" ");
}

function buildModeInstructions(mode) {
  if (mode === "analyze") {
    return [
      "Pruefe die Produktidee auf Suchpotenzial, Konkurrenz und Risiko.",
      "Gib neben Verbesserungen auch eine klare Empfehlung, ob die Suche sinnvoll wirkt.",
    ].join(" ");
  }

  return [
    "Erweitere den Suchbegriff zu besseren eBay-Suchvarianten.",
    "Gib Synonyme, alternative Suchwinkel und verwertbare Titelideen aus.",
  ].join(" ");
}

function buildSchema() {
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

async function callOpenAI(payload) {
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
        { role: "system", content: buildSystemPrompt() },
        {
          role: "user",
          content:
            `${buildModeInstructions(payload.mode)}\n\n` +
            `Suchbegriff:\n${payload.query || "Unbekannt"}\n\n` +
            `Produktdaten:\n${JSON.stringify(payload.product, null, 2)}\n\n` +
            "Antworte nur mit JSON, das exakt dem Schema entspricht.",
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "product_search_optimizer_v1",
          description: "Strukturierte Produktsuche-Analyse fuer Elyon Seller Tool",
          strict: true,
          schema: buildSchema(),
        },
      },
      max_output_tokens: 1200,
    }),
  });

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const rawText = await response.text();
  let data = null;

  if (rawText && contentType.includes("application/json")) {
    try {
      data = JSON.parse(rawText);
    } catch (error) {
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

  let parsed = null;
  try {
    parsed = JSON.parse(outputText);
  } catch (error) {
    throw new Error("OpenAI Antwort konnte nicht als JSON gelesen werden.");
  }

  return normalizeResult(parsed);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return jsonError(res, 405, "Nur POST erlaubt.", "METHOD_NOT_ALLOWED");
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (error) {
      return jsonError(res, 400, "Ungültiger JSON-Body.", "BAD_JSON");
    }
  }

  const payload = buildUserPayload(body || {});
  if (!payload.query && !payload.product.name && !payload.product.notes && !payload.product.sku) {
    return jsonError(res, 400, "Es fehlen Such- oder Produktdaten für die KI Produktsuche.", "MISSING_SEARCH_DATA");
  }

  try {
    const result = await callOpenAI(payload);
    return res.status(200).json({
      ok: true,
      source: "ai-product-search",
      mode: payload.mode,
      model: DEFAULT_MODEL,
      ...result,
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
