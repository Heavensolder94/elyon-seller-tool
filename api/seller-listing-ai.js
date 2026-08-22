import { requireSellerAccess } from "../lib/seller-access.js";
import { routeAIRequest } from "../lib/ai-provider-router.js";
import { chooseDeepSeekModelForTask } from "../lib/ai-task-model-policy.js";

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
  throw new Error("KI lieferte kein gültiges JSON.");
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

function listingMessages({ product, draft, strength }) {
  return [
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
  ];
}

export default async function handler(req, res) {
  if (!requireSellerAccess(req, res, { maxBodyBytes: 256 * 1024 })) return;
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();

  const primaryModel = chooseDeepSeekModelForTask("seller_listing_optimizer", "deepseek-v4-flash");
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      route: "/api/seller-listing-ai",
      configured: Boolean(process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY),
      primaryProvider: "deepseek",
      primaryModel,
      fallbackProvider: "openai",
      providers: {
        deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
        openai: Boolean(process.env.OPENAI_API_KEY),
      },
      safety: {
        factsOnly: true,
        noAutomaticPublishing: true,
        noSecretExposure: true,
        manualReviewRequired: true,
      },
    });
  }

  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Nur GET und POST erlaubt." });

  try {
    const body = object(req.body);
    const product = object(body.product);
    const draft = object(body.draft);
    const strength = clamp(body.strength, 0, 100);
    const aiResult = await routeAIRequest({
      provider: "deepseek",
      task: "seller_listing_optimizer",
      allowFallback: true,
      temperature: 0.1 + (strength / 100) * 0.35,
      maxTokens: 5000,
      responseFormat: { type: "json_object" },
      messages: listingMessages({ product, draft, strength }),
      safety: {
        securityMode: true,
        sandboxMode: true,
        autonomyLocked: true,
        requiresLiveAction: false,
        userApproved: false,
      },
    });

    if (!aiResult.ok) {
      return res.status(502).json({
        ok: false,
        error: aiResult.error?.code || "seller_listing_ai_request_failed",
        message: aiResult.error?.message || "Seller-Listing-KI konnte nicht antworten.",
        provider: aiResult.provider || null,
        model: aiResult.model || null,
        fallbackUsed: Boolean(aiResult.fallbackUsed),
      });
    }

    if (!aiResult.content) {
      return res.status(502).json({ ok: false, error: "seller_listing_ai_empty_response", message: "Die Seller-Listing-KI hat keine verwertbare Antwort geliefert." });
    }

    return res.status(200).json({
      ok: true,
      result: sanitizeResult(parseJson(aiResult.content)),
      provider: aiResult.provider,
      model: aiResult.model,
      fallbackUsed: Boolean(aiResult.fallbackUsed),
      strength,
      usage: aiResult.usage || null,
      safety: { automaticPublishing: false, manualReviewRequired: true },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "seller_listing_ai_failed", message: error?.message || "Seller-Listing-Optimierung fehlgeschlagen." });
  }
}
