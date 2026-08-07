import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const helperUrl = new URL("../seller-ai-task-prompt-helper.js", import.meta.url);
const publicUrl = new URL("../public/seller-ai-task-prompt-helper.js", import.meta.url);
const apiUrl = new URL("../api/ai-task-prompt-generator.js", import.meta.url);
const loaderUrl = new URL("../seller-runtime-loader.js", import.meta.url);

async function helperSource() { return readFile(helperUrl, "utf8"); }

test("DeepSeek task prompt helper is valid browser JavaScript and public asset matches", async () => {
  const [source, publicSource] = await Promise.all([helperSource(), readFile(publicUrl, "utf8")]);
  assert.doesNotThrow(() => new vm.Script(source));
  assert.equal(publicSource, source);
  assert.match(source, /window\.ElyonAITaskPromptHelper/);
});

test("helper decorates both team and generic task prompt fields", async () => {
  const source = await helperSource();
  assert.match(source, /elyonAiWorkforceTeamV5Composer/);
  assert.match(source, /data-v5-field=\\?"prompt/);
  assert.match(source, /elyonAiAgentTaskComposerModal/);
  assert.match(source, /data-task-field=\\?"prompt/);
  assert.doesNotMatch(source, /data-builder-field=\\?"systemPrompt[^\n]*insertAdjacentElement/);
});

test("helper offers generate, regenerate and restore without starting a task", async () => {
  const source = await helperSource();
  assert.match(source, /Mit DeepSeek ausformulieren/);
  assert.match(source, /Neu generieren/);
  assert.match(source, /Stichpunkte wiederherstellen/);
  assert.match(source, /elyonPromptOriginal/);
  assert.match(source, /setFieldValue\(field, String\(payload\.prompt\)\)/);
  assert.match(source, /\/api\/ai-task-prompt-generator/);
  assert.doesNotMatch(source, /\/api\/ai-agent-run-/);
  assert.doesNotMatch(source, /Aufgabe erstellen & starten/);
  assert.doesNotMatch(source, /runDepartment\(/);
});

test("prompt generator is seller-protected and DeepSeek-only", async () => {
  const source = await readFile(apiUrl, "utf8");
  assert.match(source, /requireSellerAccess/);
  assert.match(source, /DEEPSEEK_API_KEY/);
  assert.match(source, /DEEPSEEK_MODEL \|\| "deepseek-chat"/);
  assert.match(source, /https:\/\/api\.deepseek\.com\/chat\/completions/);
  assert.match(source, /response_format: \{ type: "json_object" \}/);
  assert.match(source, /startsTask: false/);
  assert.match(source, /executesExternalActions: false/);
  assert.match(source, /taskStarted: false/);
  assert.match(source, /externalActionExecuted: false/);
});

test("generator preserves intent and forbids inventing or adding external actions", async () => {
  const source = await readFile(apiUrl, "utf8");
  assert.match(source, /Bewahre Absicht, Umfang, Einschränkungen und Prioritäten/);
  assert.match(source, /Erfinde keine Produkt-, Markt-, Rechts-, Preis-, Kunden- oder Lieferantendaten/);
  assert.match(source, /Füge niemals selbstständig Veröffentlichung, Live-Preisänderung, Lieferantenbestellung, Kundennachricht, Erstattung, Löschung oder Änderung rechtlicher Daten hinzu/);
  assert.match(source, /nur als Vorbereitung oder als Aktion nach der im Elyon-System erforderlichen Freigabe/);
});

test("prompt helper stays lazy in virtual employees runtime and adds no observer or polling", async () => {
  const [helper, loader] = await Promise.all([helperSource(), readFile(loaderUrl, "utf8")]);
  const virtualGroup = loader.match(/virtualAgentsTab:\s*\[([\s\S]*?)\n\s*\],/)?.[1] || "";
  assert.match(virtualGroup, /seller-ai-task-prompt-helper\.js/);
  const beforeGroups = loader.split("const GROUPS =", 1)[0];
  assert.doesNotMatch(beforeGroups, /seller-ai-task-prompt-helper/);
  assert.match(loader, /ElyonAITaskPromptHelper\?\.refresh/);
  assert.doesNotMatch(helper, /MutationObserver/);
  assert.doesNotMatch(helper, /setInterval\(/);
});
