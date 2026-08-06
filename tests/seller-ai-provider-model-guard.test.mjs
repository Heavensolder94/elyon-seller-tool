import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../seller-ai-provider-model-guard.js", import.meta.url), "utf8");

function loadGuard() {
  const document = {
    readyState: "loading",
    addEventListener() {},
  };
  const window = {};
  const context = vm.createContext({ window, document, console });
  vm.runInContext(source, context, { filename: "seller-ai-provider-model-guard.js" });
  return window.ElyonAiProviderModelGuard;
}

test("DeepSeek rejects OpenAI models and uses its own default", () => {
  const guard = loadGuard();
  const result = guard.normalize("deepseek", "gpt-5.6-terra");
  assert.equal(result.provider, "deepseek");
  assert.equal(result.model, "deepseek-v4-flash");
  assert.equal(result.corrected, true);
});

test("valid provider and current model combinations are preserved", () => {
  const guard = loadGuard();
  assert.equal(guard.normalize("deepseek", "deepseek-v4-pro").model, "deepseek-v4-pro");
  assert.equal(guard.normalize("openai", "gpt-5.6-terra").model, "gpt-5.6-terra");
  assert.equal(guard.normalize("local", "local").model, "local");
});

test("legacy compatible OpenAI model aliases remain selectable", () => {
  const guard = loadGuard();
  assert.equal(guard.normalize("openai", "gpt-4o-mini").model, "gpt-4o-mini");
  assert.equal(guard.normalize("openai", "gpt-4o").model, "gpt-4o");
});

test("OpenAI rejects DeepSeek models", () => {
  const guard = loadGuard();
  const result = guard.normalize("openai", "deepseek-v4-flash");
  assert.equal(result.model, "gpt-4o-mini");
  assert.equal(result.corrected, true);
});

test("unknown providers fall back to OpenAI safely", () => {
  const guard = loadGuard();
  const result = guard.normalize("removed-provider", "removed-model");
  assert.equal(result.provider, "openai");
  assert.equal(result.model, "gpt-4o-mini");
  assert.equal(result.corrected, true);
});

test("model catalog contains only supported providers", () => {
  const guard = loadGuard();
  assert.deepEqual(Object.keys(guard.providers), ["deepseek", "openai", "local"]);
  assert.deepEqual(
    [...guard.providers.deepseek.models.map((entry) => entry.value)],
    ["deepseek-v4-flash", "deepseek-v4-pro"],
  );
  assert.equal(guard.providers.openai.models.some((entry) => entry.value === "gpt-5.6-luna"), true);
  assert.equal(guard.providers.openai.models.some((entry) => entry.value === "gpt-5.6-sol"), true);
});

test("workforce model text inputs are replaced by protected select controls", () => {
  assert.match(source, /WORKFORCE_CARD_SELECTOR/);
  assert.match(source, /elyonWorkforceModelSelector/);
  assert.match(source, /control\?\.replaceWith\(modelSelect\)/);
  assert.match(source, /syncWorkforceModelSelectors/);
  assert.match(source, /syncProviderOptions/);
});

test("Vercel build ships the provider-model guard", async () => {
  const build = await readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8");
  assert.match(build, /seller-ai-provider-model-guard\.js/);
});