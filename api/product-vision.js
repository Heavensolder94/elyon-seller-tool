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

function extractJson(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {}
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {}
  }
  return null;
}

function fallbackAnalysis({ barcode, note }) {
  return {
    ok: true,
    mode: "fallback",
    productName: barcode ? `Barcode Produkt ${barcode}` : "Unbekanntes Produkt",
    category: "Noch prüfen",
    searchKeywords: barcode ? [barcode, "EAN", "eBay Deutschland"] : ["Produktfoto", "eBay Deutschland", "Dropshipping"],
    estimatedPurchasePrice: null,
    estimatedSellPrice: null,
    estimatedProfit: null,
    riskLevel: "medium",
    recommendation: "prüfen",
    notes: note || "AI Vision konnte nicht live antworten. Barcode/Fotos wurden aber im Scanner erfasst.",
    nextSteps: [
      "Produktnamen oder EAN bei eBay suchen",
      "Konkurrenzpreis prüfen",
      "Versandzeit und Lieferant prüfen",
      "Marge mit eBay-Gebühren berechnen"
    ]
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Nur POST erlaubt." });
  }

  try {
    const body = readBody(req);
    const image = String(body.image || body.imageBase64 || "").trim();
    const barcode = String(body.barcode || "").trim();
    const context = String(body.context || "Mobile Elyon Produkt Scanner").trim();

    if (!image && !barcode) {
      return res.status(400).json({ ok: false, error: "Bild oder Barcode fehlt." });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || !image) {
      return res.status(200).json(fallbackAnalysis({ barcode, note: !apiKey ? "OPENAI_API_KEY fehlt oder ist nicht verfügbar." : "Kein Bild vorhanden; nur Barcode erfasst." }));
    }

    const prompt = `Du bist der Elyon Product Scanner für eBay Deutschland und Dropshipping. Analysiere das Produktfoto. Antworte ausschließlich als valides JSON mit diesen Feldern: ok, mode, productName, category, visibleFeatures, searchKeywords, estimatedPurchasePrice, estimatedSellPrice, estimatedProfit, riskLevel, recommendation, notes, nextSteps. Verwende recommendation als eines von: nehmen, prüfen, lassen. Nutze EUR-Werte, wenn schätzbar. Barcode: ${barcode || "nicht erkannt"}. Kontext: ${context}.`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_image", image_url: image }
            ]
          }
        ],
        max_output_tokens: 900,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(200).json(fallbackAnalysis({ barcode, note: data.error?.message || data.error || "OpenAI Vision Fehler." }));
    }

    const text = data.output_text || data.output?.flatMap(item => item.content || []).map(part => part.text || "").join("\n") || "";
    const parsed = extractJson(text);
    if (!parsed) {
      return res.status(200).json({
        ...fallbackAnalysis({ barcode, note: "AI Antwort war kein valides JSON." }),
        raw: text.slice(0, 1000),
      });
    }

    return res.status(200).json({
      ok: true,
      mode: "ai-vision",
      barcode: barcode || null,
      ...parsed,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Produkt Vision Analyse fehlgeschlagen." });
  }
}
