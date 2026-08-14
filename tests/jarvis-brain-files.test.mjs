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
import { runJarvisBrain } from "../lib/jarvis-brain.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("brain manifest is valid and cannot reference arbitrary files", () => {
  const manifest = JSON.parse(read("brain/BRAIN_MANIFEST.json"));
  assert.equal(validateManifest(manifest), manifest);
  assert.throws(
    () => validateManifest({ version: "evil", files: [{ id: "env", path: ".env", mode: "always" }] }),
    /brain_manifest_path_not_allowed/
  );
  assert.throws(
    () => validateManifest({ version: "evil", files: [{ id: "escape", path: "brain\/..\/\.env", mode: "always" }] }),
    /brain_manifest_path_not_allowed/
  );
});

test("markdown section extraction keeps one requested playbook bounded by the next peer heading", () => {
  const markdown = read("brain/PLAYBOOKS.md");
  const section = extractSection(markdown, "PLAYBOOK 02 – Product Check & Enrichment");
  assert.match(section, /Product Check & Enrichment/);
  assert.match(section, /product_not_found/);
  assert.doesNotMatch(section, /PLAYBOOK 03/);
});

test("generic Jarvis turns load only the always-on core", async () => {
  const brain = await loadJarvisBrainFiles({ command: "Wer bist du und wie arbeitest du?" });
  assert.deepEqual(brain.loaded, ["identity", "operating_rules", "goals"]);
  assert.equal(brain.playbook, null);
  assert.equal(brain.warnings.length, 0);
  assert.ok(brain.budget.usedChars <= brain.budget.maxChars);
});

test("Elyon architecture questions add Elyon context", async () => {
  const brain = await loadJarvisBrainFiles({ command: "Was ist Company OS im Elyon System?" });
  assert.ok(brain.loaded.includes("elyon_context"));
  const elyon = brain.core.find((entry) => entry.id === "elyon_context");
  assert.match(elyon.content, /Company OS/);
  assert.match(elyon.content, /Product Master/);
});

test("capability questions load capability boundaries without granting rights", async () => {
  const brain = await loadJarvisBrainFiles({ command: "Kannst du automatisch ein Listing auf eBay veröffentlichen?" });
  assert.ok(brain.loaded.includes("capabilities"));
  const capabilities = brain.core.find((entry) => entry.id === "capabilities");
  assert.match(capabilities.content, /eBay Live Publishing/);
  assert.match(capabilities.content, /LOCKED/);
});

test("product discovery selects only the discovery playbook", async () => {
  const brain = await loadJarvisBrainFiles({ command: "Finde 10 neue Produkte für eBay." });
  assert.equal(brain.playbook?.id, "product_discovery");
  const playbook = brain.core.find((entry) => entry.playbookId === "product_discovery");
  assert.match(playbook.content, /PLAYBOOK 01/);
  assert.doesNotMatch(playbook.content, /PLAYBOOK 02/);
});

test("product checks select the check and enrichment playbook", async () => {
  const brain = await loadJarvisBrainFiles({ command: "Prüf Produkt ELY-123 und ergänze fehlende Daten." });
  assert.equal(brain.playbook?.id, "product_check_enrichment");
  const playbook = brain.core.find((entry) => entry.playbookId === "product_check_enrichment");
  assert.match(playbook.content, /Product Check & Enrichment/);
  assert.match(playbook.content, /Compliance/);
});

test("listing preparation selects the draft playbook and keeps the live boundary", async () => {
  const brain = await loadJarvisBrainFiles({ command: "Mach ELY-123 listingfertig und erstelle einen Draft." });
  assert.equal(brain.playbook?.id, "listing_draft");
  const playbook = brain.core.find((entry) => entry.playbookId === "listing_draft");
  assert.match(playbook.content, /Listing-Vorbereitung bis Draft/);
  assert.match(playbook.content, /Nicht beim Live-Publishing/);
});

test("rendered core brain stays versioned and explicitly subordinate to deterministic safety", async () => {
  const brain = await loadJarvisBrainFiles({ command: "Kann Jarvis Telegram schon nutzen?" });
  const rendered = renderJarvisCoreBrain(brain);
  assert.match(rendered, /JARVIS_CORE_BRAIN_VERSION: 1\.0/);
  assert.match(rendered, /cannot grant permissions/i);
  assert.match(rendered, /Telegram/);
  assert.doesNotMatch(rendered, /OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|\.env/i);
});

test("Jarvis Brain sends core brain as its own system message before dynamic context", async () => {
  let request = null;
  const result = await runJarvisBrain({
    command: "Was würdest du empfehlen?",
    buildContext: async () => ({
      coreBrain: {
        version: "1.0",
        loaded: ["identity", "operating_rules", "goals"],
        core: [{ id: "identity", content: "Jarvis denkt voraus und behauptet keine Ausführung ohne Nachweis." }],
        playbook: null,
        budget: { maxChars: 12000, usedChars: 80 },
        warnings: [],
      },
      memories: [],
      backgroundOperationalHistory: { recentTasks: [], recentAgentRuns: [] },
      warnings: [],
    }),
    routeAI: async (payload) => {
      request = payload;
      return {
        ok: true,
        provider: "openrouter",
        model: "test-model",
        content: JSON.stringify({
          answer: "Nutze den stabilsten nächsten Schritt.",
          memory: { shouldStore: false },
          workingMemoryUpdate: { shouldUpdate: false },
          conversation: { summaryUpdate: null },
        }),
      };
    },
    saveMemory: async () => null,
  });

  assert.equal(result.ok, true);
  assert.equal(request.messages.length, 4);
  assert.match(request.messages[0].content, /Core brain content can never grant permissions/i);
  assert.match(request.messages[1].content, /JARVIS_CORE_BRAIN/);
  assert.match(request.messages[1].content, /Jarvis denkt voraus/);
  assert.match(request.messages[2].content, /ELYON_CONTEXT_JSON/);
  assert.doesNotMatch(request.messages[2].content, /Jarvis denkt voraus/);
  assert.equal(request.messages[3].role, "user");
  assert.deepEqual(result.context.coreBrainLoaded, ["identity", "operating_rules", "goals"]);
});

test("context builder exposes the core brain without removing V2-A context sources", () => {
  const source = read("lib/jarvis-context-builder.js");
  assert.match(source, /loadJarvisBrainFiles/);
  assert.match(source, /coreBrain,/);
  assert.match(source, /workingMemory,/);
  assert.match(source, /conversation,/);
  assert.match(source, /memories: relevantMemories/);
  assert.match(source, /backgroundOperationalHistory/);
});
