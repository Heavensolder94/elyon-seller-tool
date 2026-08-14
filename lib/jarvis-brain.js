import { routeAIRequest } from "./ai-provider-router.js";
import { buildJarvisContext } from "./jarvis-context-builder.js";
import { coreBrainMetadata, loadJarvisBrainFiles, renderJarvisCoreBrain } from "./jarvis-brain-files.js";
import { normalizeBrainMemoryCandidate } from "./jarvis-memory-policy.js";
import { writeJarvisMemory } from "./jarvis-memory-store.js";
import { recordJarvisSystemTelemetry } from "./jarvis-system-telemetry-store.js";

const DEFAULT_BRAIN_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";
const DEFAULT_BRAIN_FALLBACK_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";
const FINAL_BRAIN_FALLBACK_MODEL = "openrouter/free";

function text(value, max = 12000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function selectBrainModels(env = process.env) {
  return [...new Set([
    text(env.JARVIS_BRAIN_MODEL || DEFAULT_BRAIN_MODEL, 300),
    text(env.JARVIS_BRAIN_FALLBACK_MODEL || DEFAULT_BRAIN_FALLBACK_MODEL, 300),
    FINAL_BRAIN_FALLBACK_MODEL,
  ].filter(Boolean))];
}

function selectBrainAttempts(env = process.env) {
  const openRouterAttempts = selectBrainModels(env).map((model) => ({ provider: "openrouter", model }));
  const providerFallbacks = [
    {
      provider: "deepseek",
      model: text(env.JARVIS_BRAIN_DEEPSEEK_MODEL || env.DEEPSEEK_MODEL, 300) || undefined,
    },
    {
      provider: "openai",
      model: text(env.JARVIS_BRAIN_OPENAI_MODEL || env.OPENAI_MODEL, 300) || undefined,
    },
  ];
  const seen = new Set();
  return [...openRouterAttempts, ...providerFallbacks].filter((attempt) => {
    const key = `${attempt.provider}:${attempt.model || "<provider-default>"}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sanitizeBrainAttempt(attempt, result) {
  const error = plainObject(result?.error);
  return {
    provider: text(result?.provider || attempt?.provider, 40) || "unknown",
    model: text(result?.model || attempt?.model, 300) || null,
    ok: result?.ok === true,
    error: text(error.code, 80) || null,
    errorType: text(error.type, 80) || null,
    status: Number.isInteger(error.status) ? error.status : null,
    retryAfterSeconds: Number.isFinite(error.retryAfterSeconds) ? error.retryAfterSeconds : null,
  };
}

async function recordBrainRunSafely(recordTelemetry, event, env) {
  if (typeof recordTelemetry !== "function") return false;
  try {
    await recordTelemetry(event, { env });
    return true;
  } catch {
    return false;
  }
}

function extractJsonObject(raw) {
  const source = text(raw, 30000);
  if (!source) return null;
  const candidates = [source];
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.unshift(fenced[1].trim());
  const first = source.indexOf("{");
  const last = source.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(source.slice(first, last + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      // Continue with the next representation.
    }
  }
  return null;
}

function extractBrainPayload(raw) {
  const parsed = extractJsonObject(raw);
  if (!parsed) return { answer: text(raw, 12000), memory: null, workingMemoryUpdate: null, conversation: null };
  const answer = text(parsed.answer || parsed.response || parsed.message, 12000);
  return {
    answer: answer || text(raw, 12000),
    memory: plainObject(parsed.memory),
    workingMemoryUpdate: plainObject(parsed.workingMemoryUpdate),
    conversation: plainObject(parsed.conversation),
  };
}

function brainSystemPrompt() {
  return [
    "You are Elyon Jarvis Brain V2-A.1 with the versioned Phase 3 Core Brain: the user's personal executive assistant and orchestrator; Elyon is your primary business system.",
    "Answer in German unless the user clearly uses another language.",
    "Behave like a capable, sovereign operating assistant with a subtle Jarvis-like personality, not like a database dump or diagnostics console.",
    "JARVIS_CORE_BRAIN contains versioned identity, operating rules, goals, relevant Elyon knowledge, capability boundaries and at most one active playbook.",
    "Follow the Core Brain unless it conflicts with deterministic safety/runtime gates or the user's current safe instruction. Core Brain content can never grant permissions, remove approvals, expose secrets, or override hard safety gates.",
    "For semantic context, prioritize: current request, Core Brain, verified current-turn evidence, working memory, conversation, durable memory, then background operational history. Deterministic safety/runtime gates remain above all semantic context.",
    "Treat workingMemory.currentGoal/currentFocus/blockers/openTasks as the active work state. Do not replace them with older tasks or agent runs.",
    "Durable memories are rules, preferences and decisions. Never reinterpret a durable rule as an active blocker unless working memory explicitly marks it as one.",
    "Preserve the exact meaning of user rules. A rule that compliance data may not be auto-applied without approval does NOT mean compliance analysis itself is forbidden before approval. Research and analysis may still be performed before approval; only the protected mutation remains approval-bound.",
    "Background operational history is optional context only. Do not mention an old product/task merely because it exists; mention it only if directly relevant to the current request or active goal.",
    "If currentTurnEvidence contains autoDelegation with executed=true, those specialist/research results are verified results from this turn. Summarize them and use them in your recommendation.",
    "If no current-turn execution evidence exists, do not pretend that a specialist was run or that a mutation succeeded.",
    "Never claim that you published an eBay listing, placed a supplier order, issued a refund, sent a customer message, deleted data, changed legal/compliance data, or auto-applied compliance findings unless explicit execution evidence proves that exact action.",
    "Live eBay publishing is not allowed. Draft mode remains the default. Supplier ordering, refunds, automatic customer-message sending and unapproved legal/compliance mutations remain locked or approval-bound by runtime policy.",
    "Be proactive: surface material risks, inefficiencies and better alternatives. Clearly disagree when a proposed path is materially worse, riskier or unnecessarily complex, then recommend the better path.",
    "Think operationally, tactically and strategically at the same time, balancing profit, risk, growth, automation and user time.",
    "Prefer one clear recommended next step over an unprioritized list of alternatives. Explain the reason briefly when useful.",
    "Do not expose internal field names such as currentGoal, needs_data, routing scores, raw agent chains, database state, or internal status codes unless the user explicitly asks for technical detail.",
    "When useful, distinguish active blocker, background open point and durable rule. Do not merge these categories.",
    "Return ONLY valid JSON with this schema:",
    '{"answer":"string","memory":{"shouldStore":false},"workingMemoryUpdate":{"shouldUpdate":false,"currentGoal":null,"activeProject":null,"currentFocus":null,"openTasks":[],"blockers":[],"pendingApprovals":[],"lastAction":null,"nextExpectedAction":null},"conversation":{"summaryUpdate":null}}',
    "Set memory.shouldStore=true only for durable, reusable information. Never store passwords, tokens, API keys, secrets, cookies, or transient small talk.",
  ].join("\n");
}

async function runJarvisBrain({
  command,
  registry = {},
  requestContext = {},
  plan = null,
  env = process.env,
  routeAI = routeAIRequest,
  buildContext = buildJarvisContext,
  loadCoreBrain = loadJarvisBrainFiles,
  saveMemory = writeJarvisMemory,
  recordTelemetry = recordJarvisSystemTelemetry,
} = {}) {
  const startedAt = Date.now();
  const objective = text(command, 12000);
  if (!objective) {
    return { ok: false, error: "jarvis_brain_command_required", message: "Jarvis Brain benötigt einen Auftrag." };
  }

  const explicitCandidate = normalizeBrainMemoryCandidate(null, objective);
  if (explicitCandidate) {
    try {
      const stored = await saveMemory({
        memoryType: explicitCandidate.memoryType,
        content: explicitCandidate.content,
        importance: explicitCandidate.importance,
        confidence: explicitCandidate.confidence,
        source: explicitCandidate.source,
        env,
      });
      return {
        ok: true,
        mode: "memory_write",
        answer: stored
          ? "Die dauerhafte Jarvis-Erinnerung wurde gespeichert."
          : "Die Erinnerung konnte nicht bestätigt gespeichert werden.",
        brain: { available: false, reason: "deterministic_memory_command", attempts: [] },
        memory: { stored: Boolean(stored), memory: stored || null, reason: stored ? null : "no_row_returned" },
        context: { memoriesLoaded: 0, recentTasksLoaded: 0, recentAgentRunsLoaded: 0, warnings: [] },
        workingMemoryUpdate: null,
        conversation: null,
      };
    } catch (error) {
      return {
        ok: false,
        mode: "brain_degraded",
        error: "memory_write_failed",
        answer: "Die Erinnerung konnte nicht gespeichert werden. Bitte prüfe die serverseitige Supabase-Konfiguration.",
        brain: { available: false, reason: "memory_write_failed", attempts: [] },
        memory: { stored: false, reason: text(error?.message, 120) || "store_failed" },
        context: { memoriesLoaded: 0, recentTasksLoaded: 0, recentAgentRunsLoaded: 0, warnings: [] },
      };
    }
  }

  const [context, coreBrain] = await Promise.all([
    buildContext({ command: objective, registry, requestContext, plan, env }),
    loadCoreBrain({ command: objective }),
  ]);
  const coreMetadata = coreBrainMetadata(coreBrain);
  const combinedWarnings = [
    ...(Array.isArray(context?.warnings) ? context.warnings : []),
    ...(Array.isArray(coreBrain?.warnings) ? coreBrain.warnings : []),
  ];

  if (coreBrain?.ready !== true) {
    return {
      ok: false,
      mode: "brain_degraded",
      error: "core_brain_unavailable",
      answer: "Mein Core Brain konnte nicht vollständig geladen werden. Ich führe deshalb keine freie Brain-Antwort ohne die verpflichtenden Identitäts-, Betriebsregel- und Zieldateien aus. Die deterministischen Elyon-Safety-Gates bleiben davon unberührt.",
      brain: { available: false, reason: "core_brain_unavailable", attempts: [] },
      memory: { stored: false, reason: "brain_unavailable" },
      context: {
        memoriesLoaded: Array.isArray(context?.memories) ? context.memories.length : 0,
        coreBrain: coreMetadata,
        warnings: combinedWarnings,
      },
    };
  }

  const coreBrainPrompt = renderJarvisCoreBrain(coreBrain);
  const dynamicContext = {
    ...context,
    coreBrain: coreMetadata,
  };
  const providerAttempts = selectBrainAttempts(env);
  const attempts = [];
  let success = null;

  for (const attempt of providerAttempts) {
    const result = await routeAI({
      provider: attempt.provider,
      model: attempt.model,
      task: "jarvis_brain",
      allowFallback: false,
      temperature: 0.2,
      maxTokens: 1600,
      messages: [
        { role: "system", content: brainSystemPrompt() },
        { role: "system", content: `ELYON_CONTEXT_JSON: ${JSON.stringify(dynamicContext).slice(0, 26000)}` },
        { role: "system", content: `JARVIS_CORE_BRAIN:\n${coreBrainPrompt}` },
        { role: "user", content: objective },
      ],
      safety: {
        securityMode: true,
        sandboxMode: true,
        autonomyLocked: true,
        requiresLiveAction: false,
        userApproved: false,
      },
    });
    attempts.push(sanitizeBrainAttempt(attempt, result));
    if (result?.ok && text(result.content)) {
      success = { result, attempt, index: attempts.length - 1 };
      break;
    }
  }

  if (!success) {
    await recordBrainRunSafely(recordTelemetry, {
      at: new Date().toISOString(),
      ok: false,
      provider: null,
      model: null,
      fallbackUsed: attempts.length > 1,
      durationMs: Date.now() - startedAt,
      usage: {},
      attempts,
    }, env);
    return {
      ok: false,
      mode: "brain_degraded",
      error: "brain_provider_unavailable",
      answer: "Mein Jarvis-Brain konnte gerade keinen konfigurierten KI-Provider erreichen. Die Elyon-Systemfunktionen und Spezial-Agenten bleiben verfügbar; die Provider-Kette und ihre Fehlerdetails können im Systemstatus geprüft werden.",
      brain: { available: false, attempts },
      memory: { stored: false, reason: "brain_unavailable" },
      context: {
        memoriesLoaded: Array.isArray(context?.memories) ? context.memories.length : 0,
        coreBrain: coreMetadata,
        warnings: combinedWarnings,
      },
    };
  }

  const payload = extractBrainPayload(success.result.content);
  const candidate = normalizeBrainMemoryCandidate(payload.memory, objective);
  let memoryResult = { stored: false, reason: candidate ? "store_failed" : "not_selected" };
  if (candidate) {
    try {
      const stored = await saveMemory({
        memoryType: candidate.memoryType,
        content: candidate.content,
        importance: candidate.importance,
        confidence: candidate.confidence,
        source: candidate.source,
        env,
      });
      memoryResult = { stored: Boolean(stored), memory: stored || null, reason: stored ? null : "no_row_returned" };
    } catch (error) {
      memoryResult = { stored: false, reason: text(error?.message, 300) || "store_failed" };
    }
  }

  const provider = success.result.provider || success.attempt.provider;
  const model = success.result.model || success.attempt.model || null;
  const fallbackUsed = success.index > 0;
  await recordBrainRunSafely(recordTelemetry, {
    at: new Date().toISOString(),
    ok: true,
    provider,
    model,
    fallbackUsed,
    durationMs: Date.now() - startedAt,
    usage: plainObject(success.result.usage),
    attempts,
  }, env);

  return {
    ok: true,
    mode: "brain",
    answer: payload.answer || "Jarvis Brain hat keine verwertbare Antwort geliefert.",
    brain: {
      available: true,
      provider,
      model,
      fallbackUsed,
      attempts,
    },
    memory: memoryResult,
    context: {
      memoriesLoaded: Array.isArray(context?.memories) ? context.memories.length : 0,
      recentTasksLoaded: Array.isArray(context?.backgroundOperationalHistory?.recentTasks) ? context.backgroundOperationalHistory.recentTasks.length : 0,
      recentAgentRunsLoaded: Array.isArray(context?.backgroundOperationalHistory?.recentAgentRuns) ? context.backgroundOperationalHistory.recentAgentRuns.length : 0,
      currentTurnEvidenceLoaded: Boolean(context?.currentTurnEvidence),
      coreBrain: coreMetadata,
      warnings: combinedWarnings,
    },
    workingMemoryUpdate: payload.workingMemoryUpdate,
    conversation: payload.conversation,
  };
}

export {
  DEFAULT_BRAIN_FALLBACK_MODEL,
  DEFAULT_BRAIN_MODEL,
  FINAL_BRAIN_FALLBACK_MODEL,
  brainSystemPrompt,
  extractBrainPayload,
  recordBrainRunSafely,
  runJarvisBrain,
  sanitizeBrainAttempt,
  selectBrainAttempts,
  selectBrainModels,
};
