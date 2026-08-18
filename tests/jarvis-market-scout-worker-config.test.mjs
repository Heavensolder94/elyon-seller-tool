import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const config = JSON.parse(fs.readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));

test("Jarvis worker pins a reliable paid model only for malformed Market Scout JSON repair", () => {
  assert.equal(config.vars?.OPENROUTER_REPAIR_MODEL, "openai/gpt-4.1-mini");
  assert.equal(config.name, "elyon-jarvis-worker");
  assert.equal(config.queues?.consumers?.[0]?.queue, "elyon-jarvis-jobs");
});
