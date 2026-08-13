import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { optimizeCompanyEntryRuntime } from "../scripts/workforce-company-entry-runtime-optimization.mjs";

const entryUrl = new URL("../seller-ai-workforce-company-entry-preview.js", import.meta.url);
const finalizerUrl = new URL("../scripts/finalize-seller-os.mjs", import.meta.url);

test("production company entry coalesces repeated tab activation into one frame", async () => {
  const source = await readFile(entryUrl, "utf8");
  const optimized = optimizeCompanyEntryRuntime(source);

  assert.doesNotThrow(() => new vm.Script(optimized));
  assert.match(optimized, /activationQueued: false/);
  assert.match(optimized, /requestAnimationFrame\(activateCompanyView\)/);
  assert.match(optimized, /state\.activationQueued \|\| state\.activating/);
  assert.match(optimized, /shell\.classList\.contains\("aiw-company-view"\)/);
  assert.doesNotMatch(optimized, /\[0, 80, 250, 700\]/);
  assert.doesNotMatch(optimized, /window\.setTimeout\(renderCompanyTree, 35\)/);
});

test("Seller OS finalizer applies company entry runtime optimization before publishing", async () => {
  const source = await readFile(finalizerUrl, "utf8");
  assert.match(source, /optimizeCompanyEntryRuntime/);
  assert.match(source, /optimizeCompanyEntryRuntime\(companyEntrySource\)/);
});
