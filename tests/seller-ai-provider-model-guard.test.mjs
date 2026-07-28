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
  const result = guard.normalize("deepseek", "gpt-4o-mini");
  assert.equal(result.provider, "deepseek");
  assert.equal(result.model, "deepseek-v4-flash");
  assert.equal(result.corrected, true);
});

test("valid provider and model combinations are preserved", () => {
  const guard = loadGuard();
  assert.equal(guard.normalize("deepseek", "deepseek-v4-pro").model, "deepseek-v4-pro");
  assert.equal(guard.normalize("openai", "gpt-4o").model, "gpt-4o");
  assert.equal(guard.normalize("qwen", "qwen-plus").model, "qwen-plus");
});

test("OpenAI rejects DeepSeek models", () => {
  const guard = loadGuard();
  const result = guard.normalize("openai", "deepseek-v4-flash");
  assert.equal(result.model, "gpt-4o-mini");
  assert.equal(result.corrected, true);
});

test("unknown providers fall back to OpenAI safely", () => {
  const guard = loadGuard();
  const result = guard.normalize("unknown", "anything");
  assert.equal(result.provider, "openai");
  assert.equal(result.model, "gpt-4o-mini");
});

test("Vercel build ships the provider-model guard", async () => {
  const build = await readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8");
  assert.match(build, /seller-ai-provider-model-guard\.js/);
});
