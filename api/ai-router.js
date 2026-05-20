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

  return res.status(result.ok ? 200 : 400).json(result);
}
