import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_BRAIN_FALLBACK_MODEL,
  DEFAULT_BRAIN_MODEL,
  extractBrainPayload,
  runJarvisBrain,
  selectBrainAttempts,
  selectBrainModels,
} from "../lib/jarvis-brain.js";
import { parseRetryAfterSeconds } from "../lib/ai-provider-router.js";
import { isMemoryRecallCommand, shouldRouteToBrain } from "../api/jarvis.js";
import { rankMemories } from "../lib/jarvis-context-builder.js";
import { containsSensitiveText, explicitMemoryFromCommand, normalizeBrainMemoryCandidate } from "../lib/jarvis-memory-policy.js";
import { supabaseHeaders } from "../lib/jarvis-memory-store.js";

test("Brain models default to Ultra, Super and OpenRouter free router", () => {
  assert.deepEqual(selectBrainModels({}), [DEFAULT_BRAIN_MODEL, DEFAULT_BRAIN_FALLBACK_MODEL, "openrouter/free"]);
});

test("Brain provider chain adds DeepSeek and OpenAI after OpenRouter", () => {
  assert.deepEqual(selectBrainAttempts({}), [
    { provider: "openrouter", model: DEFAULT_BRAIN_MODEL },
    { provider: "openrouter", model: DEFAULT_BRAIN_FALLBACK_MODEL },
    { provider: "openrouter", model: "openrouter/free" },
    { provider: "deepseek", model: undefined },
    { provider: "openai", model: undefined },
  ]);
});

test("Brain provider chain accepts dedicated cross-provider model overrides", () => {
  const attempts = selectBrainAttempts({
    JARVIS_BRAIN_DEEPSEEK_MODEL: "deepseek-chat",
    JARVIS_BRAIN_OPENAI_MODEL: "gpt-4o-mini",
  });
  assert.equal(attempts[3].model, "deepseek-chat");
  assert.equal(attempts[4].model, "gpt-4o-mini");
});

test("Retry-After metadata is normalized without response bodies", () => {
  assert.equal(parseRetryAfterSeconds("12"), 12);
  assert.equal(parseRetryAfterSeconds("Thu, 01 Jan 1970 00:00:20 GMT", 10000), 10);
  assert.equal(parseRetryAfterSeconds("invalid"), null);
});

test("Brain payload parses fenced JSON", () => {
  const payload = extractBrainPayload('```json\n{"answer":"Hallo","memory":{"shouldStore":false}}\n```');
  assert.equal(payload.answer, "Hallo");
  assert.equal(payload.memory.shouldStore, false);
});

test("explicit memory command creates durable user instruction", () => {
  const memory = explicitMemoryFromCommand("Merke dir: Compliance immer erst nach meiner Freigabe.");
  assert.equal(memory.memoryType, "user_instruction");
  assert.equal(memory.content.instruction, "Compliance immer erst nach meiner Freigabe.");
  assert.equal(memory.importance, 0.95);
});

test("memory policy rejects secret-like content", () => {
  assert.equal(explicitMemoryFromCommand("Merke dir: API key abc123"), null);
  assert.equal(containsSensitiveText("ghp_1234567890abcdefghijklmnop"), true);
  assert.equal(normalizeBrainMemoryCandidate({
    shouldStore: true,
    memoryType: "business_rule",
    summary: "Token geheim speichern",
    importance: 0.99,
    confidence: 0.99,
  }), null);
});

test("memory ranking prefers command-relevant memory", () => {
  const memories = [
    { memoryType: "business_rule", content: { summary: "Compliance braucht Freigabe" }, importance: 0.8, confidence: 1 },
    { memoryType: "preference", content: { summary: "Dashboard kompakt" }, importance: 1, confidence: 1 },
  ];
  const ranked = rankMemories(memories, "Was ist unsere Compliance Freigabe?", 2);
  assert.equal(ranked[0].memoryType, "business_rule");
});

test("Brain recall sends relevant durable memory in bounded context", async () => {
  let brainMessages = [];
  const result = await runJarvisBrain({
    command: "Wie lautet unsere Compliance-Regel?",
    env: {},
    buildContext: async () => ({
      memories: [{
        memoryType: "business_rule",
        content: { instruction: "Compliance erst nach meiner Freigabe." },
        importance: 0.95,
        confidence: 1,
      }],
      recentTasks: [],
      recentAgentRuns: [],
      warnings: [],
    }),
    routeAI: async ({ messages }) => {
      brainMessages = messages;
      return {
        ok: true,
        provider: "openrouter",
        model: DEFAULT_BRAIN_MODEL,
        content: JSON.stringify({ answer: "Compliance braucht deine Freigabe.", memory: { shouldStore: false } }),
      };
    },
  });

  assert.equal(result.mode, "brain");
  assert.equal(result.context.memoriesLoaded, 1);
  assert.match(brainMessages[1].content, /Compliance erst nach meiner Freigabe/);
});

test("Supabase sb_secret uses apikey without Bearer header", () => {
  assert.deepEqual(supabaseHeaders("sb_secret_test"), { apikey: "sb_secret_test" });
  assert.equal(supabaseHeaders("legacy-jwt").Authorization, "Bearer legacy-jwt");
});

test("general Brain falls back to second model and stores a durable candidate", async () => {
  const calls = [];
  const saved = [];
  const result = await runJarvisBrain({
    command: "Welche Compliance-Regel gilt für den nächsten Produktcheck?",
    env: {},
    buildContext: async () => ({ memories: [], recentTasks: [], recentAgentRuns: [], warnings: [] }),
    routeAI: async ({ provider, model }) => {
      calls.push({ provider, model });
      if (calls.length === 1) return { ok: false, provider, model, error: { code: "RATE_LIMIT", type: "rate_limit", status: 429 } };
      return {
        ok: true,
        provider,
        model,
        content: JSON.stringify({
          answer: "Die Prüfung braucht weiterhin eine Freigabe.",
          memory: {
            shouldStore: true,
            memoryType: "business_rule",
            summary: "Compliance erst nach Nutzerfreigabe prüfen.",
            importance: 0.95,
            confidence: 1,
          },
        }),
      };
    },
    saveMemory: async (memory) => {
      saved.push(memory);
      return { id: "mem-1", memoryType: memory.memoryType, content: memory.content };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, "brain");
  assert.equal(result.brain.fallbackUsed, true);
  assert.equal(calls.length, 2);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].memoryType, "business_rule");
  assert.equal(result.memory.stored, true);
  assert.equal(result.brain.attempts[0].status, 429);
});

test("Brain crosses from OpenRouter to DeepSeek after all OpenRouter attempts fail", async () => {
  const calls = [];
  const result = await runJarvisBrain({
    command: "Hallo Jarvis",
    env: { JARVIS_BRAIN_DEEPSEEK_MODEL: "deepseek-chat" },
    buildContext: async () => ({ memories: [], backgroundOperationalHistory: {}, warnings: [] }),
    routeAI: async ({ provider, model }) => {
      calls.push({ provider, model });
      if (provider === "openrouter") {
        return {
          ok: false,
          provider,
          model,
          error: {
            code: calls.length === 1 ? "RATE_LIMIT" : "SERVER_ERROR",
            type: calls.length === 1 ? "rate_limit" : "server",
            status: calls.length === 1 ? 429 : 503,
            retryAfterSeconds: calls.length === 1 ? 30 : null,
            message: "sensitive provider body must not enter attempts",
          },
        };
      }
      return {
        ok: true,
        provider: "deepseek",
        model: "deepseek-chat",
        content: JSON.stringify({ answer: "Fallback erfolgreich.", memory: { shouldStore: false } }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.brain.provider, "deepseek");
  assert.equal(result.brain.model, "deepseek-chat");
  assert.equal(result.brain.fallbackUsed, true);
  assert.equal(calls.length, 4);
  assert.deepEqual(calls.map((call) => call.provider), ["openrouter", "openrouter", "openrouter", "deepseek"]);
  assert.equal(result.brain.attempts[0].status, 429);
  assert.equal(result.brain.attempts[0].retryAfterSeconds, 30);
  assert.equal("message" in result.brain.attempts[0], false);
});

test("Brain reaches OpenAI only after OpenRouter and DeepSeek fail", async () => {
  const calls = [];
  const result = await runJarvisBrain({
    command: "Hallo Jarvis",
    env: { JARVIS_BRAIN_DEEPSEEK_MODEL: "deepseek-chat", JARVIS_BRAIN_OPENAI_MODEL: "gpt-4o-mini" },
    buildContext: async () => ({ memories: [], backgroundOperationalHistory: {}, warnings: [] }),
    routeAI: async ({ provider, model }) => {
      calls.push({ provider, model });
      if (provider !== "openai") return { ok: false, provider, model, error: { code: "SERVER_ERROR", type: "server", status: 503 } };
      return {
        ok: true,
        provider: "openai",
        model: "gpt-4o-mini",
        content: JSON.stringify({ answer: "OpenAI Fallback erfolgreich.", memory: { shouldStore: false } }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.brain.provider, "openai");
  assert.equal(result.brain.fallbackUsed, true);
  assert.equal(calls.length, 5);
  assert.deepEqual(calls.map((call) => call.provider), ["openrouter", "openrouter", "openrouter", "deepseek", "openai"]);
});

test("explicit memory writes deterministically without requiring an LLM", async () => {
  let calls = 0;
  const saved = [];
  const result = await runJarvisBrain({
    command: "Merke dir: Compliance immer erst nach meiner Freigabe.",
    env: {},
    routeAI: async () => {
      calls += 1;
      return { ok: true, content: "should not be called" };
    },
    saveMemory: async (memory) => {
      saved.push(memory);
      return { id: "mem-1", memoryType: memory.memoryType, content: memory.content };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, "memory_write");
  assert.equal(calls, 0);
  assert.equal(saved[0].content.instruction, "Compliance immer erst nach meiner Freigabe.");
});

test("Brain degrades transparently only after all providers fail", async () => {
  const calls = [];
  const result = await runJarvisBrain({
    command: "Hallo Jarvis",
    env: {},
    buildContext: async () => ({ memories: [], recentTasks: [], recentAgentRuns: [], warnings: [] }),
    routeAI: async ({ provider, model }) => {
      calls.push({ provider, model });
      return { ok: false, provider, model, error: { code: "NO_MODEL", type: "server", status: 503 } };
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.mode, "brain_degraded");
  assert.equal(result.brain.available, false);
  assert.equal(calls.length, 5);
  assert.deepEqual(calls.map((call) => call.provider), ["openrouter", "openrouter", "openrouter", "deepseek", "openai"]);
  assert.match(result.answer, /Provider/i);
});

test("API routing keeps specialist commands out of the general Brain", () => {
  const specialistPlan = { executable: true, intent: { id: "product_data" } };
  const genericPlan = { executable: false, intent: { id: "generic" } };
  assert.equal(shouldRouteToBrain({}, specialistPlan, "Prüfe Produkt ELY-000123"), false);
  assert.equal(shouldRouteToBrain({}, genericPlan, "Hallo Jarvis"), true);
  assert.equal(isMemoryRecallCommand("Wie lautet unsere Compliance-Regel?"), true);
  assert.equal(shouldRouteToBrain({}, { executable: true, intent: { id: "compliance" } }, "Wie lautet unsere Compliance-Regel?"), true);
  assert.equal(shouldRouteToBrain({}, { executable: true, intent: { id: "compliance" } }, "Merke dir: Compliance immer erst nach meiner Freigabe."), true);
});
