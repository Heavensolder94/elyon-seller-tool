import { requireSellerAccess } from "../lib/seller-access.js";
import { routeAIRequest } from "../lib/ai-provider-router.js";
import {
  buildAgentMessages,
  buildContextPacket,
  buildLocalFallbackResult,
  calculateProfitAnalysis,
  canonicalAgentId,
  createWorkforceTask,
  getAgentDefinition,
  isActionAllowed,
  listAgentDefinitions,
  parseStructuredAgentResponse,
  sanitizeAgentResult,
} from "../lib/ai-workforce.js";

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value, max = 2000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveAgentId(action, body) {
  const requested = canonicalAgentId(body.agentId || body.task?.agentId);
  if (requested) return requested;
  if (action === "analyze_listing") return "elyon-listing-pro";
  if (action === "analyze_order") return "elyon-order-coordinator";
  if (action === "analyze_return") return "elyon-support-assistant";
  if (action === "create_daily_briefing") return "elyon-operations-manager";
  if (action === "analyze_product") return "elyon-compliance-guard";
  return "";
}

function taskType(action, agentId) {
  if (action === "analyze_listing") return "listing_analysis";
  if (action === "analyze_order") return "order_analysis";
  if (action === "analyze_return") return "return_analysis";
  if (action === "create_daily_briefing") return "daily_briefing";
  if (agentId === "elyon-profit-analyst") return "profit_analysis";
  if (agentId === "elyon-compliance-guard") return "compliance_analysis";
  if (agentId === "elyon-listing-pro") return "listing_analysis";
  return "agent_analysis";
}

function sourceTypeFor(action, body) {
  if (text(body.sourceType, 100)) return text(body.sourceType, 100);
  if (action === "analyze_order") return "order";
  if (action === "analyze_return") return "return";
  if (action === "analyze_listing") return "listing";
  if (action === "create_daily_briefing") return "operations";
  return "product";
}

function sourceIdFromContext(context) {
  return text(
    context.productId || context.orderId || context.returnId || context.listingId || "",
    300
  );
}

function agentConfiguration(body, definition) {
  const source = plainObject(body.agent || body.configuration || body.settings);
  return {
    provider: text(source.provider || body.provider || definition.defaultProvider, 100).toLowerCase(),
    model: text(source.model || body.model, 200),
    allowFallback: source.allowFallback !== false && body.allowFallback !== false,
    temperature: Math.max(0, Math.min(2, finiteNumber(source.temperature ?? body.temperature) ?? 0.2)),
    maxTokens: Math.max(200, Math.min(12000, Math.trunc(finiteNumber(source.maxTokens ?? body.maxTokens) ?? 4000))),
  };
}

async function repairStructuredResponse({ content, agentId, context, config }) {
  if (!content || config.provider === "local") return null;
  const repair = await routeAIRequest({
    task: "repair_ai_workforce_json",
    provider: config.provider,
    model: config.model || undefined,
    allowFallback: false,
    temperature: 0,
    maxTokens: config.maxTokens,
    messages: [
      {
        role: "system",
        content:
          "Repariere die folgende Antwort zu genau einem validen JSON-Objekt. Ändere keine Fakten, ergänze keine neuen Angaben und gib ausschließlich JSON zurück.",
      },
      { role: "user", content: text(content, 80000) },
    ],
    safety: {
      securityMode: true,
      sandboxMode: true,
      autonomyLocked: true,
      requiresLiveAction: false,
      userApproved: false,
    },
  });
  if (!repair.ok || !repair.content) return null;
  try {
    return parseStructuredAgentResponse(repair.content, { agentId, context });
  } catch {
    return null;
  }
}

function mergeDeterministicData(agentId, result, context) {
  if (agentId !== "elyon-profit-analyst") return result;
  const calculation = calculateProfitAnalysis(context);
  const merged = sanitizeAgentResult({
    ...result,
    generatedContent: {
      ...plainObject(result.generatedContent),
      calculation,
    },
    assumptions: Array.from(new Set([...(result.assumptions || []), ...calculation.assumptions])),
    blockers: calculation.passesMinimum
      ? result.blockers || []
      : Array.from(new Set([...(result.blockers || []), "Elyon-Mindestregel ist nicht nachweislich erfüllt."])),
    status: calculation.profit === null
      ? "manualReviewRequired"
      : calculation.passesMinimum
        ? result.status
        : "blocked",
  }, { agentId, context });
  return merged;
}

async function runAgent(action, body) {
  const agentId = resolveAgentId(action, body);
  const definition = getAgentDefinition(agentId);
  if (!definition) {
    return {
      statusCode: 400,
      payload: { ok: false, error: "unknown_agent", message: "Unbekannter virtueller Mitarbeiter." },
    };
  }
  if (!isActionAllowed(action, agentId)) {
    return {
      statusCode: 403,
      payload: {
        ok: false,
        error: "action_not_allowed",
        message: "Diese Aktion ist für den gewählten Mitarbeiter nicht freigegeben.",
      },
    };
  }

  const rawInput = action === "retry_task"
    ? plainObject(body.input || body.task?.inputSnapshot || body.context || body)
    : plainObject(body.input || body.context || body);
  const context = buildContextPacket(agentId, rawInput);
  const config = agentConfiguration(body, definition);
  const startedAt = Date.now();
  let task = createWorkforceTask({
    id: body.task?.id,
    agentId,
    type: taskType(action, agentId),
    title: text(body.title, 500) || `${definition.name}: ${taskType(action, agentId).replaceAll("_", " ")}`,
    sourceType: sourceTypeFor(action, body),
    sourceId: text(body.sourceId, 300) || sourceIdFromContext(context),
    priority: body.priority,
    status: "analyzing",
    provider: config.provider,
    model: config.model,
    inputSnapshot: context,
  });

  const messages = buildAgentMessages(agentId, action, context, { locale: "de-DE" });
  const aiResult = await routeAIRequest({
    task: `${agentId}:${action}`,
    provider: config.provider,
    model: config.model || undefined,
    allowFallback: config.allowFallback,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    messages,
    safety: {
      securityMode: true,
      sandboxMode: true,
      autonomyLocked: true,
      requiresLiveAction: false,
      userApproved: false,
    },
  });

  if (!aiResult.ok) {
    task = createWorkforceTask({
      ...task,
      status: "failed",
      errors: [aiResult.error?.message || "KI-Anfrage fehlgeschlagen."],
      warnings: aiResult.fallbackUsed ? ["Konfigurierter Provider-Fallback wurde versucht."] : [],
      provider: aiResult.provider || config.provider,
      model: aiResult.model || config.model,
      durationMs: Date.now() - startedAt,
      fallbackUsed: aiResult.fallbackUsed,
    });
    return {
      statusCode: 502,
      payload: {
        ok: false,
        error: aiResult.error?.code || "ai_request_failed",
        message: aiResult.error?.message || "KI-Anfrage fehlgeschlagen.",
        task,
      },
    };
  }

  let structuredResult;
  let repairUsed = false;
  if (aiResult.provider === "local" || aiResult.model === "local-fallback") {
    structuredResult = buildLocalFallbackResult(agentId, context);
  } else {
    try {
      structuredResult = parseStructuredAgentResponse(aiResult.content, { agentId, context });
    } catch {
      structuredResult = await repairStructuredResponse({
        content: aiResult.content,
        agentId,
        context,
        config: { ...config, provider: aiResult.provider, model: aiResult.model },
      });
      repairUsed = Boolean(structuredResult);
    }
  }

  if (!structuredResult) {
    task = createWorkforceTask({
      ...task,
      status: "failed",
      provider: aiResult.provider,
      model: aiResult.model,
      errors: ["KI-Antwort konnte auch nach einem kontrollierten Reparaturversuch nicht validiert werden."],
      usage: aiResult.usage,
      durationMs: Date.now() - startedAt,
      fallbackUsed: aiResult.fallbackUsed,
    });
    return {
      statusCode: 502,
      payload: {
        ok: false,
        error: "invalid_ai_json",
        message: "Die KI-Antwort war nicht als strukturierter Agentenbericht nutzbar.",
        task,
      },
    };
  }

  structuredResult = mergeDeterministicData(agentId, structuredResult, context);
  const requiresApproval = Boolean(
    Object.keys(plainObject(structuredResult.generatedContent)).length ||
      structuredResult.status !== "passed" ||
      agentId === "elyon-listing-pro" ||
      agentId === "elyon-support-assistant"
  );

  task = createWorkforceTask({
    ...task,
    status: requiresApproval ? "approval_required" : "draft_ready",
    provider: aiResult.provider,
    model: aiResult.model,
    result: structuredResult,
    warnings: [
      ...(structuredResult.warnings || []),
      ...(repairUsed ? ["Die KI-Antwort wurde einmal kontrolliert in valides JSON repariert."] : []),
      ...(aiResult.fallbackUsed ? [`Provider-Fallback verwendet: ${aiResult.provider}.`] : []),
    ],
    usage: aiResult.usage,
    durationMs: Date.now() - startedAt,
    fallbackUsed: aiResult.fallbackUsed,
  });

  return {
    statusCode: 200,
    payload: {
      ok: true,
      action,
      task,
      result: task.result,
      provider: task.provider,
      model: task.model,
      fallbackUsed: task.fallbackUsed,
      repairUsed,
      usage: task.usage,
      estimatedCostEur: null,
      safety: {
        manualReviewRequired: true,
        automaticPublishing: false,
        automaticOrdering: false,
        automaticMessaging: false,
        automaticRefunds: false,
      },
    },
  };
}

export default async function handler(req, res) {
  if (!requireSellerAccess(req, res, { maxBodyBytes: 192 * 1024 })) return;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      route: "/api/ai-agent-run",
      agents: listAgentDefinitions(),
      providers: {
        openai: Boolean(process.env.OPENAI_API_KEY),
        deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
        qwen: Boolean(process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY),
        local: true,
      },
      safety: {
        version: 1,
        externalActionsLocked: true,
        maxAutonomyLevel: 3,
        manualReviewRequired: true,
      },
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed", message: "Nur GET und POST sind erlaubt." });
  }

  try {
    const body = plainObject(req.body);
    const action = text(body.action, 100) || "run_agent";
    const result = await runAgent(action, body);
    return res.status(result.statusCode).json(result.payload);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "ai_agent_run_failed",
      message: text(error?.message, 2000) || "Virtueller Mitarbeiter konnte nicht ausgeführt werden.",
    });
  }
}
