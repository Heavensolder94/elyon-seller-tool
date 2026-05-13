const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function jsonError(res, status, error, details) {
  return res.status(status).json({
    ok: false,
    source: "ai",
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

function getSystemPrompt(task) {
  const base = [
    "Du bist ein professioneller eBay Listing Optimizer fuer einen deutschen Online-Shop.",
    "Erstelle verkaufsstarke, aber seriöse Inhalte.",
    "Achte auf SEO, klare Vorteile, eBay-Regeln, keine falschen Markenversprechen, keine riskanten Aussagen und moegliche Compliance-Risiken wie Batterie, WEEE, LUCID oder EPR.",
    "Wenn keine Marke in den Produktdaten genannt wird, erfinde keine Marke.",
    "Verwende Begriffe wie 'original', 'offiziell' oder 'zertifiziert' nur, wenn sie sicher sind.",
    "Mache keine unrealistischen Lieferzeitversprechen und keine Heilversprechen.",
    "Antworte ausschliesslich als valides JSON und sonst mit nichts.",
  ];

  if (task === "product_score") {
    base.push("Bewerte das Produkt sachlich mit Chancen, Risiken und einem Score.");
  }

  return base.join(" ");
}

function getResponseFormat(task) {
  if (task === "title") {
    return {
      type: "json_schema",
      name: "ai_title_task",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", maxLength: 80 },
          subtitle: { type: "string", maxLength: 120 },
          seoKeywords: { type: "array", items: { type: "string" }, maxItems: 12 },
          riskWarnings: { type: "array", items: { type: "string" }, maxItems: 8 },
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
        required: ["title", "subtitle", "seoKeywords", "riskWarnings", "score"],
      },
    };
  }

  if (task === "description") {
    return {
      type: "json_schema",
      name: "ai_description_task",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          description: { type: "string" },
          bulletPoints: { type: "array", items: { type: "string" }, maxItems: 6 },
          seoKeywords: { type: "array", items: { type: "string" }, maxItems: 12 },
          riskWarnings: { type: "array", items: { type: "string" }, maxItems: 8 },
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
        required: ["description", "bulletPoints", "seoKeywords", "riskWarnings", "score"],
      },
    };
  }

  if (task === "tags") {
    return {
      type: "json_schema",
      name: "ai_tags_task",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          seoKeywords: { type: "array", items: { type: "string" }, maxItems: 20 },
          titleIdeas: { type: "array", items: { type: "string" }, maxItems: 8 },
          riskWarnings: { type: "array", items: { type: "string" }, maxItems: 8 },
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
        required: ["seoKeywords", "titleIdeas", "riskWarnings", "score"],
      },
    };
  }

  if (task === "product_score") {
    return {
      type: "json_schema",
      name: "ai_product_score_task",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          summary: { type: "string" },
          recommendation: { type: "string" },
          riskWarnings: { type: "array", items: { type: "string" }, maxItems: 8 },
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
        required: ["summary", "recommendation", "riskWarnings", "score"],
      },
    };
  }

  throw new Error(`Unbekannter task: ${task}`);
}

function normalizeResult(task, rawResult) {
  const score = rawResult?.score || {};
  const hasTotal = score.total !== undefined && score.total !== null;
  const normalizedScore = {
    title: clampNumber(score.title),
    seo: clampNumber(score.seo),
    description: clampNumber(score.description),
    risk: clampNumber(score.risk),
    total: clampNumber(hasTotal ? score.total : 0),
  };

  if (!hasTotal) {
    normalizedScore.total = clampNumber((normalizedScore.title + normalizedScore.seo + normalizedScore.description + normalizedScore.risk) / 4);
  }

  if (task === "title") {
    return {
      title: readText(rawResult?.title).slice(0, 80),
      subtitle: readText(rawResult?.subtitle).slice(0, 120),
      seoKeywords: normalizeList(rawResult?.seoKeywords).slice(0, 12),
      riskWarnings: normalizeList(rawResult?.riskWarnings).slice(0, 8),
      score: normalizedScore,
    };
  }

  if (task === "description") {
    return {
      description: readText(rawResult?.description),
      bulletPoints: normalizeList(rawResult?.bulletPoints).slice(0, 6),
      seoKeywords: normalizeList(rawResult?.seoKeywords).slice(0, 12),
      riskWarnings: normalizeList(rawResult?.riskWarnings).slice(0, 8),
      score: normalizedScore,
    };
  }

  if (task === "tags") {
    return {
      seoKeywords: normalizeList(rawResult?.seoKeywords).slice(0, 20),
      titleIdeas: normalizeList(rawResult?.titleIdeas).slice(0, 8),
      riskWarnings: normalizeList(rawResult?.riskWarnings).slice(0, 8),
      score: normalizedScore,
    };
  }

  if (task === "product_score") {
    return {
      summary: readText(rawResult?.summary),
      recommendation: readText(rawResult?.recommendation),
      riskWarnings: normalizeList(rawResult?.riskWarnings).slice(0, 8),
      score: normalizedScore,
    };
  }

  return rawResult;
}

async function callOpenAI(task, prompt) {
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
        { role: "system", content: getSystemPrompt(task) },
        { role: "user", content: prompt },
      ],
      text: {
        format: getResponseFormat(task),
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

  return normalizeResult(task, parsed);
}

function buildTaskPrompt(task, prompt, body) {
  const safePrompt = readText(prompt);
  const payload = JSON.stringify(body || {}, null, 2);

  if (task === "title") {
    return [
      "Erzeuge einen eBay-Titel mit maximal 80 Zeichen.",
      "Keine falschen Markenversprechen, keine unsicheren Zertifizierungen.",
      "Liefer optional einen kurzen Untertitel, SEO-Keywords und Risikohinweise.",
      "Wenn wichtige Daten fehlen, arbeite mit den vorhandenen Angaben und bleibe seriös.",
      "",
      "Prompt:",
      safePrompt,
      "",
      "Daten:",
      payload,
    ].join("\n");
  }

  if (task === "description") {
    return [
      "Erzeuge eine seriöse, verkaufsstarke eBay-Beschreibung.",
      "Achte auf klare Vorteile, Bulletpoints, eBay-Regeln und keine riskanten Aussagen.",
      "",
      "Prompt:",
      safePrompt,
      "",
      "Daten:",
      payload,
    ].join("\n");
  }

  if (task === "tags") {
    return [
      "Erzeuge SEO-Keywords und Titelideen fuer eBay.",
      "Gib Synonyme, Suchvarianten und passende Keyword-Cluster aus.",
      "",
      "Prompt:",
      safePrompt,
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
      safePrompt,
      "",
      "Daten:",
      payload,
    ].join("\n");
  }

  return [safePrompt, payload].join("\n\n");
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

  const task = readText(body?.task);
  const prompt = readText(body?.prompt);

  if (!task) {
    return jsonError(res, 400, "task fehlt.", "TASK_MISSING");
  }
  if (!prompt) {
    return jsonError(res, 400, "prompt fehlt.", "PROMPT_MISSING");
  }

  try {
    const result = await callOpenAI(task, buildTaskPrompt(task, prompt, body));
    return res.status(200).json({
      ok: true,
      source: "ai",
      task,
      model: DEFAULT_MODEL,
      result,
    });
  } catch (error) {
    return jsonError(
      res,
      error.status || 500,
      error.message || "KI Anfrage fehlgeschlagen.",
      error.details || null
    );
  }
}
