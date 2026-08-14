import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { runJarvisBrain } from "../lib/jarvis-brain.js";
import {
  sanitizeTelemetryEvent,
  summarizeJarvisSystemTelemetry,
} from "../lib/jarvis-system-telemetry-store.js";
import { buildJarvisSystemStatus } from "../api/jarvis-system-status.js";

const root = new URL("../", import.meta.url);

test("system telemetry strips prompts, answers and provider error messages", () => {
  const event = sanitizeTelemetryEvent({
    at: "2026-08-15T00:00:00.000Z",
    ok: false,
    prompt: "do not store me",
    answer: "do not store me either",
    secret: "sk_test_secret",
    attempts: [{
      provider: "openrouter",
      model: "openrouter/free",
      ok: false,
      error: "RATE_LIMIT",
      errorType: "rate_limit",
      status: 429,
      retryAfterSeconds: 30,
      message: "raw provider body must not survive",
    }],
  });

  assert.equal("prompt" in event, false);
  assert.equal("answer" in event, false);
  assert.equal("secret" in event, false);
  assert.equal("message" in event.attempts[0], false);
  assert.deepEqual(event.attempts[0], {
    provider: "openrouter",
    model: "openrouter/free",
    ok: false,
    error: "RATE_LIMIT",
    errorType: "rate_limit",
    status: 429,
    retryAfterSeconds: 30,
  });
});

test("24h telemetry summary counts fallback, errors, rate limits, tokens and observed cost", () => {
  const nowMs = Date.parse("2026-08-15T00:00:00.000Z");
  const summary = summarizeJarvisSystemTelemetry([
    sanitizeTelemetryEvent({
      at: "2026-08-14T23:59:00.000Z",
      ok: true,
      provider: "deepseek",
      model: "deepseek-v4-flash",
      fallbackUsed: true,
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, cost: 0.01 },
      attempts: [
        { provider: "openrouter", ok: false, error: "RATE_LIMIT", status: 429 },
        { provider: "deepseek", ok: true },
      ],
    }),
    sanitizeTelemetryEvent({
      at: "2026-08-14T23:58:00.000Z",
      ok: false,
      usage: { inputTokens: 2, outputTokens: 0, totalTokens: 2 },
      attempts: [{ provider: "openrouter", ok: false, error: "SERVER_ERROR", status: 503 }],
    }),
  ], { nowMs });

  assert.equal(summary.requests, 2);
  assert.equal(summary.fallbacks, 1);
  assert.equal(summary.errors, 1);
  assert.equal(summary.rateLimits, 1);
  assert.equal(summary.totalTokens, 17);
  assert.equal(summary.cost, 0.01);
});

test("Brain records sanitized runtime telemetry without making telemetry availability critical", async () => {
  const recorded = [];
  const baseOptions = {
    command: "Hallo Jarvis",
    env: {},
    buildContext: async () => ({ memories: [], backgroundOperationalHistory: {}, warnings: [] }),
    routeAI: async ({ provider, model }) => ({
      ok: true,
      provider,
      model,
      content: JSON.stringify({ answer: "Hallo.", memory: { shouldStore: false } }),
      usage: { inputTokens: 10, outputTokens: 3, totalTokens: 13 },
    }),
  };

  const result = await runJarvisBrain({
    ...baseOptions,
    recordTelemetry: async (event) => { recorded.push(event); },
  });
  assert.equal(result.ok, true);
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].ok, true);
  assert.equal(recorded[0].provider, "openrouter");
  assert.equal(recorded[0].usage.totalTokens, 13);
  assert.equal("command" in recorded[0], false);

  const resilient = await runJarvisBrain({
    ...baseOptions,
    recordTelemetry: async () => { throw new Error("telemetry offline"); },
  });
  assert.equal(resilient.ok, true);
  assert.equal(resilient.answer, "Hallo.");
});

test("read-only system status reports providers, memory and E5 without expanding safety permissions", async () => {
  const nowMs = Date.parse("2026-08-15T00:00:00.000Z");
  const telemetry = [sanitizeTelemetryEvent({
    at: "2026-08-14T23:59:00.000Z",
    ok: true,
    provider: "openrouter",
    model: "nvidia/nemotron-3-ultra-550b-a55b:free",
    attempts: [{ provider: "openrouter", model: "nvidia/nemotron-3-ultra-550b-a55b:free", ok: true }],
  })];
  const supabaseRequest = async (path) => {
    if (path.includes("jarvis_memory?")) return [{ id: "m1", updated_at: "2026-08-14T23:50:00.000Z" }];
    if (path.includes("jarvis_working_memory?")) return [{ id: "w1", updated_at: "2026-08-14T23:55:00.000Z" }];
    if (path.includes("jarvis_tasks?")) return [{ id: "t1", type: "product-check", status: "completed", progress: 100, updated_at: "2026-08-14T23:56:00.000Z" }];
    if (path.includes("jarvis_agent_runs?")) return [{ id: "r1", agent_name: "Product Check", status: "completed", model: null, cost: 0, created_at: "2026-08-14T23:57:00.000Z", finished_at: "2026-08-14T23:57:10.000Z" }];
    return [];
  };
  const pipelineReader = async () => ({
    pipeline: { enabled: true },
    control: { mode: "autopilot", state: "running", killSwitch: false, pausedByGuard: false },
    permissions: {
      internalPipelineAllowed: true,
      ebayDraftAllowed: true,
      livePublishingAllowed: false,
      supplierOrdersAllowed: false,
      customerMessagesAllowed: false,
      refundsAllowed: false,
      legalDataChangesAllowed: false,
    },
    reasons: [],
  });

  const status = await buildJarvisSystemStatus({
    nowMs,
    env: {
      OPENROUTER_API_KEY: "configured",
      DEEPSEEK_API_KEY: "configured",
      OPENAI_API_KEY: "configured",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "configured",
    },
    telemetryReader: async () => telemetry,
    pipelineReader,
    supabaseRequest,
  });

  assert.equal(status.ok, true);
  assert.equal(status.readOnly, true);
  assert.equal(status.status, "healthy");
  assert.equal(status.providers.find((provider) => provider.provider === "openrouter").status, "online");
  assert.equal(status.providers.find((provider) => provider.provider === "deepseek").status, "configured");
  assert.equal(status.memory.online, true);
  assert.equal(status.e5.pipelineEnabled, true);
  assert.equal(status.e5.mode, "autopilot");
  assert.equal(status.safety.livePublishingAllowed, false);
  assert.equal(status.safety.supplierOrdersAllowed, false);
  assert.equal(status.safety.refundsAllowed, false);
});

test("Integration Center V2 is protected, GET-only, event-driven and has no polling", async () => {
  const api = await readFile(new URL("api/jarvis-system-status.js", root), "utf8");
  const ui = await readFile(new URL("seller-jarvis-integration-center.js", root), "utf8");

  assert.match(api, /requireSellerAccess\(req, res\)/);
  assert.match(api, /method_not_allowed/);
  assert.match(api, /readOnly:\s*true/);
  assert.match(api, /livePublishingAllowed:\s*false/);
  assert.match(api, /supplierOrdersAllowed:\s*false/);
  assert.match(ui, /\/api\/jarvis-system-status/);
  assert.match(ui, /cache:\s*"no-store"/);
  assert.match(ui, /data-jic-refresh/);
  assert.doesNotMatch(ui, /setInterval\s*\(/);
  assert.doesNotMatch(ui, /MutationObserver\s*\(/);
  assert.match(ui, /Prompts, Antworten, API-Secrets/);
});
