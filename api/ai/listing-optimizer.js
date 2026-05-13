const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function jsonError(res, status, error, details) {
  return res.status(status).json({
    ok: false,
    source: "ai-listing-optimizer",
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

function buildUserPayload(payload) {
  const product = payload?.product || {};
  const mode = readText(payload?.mode || payload?.requestedMode || "regenerate") || "regenerate";

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

function buildSystemPrompt() {
  return [
    "Du bist ein professioneller eBay Listing Optimizer fuer einen deutschen Online-Shop.",
    "Erstelle verkaufsstarke, aber seriöse eBay-Titel und Beschreibungen.",
    "Achte auf SEO, klare Vorteile, eBay-Regeln, keine falschen Markenversprechen, keine riskanten Aussagen und moegliche Compliance-Risiken wie Batterie, WEEE, LUCID oder EPR.",
    "Wenn keine Marke in den Produktdaten genannt wird, erfinde keine Marke.",
    "Verwende die Begriffe 'original', 'offiziell' oder 'zertifiziert' nur, wenn sie wirklich sicher sind.",
    "Mache keine unrealistischen Lieferzeitversprechen und keine Heilversprechen.",
    "Bei Elektronik, Batterie oder anderen Risikoprodukten nenne die moeglichen Pflichten und warnenden Hinweise klar.",
    "Der eBay-Titel darf maximal 80 Zeichen lang sein.",
    "Antworte ausschliesslich als valides JSON und sonst mit nichts.",
  ].join(" ");
}

function buildModeInstructions(mode) {
  if (mode === "improve") {
    return [
      "Verbessere einen bereits vorhandenen Entwurf.",
      "Nutze currentTitle und currentDescription als Ausgangspunkt, aber korrigiere sie nach den Regeln.",
    ].join(" ");
  }

  if (mode === "check") {
    return [
      "Pruefe das Listing und bewerte seine Qualitaet.",
      "Wenn das Listing Schwachstellen hat, ersetze unsichere Formulierungen durch sichere Alternativen.",
      "Die Ausgabe soll trotzdem ein verbessertes Listing enthalten, damit der Nutzer es direkt verwenden kann.",
    ].join(" ");
  }

  return [
    "Erzeuge das Listing komplett neu aus den Produktdaten.",
    "Nutze Titel, Bulletpoints, Beschreibung, SEO-Keywords, Risiko-Hinweise und Score.",
  ].join(" ");
}

function buildResponseSchema() {
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
            `Produktdaten:\n${JSON.stringify(payload.product, null, 2)}\n\n` +
            "Antworte nur mit JSON, das exakt dem Schema entspricht.",
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "listing_optimizer_v1",
          description: "Strukturierte eBay-Listing-Ausgabe fuer Elyon Seller Tool",
          strict: true,
          schema: buildResponseSchema(),
        },
      },
      max_output_tokens: 1400,
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
  if (
    !payload.product.productName &&
    !payload.product.mainKeyword &&
    !payload.product.features &&
    !payload.product.currentTitle &&
    !payload.product.currentDescription
  ) {
    return jsonError(res, 400, "Es fehlen Produktdaten für den KI Listing Optimizer.", "MISSING_PRODUCT_DATA");
  }

  try {
    const result = await callOpenAI(payload);
    return res.status(200).json({
      ok: true,
      source: "ai-listing-optimizer",
      mode: payload.mode,
      model: DEFAULT_MODEL,
      ...result,
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
