import { requireSellerAccess } from "../lib/seller-access.js";

function text(value, max = 20000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function parseJson(content) {
  const raw = text(content, 50000);
  try { return JSON.parse(raw); } catch {}
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
  throw new Error("DeepSeek lieferte kein gültiges JSON.");
}

function cleanList(value, max = 8) {
  return (Array.isArray(value) ? value : [])
    .map((entry) => object(entry))
    .map((entry) => ({
      title: text(entry.title || entry.name, 80),
      text: text(entry.text || entry.value || entry.description, 500),
      name: text(entry.name || entry.title, 80),
      value: text(entry.value || entry.text || entry.description, 500),
    }))
    .filter((entry) => entry.title || entry.text || entry.name || entry.value)
    .slice(0, max);
}

function sanitizeResult(value = {}) {
  const source = object(value);
  return {
    title: text(source.title, 80),
    subtitle: text(source.subtitle, 180),
    shortDescription: text(source.shortDescription, 600),
    longDescription: text(source.longDescription, 20000),
    features: cleanList(source.features, 8).map((entry, index) => ({
      title: entry.title || entry.name || `Vorteil ${index + 1}`,
      text: entry.text || entry.value,
    })),
    specs: cleanList(source.specs, 20).map((entry, index) => ({
      name: entry.name || entry.title || `Merkmal ${index + 1}`,
      value: entry.value || entry.text,
    })),
    packageContents: text(source.packageContents, 3000),
    importantNotes: text(source.importantNotes, 3000),
    shippingText: text(source.shippingText, 2000),
    returnsText: text(source.returnsText, 2000),
    serviceText: text(source.serviceText, 2000),
    warnings: (Array.isArray(source.warnings) ? source.warnings : []).map((entry) => text(entry, 500)).filter(Boolean).slice(0, 20),
  };
}

export default async function handler(req, res) {
  if (!requireSellerAccess(req, res, { maxBodyBytes: 256 * 1024 })) return;
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();

  const apiKey = text(process.env.DEEPSEEK_API_KEY, 1000);
  const model = text(process.env.DEEPSEEK_MODEL || "deepseek-chat", 100);
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      route: "/api/seller-listing-ai",
      configured: Boolean(apiKey),
      model: apiKey ? model : null,
      safety: {
        factsOnly: true,
        noAutomaticPublishing: true,
        noSecretExposure: true,
      },
    });
  }

  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Nur GET und POST erlaubt." });
  if (!apiKey) {
    return res.status(503).json({
      ok: false,
      error: "deepseek_not_configured",
      message: "DeepSeek ist im Seller Tool noch nicht serverseitig konfiguriert. Der bestehende Seller-KI-Generator bleibt als Fallback nutzbar.",
    });
  }

  try {
    const body = object(req.body);
    const product = object(body.product);
    const draft = object(body.draft);
    const strength = clamp(body.strength, 0, 100);
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1 + (strength / 100) * 0.35,
        max_tokens: 5000,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Du optimierst ein deutsches eBay-Listing für den Elyon Store. Antworte ausschließlich als valides JSON. " +
              "Verwende nur Fakten aus product und draft. Erfinde niemals Marke, EAN, MPN, Hersteller, GPSR-, CE-, Sicherheits-, Material-, Maß-, Lieferzeit- oder Leistungsangaben. " +
              "Keine unbelegten Superlative, kein Lieferantenname, keine Garantiezusage und keine automatische Veröffentlichung. " +
              "Titel maximal 80 Zeichen. Fehlende Fakten bleiben leer und werden zusätzlich in warnings genannt.",
          },
          {
            role: "user",
            content: JSON.stringify({
              task: "optimize_ebay_listing_designer",
              locale: "de-DE",
              strength,
              strengthMeaning: strength < 35 ? "sehr konservativ, vorhandene Formulierungen weitgehend erhalten" : strength < 70 ? "ausgewogen verbessern" : "deutlich verkaufsstärker formulieren, aber strikt faktengebunden",
              schema: {
                title: "string max 80",
                subtitle: "string",
                shortDescription: "string",
                longDescription: "string",
                features: [{ title: "string", text: "string" }],
                specs: [{ name: "string", value: "string" }],
                packageContents: "string",
                importantNotes: "string",
                shippingText: "string",
                returnsText: "string",
                serviceText: "string",
                warnings: ["string"],
              },
              product,
              draft,
            }),
          },
        ],
      }),
    });

    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
    if (!response.ok) {
      return res.status(502).json({
        ok: false,
        error: "deepseek_request_failed",
        message: data?.error?.message || data?.message || data?.raw || `HTTP ${response.status}`,
      });
    }
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return res.status(502).json({ ok: false, error: "deepseek_empty_response", message: "DeepSeek hat keine verwertbare Antwort geliefert." });
    return res.status(200).json({
      ok: true,
      result: sanitizeResult(parseJson(content)),
      model,
      strength,
      usage: data.usage || null,
      safety: { automaticPublishing: false, manualReviewRequired: true },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "seller_listing_ai_failed", message: error?.message || "DeepSeek-Optimierung fehlgeschlagen." });
  }
}