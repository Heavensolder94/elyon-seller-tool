import { routeAIRequest } from "./ai-provider-router.js";
import { buildJarvisContext } from "./jarvis-context-builder.js";
import { normalizeBrainMemoryCandidate } from "./jarvis-memory-policy.js";
import { writeJarvisMemory } from "./jarvis-memory-store.js";

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
    "You are Elyon Jarvis Brain V2-A, the central business assistant and orchestrator for the Elyon Seller Tool.",
    "Answer in German unless the user clearly uses another language.",
    "Use the supplied Elyon context and memories as context, not as unquestionable truth. Resolve conflicts in favor of newer explicit user instructions.",
    "Never claim that you published an eBay listing, placed a supplier order, issued a refund, sent a customer message, deleted data, or changed legal/compliance data unless an explicit tool result in the supplied context proves it.",
    "External actions are locked and live eBay publishing is not allowed. Draft mode remains the default.",
    "When a specialist is needed, explain which specialist should handle it; do not pretend you executed a specialist task from this Brain-only response.",
    "Be concise, practical, and Elyon-specific.",
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
  saveMemory = writeJarvisMemory,
} = {}) {
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

  const context = await buildContext({ command: objective, registry, requestContext, plan, env });
  const models = selectBrainModels(env);
  const attempts = [];
  let success = null;

  for (const model of models) {
    const result = await routeAI({
      provider: "openrouter",
      model,
      task: "jarvis_brain",
      allowFallback: false,
      temperature: 0.2,
      maxTokens: 1400,
      messages: [
        { role: "system", content: brainSystemPrompt() },
        { role: "system", content: `ELYON_CONTEXT_JSON: ${JSON.stringify(context).slice(0, 24000)}` },
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
    attempts.push({
      model,
      ok: result?.ok === true,
      error: result?.error?.code || result?.error?.message || null,
    });
    if (result?.ok && text(result.content)) {
      success = { result, model };
      break;
    }
  }

  if (!success) {
    return {
      ok: false,
      mode: "brain_degraded",
      error: "brain_provider_unavailable",
      answer: "Mein Jarvis-Brain konnte gerade kein KI-Modell erreichen. Die Elyon-Systemfunktionen und Spezial-Agenten bleiben verfügbar; für eine freie Brain-Antwort muss die OpenRouter-Verbindung geprüft werden.",
      brain: { available: false, attempts },
      memory: { stored: false, reason: "brain_unavailable" },
      context: { memoriesLoaded: Array.isArray(context?.memories) ? context.memories.length : 0, warnings: context?.warnings || [] },
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

  return {
    ok: true,
    mode: "brain",
    answer: payload.answer || "Jarvis Brain hat keine verwertbare Antwort geliefert.",
    brain: {
      available: true,
      provider: success.result.provider || "openrouter",
      model: success.result.model || success.model,
      fallbackUsed: success.model !== models[0],
      attempts,
    },
    memory: memoryResult,
    context: {
      memoriesLoaded: Array.isArray(context?.memories) ? context.memories.length : 0,
      recentTasksLoaded: Array.isArray(context?.recentTasks) ? context.recentTasks.length : 0,
      recentAgentRunsLoaded: Array.isArray(context?.recentAgentRuns) ? context.recentAgentRuns.length : 0,
      warnings: Array.isArray(context?.warnings) ? context.warnings : [],
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
  runJarvisBrain,
  selectBrainModels,
};
