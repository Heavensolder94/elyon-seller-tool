const PROVIDER_CONFIG = {
  openai: {
    endpoint: "https://api.openai.com/v1/chat/completions",
    apiKeyEnv: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL",
    defaultModel: "gpt-4o-mini",
    modelPattern: /^(?:gpt-|o\d)/i,
    label: "OpenAI",
  },
  deepseek: {
    endpoint: "https://api.deepseek.com/chat/completions",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    modelEnv: "DEEPSEEK_MODEL",
    defaultModel: "deepseek-v4-flash",
    modelPattern: /^deepseek-/i,
    label: "DeepSeek",
  },
};

function toText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toBool(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeMessages(messages, prompt, context) {
  let normalized = [];
  if (Array.isArray(messages) && messages.length) {
    normalized = messages
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        role: item.role === "assistant" ? "assistant" : item.role === "system" ? "system" : "user",
        content: toText(item.content ?? item.text ?? ""),
      }))
      .filter((item) => item.content);
  } else {
    const cleanPrompt = toText(prompt);
    if (cleanPrompt) normalized = [{ role: "user", content: cleanPrompt }];
  }

  if (context && typeof context === "object") {
    normalized.unshift({
      role: "system",
      content: `Context: ${JSON.stringify(context).slice(0, 4000)}`,
    });
  }
  return normalized;
}

function normalizeProvider(provider) {
  const value = toText(provider).toLowerCase();
  if (value === "openai" || value === "deepseek" || value === "local") return value;
  return "";
}

function normalizeModelName(provider, model) {
  const config = PROVIDER_CONFIG[provider] || PROVIDER_CONFIG.openai;
  const clean = toText(model);
  if (clean && config.modelPattern.test(clean)) return clean;
  const configured = toText(process.env[config.modelEnv]);
  return configured && config.modelPattern.test(configured) ? configured : config.defaultModel;
}

function normalizeSafety(safety) {
  const source = safety && typeof safety === "object" ? safety : {};
  return {
    securityMode: toBool(source.securityMode, true),
    sandboxMode: toBool(source.sandboxMode, true),
    autonomyLocked: toBool(source.autonomyLocked, true),
    requiresLiveAction: toBool(source.requiresLiveAction, false),
    userApproved: toBool(source.userApproved, false),
  };
}

function isSafetyBlocked(safety) {
  return Boolean(
    safety.requiresLiveAction &&
      (safety.securityMode === true ||
        safety.sandboxMode === true ||
        safety.autonomyLocked === true ||
        safety.userApproved !== true)
  );
}

function getAuthErrorCode(status, body) {
  if (status === 401 || status === 403) return "AUTH_ERROR";
  if (status === 402) return "BILLING_ERROR";
  if (status === 429) return "RATE_LIMIT";
  if (status >= 500) return "SERVER_ERROR";
  if (body && typeof body.error === "string" && /insufficient|billing|quota/i.test(body.error)) return "BILLING_ERROR";
  return "UNKNOWN_ERROR";
}

function mapErrorType(status, body) {
  if (status === 401 || status === 403) return "auth";
  if (status === 402) return "billing";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "server";
  if (body && typeof body.error === "string" && /quota|billing|insufficient/i.test(body.error)) return "billing";
  return "unknown";
}

function buildErrorResult({ provider, model, task, fallbackUsed, code, message, type }) {
  return {
    ok: false,
    provider,
    model: model || "",
    fallbackUsed: Boolean(fallbackUsed),
    task: task || "",
    content: "",
    usage: null,
    error: {
      code: code || "UNKNOWN_ERROR",
      message: message || "AI request failed.",
      type: type || "unknown",
    },
  };
}

function buildSuccessResult({ provider, model, task, fallbackUsed, content, usage }) {
  return {
    ok: true,
    provider,
    model,
    fallbackUsed: Boolean(fallbackUsed),
    task: task || "",
    content: content || "",
    usage: usage || {
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
    },
    error: null,
  };
}

function localFallback({ task, prompt, messages }) {
  const messageCount = Array.isArray(messages) ? messages.length : 0;
  const cleanTask = toText(task) || "general";
  const cleanPrompt = toText(prompt);
  const content = cleanPrompt
    ? `Analyse konnte nicht extern durchgeführt werden. Aufgabe: ${cleanTask}. Bitte API-Key prüfen oder später erneut versuchen.`
    : `KI-Anbieter nicht verfügbar. Aufgabe: ${cleanTask}. Diese Aktion wurde lokal vorbereitet, aber nicht live ausgeführt.`;

  return buildSuccessResult({
    provider: "local",
    model: "local-fallback",
    task: cleanTask,
    fallbackUsed: true,
    content: messageCount > 0 ? `${content} (Kontext: ${messageCount} Nachrichten.)` : content,
  });
}

async function callProvider(provider, { task, messages, prompt, model, temperature, maxTokens }) {
  const config = PROVIDER_CONFIG[provider];
  if (!config) {
    return buildErrorResult({
      provider: "local",
      task,
      code: "UNKNOWN_PROVIDER",
      message: `Unbekannter Provider: ${provider}`,
      type: "unknown",
    });
  }

  const apiKey = process.env[config.apiKeyEnv];
  const normalizedModel = normalizeModelName(provider, model);
  if (!apiKey) {
    return buildErrorResult({
      provider,
      model: normalizedModel,
      task,
      code: "MISSING_API_KEY",
      message: `${config.apiKeyEnv} fehlt.`,
      type: "auth",
    });
  }

  const payload = {
    model: normalizedModel,
    messages: normalizeMessages(messages, prompt),
  };
  if (typeof temperature === "number") payload.temperature = temperature;
  if (typeof maxTokens === "number") payload.max_tokens = maxTokens;

  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const rawText = await response.text();
    let data = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      return buildErrorResult({
        provider,
        model: normalizedModel,
        task,
        code: getAuthErrorCode(response.status, data),
        message: toText(data?.error?.message || data?.message || rawText || `${config.label} request failed.`),
        type: mapErrorType(response.status, data),
      });
    }

    return buildSuccessResult({
      provider,
      model: normalizedModel,
      task,
      fallbackUsed: false,
      content: toText(data?.choices?.[0]?.message?.content || data?.output_text || ""),
      usage: {
        inputTokens: data?.usage?.prompt_tokens ?? null,
        outputTokens: data?.usage?.completion_tokens ?? null,
        totalTokens: data?.usage?.total_tokens ?? null,
      },
    });
  } catch (error) {
    return buildErrorResult({
      provider,
      model: normalizedModel,
      task,
      code: "NETWORK_ERROR",
      message: toText(error?.message || `${config.label} network error.`),
      type: "network",
    });
  }
}

function callOpenAI(options) {
  return callProvider("openai", options);
}

function callDeepSeek(options) {
  return callProvider("deepseek", options);
}

function resolveDefaultProvider() {
  return normalizeProvider(process.env.AI_DEFAULT_PROVIDER) || "openai";
}

function resolveFallbackProvider(provider) {
  const configured = normalizeProvider(process.env.AI_FALLBACK_PROVIDER);
  if (configured && configured !== provider && configured !== "local") return configured;
  if (provider === "openai") return "deepseek";
  if (provider === "deepseek") return "openai";
  return "local";
}

async function executeProvider(provider, request) {
  if (provider === "openai") return callOpenAI(request);
  if (provider === "deepseek") return callDeepSeek(request);
  if (provider === "local") return localFallback(request);
  return buildErrorResult({
    provider: "local",
    model: "local-fallback",
    task: request.task,
    fallbackUsed: true,
    code: "UNKNOWN_PROVIDER",
    message: `Unbekannter Provider: ${provider}`,
    type: "unknown",
  });
}

async function routeAIRequest(options = {}) {
  const provider = normalizeProvider(options.provider) || resolveDefaultProvider();
  const task = toText(options.task);
  const prompt = toText(options.prompt);
  const messages = normalizeMessages(options.messages, prompt, options.context);
  const request = {
    task,
    messages,
    prompt,
    model: options.model,
    temperature: typeof options.temperature === "number" ? options.temperature : undefined,
    maxTokens: typeof options.maxTokens === "number" ? options.maxTokens : undefined,
  };
  const allowFallback = toBool(options.allowFallback, true);
  const safety = normalizeSafety(options.safety);
  const loggingEnabled = toBool(options.loggingEnabled, process.env.AI_LOGGING_ENABLED === "true");

  if (isSafetyBlocked(safety)) {
    return buildErrorResult({
      provider: "local",
      model: "local-fallback",
      task,
      fallbackUsed: true,
      code: "SAFETY_BLOCKED",
      message: "Live-Aktion durch Sicherheitsmodus, Sandbox oder Autonomie-Sperre blockiert.",
      type: "safety",
    });
  }

  const result = await executeProvider(provider, request);
  if (result.ok) {
    if (loggingEnabled) console.info("[ai-router]", { provider: result.provider, model: result.model, task, fallbackUsed: result.fallbackUsed });
    return result;
  }

  const fallbackAllowed = allowFallback && process.env.AI_ALLOW_PROVIDER_FALLBACK !== "false" && provider !== "local";
  if (!fallbackAllowed) return { ...result, fallbackUsed: false };

  const fallbackProvider = resolveFallbackProvider(provider);
  const fallbackResult = await executeProvider(fallbackProvider, request);
  if (fallbackResult.ok) {
    fallbackResult.fallbackUsed = true;
    if (loggingEnabled) console.info("[ai-router]", { provider: fallbackResult.provider, model: fallbackResult.model, task, fallbackUsed: true });
    return fallbackResult;
  }

  return fallbackResult.provider === "local"
    ? fallbackResult
    : { ...fallbackResult, fallbackUsed: true };
}

export {
  callDeepSeek,
  callOpenAI,
  localFallback,
  routeAIRequest,
};