import { readFile, writeFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), "..");
const workflowPath = path.join(root, ".github/workflows/remove-qwen-provider-once.yml");
const mode = process.argv[2] || "apply";
const changed = [];

async function edit(relativePath, transform) {
  const target = path.join(root, relativePath);
  const before = await readFile(target, "utf8");
  const after = transform(before);
  if (after === before) {
    console.log(`[unchanged] ${relativePath}`);
    return;
  }
  await writeFile(target, after, "utf8");
  changed.push(relativePath);
  console.log(`[updated] ${relativePath}`);
}

function replaceAllLiteral(source, search, replacement) {
  return source.split(search).join(replacement);
}

async function applyMigration() {
  await edit("seller-ai-provider-model-guard.js", (source) => source.replace(
    /\n    qwen: \{\n[\s\S]*?\n    \},\n    local:/,
    "\n    local:",
  ));

  await edit("ai-workforce-client.js", (source) => {
    let output = replaceAllLiteral(source, 'provider: "qwen"', 'provider: "deepseek"');
    output = output.replace(
      '      const oldModel = text(source.model).toLowerCase();\n      const oldModelIsProvider = ["openai", "deepseek", "qwen", "local"].includes(oldModel);',
      '      const oldModel = text(source.model).toLowerCase();\n      const supportedProviders = ["openai", "deepseek", "local"];\n      const oldModelIsProvider = supportedProviders.includes(oldModel);\n      const requestedProvider = text(source.provider, oldModelIsProvider ? oldModel : definition.provider).toLowerCase();\n      const normalizedProvider = supportedProviders.includes(requestedProvider) ? requestedProvider : definition.provider;\n      const normalizedModel = normalizedProvider === requestedProvider && !oldModelIsProvider ? text(source.model) : "";',
    );
    output = output.replace(
      '        provider: text(source.provider, oldModelIsProvider ? oldModel : definition.provider).toLowerCase(),\n        model: oldModelIsProvider ? "" : text(source.model),',
      '        provider: normalizedProvider,\n        model: normalizedModel,',
    );
    return output;
  });

  await edit("seller-ai-workforce-structure-v2.js", (source) => {
    let output = replaceAllLiteral(source, 'provider: "qwen"', 'provider: "deepseek"');
    output = output.replace(
      '      const source = Object.assign({}, ...sources.reverse());\n      settings.agents[definition.id] = {',
      '      const source = Object.assign({}, ...sources.reverse());\n      const requestedProvider = text(source.provider, definition.provider).toLowerCase();\n      const supportedProviders = ["openai", "deepseek", "local"];\n      const provider = supportedProviders.includes(requestedProvider) ? requestedProvider : definition.provider;\n      const model = provider === requestedProvider ? text(source.model) : "";\n      settings.agents[definition.id] = {',
    );
    output = output.replace(
      '        provider: text(source.provider, definition.provider).toLowerCase(),\n        model: text(source.model),',
      '        provider,\n        model,',
    );
    return output;
  });

  await edit("lib/ai-workforce.js", (source) => {
    let output = replaceAllLiteral(source, 'defaultProvider: "qwen"', 'defaultProvider: "deepseek"');
    output = output.replace(
      '    const modelLooksLikeProvider = ["openai", "deepseek", "qwen", "local"].includes(text(source.model, 100).toLowerCase());',
      '    const supportedProviders = ["openai", "deepseek", "local"];\n    const requestedProvider = text(source.provider, 100).toLowerCase();\n    const requestedModel = text(source.model, 200);\n    const modelProvider = requestedModel.toLowerCase();\n    const modelLooksLikeProvider = supportedProviders.includes(modelProvider);\n    const normalizedProvider = supportedProviders.includes(requestedProvider)\n      ? requestedProvider\n      : modelLooksLikeProvider\n        ? modelProvider\n        : definition.defaultProvider;\n    const normalizedModel = supportedProviders.includes(requestedProvider) && !modelLooksLikeProvider\n      ? requestedModel\n      : "";',
    );
    output = output.replace(
      '      provider: text(source.provider, 100).toLowerCase() || (modelLooksLikeProvider ? text(source.model, 100).toLowerCase() : definition.defaultProvider),\n      model: modelLooksLikeProvider ? "" : text(source.model, 200),',
      '      provider: normalizedProvider,\n      model: normalizedModel,',
    );
    return output;
  });

  await edit("lib/ai-workforce-structure-v2.js", (source) =>
    replaceAllLiteral(source, 'defaultProvider: "qwen"', 'defaultProvider: "deepseek"),
  );

  await edit("internal/extension/import-product.js", (source) => source.replace(
    /  const provider = toText\(process\.env\.BROWSER_IMPORT_AI_PROVIDER \|\| process\.env\.AI_BROWSER_IMPORT_PROVIDER \|\| "qwen"\)\.toLowerCase\(\);\n  const model =\n    provider === "deepseek"\n      \? toText\(process\.env\.BROWSER_IMPORT_AI_MODEL \|\| process\.env\.DEEPSEEK_MODEL \|\| "deepseek-v4-flash"\)\n      : provider === "openai"\n        \? toText\(process\.env\.BROWSER_IMPORT_AI_MODEL \|\| process\.env\.OPENAI_MODEL \|\| "gpt-4o-mini"\)\n        : toText\(process\.env\.BROWSER_IMPORT_AI_MODEL \|\| process\.env\.QWEN_MODEL \|\| "qwen-plus"\);/,
    '  const requestedProvider = toText(process.env.BROWSER_IMPORT_AI_PROVIDER || process.env.AI_BROWSER_IMPORT_PROVIDER || "deepseek").toLowerCase();\n  const provider = ["openai", "deepseek"].includes(requestedProvider) ? requestedProvider : "deepseek";\n  const model = provider === "openai"\n    ? toText(process.env.BROWSER_IMPORT_AI_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini")\n    : toText(process.env.BROWSER_IMPORT_AI_MODEL || process.env.DEEPSEEK_MODEL || "deepseek-v4-flash");',
  ));

  await edit("api/ai-agent-run-advanced.js", (source) => source
    .split("\n")
    .filter((line) => !/qwen|dashscope/i.test(line))
    .join("\n"));

  await edit("scripts/prepare-vercel.mjs", (source) => source
    .split("\n")
    .filter((line) => !/qwen|dashscope/i.test(line))
    .join("\n"));

  await edit("docs/ai/AI_WORKFORCE_V1.md", (source) => source
    .split("\n")
    .filter((line) => !/qwen|dashscope/i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n"));

  await edit("tests/seller-ai-provider-model-guard.test.mjs", () => `import assert from "node:assert/strict";
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
  assert.match(source, /control\\?\\.replaceWith\\(modelSelect\\)/);
  assert.match(source, /syncWorkforceModelSelectors/);
});

test("Vercel build ships the provider-model guard", async () => {
  const build = await readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8");
  assert.match(build, /seller-ai-provider-model-guard\\.js/);
});
`);

  console.log(`Migration applied. ${changed.length} file(s) changed.`);
}

const scanExtensions = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json", ".md", ".html", ".css", ".yml", ".yaml", ".env", ".txt"]);
const excludedDirectories = new Set([".git", "node_modules", ".vercel"]);
const excludedFiles = new Set([
  path.relative(root, scriptPath),
  path.relative(root, workflowPath),
]);

async function scanDirectory(directory, findings = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute);
    if (entry.isDirectory()) {
      await scanDirectory(absolute, findings);
      continue;
    }
    if (!entry.isFile() || excludedFiles.has(relative) || !scanExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    const content = await readFile(absolute, "utf8");
    if (/qwen|dashscope/i.test(content)) findings.push(relative);
  }
  return findings;
}

async function finalizeMigration() {
  const findings = await scanDirectory(root);
  if (findings.length) {
    throw new Error(`Removed provider references remain in: ${findings.join(", ")}`);
  }
  await rm(workflowPath, { force: true });
  await rm(scriptPath, { force: true });
  console.log("Repository verification passed; one-time migration files removed.");
}

if (mode === "apply") await applyMigration();
else if (mode === "finalize") await finalizeMigration();
else throw new Error(`Unknown mode: ${mode}`);
