function json(res, status, body) {
  return res.status(status).json(body);
}

function toText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round2(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeBody(body) {
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch (error) {
      return {};
    }
  }

  return body && typeof body === "object" ? body : {};
}

function summarizeProduct(item, index) {
  const buy = toNumber(item.buy);
  const sell = toNumber(item.sell);
  const ship = toNumber(item.ship);
  const feePercent = toNumber(item.feePercent, 15);
  const bufferPercent = toNumber(item.bufferPercent, 5);
  const delivery = toNumber(item.delivery);
  const sales = toNumber(item.sales);
  const competition = toNumber(item.competition);
  const fee = sell > 0 ? sell * (feePercent / 100) : 0;
  const buffer = sell > 0 ? sell * (bufferPercent / 100) : 0;
  const profit = round2(sell - buy - ship - fee - buffer);
  const marginPercent = sell > 0 ? round2((profit / sell) * 100) : null;
  const missingMargin = Boolean(item.missingMargin) || buy <= 0 || sell <= 0;
  const missingDelivery = Boolean(item.missingDelivery) || delivery <= 0;
  const weakMargin = Boolean(item.weakMargin) || (!missingMargin && profit < 5);
  const riskTag = toText(item.riskTag || item.risk).toLowerCase() || "low";
  const riskTags = Array.isArray(item.riskTags) ? unique(item.riskTags.map(toText)) : [];
  const complianceRisk = Boolean(item.complianceRisk) || riskTag === "high" || riskTags.length > 0;

  return {
    id: `P${index + 1}`,
    status: toText(item.status) || "Idee",
    riskTag,
    riskTags,
    buy: round2(buy),
    sell: round2(sell),
    ship: round2(ship),
    delivery: round2(delivery),
    sales: round2(sales),
    competition: round2(competition),
    feePercent: round2(feePercent),
    bufferPercent: round2(bufferPercent),
    profit,
    marginPercent,
    missingMargin,
    missingDelivery,
    weakMargin,
    complianceRisk,
    shopifyCandidate: Boolean(item.shopifyCandidate),
  };
}

function summarizeProducts(products) {
  const normalized = Array.isArray(products) ? products.map(summarizeProduct) : [];
  const total = normalized.length;
  const missingMarginCount = normalized.filter((item) => item.missingMargin).length;
  const missingDeliveryCount = normalized.filter((item) => item.missingDelivery).length;
  const complianceRiskCount = normalized.filter((item) => item.complianceRisk).length;
  const weakMarginCount = normalized.filter((item) => item.weakMargin).length;
  const averageProfit = total ? normalized.reduce((sum, item) => sum + item.profit, 0) / total : 0;
  const validMargins = normalized.filter((item) => Number.isFinite(item.marginPercent));
  const averageMargin = validMargins.length
    ? validMargins.reduce((sum, item) => sum + item.marginPercent, 0) / validMargins.length
    : 0;

  return {
    total,
    missingMarginCount,
    missingDeliveryCount,
    complianceRiskCount,
    weakMarginCount,
    averageProfit,
    averageMargin,
    recommendation:
      total === 0
        ? "Noch keine Produkte vorhanden. Lege zuerst anonymisierte Produktdaten an."
        : complianceRiskCount > 0
          ? "Erst Compliance-Risiken prüfen, dann nur die sauberen Produkte weiterlisten."
          : missingMarginCount > 0
            ? "Produkte ohne valide Marge zuerst nachpflegen oder pausieren."
            : missingDeliveryCount > 0
              ? "Lieferzeiten ergänzen, bevor du neue Produkte importierst oder bewertest."
              : weakMarginCount > 0
                ? "Schwache Margen zuerst nachverhandeln oder streichen, damit der Cashflow stabil bleibt."
                : "Solide Basis. Jetzt die stärksten Produkte fokussieren und regelmäßig Backups ziehen.",
  };
}

function extractAssistantText(payload) {
  const message = payload?.choices?.[0]?.message;
  const content = message?.content;

  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const textPart = content.find((item) => typeof item?.text === "string" && item.text.trim());
    if (textPart) return textPart.text.trim();
  }

  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  return "";
}

function cleanRecommendation(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 320);
}

function sanitizePrompt(prompt) {
  return String(prompt || "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted]")
    .replace(/\+?\d[\d\s()./-]{7,}\d/g, "[redacted]")
    .replace(/\b(?:[A-Z]{2,}-?\d{4,}|[0-9]{6,})\b/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function stripProductList(summary) {
  const copy = { ...summary };
  delete copy.products;
  return copy;
}

function buildChatMessages(summary, products, prompt) {
  const safePrompt = sanitizePrompt(prompt);
  const productContext = summary.total > 0 ? JSON.stringify({ summary, products }, null, 2) : "";
  return [
    {
      role: "system",
      content: [
        "Du bist Elyon Soul, ein ruhiger, präziser Business-Coach für einen eBay-Seller.",
        "Du antwortest direkt auf die Nutzerfrage und wiederholst sie nicht wortwörtlich.",
        "Du beginnst nicht mit Meta-Hinweisen wie fehlende Produktdaten.",
        "Erwähne niemals Namen, Adressen, Telefonnummern, E-Mails oder Bestellnummern.",
        "Gib genau eine kurze, klare Business-Empfehlung auf Deutsch.",
        "Maximal zwei Sätze, direkt umsetzbar, ohne Aufzählung.",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        `Nutzerfrage: ${safePrompt || "Bitte gib eine kurze, direkte Business-Empfehlung."}`,
        productContext ? `Anonymisierte Produktdaten:\n${productContext}` : "",
      ].filter(Boolean).join("\n\n"),
    },
  ];
}
async function callDeepSeek(summary, products, prompt) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return {
      ok: true,
      aiEnabled: false,
      mode: "rule-based",
      message: "KI-Modus ist noch nicht aktiviert. Regelbasierte Soul ist aktiv.",
      recommendation: summary.total > 0 ? summary.recommendation : "KI-Modus ist noch nicht aktiviert. Regelbasierte Soul ist aktiv.",
      summary: stripProductList(summary),
      model: null,
    };
  }

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-v4-flash",
      temperature: 0.2,
      max_tokens: 300,
      messages: buildChatMessages(summary, products, prompt),
    }),
  });

  const rawText = await response.text();
  let data = null;

  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch (error) {
    data = null;
  }

  if (!response.ok) {
    const message = toText(data?.error?.message || data?.message || rawText || "DeepSeek API Fehler");
    const error = new Error(message || "DeepSeek API Fehler");
    error.status = response.status || 502;
    error.details = data || rawText || null;
    throw error;
  }

  const recommendation = cleanRecommendation(extractAssistantText(data) || summary.recommendation);

  return {
    ok: true,
    aiEnabled: true,
    mode: "deepseek",
    model: "deepseek-v4-flash",
    recommendation,
    summary: stripProductList(summary),
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return json(res, 405, {
      ok: false,
      error: "Nur POST erlaubt.",
    });
  }

  const body = normalizeBody(req.body);
  const productsInput = Array.isArray(body.products) ? body.products : [];
  const summaryInput = body.summary && typeof body.summary === "object" ? body.summary : {};
  const prompt = toText(body.prompt || body.message || body.query);

  const products = productsInput.map((item, index) => summarizeProduct(item, index));
  const summary = summarizeProducts(products);

  const mergedSummary = {
    ...summary,
    total: toNumber(summaryInput.total, summary.total),
    missingMarginCount: toNumber(summaryInput.missingMarginCount, summary.missingMarginCount),
    missingDeliveryCount: toNumber(summaryInput.missingDeliveryCount, summary.missingDeliveryCount),
    complianceRiskCount: toNumber(summaryInput.complianceRiskCount, summary.complianceRiskCount),
    weakMarginCount: toNumber(summaryInput.weakMarginCount, summary.weakMarginCount),
    averageProfit: Number.isFinite(Number(summaryInput.averageProfit)) ? Number(summaryInput.averageProfit) : summary.averageProfit,
    averageMargin: Number.isFinite(Number(summaryInput.averageMargin)) ? Number(summaryInput.averageMargin) : summary.averageMargin,
  };

  if (body.probe) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    return json(res, 200, {
      ok: true,
      aiEnabled: Boolean(apiKey),
      mode: apiKey ? "deepseek" : "rule-based",
      model: apiKey ? "deepseek-v4-flash" : null,
      message: apiKey ? "KI-Modus ist bereit." : "KI-Modus ist noch nicht aktiviert. Regelbasierte Soul ist aktiv.",
      summary: stripProductList(mergedSummary),
    });
  }

  try {
    const result = await callDeepSeek(mergedSummary, products, prompt);
    return json(res, 200, {
      ...result,
      message:
        result.mode === "deepseek"
          ? "DeepSeek-Analyse abgeschlossen."
          : "KI-Modus ist noch nicht aktiviert. Regelbasierte Soul ist aktiv.",
    });
  } catch (error) {
    return json(res, error.status || 500, {
      ok: false,
      aiEnabled: Boolean(process.env.DEEPSEEK_API_KEY),
      mode: "deepseek",
      error: error.message || "KI-Analyse fehlgeschlagen.",
      details: error.details || null,
      summary: stripProductList(mergedSummary),
    });
  }
}

