import { routeAIRequest } from "../lib/ai-provider-router.js";

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
  if (start >= 0 && end > start) {
    candidates.push(text.slice(start, end + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      // Providers sometimes wrap JSON in Markdown. Try the next candidate.
    }
  }
  return null;
}

function withStructuredTaskResult(result) {
  if (!result || !result.ok || result.task !== "product_decision") return result;
  const parsed = parseJsonObjectFromText(result.result || result.content);
  if (!parsed) return result;
  return {
    ...result,
    result: parsed,
  };
}

export default async function handler(req, res) {
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

  const body = readBody(req);
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
  });

  return res.status(result.ok ? 200 : 400).json(withStructuredTaskResult(result));
}
