import { chooseDeepSeekModelForTask } from "./ai-task-model-policy.js";

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
  openrouter: {
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    apiKeyEnv: "OPENROUTER_API_KEY",
    modelEnv: "OPENROUTER_MODEL",
    defaultModel: "openrouter/free",
    modelPattern: /^[a-z0-9_.-]+\/[a-z0-9_.:-]+$/i,
    label: "OpenRouter",
  },
};

function toText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toBool(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeToolCalls(value) {
  return (Array.isArray(value) ? value : [])
    .map((call, index) => {
      const fn = call?.function && typeof call.function === "object" ? call.function : {};
      const name = toText(fn.name);
      if (!name) return null;
      return {
        id: toText(call?.id) || `tool-call-${index + 1}`,
        type: "function",
        function: {
          name,
          arguments: typeof fn.arguments === "string" ? fn.arguments : JSON.stringify(fn.arguments || {}),
        },
      };
    })
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeMessage(item) {
  if (!item || typeof item !== "object") return null;
  const rawRole = toText(item.role).toLowerCase();
  const role = rawRole === "assistant" ? "assistant" : rawRole === "system" ? "system" : rawRole === "tool" ? "tool" : "user";
  const content = toText(item.content ?? item.text ?? "");

  if (role === "tool") {
    const toolCallId = toText(item.tool_call_id || item.toolCallId);
    if (!toolCallId) return null;
    return {
      role: "tool",
      tool_call_id: toolCallId,
      content: content || "{}",
    };
  }

  if (role === "assistant") {
    const toolCalls = normalizeToolCalls(item.tool_calls || item.toolCalls);
    if (!content && !toolCalls.length) return null;
    return {
      role: "assistant",
      content: content || null,
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    };
  }

  if (!content) return null;
  return { role, content };
}

function normalizeMessages(messages, prompt, context) {
  let normalized = [];
  if (Array.isArray(messages) && messages.length) {
    normalized = messages.map(normalizeMessage).filter(Boolean);
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
  if (value === "openai" || value === "deepseek" || value === "openrouter" || value === "local") return value;
  return "";
}

function isOpenRouterModel(model) {
  const value = toText(model);
  return value === "openrouter/free" || /^[a-z0-9_.-]+\/[a-z0-9_.:-]+$/i.test(value);
}

function normalizeModelName(provider, model, task) {
  const config = PROVIDER_CONFIG[provider] || PROVIDER_CONFIG.openai;
  const clean = toText(model);
  if (clean && config.modelPattern.test(clean)) return clean;

  if (provider === "deepseek" && process.env.DEEPSEEK_SMART_ROUTING !== "false") {
    const policyModel = chooseDeepSeekModelForTask(task);
    if (policyModel && config.modelPattern.test(policyModel)) return policyModel;
  }

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

function parseRetryAfterSeconds(value, nowMs = Date.now()) {
  const clean = toText(value);
  if (!clean) return null;
  const numeric = Number(clean);
  if (Number.isFinite(numeric) && numeric >= 0) return Math.ceil(numeric);
  const retryAt = Date.parse(clean);
  if (!Number.isFinite(retryAt)) return null;
  return Math.max(0, Math.ceil((retryAt - nowMs) / 1000));
}

function emptyUsage() {
  return { inputTokens: null, outputTokens: null, totalTokens: null };
}

function mergeUsage(left, right) {
  const values = [left || {}, right || {}];
  const sum = (key) => {
    const numbers = values.map((value) => value?.[key]).filter((value) => Number.isFinite(value));
    return numbers.length ? numbers.reduce((total, value) => total + value, 0) : null;
  };
  return {
    inputTokens: sum("inputTokens"),
    outputTokens: sum("outputTokens"),
    totalTokens: sum("totalTokens"),
  };
}

function buildErrorResult({ provider, model, task, fallbackUsed, code, message, type, status, retryAfterSeconds, toolTrace }) {
  return {
    ok: false,
    provider,
    model: model || "",
    fallbackUsed: Boolean(fallbackUsed),
    task: task || "",
    content: "",
    toolCalls: [],
    toolTrace: Array.isArray(toolTrace) ? toolTrace : [],
    usage: null,
    error: {
      code: code || "UNKNOWN_ERROR",
      message: message || "AI request failed.",
      type: type || "unknown",
      status: Number.isInteger(status) ? status : null,
      retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : null,
    },
  };
}

function buildSuccessResult({ provider, model, task, fallbackUsed, content, usage, toolCalls, toolTrace, finishReason }) {
  return {
    ok: true,
    provider,
    model,
    fallbackUsed: Boolean(fallbackUsed),
    task: task || "",
    content: content || "",
    toolCalls: normalizeToolCalls(toolCalls),
    toolTrace: Array.isArray(toolTrace) ? toolTrace : [],
    finishReason: toText(finishReason),
    usage: usage || emptyUsage(),
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

async function callProvider(provider, { task, messages, prompt, model, temperature, maxTokens, tools, responseFormat }) {
  const config = PROVIDER_CONFIG[provider];
  if (!config) {
    return buildErrorResult({ provider: "local", task, code: "UNKNOWN_PROVIDER", message: `Unbekannter Provider: ${provider}`, type: "unknown" });
  }

  const apiKey = process.env[config.apiKeyEnv];
  const normalizedModel = normalizeModelName(provider, model, task);
  if (!apiKey) {
    return buildErrorResult({ provider, model: normalizedModel, task, code: "MISSING_API_KEY", message: `${config.apiKeyEnv} fehlt.`, type: "auth" });
  }

  const payload = {
    model: normalizedModel,
    messages: normalizeMessages(messages, prompt),
  };
  if (typeof temperature === "number") payload.temperature = temperature;
  if (typeof maxTokens === "number") payload.max_tokens = maxTokens;
  if (Array.isArray(tools) && tools.length) payload.tools = tools;
  if (responseFormat && typeof responseFormat === "object") payload.response_format = responseFormat;

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = toText(process.env.OPENROUTER_HTTP_REFERER) || "https://elyonsellertool.vercel.app";
    headers["X-Title"] = toText(process.env.OPENROUTER_APP_NAME) || "Elyon Seller Tool";
  }

  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const rawText = await response.text();
    let data = null;
    try { data = rawText ? JSON.parse(rawText) : null; } catch { data = null; }

    if (!response.ok) {
      return buildErrorResult({
        provider,
        model: normalizedModel,
        task,
        code: getAuthErrorCode(response.status, data),
        message: toText(data?.error?.message || data?.message || rawText || `${config.label} request failed.`),
        type: mapErrorType(response.status, data),
        status: response.status,
        retryAfterSeconds: parseRetryAfterSeconds(response.headers?.get?.("retry-after")),
      });
    }

    const choice = data?.choices?.[0] || {};
    const message = choice?.message || {};
    return buildSuccessResult({
      provider,
      model: toText(data?.model) || normalizedModel,
      task,
      fallbackUsed: false,
      content: toText(message?.content || data?.output_text || ""),
      toolCalls: message?.tool_calls,
      finishReason: choice?.finish_reason,
      usage: {
        inputTokens: data?.usage?.prompt_tokens ?? null,
        outputTokens: data?.usage?.completion_tokens ?? null,
        totalTokens: data?.usage?.total_tokens ?? null,
      },
    });
  } catch (error) {
    return buildErrorResult({ provider, model: normalizedModel, task, code: "NETWORK_ERROR", message: toText(error?.message || `${config.label} network error.`), type: "network" });
  }
}

function callOpenAI(options) { return callProvider("openai", options); }
function callDeepSeek(options) { return callProvider("deepseek", options); }
function callOpenRouter(options) { return callProvider("openrouter", options); }

function resolveDefaultProvider() {
  return normalizeProvider(process.env.AI_DEFAULT_PROVIDER) || "openai";
}

function resolveFallbackProvider(provider) {
  const configured = normalizeProvider(process.env.AI_FALLBACK_PROVIDER);
  if (configured && configured !== provider && configured !== "local") return configured;
  if (provider === "openai") return "deepseek";
  if (provider === "deepseek") return "openai";
  if (provider === "openrouter") return "openai";
  return "local";
}

async function executeProvider(provider, request) {
  if (provider === "openai") return callOpenAI(request);
  if (provider === "deepseek") return callDeepSeek(request);
  if (provider === "openrouter") return callOpenRouter(request);
  if (provider === "local") return localFallback(request);
  return buildErrorResult({ provider: "local", model: "local-fallback", task: request.task, fallbackUsed: true, code: "UNKNOWN_PROVIDER", message: `Unbekannter Provider: ${provider}`, type: "unknown" });
}

function traceValue(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return { ok: false, error: "tool_result_not_serializable" };
  }
}

async function executeProviderWithTools(provider, request, { toolExecutor, maxToolRounds = 3 } = {}) {
  let result = await executeProvider(provider, request);
  if (!result.ok || typeof toolExecutor !== "function" || !result.toolCalls?.length) return result;

  let messages = Array.isArray(request.messages) ? [...request.messages] : normalizeMessages([], request.prompt);
  let aggregateUsage = result.usage;
  const toolTrace = [];
  const roundLimit = Math.max(1, Math.min(5, Math.trunc(Number(maxToolRounds) || 3)));

  for (let round = 1; round <= roundLimit && result.ok && result.toolCalls?.length; round += 1) {
    const assistantToolCalls = normalizeToolCalls(result.toolCalls);
    messages.push({
      role: "assistant",
      content: result.content || null,
      tool_calls: assistantToolCalls,
    });

    for (const call of assistantToolCalls) {
      let output;
      try {
        output = await toolExecutor(call.function.name, call.function.arguments, {
          provider,
          task: request.task,
          round,
          call,
        });
      } catch (error) {
        output = { ok: false, error: "tool_execution_failed", message: toText(error?.message) };
      }
      const safeOutput = traceValue(output ?? { ok: true });
      toolTrace.push({ round, tool: call.function.name, callId: call.id, output: safeOutput });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(safeOutput),
      });
    }

    result = await executeProvider(provider, { ...request, messages, prompt: "" });
    if (!result.ok) return { ...result, toolTrace, usage: aggregateUsage };
    aggregateUsage = mergeUsage(aggregateUsage, result.usage);
  }

  if (result.toolCalls?.length) {
    return buildErrorResult({
      provider: result.provider || provider,
      model: result.model,
      task: request.task,
      code: "TOOL_ROUND_LIMIT",
      message: "Die KI hat die maximale Zahl sicherer Tool-Runden überschritten.",
      type: "safety",
      toolTrace,
    });
  }

  return { ...result, toolTrace, usage: aggregateUsage };
}

async function routeAIRequest(options = {}) {
  const requestedModel = toText(options.model);
  const provider = isOpenRouterModel(requestedModel)
    ? "openrouter"
    : normalizeProvider(options.provider) || resolveDefaultProvider();
  const task = toText(options.task);
  const prompt = toText(options.prompt);
  const messages = normalizeMessages(options.messages, prompt, options.context);
  const request = {
    task,
    messages,
    prompt,
    model: requestedModel || undefined,
    temperature: typeof options.temperature === "number" ? options.temperature : undefined,
    maxTokens: typeof options.maxTokens === "number" ? options.maxTokens : undefined,
    tools: Array.isArray(options.tools) ? options.tools : undefined,
    responseFormat: options.responseFormat && typeof options.responseFormat === "object" ? options.responseFormat : undefined,
  };
  const allowFallback = toBool(options.allowFallback, true);
  const safety = normalizeSafety(options.safety);
  const loggingEnabled = toBool(options.loggingEnabled, process.env.AI_LOGGING_ENABLED === "true");
  const executionOptions = {
    toolExecutor: typeof options.toolExecutor === "function" ? options.toolExecutor : undefined,
    maxToolRounds: options.maxToolRounds,
  };

  if (isSafetyBlocked(safety)) {
    return buildErrorResult({ provider: "local", model: "local-fallback", task, fallbackUsed: true, code: "SAFETY_BLOCKED", message: "Live-Aktion durch Sicherheitsmodus, Sandbox oder Autonomie-Sperre blockiert.", type: "safety" });
  }

  const result = await executeProviderWithTools(provider, request, executionOptions);
  if (result.ok) {
    if (loggingEnabled) console.info("[ai-router]", { provider: result.provider, model: result.model, task, fallbackUsed: result.fallbackUsed, toolCalls: result.toolTrace?.length || 0 });
    return result;
  }

  const fallbackAllowed = allowFallback && process.env.AI_ALLOW_PROVIDER_FALLBACK !== "false" && provider !== "local";
  if (!fallbackAllowed) return { ...result, fallbackUsed: false };

  if (provider === "openrouter" && request.model !== "openrouter/free") {
    const freeRouterResult = await executeProviderWithTools("openrouter", { ...request, model: "openrouter/free" }, executionOptions);
    if (freeRouterResult.ok) {
      freeRouterResult.fallbackUsed = true;
      if (loggingEnabled) console.info("[ai-router]", { provider: freeRouterResult.provider, model: freeRouterResult.model, task, fallbackUsed: true, toolCalls: freeRouterResult.toolTrace?.length || 0 });
      return freeRouterResult;
    }
  }

  const fallbackProvider = resolveFallbackProvider(provider);
  const fallbackRequest = fallbackProvider === "openrouter" ? { ...request, model: "openrouter/free" } : request;
  const fallbackResult = await executeProviderWithTools(fallbackProvider, fallbackRequest, executionOptions);
  if (fallbackResult.ok) {
    fallbackResult.fallbackUsed = true;
    if (loggingEnabled) console.info("[ai-router]", { provider: fallbackResult.provider, model: fallbackResult.model, task, fallbackUsed: true, toolCalls: fallbackResult.toolTrace?.length || 0 });
    return fallbackResult;
  }

  return fallbackResult.provider === "local" ? fallbackResult : { ...fallbackResult, fallbackUsed: true };
}

export {
  callDeepSeek,
  callOpenAI,
  callOpenRouter,
  localFallback,
  normalizeModelName,
  parseRetryAfterSeconds,
  routeAIRequest,
};
