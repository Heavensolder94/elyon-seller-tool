const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
const QWEN_DEFAULT_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

function toText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toBool(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeMessages(messages, prompt, context) {
  if (Array.isArray(messages) && messages.length) {
    const normalized = messages
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        role: item.role === "assistant" ? "assistant" : item.role === "system" ? "system" : "user",
        content: toText(item.content ?? item.text ?? ""),
      }))
      .filter((item) => item.content);

    if (context && typeof context === "object") {
      normalized.unshift({
        role: "system",
        content: `Context: ${JSON.stringify(context).slice(0, 4000)}`,
      });
    }

    return normalized;
  }

  const cleanPrompt = toText(prompt);
  if (!cleanPrompt) return [];
  const output = [{ role: "user", content: cleanPrompt }];
  if (context && typeof context === "object") {
    output.unshift({
      role: "system",
      content: `Context: ${JSON.stringify(context).slice(0, 4000)}`,
    });
  }
  return output;
}

function normalizeProvider(provider) {
  const value = toText(provider).toLowerCase();
  if (value === "deepseek") return "deepseek";
  if (value === "qwen") return "qwen";
  if (value === "local") return "local";
  if (value === "openai") return "openai";
  return "";
}

function normalizeModelName(provider, model) {
  const clean = toText(model);
  if (clean) return clean;
  if (provider === "deepseek") return process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
  if (provider === "qwen") return process.env.QWEN_MODEL || "qwen-plus";
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
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

async function callOpenAI({ task, messages, prompt, model, temperature, maxTokens }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return buildErrorResult({
      provider: "openai",
      model: normalizeModelName("openai", model),
      task,
      code: "MISSING_API_KEY",
      message: "OPENAI_API_KEY fehlt.",
      type: "auth",
    });
  }

  const normalizedModel = normalizeModelName("openai", model);
  const payload = {
    model: normalizedModel,
    messages: normalizeMessages(messages, prompt),
  };

  if (typeof temperature === "number") payload.temperature = temperature;
  if (typeof maxTokens === "number") payload.max_tokens = maxTokens;

  try {
    const response = await fetch(OPENAI_ENDPOINT, {
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
        provider: "openai",
        model: normalizedModel,
        task,
        code: getAuthErrorCode(response.status, data),
        message: toText(data?.error?.message || data?.message || rawText || "OpenAI request failed."),
        type: mapErrorType(response.status, data),
      });
    }

    const content = toText(data?.choices?.[0]?.message?.content || data?.output_text || "");
    return buildSuccessResult({
      provider: "openai",
      model: normalizedModel,
      task,
      fallbackUsed: false,
      content,
      usage: {
        inputTokens: data?.usage?.prompt_tokens ?? null,
        outputTokens: data?.usage?.completion_tokens ?? null,
        totalTokens: data?.usage?.total_tokens ?? null,
      },
    });
  } catch (error) {
    return buildErrorResult({
      provider: "openai",
      model: normalizedModel,
      task,
      code: "NETWORK_ERROR",
      message: toText(error && error.message ? error.message : "OpenAI network error."),
      type: "network",
    });
  }
}

async function callDeepSeek({ task, messages, prompt, model, temperature, maxTokens }) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return buildErrorResult({
      provider: "deepseek",
      model: normalizeModelName("deepseek", model),
      task,
      code: "MISSING_API_KEY",
      message: "DEEPSEEK_API_KEY fehlt.",
      type: "auth",
    });
  }

  const normalizedModel = normalizeModelName("deepseek", model);
  const payload = {
    model: normalizedModel,
    messages: normalizeMessages(messages, prompt),
  };

  if (typeof temperature === "number") payload.temperature = temperature;
  if (typeof maxTokens === "number") payload.max_tokens = maxTokens;

  try {
    const response = await fetch(DEEPSEEK_ENDPOINT, {
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
        provider: "deepseek",
        model: normalizedModel,
        task,
        code: getAuthErrorCode(response.status, data),
        message: toText(data?.error?.message || data?.message || rawText || "DeepSeek request failed."),
        type: mapErrorType(response.status, data),
      });
    }

    const content = toText(data?.choices?.[0]?.message?.content || data?.output_text || "");
    return buildSuccessResult({
      provider: "deepseek",
      model: normalizedModel,
      task,
      fallbackUsed: false,
      content,
      usage: {
        inputTokens: data?.usage?.prompt_tokens ?? null,
        outputTokens: data?.usage?.completion_tokens ?? null,
        totalTokens: data?.usage?.total_tokens ?? null,
      },
    });
  } catch (error) {
    return buildErrorResult({
      provider: "deepseek",
      model: normalizedModel,
      task,
      code: "NETWORK_ERROR",
      message: toText(error && error.message ? error.message : "DeepSeek network error."),
      type: "network",
    });
  }
}

async function callQwen({ task, messages, prompt, model, temperature, maxTokens }) {
  const apiKey = process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    return buildErrorResult({
      provider: "qwen",
      model: normalizeModelName("qwen", model),
      task,
      code: "MISSING_API_KEY",
      message: "QWEN_API_KEY bzw. DASHSCOPE_API_KEY fehlt.",
      type: "auth",
    });
  }

  const baseUrl = toText(process.env.QWEN_BASE_URL) || QWEN_DEFAULT_BASE_URL;
  const normalizedModel = normalizeModelName("qwen", model);
  const payload = {
    model: normalizedModel,
    messages: normalizeMessages(messages, prompt),
  };

  if (typeof temperature === "number") payload.temperature = temperature;
  if (typeof maxTokens === "number") payload.max_tokens = maxTokens;

  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
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
        provider: "qwen",
        model: normalizedModel,
        task,
        code: getAuthErrorCode(response.status, data),
        message: toText(data?.error?.message || data?.message || rawText || "Qwen request failed."),
        type: mapErrorType(response.status, data),
      });
    }

    const content = toText(data?.choices?.[0]?.message?.content || data?.output_text || "");
    return buildSuccessResult({
      provider: "qwen",
      model: normalizedModel,
      task,
      fallbackUsed: false,
      content,
      usage: {
        inputTokens: data?.usage?.prompt_tokens ?? null,
        outputTokens: data?.usage?.completion_tokens ?? null,
        totalTokens: data?.usage?.total_tokens ?? null,
      },
    });
  } catch (error) {
    return buildErrorResult({
      provider: "qwen",
      model: normalizedModel,
      task,
      code: "NETWORK_ERROR",
      message: toText(error && error.message ? error.message : "Qwen network error."),
      type: "network",
    });
  }
}

function resolveDefaultProvider() {
  return normalizeProvider(process.env.AI_DEFAULT_PROVIDER) || "openai";
}

function resolveFallbackProvider(provider) {
  const configured = normalizeProvider(process.env.AI_FALLBACK_PROVIDER);
  if (configured && configured !== provider) return configured;
  if (provider === "openai") return "deepseek";
  if (provider === "deepseek") return "openai";
  if (provider === "qwen") return "openai";
  return "local";
}

async function routeAIRequest(options = {}) {
  const provider = normalizeProvider(options.provider) || resolveDefaultProvider();
  const task = toText(options.task);
  const prompt = toText(options.prompt);
  const messages = normalizeMessages(options.messages, prompt, options.context);
  const temperature = typeof options.temperature === "number" ? options.temperature : undefined;
  const maxTokens = typeof options.maxTokens === "number" ? options.maxTokens : undefined;
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

  const request = { task, messages, prompt, model: options.model, temperature, maxTokens };
  let result;

  if (provider === "openai") {
    result = await callOpenAI(request);
  } else if (provider === "deepseek") {
    result = await callDeepSeek(request);
  } else if (provider === "qwen") {
    result = await callQwen(request);
  } else if (provider === "local") {
    result = localFallback({ task, prompt, messages });
  } else {
    result = buildErrorResult({
      provider: "local",
      model: "local-fallback",
      task,
      fallbackUsed: true,
      code: "UNKNOWN_PROVIDER",
      message: `Unbekannter Provider: ${provider}`,
      type: "unknown",
    });
  }

  if (result.ok) {
    if (loggingEnabled && typeof console !== "undefined" && typeof console.info === "function") {
      console.info("[ai-router]", {
        provider: result.provider,
        model: result.model,
        task: result.task,
        fallbackUsed: result.fallbackUsed,
      });
    }
    return result;
  }

  const fallbackAllowed =
    allowFallback &&
    process.env.AI_ALLOW_PROVIDER_FALLBACK !== "false" &&
    provider !== "local";

  if (fallbackAllowed) {
    const fallbackProvider = resolveFallbackProvider(provider);
    let fallbackResult;
    if (fallbackProvider === "openai") {
      fallbackResult = await callOpenAI(request);
    } else if (fallbackProvider === "deepseek") {
      fallbackResult = await callDeepSeek(request);
    } else if (fallbackProvider === "qwen") {
      fallbackResult = await callQwen(request);
    } else {
      fallbackResult = localFallback({ task, prompt, messages });
    }

    if (fallbackResult.ok) {
      fallbackResult.fallbackUsed = true;
      if (loggingEnabled && typeof console !== "undefined" && typeof console.info === "function") {
        console.info("[ai-router]", {
          provider: fallbackResult.provider,
          model: fallbackResult.model,
          task: fallbackResult.task,
          fallbackUsed: true,
        });
      }
      return fallbackResult;
    }

    if (fallbackResult.provider === "local") {
      return fallbackResult;
    }

    return {
      ...fallbackResult,
      fallbackUsed: true,
    };
  }

  if (provider === "openai" || provider === "deepseek" || provider === "qwen") {
    return {
      ...result,
      fallbackUsed: false,
    };
  }

  return localFallback({ task, prompt, messages });
}

export {
  callDeepSeek,
  callOpenAI,
  callQwen,
  localFallback,
  routeAIRequest,
};
