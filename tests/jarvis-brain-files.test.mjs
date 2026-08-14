import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractSection,
  loadJarvisBrainFiles,
  renderJarvisCoreBrain,
  validateManifest,
} from "../lib/jarvis-brain-files.js";
import { runJarvisBrain, selectBrainAttempts } from "../lib/jarvis-brain.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

function readyCore(playbook = null) {
  const core = [
    { id: "identity", mode: "always", path: "brain/IDENTITY.md", content: "Jarvis ist proaktiv und faktentreu." },
    { id: "operating_rules", mode: "always", path: "brain/OPERATING_RULES.md", content: "Draft vor Live. Keine erfundenen Daten." },
    { id: "goals", mode: "always", path: "brain/GOALS.md", content: "Gewinn, Risiko und Wachstum balancieren." },
  ];
  return {
    version: "1.1",
    ready: true,
    requiredMissing: [],
    loaded: core.map((item) => item.id),
    core,
    playbook,
    budget: { maxChars: 12000, usedChars: 160 },
    warnings: [],
  };
}

test("brain manifest is valid, path-safe and defines exactly the Phase-3 V1 playbooks", () => {
  const manifest = JSON.parse(read("brain/BRAIN_MANIFEST.json"));
  assert.equal(validateManifest(manifest), manifest);
  assert.deepEqual(manifest.requiredCoreIds, ["identity", "operating_rules", "goals"]);
  const playbookFile = manifest.files.find((entry) => entry.id === "playbooks");
  assert.deepEqual(
    playbookFile.playbooks.map((entry) => entry.id).sort(),
    ["listing_draft", "product_check", "product_enrichment"]
  );
  assert.throws(
    () => validateManifest({ version: "evil", maxCoreChars: 12000, requiredCoreIds: ["env"], files: [{ id: "env", path: ".env", mode: "always", required: true, maxChars: 1000 }] }),
    /brain_manifest_path_not_allowed/
  );
});

test("manifest rejects a required core that is not an always-on required entry", () => {
  assert.throws(
    () => validateManifest({
      version: "bad",
      maxCoreChars: 12000,
      requiredCoreIds: ["identity"],
      files: [{ id: "identity", path: "brain/IDENTITY.md", mode: "relevant", required: false, maxChars: 1000 }],
    }),
    /brain_manifest_required_core_invalid/
  );
});

test("generic Jarvis turns load the mandatory core and report ready", async () => {
  const brain = await loadJarvisBrainFiles({ command: "Wer bist du und wie arbeitest du?" });
  assert.equal(brain.ready, true);
  assert.deepEqual(brain.requiredMissing, []);
  assert.deepEqual(brain.loaded, ["identity", "operating_rules", "goals"]);
  assert.equal(brain.playbook, null);
  assert.ok(brain.budget.usedChars <= brain.budget.maxChars);
});

test("Elyon questions add stable Elyon context without claiming live state", async () => {
  const brain = await loadJarvisBrainFiles({ command: "Wie funktioniert Company OS im Elyon System?" });
  assert.ok(brain.loaded.includes("elyon_context"));
  const elyon = brain.core.find((entry) => entry.id === "elyon_context");
  assert.match(elyon.content, /Company OS/);
  assert.match(elyon.content, /Statisches Wissen vs\. Live-Zustand/);
});

test("capability questions include the no-static-live-status rule and hard eBay boundary", async () => {
  const brain = await loadJarvisBrainFiles({ command: "Kannst du aktuell automatisch ein Listing auf eBay live veröffentlichen?" });
  assert.ok(brain.loaded.includes("capabilities"));
  const capabilities = brain.core.find((entry) => entry.id === "capabilities");
  assert.match(capabilities.content, /Kein statischer Live-Status/);
  assert.match(capabilities.content, /eBay Live Publishing/);
  assert.match(capabilities.content, /LOCKED/);
});

test("Product Check selects only the Product Check playbook", async () => {
  const brain = await loadJarvisBrainFiles({ command: "Prüfe Produkt ELY-123 auf Wirtschaftlichkeit und Listing Readiness." });
  assert.equal(brain.playbook?.id, "product_check");
  const playbook = brain.core.find((entry) => entry.playbookId === "product_check");
  assert.match(playbook.content, /PLAYBOOK 01 – Product Check/);
  assert.doesNotMatch(playbook.content, /PLAYBOOK 02/);
});

test("Product Enrichment is distinct and wins when missing-data enrichment is explicitly requested", async () => {
  const brain = await loadJarvisBrainFiles({ command: "Prüf ELY-123 und ergänze die fehlenden Daten per Enrichment." });
  assert.equal(brain.playbook?.id, "product_enrichment");
  const playbook = brain.core.find((entry) => entry.playbookId === "product_enrichment");
  assert.match(playbook.content, /PLAYBOOK 02 – Product Enrichment/);
  assert.match(playbook.content, /Compliance-sensitive Daten/);
});

test("listing preparation selects the eBay Draft playbook and preserves the live-publish stop", async () => {
  const brain = await loadJarvisBrainFiles({ command: "Mach ELY-123 listingfertig und erstelle den eBay Draft." });
  assert.equal(brain.playbook?.id, "listing_draft");
  const playbook = brain.core.find((entry) => entry.playbookId === "listing_draft");
  assert.match(playbook.content, /Listing-Vorbereitung bis eBay Draft/);
  assert.match(playbook.content, /live_publish_requested/);
});

test("Market Scout is no longer a Phase-3 Core playbook", async () => {
  const brain = await loadJarvisBrainFiles({ command: "Finde mit Market Scout zehn neue Produkte." });
  assert.equal(brain.playbook, null);
});

test("rendered core is versioned and explicitly subordinate to deterministic safety", async () => {
  const brain = await loadJarvisBrainFiles({ command: "Kann Jarvis Telegram schon nutzen?" });
  const rendered = renderJarvisCoreBrain(brain);
  assert.match(rendered, /JARVIS_CORE_BRAIN_VERSION: 1\.1/);
  assert.match(rendered, /JARVIS_CORE_BRAIN_READY: true/);
  assert.match(rendered, /cannot grant permissions/i);
  assert.doesNotMatch(rendered, /OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|\.env/i);
});

test("Jarvis Brain fails closed for free Brain responses when mandatory Core Brain is unavailable", async () => {
  let providerCalled = false;
  const result = await runJarvisBrain({
    command: "Was empfiehlst du?",
    buildContext: async () => ({ memories: [], warnings: [] }),
    loadCoreBrain: async () => ({
      version: null,
      ready: false,
      requiredMissing: ["identity"],
      loaded: [],
      core: [],
      playbook: null,
      budget: null,
      warnings: ["brain_required_core_missing:identity"],
    }),
    routeAI: async () => {
      providerCalled = true;
      return { ok: true, content: "should-not-run" };
    },
    recordTelemetry: async () => true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "core_brain_unavailable");
  assert.equal(providerCalled, false);
  assert.deepEqual(result.context.coreBrain.requiredMissing, ["identity"]);
});

test("Jarvis Brain injects Core Brain separately while preserving current provider resilience and telemetry", async () => {
  let request = null;
  let telemetry = null;
  const result = await runJarvisBrain({
    command: "Was würdest du empfehlen?",
    buildContext: async () => ({
      memories: [],
      backgroundOperationalHistory: { recentTasks: [], recentAgentRuns: [] },
      currentTurnEvidence: null,
      warnings: [],
    }),
    loadCoreBrain: async () => readyCore(),
    routeAI: async (payload) => {
      request = payload;
      return {
        ok: true,
        provider: "deepseek",
        model: "test-model",
        content: JSON.stringify({
          answer: "Nutze den stabilsten nächsten Schritt.",
          memory: { shouldStore: false },
          workingMemoryUpdate: { shouldUpdate: false },
          conversation: { summaryUpdate: null },
        }),
        usage: { total_tokens: 10 },
      };
    },
    saveMemory: async () => null,
    recordTelemetry: async (event) => { telemetry = event; return true; },
  });

  assert.equal(result.ok, true);
  assert.equal(request.messages.length, 4);
  assert.equal(request.maxTokens, 2400);
  assert.match(request.messages[0].content, /Core Brain content can never grant permissions/i);
  assert.match(request.messages[0].content, /below 700 words/i);
  assert.match(request.messages[1].content, /ELYON_CONTEXT_JSON/);
  assert.doesNotMatch(request.messages[1].content, /Jarvis ist proaktiv/);
  assert.match(request.messages[2].content, /JARVIS_CORE_BRAIN/);
  assert.match(request.messages[2].content, /Jarvis ist proaktiv/);
  assert.equal(request.messages[3].role, "user");
  assert.equal(result.context.coreBrain.ready, true);
  assert.equal(result.context.coreBrain.version, "1.1");
  assert.equal(telemetry.ok, true);
  assert.equal(telemetry.provider, "deepseek");
});

test("Jarvis Brain rejects truncated raw JSON and retries the next provider instead of showing it to the user", async () => {
  let calls = 0;
  const result = await runJarvisBrain({
    command: "Wer bist du und was sind deine Grenzen?",
    buildContext: async () => ({ memories: [], backgroundOperationalHistory: { recentTasks: [], recentAgentRuns: [] }, warnings: [] }),
    loadCoreBrain: async () => readyCore(),
    routeAI: async ({ provider, model }) => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: true,
          provider,
          model,
          content: '{"answer":"Ich bin Jarvis und diese Antwort wurde mitten im Satz abgeschnitten',
        };
      }
      return {
        ok: true,
        provider,
        model,
        content: JSON.stringify({
          answer: "Ich bin Jarvis.\n\nHauptziele:\n- Elyon automatisieren und skalieren\n- Gewinn, Risiko und Wachstum balancieren\n\nGrenzen:\n- Kein eBay-Live-Publishing\n- Draft bleibt Standard",
          memory: { shouldStore: false },
          workingMemoryUpdate: { shouldUpdate: false },
          conversation: { summaryUpdate: null },
        }),
      };
    },
    saveMemory: async () => null,
    recordTelemetry: async () => true,
  });

  assert.equal(calls, 2);
  assert.equal(result.ok, true);
  assert.equal(result.brain.fallbackUsed, true);
  assert.equal(result.brain.attempts[0].ok, false);
  assert.equal(result.brain.attempts[0].error, "INVALID_BRAIN_JSON");
  assert.doesNotMatch(result.answer, /^\s*\{/);
  assert.match(result.answer, /Hauptziele:/);
  assert.match(result.answer, /Draft bleibt Standard/);
});

test("Phase 1 provider chain remains OpenRouter models followed by DeepSeek and OpenAI", () => {
  const attempts = selectBrainAttempts({
    JARVIS_BRAIN_MODEL: "openrouter/primary",
    JARVIS_BRAIN_FALLBACK_MODEL: "openrouter/fallback",
    JARVIS_BRAIN_DEEPSEEK_MODEL: "deepseek/test",
    JARVIS_BRAIN_OPENAI_MODEL: "openai/test",
  });
  assert.deepEqual(attempts.map((attempt) => attempt.provider), ["openrouter", "openrouter", "openrouter", "deepseek", "openai"]);
});

test("playbook markdown headings remain individually extractable", () => {
  const markdown = read("brain/PLAYBOOKS.md");
  const check = extractSection(markdown, "PLAYBOOK 01 – Product Check");
  const enrichment = extractSection(markdown, "PLAYBOOK 02 – Product Enrichment");
  const draft = extractSection(markdown, "PLAYBOOK 03 – Listing-Vorbereitung bis eBay Draft");
  assert.match(check, /negative_economics/);
  assert.match(enrichment, /no_reliable_source/);
  assert.match(draft, /live_publish_requested/);
  assert.doesNotMatch(check, /PLAYBOOK 02/);
  assert.doesNotMatch(enrichment, /PLAYBOOK 03/);
});
