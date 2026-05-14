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

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function sanitizeProductDecisionInput(body) {
  const product = body?.product || body?.productData || body?.item || {};
  const name = readText(product.name || product.productName || product.title);
  const sku = readText(product.sku);
  const category = readText(product.category || product.type || product.productType);
  const supplier = readText(product.supplier || product.supplierName || product.supplierId);
  const supplierId = readText(product.supplierId || product.supplierID || product.supplier);
  const description = readText(product.description || product.listingDescription || product.shortDescription || product.summary);
  const buy = toNumber(product.buy || product.cost || product.purchasePrice);
  const ship = toNumber(product.ship || product.shipping || product.shippingCost);
  const sell = toNumber(product.sell || product.price || product.listPrice);
  const delivery = toNumber(product.delivery || product.deliveryTime || product.deliveryDays);
  const competition = toNumber(product.competition || product.sellers || product.competitors);
  const margin = sell - buy - ship;
  const marginPercent = sell > 0 ? Math.round((margin / sell) * 1000) / 10 : 0;
  const risk = readText(product.risk || product.riskLevel || product.riskLabel);

  return {
    name,
    sku,
    category,
    supplier,
    supplierId,
    description,
    buy,
    ship,
    sell,
    margin: Math.round(margin * 100) / 100,
    marginPercent,
    delivery,
    competition,
    risk,
    complianceHints: {
      electronics: Boolean(product.electronics || product.electronic || product.isElectronics),
      battery: Boolean(product.battery || product.hasBattery || product.containsBattery),
      brandRisk: Boolean(product.brandRisk || product.markenrisiko),
      lucidRisk: Boolean(product.lucidRisk || product.packagingRisk),
      weeeRisk: Boolean(product.weeeRisk || product.wasteElectricalRisk),
      battRisk: Boolean(product.battRisk || product.batteryRisk),
    },
  };
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

  if (task === "product_decision") {
    base.push("Bewerte ein einzelnes Produkt fuer eine interne Kauf- und Listing-Entscheidung.");
    base.push("Gib nur eine sachliche Beratung, keine Aufforderung zur automatischen Veröffentlichung oder Bestellung.");
    base.push("Achte besonders auf Marge, Lieferzeit, Wettbewerb, Risiko und moegliche Compliance-Themen wie Elektronik, Akku, Batterie, CE, Markenrisiko, LUCID, WEEE und BATT.");
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

  if (task === "product_decision") {
    return {
      type: "json_schema",
      name: "ai_product_decision_task",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          score: { type: "integer", minimum: 0, maximum: 100 },
          decision: { type: "string", enum: ["GO", "TEST", "NO"] },
          riskLevel: { type: "string", enum: ["low", "medium", "high"] },
          compliance: { type: "string", enum: ["green", "yellow", "red"] },
          profitVerdict: { type: "string", enum: ["good", "tight", "bad"] },
          publishReady: { type: "boolean" },
          shortSummary: { type: "string" },
          warnings: { type: "array", items: { type: "string" }, maxItems: 8 },
          nextSteps: { type: "array", items: { type: "string" }, maxItems: 8 },
        },
        required: [
          "score",
          "decision",
          "riskLevel",
          "compliance",
          "profitVerdict",
          "publishReady",
          "shortSummary",
          "warnings",
          "nextSteps",
        ],
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

  if (task === "product_decision") {
    const rawDecision = readText(rawResult?.decision).toUpperCase();
    const decision = ["GO", "TEST", "NO"].includes(rawDecision)
      ? rawDecision
      : normalizedScore.total >= 75
        ? "GO"
        : normalizedScore.total >= 45
          ? "TEST"
          : "NO";

    const rawRiskLevel = readText(rawResult?.riskLevel).toLowerCase();
    const riskLevel = ["low", "medium", "high"].includes(rawRiskLevel)
      ? rawRiskLevel
      : decision === "GO"
        ? "low"
        : decision === "TEST"
          ? "medium"
          : "high";

    const rawCompliance = readText(rawResult?.compliance).toLowerCase();
    const compliance = ["green", "yellow", "red"].includes(rawCompliance)
      ? rawCompliance
      : riskLevel === "low"
        ? "green"
        : riskLevel === "medium"
          ? "yellow"
          : "red";

    const rawProfitVerdict = readText(rawResult?.profitVerdict).toLowerCase();
    const profitVerdict = ["good", "tight", "bad"].includes(rawProfitVerdict)
      ? rawProfitVerdict
      : decision === "GO"
        ? "good"
        : decision === "TEST"
          ? "tight"
          : "bad";

    const publishReady = Boolean(
      rawResult?.publishReady === true ||
      (decision === "GO" && compliance === "green" && riskLevel === "low")
    );

    return {
      score: normalizedScore.total,
      decision,
      riskLevel,
      compliance,
      profitVerdict,
      publishReady,
      shortSummary: readText(rawResult?.shortSummary).slice(0, 260),
      warnings: normalizeList(rawResult?.warnings).slice(0, 8),
      nextSteps: normalizeList(rawResult?.nextSteps).slice(0, 8),
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
  const payload = JSON.stringify(
    task === "product_decision" ? sanitizeProductDecisionInput(body) : (body || {}),
    null,
    2
  );

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

  if (task === "product_decision") {
    return [
      "Bewerte das Produkt fuer eine interne Kauf- und Listing-Entscheidung.",
      "Antworte nur mit einem kurzen strukturierten JSON-Ergebnis.",
      "Gib keine langen Fliesstexte aus, sondern kurze Zusammenfassung, Warnungen und naechste Schritte.",
      "Nenne moegliche Compliance-Themen wie Elektronik, Akku, Batterie, CE, Markenrisiko, LUCID, WEEE und BATT klar.",
      "Keine automatische Veröffentlichung, keine Bestellungen, nur Beratung.",
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
